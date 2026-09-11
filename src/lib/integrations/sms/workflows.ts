// SMS Workflows - Delivery tracking, opt-out handling, and segment calculation

import {
  hasOptedOut,
  listOptOuts,
  recordOptOut,
  removeOptOut,
  _resetOptOuts,
} from '@/lib/integrations/communication/opt-outs';
import { sendSMS } from '@/lib/integrations/sms/client';
import { getSmsTemplate, renderSmsTemplate } from '@/lib/integrations/sms/templates';

// P-36 (ESC-3, migration window 01): `optOutRecords` (:30) and `optOutIndex`
// (:31) are now `CommunicationOptOut` rows, reached through
// lib/integrations/communication/opt-outs.ts, which carries the reasoning.
//
// This is the channel where the volatility was sharpest. `sendTemplatedSms`
// DOES consult `isOptedOut` before every send -- unlike the email path, which
// never consults its unsubscribe list -- so the check was real and the store
// under it was a `Set` that a deploy emptied. A STOP reply is the legal
// instruction; forgetting it on restart and texting the person again is the
// TCPA violation itself, not a precursor to one. Nothing has been sent through
// this module in production (it has no importers outside its own tests), which
// is the only reason this is latent rather than live.
//
// `isOptedOut` is consequently ASYNC. It was synchronous because a Set is.
//
// `deliveryRecords` (:29) stays in memory: it is a delivery LOG, the authorized
// window covers opt-outs only, and it is escalated rather than forced into a
// table that means something else.

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SmsDeliveryRecord {
  id: string;
  to: string;
  templateId: string;
  message: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'undelivered';
  sentAt?: Date;
  deliveredAt?: Date;
  failureReason?: string;
  segments: number;
}

export interface SmsOptOutRecord {
  phoneNumber: string;
  entityId: string;
  optedOutAt: Date;
  reason?: string;
}

// ─── In-Memory Stores ──────────────────────────────────────────────────────────

const deliveryRecords = new Map<string, SmsDeliveryRecord>();

// ─── ID Generator ──────────────────────────────────────────────────────────────

let idCounter = 0;
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++idCounter}`;
}

// ─── Store Reset (for testing) ─────────────────────────────────────────────────

export async function _resetStores(): Promise<void> {
  deliveryRecords.clear();
  idCounter = 0;
  await _resetOptOuts();
}

// ─── GSM-7 Character Detection ─────────────────────────────────────────────────

const GSM7_CHARS =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
  'ÄÖÑÜabcdefghijklmnopqrstuvwxyzäöñüà§';
const GSM7_EXTENDED = '|^€{}[]~\\';

function isGsm7(message: string): boolean {
  for (const char of message) {
    if (!GSM7_CHARS.includes(char) && !GSM7_EXTENDED.includes(char)) {
      return false;
    }
  }
  return true;
}

// ─── Segment Calculation ───────────────────────────────────────────────────────

export function calculateSegments(message: string): number {
  if (message.length === 0) return 0;

  if (isGsm7(message)) {
    // GSM-7: 160 chars for single, 153 per segment for multi
    if (message.length <= 160) return 1;
    return Math.ceil(message.length / 153);
  } else {
    // UCS-2: 70 chars for single, 67 per segment for multi
    if (message.length <= 70) return 1;
    return Math.ceil(message.length / 67);
  }
}

// ─── Send Templated SMS ────────────────────────────────────────────────────────

export async function sendTemplatedSms<TData extends Record<string, unknown>>(params: {
  to: string;
  templateId: string;
  data: TData;
  entityId: string;
}): Promise<SmsDeliveryRecord> {
  const record: SmsDeliveryRecord = {
    id: generateId('sms'),
    to: params.to,
    templateId: params.templateId,
    message: '',
    status: 'queued',
    segments: 0,
  };

  // Check opt-out before sending. This is the one send gate in either
  // communication module that actually reads its suppression list.
  if (await isOptedOut(params.to, params.entityId)) {
    record.status = 'failed';
    record.failureReason = 'Recipient has opted out';
    deliveryRecords.set(record.id, record);
    return record;
  }

  const template = getSmsTemplate(params.templateId);
  if (!template) {
    record.status = 'failed';
    record.failureReason = `Template not found: ${params.templateId}`;
    deliveryRecords.set(record.id, record);
    return record;
  }

  const message = renderSmsTemplate(template, params.data);
  record.message = message;
  record.segments = calculateSegments(message);

  try {
    const sid = await sendSMS({ to: params.to, body: message });
    if (sid) {
      record.status = 'sent';
      record.sentAt = new Date();
    } else {
      record.status = 'failed';
      record.failureReason = 'SMS client returned null';
    }
  } catch (error) {
    record.status = 'failed';
    record.failureReason = error instanceof Error ? error.message : 'Unknown error';
  }

  deliveryRecords.set(record.id, record);
  return record;
}

// ─── Delivery Status Updates ───────────────────────────────────────────────────

export async function updateDeliveryStatus(params: {
  messageId: string;
  status: 'delivered' | 'failed' | 'undelivered';
  timestamp: Date;
  failureReason?: string;
}): Promise<void> {
  const record = deliveryRecords.get(params.messageId);
  if (!record) return;

  record.status = params.status;
  if (params.status === 'delivered') {
    record.deliveredAt = params.timestamp;
  }
  if (params.failureReason) {
    record.failureReason = params.failureReason;
  }
}

// ─── Delivery History ──────────────────────────────────────────────────────────

export function getDeliveryHistory(phoneNumber: string, limit: number = 50): SmsDeliveryRecord[] {
  const records: SmsDeliveryRecord[] = [];
  for (const record of deliveryRecords.values()) {
    if (record.to === phoneNumber) {
      records.push(record);
    }
  }
  // Sort by most recent first (using sentAt or id order)
  records.sort((a, b) => {
    const aTime = a.sentAt?.getTime() ?? 0;
    const bTime = b.sentAt?.getTime() ?? 0;
    return bTime - aTime;
  });
  return records.slice(0, limit);
}

// ─── Opt-Out / Opt-In ──────────────────────────────────────────────────────────

export async function handleOptOut(params: {
  phoneNumber: string;
  entityId: string;
  reason?: string;
}): Promise<void> {
  // `recordOptOut` is idempotent, so the "already opted out" early return the
  // `optOutIndex` needed is gone: a repeated STOP leaves one row.
  await recordOptOut({
    channel: 'sms',
    address: params.phoneNumber,
    entityId: params.entityId,
    scope: 'all',
    source: 'opt_out_keyword',
    reason: params.reason,
  });
}

export async function handleOptIn(params: {
  phoneNumber: string;
  entityId: string;
}): Promise<void> {
  await removeOptOut({
    channel: 'sms',
    address: params.phoneNumber,
    entityId: params.entityId,
  });
}

export async function isOptedOut(phoneNumber: string, entityId: string): Promise<boolean> {
  return hasOptedOut({
    channel: 'sms',
    address: phoneNumber,
    entityId,
    scopes: ['all'],
  });
}

// ─── Opt-Out Stats ─────────────────────────────────────────────────────────────

export async function getOptOutStats(entityId: string): Promise<{
  totalOptOuts: number;
  optedOutNumbers: string[];
}> {
  const optOuts = await listOptOuts({ channel: 'sms', entityId });
  return {
    totalOptOuts: optOuts.length,
    optedOutNumbers: optOuts.map((r) => r.address),
  };
}
