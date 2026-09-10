import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import {
  createHabit,
  getHabits,
} from '@/modules/analytics/services/habit-tracking-service';

// P-13 / tenancy-pattern.md 5b -- SINGLE-ENTITY.
//
// `HabitEntry.entityId` is a required foreign key to `Entity`, so a habit
// belongs to exactly one entity and this list is genuinely one entity's habits.
// `withEntityScope` is the right wrapper and narrows nothing.
//
// Two things changed. `userId` is no longer accepted from the caller (it was
// `parsed.data.userId ?? session.userId`, so `?userId=<B>` read tenant B), and
// the service no longer puts a user id in the `entityId` column -- see the note
// at the top of habit-tracking-service.ts.

const getQuerySchema = z.object({
  entityId: z.string().min(1).optional(),
});

const postBodySchema = z.object({
  entityId: z.string().min(1).optional(),
  name: z.string().min(1),
  frequency: z.enum(['DAILY', 'WEEKDAY', 'WEEKLY']),
});

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = getQuerySchema.safeParse(params);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const habits = await getHabits(entityId);
      return success(habits);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to fetch habits', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const body = await req.json();
      const parsed = postBodySchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const habit = await createHabit(entityId, parsed.data.name, parsed.data.frequency);
      return success(habit, 201);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to create habit', 500);
    }
  });
}
