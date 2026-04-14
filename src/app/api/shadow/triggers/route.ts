import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';

const createTriggerSchema = z.object({
  triggerName: z.string().min(1),
  triggerType: z.enum([
    'P0_urgent',
    'crisis',
    'workflow_blocked',
    'overdue_task',
    'morning_briefing',
    'eod_summary',
    'vip_email',
  ]),
  conditions: z.record(z.string(), z.unknown()),
  action: z.record(z.string(), z.unknown()),
  enabled: z.boolean().optional().default(true),
  cooldownMinutes: z.number().int().min(0).optional().default(60),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (_req, session) => {
    try {
      const triggers = await prisma.shadowTrigger.findMany({
        where: { userId: session.userId },
        orderBy: { triggerName: 'asc' },
      });
      return success(triggers);
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to list triggers',
        500
      );
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = createTriggerSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      // P0_urgent triggers cannot be disabled
      const enabled =
        parsed.data.triggerType === 'P0_urgent' ? true : parsed.data.enabled;

      const trigger = await prisma.shadowTrigger.create({
        data: {
          userId: session.userId,
          triggerName: parsed.data.triggerName,
          triggerType: parsed.data.triggerType,
          // JSON columns — Prisma's InputJsonValue rejects
          // Record<string, unknown> without an explicit cast.
          conditions: parsed.data.conditions as unknown as Parameters<
            typeof prisma.shadowTrigger.create
          >[0]['data']['conditions'],
          action: parsed.data.action as unknown as Parameters<
            typeof prisma.shadowTrigger.create
          >[0]['data']['action'],
          enabled,
          cooldownMinutes: parsed.data.cooldownMinutes,
        },
      });

      return success(trigger, 201);
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to create trigger',
        500
      );
    }
  });
}
