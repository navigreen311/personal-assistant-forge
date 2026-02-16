// ============================================================================
// Broadcast Manager Service
// Handles templated mass-messaging with merge fields and recipient validation.
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/integrations/email/client';
import { sendSMS } from '@/lib/integrations/sms/client';
import type { BroadcastRequest, BroadcastResult } from '@/modules/communication/types';

/**
 * Render a template string by replacing {{fieldName}} with merge field values.
 */
export function renderTemplate(
  template: string,
  mergeFields: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, fieldName) => {
    return mergeFields[fieldName] ?? match;
  });
}

/**
 * Validate recipients: check for doNotContact flag and missing channel handles.
 */
export async function validateRecipients(
  recipientIds: string[]
): Promise<{ valid: string[]; invalid: string[] }> {
  if (recipientIds.length === 0) {
    return { valid: [], invalid: [] };
  }

  const contacts = await prisma.contact.findMany({
    where: { id: { in: recipientIds } },
    select: { id: true, preferences: true, channels: true },
  });

  const foundIds = new Set(contacts.map((c: { id: string }) => c.id));
  const valid: string[] = [];
  const invalid: string[] = [];

  // IDs not found in DB are invalid
  for (const id of recipientIds) {
    if (!foundIds.has(id)) {
      invalid.push(id);
    }
  }

  for (const contact of contacts) {
    const prefs = (contact.preferences as Record<string, unknown>) ?? {};
    const channels = (contact.channels as Array<{ type: string; handle: string }>) ?? [];

    if (prefs.doNotContact === true) {
      invalid.push(contact.id);
    } else if (channels.length === 0) {
      invalid.push(contact.id);
    } else {
      valid.push(contact.id);
    }
  }

  return { valid, invalid };
}

/**
 * Send a broadcast message to multiple recipients using a template.
 */
export async function sendBroadcast(
  request: BroadcastRequest
): Promise<BroadcastResult> {
  const { entityId, recipientIds, template, mergeFields, channel, scheduledAt } = request;

  // Validate recipients first
  const { valid, invalid } = await validateRecipients(recipientIds);

  const failures: { contactId: string; reason: string }[] = invalid.map((id) => ({
    contactId: id,
    reason: 'Contact is invalid, marked doNotContact, or has no available channels.',
  }));

  let totalSent = 0;

  // Send to valid recipients
  for (let i = 0; i < valid.length; i++) {
    const contactId = valid[i];
    const contactMergeFields = mergeFields[i] ?? mergeFields[0] ?? {};

    const body = renderTemplate(template, contactMergeFields);

    try {
      await prisma.message.create({
        data: {
          id: uuidv4(),
          channel,
          senderId: entityId,
          recipientId: contactId,
          entityId,
          body,
          subject: `Broadcast: ${template.slice(0, 50)}`,
          triageScore: 3,
          sensitivity: 'INTERNAL',
          draftStatus: scheduledAt ? 'DRAFT' : 'SENT',
          attachments: [],
        },
      });

      // Dispatch via email or SMS after recording the message
      if (channel === 'EMAIL') {
        try {
          const contact = await prisma.contact.findUnique({
            where: { id: contactId },
            select: { email: true, name: true },
          });
          if (contact?.email) {
            await sendEmail({
              to: contact.email,
              subject: `Broadcast: ${template.slice(0, 50)}`,
              text: body,
            });
          }
        } catch {
          // Email send failed — message is still recorded
        }
      } else if (channel === 'SMS') {
        try {
          const contact = await prisma.contact.findUnique({
            where: { id: contactId },
            select: { phone: true, name: true },
          });
          if (contact?.phone) {
            await sendSMS({
              to: contact.phone,
              body,
            });
          }
        } catch {
          // SMS send failed — message is still recorded
        }
      }

      totalSent++;
    } catch (err) {
      failures.push({
        contactId,
        reason: err instanceof Error ? err.message : 'Unknown error during send',
      });
    }
  }

  return {
    totalSent,
    totalFailed: failures.length,
    failures,
  };
}

/**
 * Schedule a broadcast for later execution.
 * Stores the broadcast as a pending Document record.
 */
export async function scheduleBroadcast(
  request: BroadcastRequest & { scheduledAt: Date }
): Promise<{ broadcastId: string; scheduledAt: Date }> {
  const doc = await prisma.document.create({
    data: {
      title: `Scheduled Broadcast`,
      entityId: request.entityId,
      type: 'SCHEDULED_BROADCAST',
      content: JSON.stringify(request),
      status: 'DRAFT',
    },
  });

  return { broadcastId: doc.id, scheduledAt: request.scheduledAt };
}

/**
 * Get broadcast history for an entity, grouped by subject.
 */
export async function getBroadcastHistory(
  entityId: string,
  limit = 20
): Promise<Array<{ id: string; subject: string; totalSent: number; sentAt: Date }>> {
  const messages = await prisma.message.findMany({
    where: {
      entityId,
      subject: { startsWith: 'Broadcast:' },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, subject: true, createdAt: true },
  });

  const grouped = new Map<string, { id: string; subject: string; totalSent: number; sentAt: Date }>();
  for (const msg of messages) {
    const key = msg.subject ?? '';
    if (!grouped.has(key)) {
      grouped.set(key, { id: msg.id, subject: key, totalSent: 0, sentAt: msg.createdAt });
    }
    grouped.get(key)!.totalSent += 1;
  }

  return Array.from(grouped.values());
}
