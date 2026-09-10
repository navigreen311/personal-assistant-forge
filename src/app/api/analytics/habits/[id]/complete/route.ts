import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope, withRole } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';
import { recordCompletion } from '@/modules/analytics/services/habit-tracking-service';

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  completed: z.boolean(),
});

/**
 * tenancy-pattern.md 4 -- the entity of a `/habits/<id>/complete` request is a
 * property of the row, not of the request. Falling through to the session's
 * active entity would answer about a habit the caller never asked for.
 *
 * Deliberately local to this route file: Next.js route files may export only
 * HTTP handlers, so this cannot be lifted into a shared helper here.
 */
async function withHabitScope(
  request: NextRequest,
  habitId: string,
  handler: Parameters<typeof withEntityScope>[1]
): Promise<Response> {
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.habitEntry.findUnique({
      where: { id: habitId },
      select: { entityId: true }, // the id ONLY -- no habit data crosses this line
    });
    if (!owner) {
      return error('NOT_FOUND', 'Habit not found', 404);
    }
    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withHabitScope(request, id, async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = bodySchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', parsed.error.message, 400);
        }

        const habit = await recordCompletion(
          id,
          entityId,
          parsed.data.date,
          parsed.data.completed
        );
        return success(habit);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to record completion';
        return error('INTERNAL_ERROR', message, 500);
      }
    })
  );
}
