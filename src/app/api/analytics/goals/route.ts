import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, verifyEntityForUser } from '@/shared/middleware/auth';
import {
  createGoal,
  getGoals,
} from '@/modules/analytics/services/goal-tracking-service';

// P-13 / tenancy-pattern.md 5b -- CROSS-ENTITY.
//
// `GoalEntry` is keyed by `userId`; its `entityId` is optional, and a goal with
// no entity is a goal about the person rather than about one business. With no
// `entityId` this route therefore means "every goal I own" across all of them,
// so it keeps `withAuth` and scopes by `session.userId`. Narrowing it to
// `withEntityScope` would silently drop every entity-less goal and every goal
// filed against a non-active entity -- a behaviour change no 403 test can see.
//
// `entityId` is still accepted as a FILTER, and is proved with
// `verifyEntityForUser` before it reaches the query.
//
// `userId` is no longer accepted from the caller at all. It used to be
// `parsed.data.userId ?? session.userId`, so `GET /api/analytics/goals?userId=<B>`
// returned tenant B's goals with a 200.

const getQuerySchema = z.object({
  entityId: z.string().min(1).optional(),
});

const postBodySchema = z.object({
  entityId: z.string().min(1).optional(),
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
  return withAuth(request, async (req, session) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = getQuerySchema.safeParse(params);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      let entityId;
      if (parsed.data.entityId) {
        const verified = await verifyEntityForUser(parsed.data.entityId, session.userId);
        if (!verified) {
          return error('FORBIDDEN', 'You do not have access to this entity', 403);
        }
        entityId = verified;
      }

      const goals = await getGoals(session.userId, entityId);
      return success(goals);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to fetch goals', 500);
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

      let entityId;
      if (parsed.data.entityId) {
        const verified = await verifyEntityForUser(parsed.data.entityId, session.userId);
        if (!verified) {
          return error('FORBIDDEN', 'You do not have access to this entity', 403);
        }
        entityId = verified;
      }

      // `userId` and `entityId` last, deliberately: they overwrite whatever the
      // caller sent.
      const goal = await createGoal({
        ...parsed.data,
        entityId,
        userId: session.userId,
      });
      return success(goal, 201);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to create goal', 500);
    }
  });
}
