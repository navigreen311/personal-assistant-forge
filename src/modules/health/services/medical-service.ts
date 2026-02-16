import { v4 as uuidv4 } from 'uuid';
import { addDays, isBefore, isAfter } from 'date-fns';
import type { MedicalRecord } from '../types';

const medicalStore = new Map<string, MedicalRecord[]>();

export async function addRecord(
  userId: string,
  record: Omit<MedicalRecord, 'id'>
): Promise<MedicalRecord> {
  const newRecord: MedicalRecord = {
    ...record,
    id: uuidv4(),
    userId,
  };

  const existing = medicalStore.get(userId) ?? [];
  existing.push(newRecord);
  medicalStore.set(userId, existing);

  return newRecord;
}

export async function getRecords(userId: string, type?: string): Promise<MedicalRecord[]> {
  const all = medicalStore.get(userId) ?? [];
  if (type) return all.filter(r => r.type === type);
  return all;
}

export async function getUpcomingAppointments(userId: string, days: number): Promise<MedicalRecord[]> {
  const records = await getRecords(userId, 'APPOINTMENT');
  const now = new Date();
  const futureDate = addDays(now, days);

  return records.filter(r => {
    if (!r.nextDate) return false;
    const next = new Date(r.nextDate);
    return isAfter(next, now) && isBefore(next, futureDate);
  });
}

export async function getMedicationReminders(userId: string): Promise<MedicalRecord[]> {
  const records = await getRecords(userId, 'MEDICATION');
  const now = new Date();

  return records.filter(r => {
    if (!r.nextDate) return false;
    // Medication needing refill: nextDate is within 7 days or past
    const refillDate = new Date(r.nextDate);
    return isBefore(refillDate, addDays(now, 7));
  });
}

export async function checkOverdueAppointments(userId: string): Promise<MedicalRecord[]> {
  const records = await getRecords(userId, 'APPOINTMENT');
  const now = new Date();

  return records.filter(r => {
    if (!r.nextDate) return false;
    return isBefore(new Date(r.nextDate), now);
  });
}
