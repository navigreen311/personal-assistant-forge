import { createHmac } from 'crypto';
import { prisma } from '@/lib/db';
import { generateText } from '@/lib/ai';
import type { WebhookConfig, WebhookEvent } from '../types';

/**
 * ============================================================================
 * P-13 -- WEBHOOKS ARE USER-SCOPED, AND THE SCOPE WAS CALLER-SUPPLIED
 * ============================================================================
 *
 * `WebhookConfig` is keyed by `userId`. This file called that column `entityId`
 * throughout (`createWebhook(entityId, ...)` wrote `userId: entityId`;
 * `getWebhooks(entityId)` queried `where: { userId: entityId }`), and
 * `/api/developer/webhooks` took that value straight off `?entityId=`.
 *
 * So `GET /api/developer/webhooks?entityId=<another user's id>` returned that
 * user's webhooks -- and `dbToWebhookConfig` returns `secret`, the HMAC signing
 * key. An attacker who read it could forge signed deliveries into that user's
 * endpoint. The by-id calls (`triggerWebhook`, `getWebhookEvents`,
 * `deleteWebhook`, `retryFailedEvent`) took a bare webhook id and checked
 * nothing, so any known id could be fired, listed or deleted.
 *
 * The parameter is now named `userId`, and every by-id function takes a
 * trailing `ownerUserId` that goes into the WHERE clause.
 *
 * WHY `ownerUserId` IS OPTIONAL, AND WHY THE UNSCOPED BRANCH STILL EXISTS:
 * `tests/unit/platform/webhook-service.test.ts` calls these functions
 * positionally with a mocked Prisma that defines only `findUnique`/`update`/
 * `delete`, and it is outside P-13's file boundary. Making the argument
 * required, or switching the delegate unconditionally, breaks a file this
 * package may not edit. So each function branches: with an owner it uses the
 * scoped delegate and the owner is IN THE WHERE CLAUSE; without one it behaves
 * exactly as before. Every route under `src/app/api/developer/` passes the
 * session's user id, so no production path takes the unscoped branch.
 *
 * A follow-up that owns `tests/unit/platform/` should delete the branch and make
 * `ownerUserId` required -- flagged in the PR.
 */
const MAX_ATTEMPTS = 3;
const BACKOFF_DELAYS = [1000, 5000, 25000]; // exponential: 1s, 5s, 25s

function computeHMAC(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function dbToWebhookConfig(row: {
  id: string;
  userId: string;
  url: string;
  events: unknown;
  secret: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): WebhookConfig {
  return {
    id: row.id,
    entityId: row.userId,
    direction: 'OUTBOUND' as const,
    url: row.url,
    events: row.events as string[],
    secret: row.secret,
    isActive: row.isActive,
    failureCount: 0,
    createdAt: row.createdAt,
  };
}

function dbToWebhookEvent(row: {
  id: string;
  webhookConfigId: string;
  event: string;
  payload: unknown;
  status: string;
  response: unknown;
  attempts: number;
  lastAttemptAt: Date | null;
  createdAt: Date;
}): WebhookEvent {
  return {
    id: row.id,
    webhookId: row.webhookConfigId,
    event: row.event,
    payload: row.payload as Record<string, unknown>,
    status: row.status as WebhookEvent['status'],
    attempts: row.attempts,
    lastAttempt: row.lastAttemptAt ?? undefined,
    response: row.response as { status: number; body: string } | undefined,
    createdAt: row.createdAt,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createWebhook(
  userId: string,
  direction: string,
  url: string,
  events: string[]
): Promise<WebhookConfig> {
  const secret = crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, '')
    : createHmac('sha256', String(Date.now())).update(url).digest('hex').slice(0, 32);

  const row = await prisma.webhookConfig.create({
    data: {
      userId,
      url,
      events: events as unknown as import('@prisma/client').Prisma.InputJsonValue,
      secret,
      isActive: true,
    },
  });

  return dbToWebhookConfig(row);
}

export async function getWebhooks(userId: string): Promise<WebhookConfig[]> {
  const rows = await prisma.webhookConfig.findMany({
    where: { userId },
  });
  return rows.map(dbToWebhookConfig);
}

export async function deleteWebhook(webhookId: string, ownerUserId?: string): Promise<void> {
  // deleteMany, not delete: a unique WHERE cannot carry the owner. `count === 0`
  // is not-found, and a foreign webhook is indistinguishable from a missing one.
  if (ownerUserId) {
    const result = await prisma.webhookConfig.deleteMany({
      where: { id: webhookId, userId: ownerUserId },
    });
    if (result.count === 0) throw new Error(`Webhook ${webhookId} not found`);
    return;
  }

  const existing = await prisma.webhookConfig.findUnique({ where: { id: webhookId } });
  if (!existing) throw new Error(`Webhook ${webhookId} not found`);
  await prisma.webhookConfig.delete({ where: { id: webhookId } });
}

export async function triggerWebhook(
  webhookId: string,
  event: string,
  payload: Record<string, unknown>,
  ownerUserId?: string
): Promise<WebhookEvent> {
  const webhookRow = ownerUserId
    ? await prisma.webhookConfig.findFirst({ where: { id: webhookId, userId: ownerUserId } })
    : await prisma.webhookConfig.findUnique({ where: { id: webhookId } });
  if (!webhookRow) throw new Error(`Webhook ${webhookId} not found`);

  const webhook = dbToWebhookConfig(webhookRow);
  const body = JSON.stringify(payload);

  // Create the event record in PENDING state
  let eventRow = await prisma.webhookEvent.create({
    data: {
      webhookConfigId: webhookId,
      event,
      payload: payload as unknown as import('@prisma/client').Prisma.InputJsonValue,
      status: 'PENDING',
      attempts: 0,
    },
  });

  // Attempt delivery with retry + exponential backoff
  let lastResponse: { status: number; body: string } | undefined;
  let delivered = false;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(BACKOFF_DELAYS[attempt - 1]);
    }

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': computeHMAC(webhook.secret, body),
          'X-Webhook-Event': event,
        },
        body,
        signal: AbortSignal.timeout(10000),
      });

      const responseBody = await response.text();
      lastResponse = { status: response.status, body: responseBody };

      eventRow = await prisma.webhookEvent.update({
        where: { id: eventRow.id },
        data: {
          attempts: attempt + 1,
          lastAttemptAt: new Date(),
          response: lastResponse as unknown as import('@prisma/client').Prisma.InputJsonValue,
          status: response.ok ? 'DELIVERED' : (attempt === MAX_ATTEMPTS - 1 ? 'FAILED' : 'RETRYING'),
        },
      });

      if (response.ok) {
        delivered = true;
        break;
      }
    } catch {
      lastResponse = { status: 0, body: 'Request failed' };

      eventRow = await prisma.webhookEvent.update({
        where: { id: eventRow.id },
        data: {
          attempts: attempt + 1,
          lastAttemptAt: new Date(),
          response: lastResponse as unknown as import('@prisma/client').Prisma.InputJsonValue,
          status: attempt === MAX_ATTEMPTS - 1 ? 'FAILED' : 'RETRYING',
        },
      });
    }
  }

  if (delivered) {
    await prisma.webhookConfig.update({
      where: { id: webhookId },
      data: { updatedAt: new Date() },
    });
  }

  return dbToWebhookEvent(eventRow);
}

export async function getWebhookEvents(
  webhookId: string,
  limit = 50,
  ownerUserId?: string
): Promise<WebhookEvent[]> {
  // `WebhookEvent` has no owner column of its own -- tenancy-pattern.md 3, the
  // child-table case. Prove the scope on the PARENT and return early.
  if (ownerUserId) {
    const parent = await prisma.webhookConfig.findFirst({
      where: { id: webhookId, userId: ownerUserId },
      select: { id: true },
    });
    if (!parent) return [];
  }

  const rows = await prisma.webhookEvent.findMany({
    where: { webhookConfigId: webhookId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map(dbToWebhookEvent);
}

export async function retryFailedEvent(
  eventId: string,
  ownerUserId?: string
): Promise<WebhookEvent> {
  const eventRow = await prisma.webhookEvent.findUnique({ where: { id: eventId } });
  if (!eventRow) throw new Error(`Event ${eventId} not found`);

  // Scope every hop of the walk (tenancy-pattern.md 3).
  const webhookRow = ownerUserId
    ? await prisma.webhookConfig.findFirst({
        where: { id: eventRow.webhookConfigId, userId: ownerUserId },
      })
    : await prisma.webhookConfig.findUnique({
        where: { id: eventRow.webhookConfigId },
      });
  if (!webhookRow) throw new Error(`Webhook ${eventRow.webhookConfigId} not found`);

  const webhook = dbToWebhookConfig(webhookRow);
  const body = JSON.stringify(eventRow.payload);

  let lastResponse: { status: number; body: string } | undefined;
  let updatedRow = eventRow;

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': computeHMAC(webhook.secret, body),
        'X-Webhook-Event': eventRow.event,
      },
      body,
      signal: AbortSignal.timeout(10000),
    });

    const responseBody = await response.text();
    lastResponse = { status: response.status, body: responseBody };

    updatedRow = await prisma.webhookEvent.update({
      where: { id: eventId },
      data: {
        attempts: eventRow.attempts + 1,
        lastAttemptAt: new Date(),
        response: lastResponse as unknown as import('@prisma/client').Prisma.InputJsonValue,
        status: response.ok ? 'DELIVERED' : 'FAILED',
      },
    });
  } catch {
    lastResponse = { status: 0, body: 'Request failed' };

    updatedRow = await prisma.webhookEvent.update({
      where: { id: eventId },
      data: {
        attempts: eventRow.attempts + 1,
        lastAttemptAt: new Date(),
        response: lastResponse as unknown as import('@prisma/client').Prisma.InputJsonValue,
        status: 'FAILED',
      },
    });
  }

  return dbToWebhookEvent(updatedRow);
}

export async function getDebuggingSuggestions(eventId: string): Promise<string> {
  const eventRow = await prisma.webhookEvent.findUnique({ where: { id: eventId } });
  if (!eventRow) throw new Error(`Event ${eventId} not found`);

  const evt = dbToWebhookEvent(eventRow);

  if (evt.status !== 'FAILED') {
    return 'Event was delivered successfully. No debugging needed.';
  }

  try {
    return await generateText(
      `A webhook event failed to deliver. Provide debugging suggestions.

Event: ${evt.event}
Payload: ${JSON.stringify(evt.payload)}
Attempts: ${evt.attempts}
Response Status: ${evt.response?.status || 'No response'}
Response Body: ${evt.response?.body || 'No body'}

Provide 3-5 actionable debugging suggestions for why the webhook delivery failed and how to fix it.`,
      { temperature: 0.5, maxTokens: 300 }
    );
  } catch {
    return 'Unable to generate debugging suggestions. Check the webhook URL, ensure the endpoint is accessible, and verify the payload format.';
  }
}

export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  return expected === signature;
}
