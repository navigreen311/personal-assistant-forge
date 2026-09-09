import { addDays, isBefore, isAfter } from 'date-fns';
import { prisma } from '@/lib/db';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { MedicalRecord } from '../types';

// === Mapping Helpers ===

// Store medical records using the Document model where type='MEDICAL'.
// Document.status = medical sub-type (APPOINTMENT, MEDICATION, etc.)
// Document.citations = medical-specific fields as JSON
// Document.title = record title
// Document.entityId = the VERIFIED entity the record belongs to (NOT the userId)

interface MedicalCitations {
  provider?: string;
  date: string;
  nextDate?: string;
  notes?: string;
  reminders: { daysBefore: number; sent: boolean }[];
}

function mapDbToMedicalRecord(
  doc: {
    id: string;
    entityId: string;
    title: string;
    status: string;
    citations: unknown;
  },
  userId: string
): MedicalRecord {
  const citations = doc.citations as MedicalCitations;

  return {
    id: doc.id,
    userId,
    type: doc.status as MedicalRecord['type'],
    title: doc.title,
    provider: citations.provider,
    date: new Date(citations.date),
    nextDate: citations.nextDate ? new Date(citations.nextDate) : undefined,
    notes: citations.notes,
    reminders: citations.reminders ?? [],
  };
}

// === Public API ===

export async function addRecord(
  entityId: VerifiedEntityId,
  userId: string,
  record: Omit<MedicalRecord, 'id'>
): Promise<MedicalRecord> {
  const citations: MedicalCitations = {
    provider: record.provider,
    date: record.date.toISOString(),
    nextDate: record.nextDate?.toISOString(),
    notes: record.notes,
    reminders: record.reminders ?? [],
  };

  const doc = await prisma.document.create({
    data: {
      entityId,
      type: 'MEDICAL',
      title: record.title,
      status: record.type,
      citations: citations as unknown as import('@prisma/client').Prisma.InputJsonValue,
    },
  });

  return mapDbToMedicalRecord(doc, userId);
}

export async function getRecords(
  entityId: VerifiedEntityId,
  userId: string,
  type?: string
): Promise<MedicalRecord[]> {
  const where: Record<string, unknown> = {
    type: 'MEDICAL',
    deletedAt: null,
  };
  if (type) where.status = type;
  // Scope applied LAST and unconditionally, so no filter combination widens it.
  where.entityId = entityId;

  const docs = await prisma.document.findMany({ where, orderBy: { createdAt: 'desc' } });
  return docs.map((doc) => mapDbToMedicalRecord(doc, userId));
}

export async function getUpcomingAppointments(
  entityId: VerifiedEntityId,
  userId: string,
  days: number
): Promise<MedicalRecord[]> {
  const records = await getRecords(entityId, userId, 'APPOINTMENT');
  const now = new Date();
  const futureDate = addDays(now, days);

  return records.filter(r => {
    if (!r.nextDate) return false;
    const next = new Date(r.nextDate);
    return isAfter(next, now) && isBefore(next, futureDate);
  });
}

export async function getMedicationReminders(
  entityId: VerifiedEntityId,
  userId: string
): Promise<MedicalRecord[]> {
  const records = await getRecords(entityId, userId, 'MEDICATION');
  const now = new Date();

  return records.filter(r => {
    if (!r.nextDate) return false;
    const refillDate = new Date(r.nextDate);
    return isBefore(refillDate, addDays(now, 7));
  });
}

export async function checkOverdueAppointments(
  entityId: VerifiedEntityId,
  userId: string
): Promise<MedicalRecord[]> {
  const records = await getRecords(entityId, userId, 'APPOINTMENT');
  const now = new Date();

  return records.filter(r => {
    if (!r.nextDate) return false;
    return isBefore(new Date(r.nextDate), now);
  });
}
