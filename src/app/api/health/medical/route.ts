import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import * as medicalService from '@/modules/health/services/medical-service';

const addRecordSchema = z.object({
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
  return withAuth(request, async (req, session) => {
    try {
      const type = req.nextUrl.searchParams.get('type') ?? undefined;
      const records = await medicalService.getRecords(session.userId, type);
      return success(records);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = addRecordSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      const record = await medicalService.addRecord(session.userId, {
        ...parsed.data,
        userId: session.userId,
        reminders: parsed.data.reminders ?? [],
      });
      return success(record, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
