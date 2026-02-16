// Email Workflows - Scheduling, batching, bounce handling, and unsubscribe management

import { sendEmail } from '@/lib/integrations/email/client';
import { getEmailTemplate, renderTemplate } from '@/lib/integrations/email/templates';

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
const suppressedEmails = new Set<string>();
const unsubscribeRecords: UnsubscribeRecord[] = [];
const batchJobs = new Map<string, BatchEmailJob>();

// ─── ID Generator ──────────────────────────────────────────────────────────────

let idCounter = 0;
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++idCounter}`;
}

// ─── Store Reset (for testing) ─────────────────────────────────────────────────

export function _resetStores(): void {
  scheduledEmails.clear();
  bounceRecords.length = 0;
  suppressedEmails.clear();
  unsubscribeRecords.length = 0;
  batchJobs.clear();
  idCounter = 0;
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
        if (isEmailSuppressed(recipient.email)) {
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

  // Hard bounces permanently suppress the email
  if (params.type === 'hard') {
    suppressedEmails.add(params.email);
  }
}

export function isEmailSuppressed(email: string): boolean {
  return suppressedEmails.has(email);
}

// ─── Unsubscribe Handling ──────────────────────────────────────────────────────

export async function handleUnsubscribe(params: {
  email: string;
  entityId: string;
  categories?: string[];
  reason?: string;
}): Promise<void> {
  const record: UnsubscribeRecord = {
    email: params.email,
    entityId: params.entityId,
    reason: params.reason,
    unsubscribedAt: new Date(),
    categories: params.categories ?? ['all'],
  };

  unsubscribeRecords.push(record);
}

export function isUnsubscribed(email: string, entityId: string, category?: string): boolean {
  return unsubscribeRecords.some(
    (r) =>
      r.email === email &&
      r.entityId === entityId &&
      (r.categories.includes('all') || (category ? r.categories.includes(category) : false))
  );
}

// ─── Deliverability Stats ──────────────────────────────────────────────────────

export function getDeliverabilityStats(entityId: string): {
  totalBounces: number;
  hardBounces: number;
  softBounces: number;
  unsubscribes: number;
  suppressedAddresses: string[];
} {
  const entityUnsubs = unsubscribeRecords.filter((r) => r.entityId === entityId);

  return {
    totalBounces: bounceRecords.length,
    hardBounces: bounceRecords.filter((r) => r.type === 'hard').length,
    softBounces: bounceRecords.filter((r) => r.type === 'soft').length,
    unsubscribes: entityUnsubs.length,
    suppressedAddresses: Array.from(suppressedEmails),
  };
}
