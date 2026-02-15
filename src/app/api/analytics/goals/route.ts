import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import {
  createGoal,
  getGoals,
} from '@/modules/analytics/services/goal-tracking-service';

const getQuerySchema = z.object({
  userId: z.string().min(1),
  entityId: z.string().optional(),
});

const postBodySchema = z.object({
  userId: z.string().min(1),
  entityId: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  framework: z.enum(['OKR', 'SMART', 'CUSTOM']),
  targetValue: z.number().positive(),
  unit: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  autoProgress: z.boolean().default(false),
  linkedTaskIds: z.array(z.string()).default([]),
  linkedWorkflowIds: z.array(z.string()).default([]),
  milestones: z
    .array(
      z.object({
        title: z.string().min(1),
        targetValue: z.number().positive(),
        targetDate: z.coerce.date(),
      })
    )
    .optional(),
});

export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = getQuerySchema.safeParse(params);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    const goals = await getGoals(parsed.data.userId, parsed.data.entityId);
    return success(goals);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to fetch goals', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = postBodySchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    const goal = await createGoal(parsed.data);
    return success(goal, 201);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to create goal', 500);
  }
}
