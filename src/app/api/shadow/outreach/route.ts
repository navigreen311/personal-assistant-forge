// ============================================================================
// GET /api/shadow/outreach — what Shadow has tried, and how far up the ladder
// ============================================================================
//
// P-16, deliverable 4. `ShadowOutreach` is the escalation state machine's
// durable state: every rung it took, every rung anti-spam refused, and the
// acknowledgement that stops it. Nothing could read it. The Shadow settings
// page could configure quiet hours and `maxCallsPerDay` and then show the user
// nothing about whether either had ever applied.

import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import { notificationEscalator } from '@/modules/shadow/proactive/notification-escalator';

const MAX_ROWS = 100;

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const { searchParams } = new URL(req.url);
      const limitParam = Number(searchParams.get('limit'));
      const take = Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(Math.floor(limitParam), MAX_ROWS)
        : 25;

      // `userId` is in the WHERE clause, not checked afterwards: outreach rows
      // carry the content of a notification Shadow tried to deliver, so another
      // user's rows must be unreachable rather than filtered late.
      const outreach = await prisma.shadowOutreach.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: 'desc' },
        take,
      });

      const active = await notificationEscalator.listActiveEscalations(session.userId);

      return success({
        outreach: outreach.map((row) => ({
          id: row.id,
          triggerType: row.triggerType,
          triggerEvent: row.triggerEvent,
          channel: row.channel,
          status: row.status,
          content: row.content,
          createdAt: row.createdAt.toISOString(),
        })),
        activeEscalations: active.map((row) => ({
          notificationId: row.notificationId,
          triggerType: row.triggerType,
          attempts: row.attempts,
          priority: row.priority,
          title: row.title,
          lastAttemptAt: row.lastAttemptAt.toISOString(),
        })),
      });
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to list outreach',
        500
      );
    }
  });
}
