// SMS Workflows - Delivery tracking, opt-out handling, and segment calculation

import { sendSMS } from '@/lib/integrations/sms/client';
import { getSmsTemplate, renderSmsTemplate } from '@/lib/integrations/sms/templates';

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
const optOutRecords: SmsOptOutRecord[] = [];
const optOutIndex = new Set<string>(); // "phone:entityId" keys for fast lookup

// ─── ID Generator ──────────────────────────────────────────────────────────────

let idCounter = 0;
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++idCounter}`;
}

// ─── Store Reset (for testing) ─────────────────────────────────────────────────

export function _resetStores(): void {
  deliveryRecords.clear();
  optOutRecords.length = 0;
  optOutIndex.clear();
  idCounter = 0;
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

  // Check opt-out before sending
  if (isOptedOut(params.to, params.entityId)) {
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

function optOutKey(phoneNumber: string, entityId: string): string {
  return `${phoneNumber}:${entityId}`;
}

export async function handleOptOut(params: {
  phoneNumber: string;
  entityId: string;
  reason?: string;
}): Promise<void> {
  const key = optOutKey(params.phoneNumber, params.entityId);
  if (optOutIndex.has(key)) return; // Already opted out

  const record: SmsOptOutRecord = {
    phoneNumber: params.phoneNumber,
    entityId: params.entityId,
    optedOutAt: new Date(),
    reason: params.reason,
  };

  optOutRecords.push(record);
  optOutIndex.add(key);
}

export async function handleOptIn(params: {
  phoneNumber: string;
  entityId: string;
}): Promise<void> {
  const key = optOutKey(params.phoneNumber, params.entityId);
  optOutIndex.delete(key);

  // Remove from records array
  const idx = optOutRecords.findIndex(
    (r) => r.phoneNumber === params.phoneNumber && r.entityId === params.entityId
  );
  if (idx !== -1) {
    optOutRecords.splice(idx, 1);
  }
}

export function isOptedOut(phoneNumber: string, entityId: string): boolean {
  return optOutIndex.has(optOutKey(phoneNumber, entityId));
}

// ─── Opt-Out Stats ─────────────────────────────────────────────────────────────

export function getOptOutStats(entityId: string): {
  totalOptOuts: number;
  optedOutNumbers: string[];
} {
  const entityOptOuts = optOutRecords.filter((r) => r.entityId === entityId);
  return {
    totalOptOuts: entityOptOuts.length,
    optedOutNumbers: entityOptOuts.map((r) => r.phoneNumber),
  };
}
