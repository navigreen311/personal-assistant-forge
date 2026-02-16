import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import * as medicalService from '@/modules/health/services/medical-service';

const addRecordSchema = z.object({
  userId: z.string().min(1),
  type: z.enum(['APPOINTMENT', 'MEDICATION', 'PRESCRIPTION', 'LAB_RESULT', 'IMMUNIZATION']),
  title: z.string().min(1),
  provider: z.string().optional(),
  date: z.string().transform(s => new Date(s)),
  nextDate: z.string().transform(s => new Date(s)).optional(),
  notes: z.string().optional(),
  reminders: z.array(z.object({
    daysBefore: z.number(),
    sent: z.boolean(),
  })).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const userId = searchParams.get('userId');
    const type = searchParams.get('type') ?? undefined;

    if (!userId) return error('MISSING_PARAM', 'userId is required', 400);

    const records = await medicalService.getRecords(userId, type);
    return success(records);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = addRecordSchema.safeParse(body);
    if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

    const record = await medicalService.addRecord(parsed.data.userId, {
      ...parsed.data,
      reminders: parsed.data.reminders ?? [],
    });
    return success(record, 201);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
