import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import {
  createHabit,
  getHabits,
} from '@/modules/analytics/services/habit-tracking-service';

const getQuerySchema = z.object({
  userId: z.string().min(1),
});

const postBodySchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1),
  frequency: z.enum(['DAILY', 'WEEKDAY', 'WEEKLY']),
});

export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = getQuerySchema.safeParse(params);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    const habits = await getHabits(parsed.data.userId);
    return success(habits);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to fetch habits', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = postBodySchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    const habit = await createHabit(
      parsed.data.userId,
      parsed.data.name,
      parsed.data.frequency
    );
    return success(habit, 201);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to create habit', 500);
  }
}
