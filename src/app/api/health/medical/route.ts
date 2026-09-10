import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope, withRole } from '@/shared/middleware/auth';
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
  // Optional and still verified; see the tenancy pattern, section 1.
  entityId: z.string().min(1).optional(),
});

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, session, entityId) => {
    try {
      const type = req.nextUrl.searchParams.get('type') ?? undefined;
      const records = await medicalService.getRecords(entityId, session.userId, type);
      return success(records);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEntityScope(request, async (req, session, entityId) => {
      try {
        const body = await req.json();
        const parsed = addRecordSchema.safeParse(body);
        if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

        const { entityId: _requested, ...draft } = parsed.data;
        const record = await medicalService.addRecord(entityId, session.userId, {
          ...draft,
          userId: session.userId,
          reminders: draft.reminders ?? [],
        });
        return success(record, 201);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    })
  );
}
