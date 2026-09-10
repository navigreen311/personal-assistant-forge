import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';
import {
  updateGoalProgress,
  completeGoal,
} from '@/modules/analytics/services/goal-tracking-service';

// P-13 / tenancy-pattern.md 4 -- SINGLE-RECORD.
//
// The entity of a `/goals/<id>` request is a property of the row, not of the
// request, and `GoalEntry` is keyed by `userId` rather than `entityId`. So the
// scope here is the session's user id, pushed into every WHERE clause. Before
// this, all three handlers took only the path id: any authenticated caller who
// knew a goal id could read it, advance it, complete it, or DELETE it.

const putBodySchema = z.object({
  action: z.enum(['update_progress', 'complete']),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (_req, session) => {
    try {
      const { id } = await params;
      const goal = await updateGoalProgress(id, session.userId);
      return success(goal);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Goal not found';
      return error('NOT_FOUND', message, 404);
    }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await params;
      const body = await req.json();
      const parsed = putBodySchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      let goal;
      if (parsed.data.action === 'complete') {
        goal = await completeGoal(id, session.userId);
      } else {
        goal = await updateGoalProgress(id, session.userId);
      }

      return success(goal);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update goal';
      if (message.includes('not found')) {
        return error('NOT_FOUND', 'Goal not found', 404);
      }
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (_req, session) => {
    try {
      const { id } = await params;

      // deleteMany, not delete: `delete` takes a unique WHERE and cannot carry
      // the owner, so a foreign id would have been removed outright.
      const result = await prisma.goalEntry.deleteMany({
        where: { id, userId: session.userId },
      });
      if (result.count === 0) {
        return error('NOT_FOUND', 'Goal not found', 404);
      }

      return success({ deleted: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete goal';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
