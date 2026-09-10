// Email Workflows - Scheduling, batching, bounce handling, and unsubscribe management

import {
  hasOptedOut,
  listOptOuts,
  recordOptOut,
  _resetOptOuts,
} from '@/lib/integrations/communication/opt-outs';
import { sendEmail } from '@/lib/integrations/email/client';
import { getEmailTemplate, renderTemplate } from '@/lib/integrations/email/templates';

// P-36 (ESC-3, migration window 01): `suppressedEmails` (:53) and
// `unsubscribeRecords` (:54) are now `CommunicationOptOut` rows, reached
// through lib/integrations/communication/opt-outs.ts. That file carries the
// reasoning, including why `Contact.preferences` cannot hold a suppression list
// and why the authorized @@unique does not constrain the platform-wide rows.
//
// `isEmailSuppressed` and `isUnsubscribed` are consequently ASYNC. They were
// synchronous only because a Set is; a suppression check that has to be right
// after a restart is a database read, and the signature should say so.
//
// STILL VOLATILE, deliberately and visibly: `bounceRecords` (:52). It is a
// bounce LOG, not a suppression list -- it records soft bounces, which must NOT
// suppress -- and the authorized model cannot hold it: a soft bounce followed
// by a hard bounce for one address collides on
// `@@unique([channel, address, entityId, scope])`, so storing both would either
// throw or force a scope value invented to dodge the constraint. The durable
// half is the part that gates a send: a hard bounce writes a
// `source: 'hard_bounce'` row and `isEmailSuppressed` reads it. The log needs
// its own table and is escalated rather than smuggled into this one.
//
// NOT FIXED HERE, and named so it is not mistaken for fixed: `sendBatchEmails`
// checks `isEmailSuppressed` (hard bounces) and never calls `isUnsubscribed`.
// A durable unsubscribe list that no send path consults is still a violation.
// The fix is a real `entityId` on the send path, not an optional parameter no
// caller passes -- an advertised control that does nothing is worse than an
// absent one, which is the argument P-18 used when it deleted the constant
// X-RateLimit headers rather than persisting them. See the PR body.

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ScheduledEmail {
  id: string;
  templateId: string;
  to: string;
  data: Record<string, unknown>;
  scheduledAt: Date;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  createdAt: Date;
}

export interface BatchEmailJob {
  id: string;
  templateId: string;
  recipients: Array<{ email: string; data: Record<string, unknown> }>;
  status: 'queued' | 'processing' | 'completed' | 'partial_failure';
  totalCount: number;
  sentCount: number;
  failedCount: number;
  startedAt?: Date;
  completedAt?: Date;
}

export interface BounceRecord {
  email: string;
  type: 'hard' | 'soft';
  reason: string;
  bouncedAt: Date;
  originalMessageId?: string;
}

export interface UnsubscribeRecord {
  email: string;
  entityId: string;
  reason?: string;
  unsubscribedAt: Date;
  categories: string[];
}

// ─── In-Memory Stores ──────────────────────────────────────────────────────────

const scheduledEmails = new Map<string, ScheduledEmail>();
const bounceRecords: BounceRecord[] = [];
const batchJobs = new Map<string, BatchEmailJob>();

// ─── ID Generator ──────────────────────────────────────────────────────────────

let idCounter = 0;
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++idCounter}`;
}

// ─── Store Reset (for testing) ─────────────────────────────────────────────────

export async function _resetStores(): Promise<void> {
  scheduledEmails.clear();
  bounceRecords.length = 0;
  batchJobs.clear();
  idCounter = 0;
  await _resetOptOuts();
}

// ─── Delay Utility ─────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Schedule Email ────────────────────────────────────────────────────────────

export async function scheduleEmail(params: {
  templateId: string;
  to: string;
  data: Record<string, unknown>;
  scheduledAt: Date;
}): Promise<ScheduledEmail> {
  const scheduled: ScheduledEmail = {
    id: generateId('sched'),
    templateId: params.templateId,
    to: params.to,
    data: params.data,
    scheduledAt: params.scheduledAt,
    status: 'pending',
    attempts: 0,
    maxAttempts: 3,
    createdAt: new Date(),
  };

  scheduledEmails.set(scheduled.id, scheduled);
  return scheduled;
}

// ─── Cancel Scheduled Email ────────────────────────────────────────────────────

export async function cancelScheduledEmail(emailId: string): Promise<boolean> {
  const scheduled = scheduledEmails.get(emailId);
  if (!scheduled || scheduled.status !== 'pending') {
    return false;
  }
  scheduled.status = 'cancelled';
  return true;
}

// ─── Process Scheduled Emails ──────────────────────────────────────────────────

export async function processScheduledEmails(): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  const now = new Date();
  let processed = 0;
  let sent = 0;
  let failed = 0;

  for (const scheduled of scheduledEmails.values()) {
    if (scheduled.status !== 'pending') continue;
    if (scheduled.scheduledAt > now) continue;

    processed++;
    scheduled.attempts++;

    const template = getEmailTemplate(scheduled.templateId);
    if (!template) {
      scheduled.status = 'failed';
      scheduled.lastError = `Template not found: ${scheduled.templateId}`;
      failed++;
      continue;
    }

    const rendered = renderTemplate(template, scheduled.data);

    try {
      const success = await sendEmail({
        to: scheduled.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      if (success) {
        scheduled.status = 'sent';
        sent++;
      } else {
        if (scheduled.attempts >= scheduled.maxAttempts) {
          scheduled.status = 'failed';
          scheduled.lastError = 'Max attempts reached';
        }
        failed++;
      }
    } catch (error) {
      scheduled.lastError = error instanceof Error ? error.message : 'Unknown error';
      if (scheduled.attempts >= scheduled.maxAttempts) {
        scheduled.status = 'failed';
      }
      failed++;
    }
  }

  return { processed, sent, failed };
}

// ─── Send Batch Emails ─────────────────────────────────────────────────────────

export async function sendBatchEmails(params: {
  templateId: string;
  recipients: Array<{ email: string; data: Record<string, unknown> }>;
  rateLimit?: number;
  concurrency?: number;
}): Promise<BatchEmailJob> {
  const rateLimit = params.rateLimit ?? 10;
  const concurrency = params.concurrency ?? 3;
  const delayMs = 1000 / rateLimit;

  const job: BatchEmailJob = {
    id: generateId('batch'),
    templateId: params.templateId,
    recipients: params.recipients,
    status: 'processing',
    totalCount: params.recipients.length,
    sentCount: 0,
    failedCount: 0,
    startedAt: new Date(),
  };

  batchJobs.set(job.id, job);

  const template = getEmailTemplate(params.templateId);
  if (!template) {
    job.status = 'partial_failure';
    job.failedCount = job.totalCount;
    job.completedAt = new Date();
    return job;
  }

  // Process recipients in chunks of `concurrency`
  for (let i = 0; i < params.recipients.length; i += concurrency) {
    const chunk = params.recipients.slice(i, i + concurrency);

    const results = await Promise.allSettled(
      chunk.map(async (recipient) => {
        // Skip suppressed emails
        if (await isEmailSuppressed(recipient.email)) {
          return false;
        }

        const rendered = renderTemplate(template, recipient.data);
        return sendEmail({
          to: recipient.email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        });
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value === true) {
        job.sentCount++;
      } else {
        job.failedCount++;
      }
    }

    // Rate limiting delay between chunks
    if (i + concurrency < params.recipients.length) {
      await delay(delayMs * chunk.length);
    }
  }

  job.status = job.failedCount === 0 ? 'completed' : 'partial_failure';
  job.completedAt = new Date();
  return job;
}

// ─── Bounce Handling ───────────────────────────────────────────────────────────

export async function handleBounce(params: {
  email: string;
  type: 'hard' | 'soft';
  reason: string;
  messageId?: string;
}): Promise<void> {
  const record: BounceRecord = {
    email: params.email,
    type: params.type,
    reason: params.reason,
    bouncedAt: new Date(),
    originalMessageId: params.messageId,
  };

  bounceRecords.push(record);

  // Hard bounces permanently suppress the email, platform-wide: the mailbox
  // does not exist, so no entity may send to it. `entityId: null` is that.
  if (params.type === 'hard') {
    await recordOptOut({
      channel: 'email',
      address: params.email,
      entityId: null,
      scope: 'all',
      source: 'hard_bounce',
      reason: params.reason,
    });
  }
}

export async function isEmailSuppressed(email: string): Promise<boolean> {
  return hasOptedOut({
    channel: 'email',
    address: email,
    entityId: null,
    scopes: ['all'],
    source: 'hard_bounce',
  });
}

// ─── Unsubscribe Handling ──────────────────────────────────────────────────────

export async function handleUnsubscribe(params: {
  email: string;
  entityId: string;
  categories?: string[];
  reason?: string;
}): Promise<void> {
  // One row per category. `scope` IS the category, so a marketing unsubscribe
  // and a transactional one are separately expressible and separately
  // revocable, which one `categories[]` array on one record was not.
  const categories = params.categories ?? ['all'];
  for (const scope of categories) {
    await recordOptOut({
      channel: 'email',
      address: params.email,
      entityId: params.entityId,
      scope,
      source: 'unsubscribe',
      reason: params.reason,
    });
  }
}

export async function isUnsubscribed(
  email: string,
  entityId: string,
  category?: string
): Promise<boolean> {
  return hasOptedOut({
    channel: 'email',
    address: email,
    entityId,
    scopes: category ? ['all', category] : ['all'],
    source: 'unsubscribe',
  });
}

// ─── Deliverability Stats ──────────────────────────────────────────────────────

/**
 * P-33 recorded a defect here that this package has NOT closed:
 * `totalBounces` / `hardBounces` / `softBounces` ignore `entityId` entirely, so
 * cross-entity figures are returned under a per-entity signature. They still
 * do, because `BounceRecord` has no `entityId` field to filter on and adding
 * one is a change to the bounce log, which has no table yet. `unsubscribes` and
 * `suppressedAddresses` are now correct and durable; the bounce counts are
 * still process-local and still platform-wide. Both facts are stated here
 * rather than only in a commit message, because this is where someone will
 * read them.
 */
export async function getDeliverabilityStats(entityId: string): Promise<{
  totalBounces: number;
  hardBounces: number;
  softBounces: number;
  unsubscribes: number;
  suppressedAddresses: string[];
}> {
  const [unsubs, suppressed] = await Promise.all([
    listOptOuts({ channel: 'email', entityId, source: 'unsubscribe' }),
    listOptOuts({ channel: 'email', entityId: null, source: 'hard_bounce' }),
  ]);

  return {
    totalBounces: bounceRecords.length,
    hardBounces: bounceRecords.filter((r) => r.type === 'hard').length,
    softBounces: bounceRecords.filter((r) => r.type === 'soft').length,
    unsubscribes: unsubs.length,
    suppressedAddresses: suppressed.map((r) => r.address),
  };
}
