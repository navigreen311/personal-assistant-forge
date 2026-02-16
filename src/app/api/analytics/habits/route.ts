import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import {
  createHabit,
  getHabits,
} from '@/modules/analytics/services/habit-tracking-service';

const getQuerySchema = z.object({
  userId: z.string().min(1).optional(),
});

const postBodySchema = z.object({
  userId: z.string().min(1).optional(),
  name: z.string().min(1),
  frequency: z.enum(['DAILY', 'WEEKDAY', 'WEEKLY']),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = getQuerySchema.safeParse(params);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const userId = parsed.data.userId ?? session.userId;
      const habits = await getHabits(userId);
      return success(habits);
    } catch (err) {
      return error('INTERNAL_ERROR', 'Failed to fetch habits', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = postBodySchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const userId = parsed.data.userId ?? session.userId;
      const habit = await createHabit(userId, parsed.data.name, parsed.data.frequency);
      return success(habit, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', 'Failed to create habit', 500);
    }
  });
}
