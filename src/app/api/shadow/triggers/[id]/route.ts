import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';

const updateTriggerSchema = z.object({
  triggerName: z.string().min(1).optional(),
  triggerType: z
    .enum([
      'P0_urgent',
      'crisis',
      'workflow_blocked',
      'overdue_task',
      'morning_briefing',
      'eod_summary',
      'vip_email',
    ])
    .optional(),
  conditions: z.record(z.string(), z.unknown()).optional(),
  action: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
  cooldownMinutes: z.number().int().min(0).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await params;
      const body = await req.json();
      const parsed = updateTriggerSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      // Verify ownership
      const existing = await prisma.shadowTrigger.findUnique({
        where: { id },
      });

      if (!existing) {
        return error('NOT_FOUND', 'Trigger not found', 404);
      }

      if (existing.userId !== session.userId) {
        return error('FORBIDDEN', 'Access denied', 403);
      }

      // P0_urgent triggers cannot be disabled
      const triggerType = parsed.data.triggerType ?? existing.triggerType;
      const data = { ...parsed.data };
      if (triggerType === 'P0_urgent' && data.enabled === false) {
        data.enabled = true; // Override: P0 cannot be disabled
      }

      const updated = await prisma.shadowTrigger.update({
        where: { id },
        data: data as unknown as Parameters<
          typeof prisma.shadowTrigger.update
        >[0]['data'],
      });

      return success(updated);
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to update trigger',
        500
      );
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

      // Verify ownership
      const existing = await prisma.shadowTrigger.findUnique({
        where: { id },
      });

      if (!existing) {
        return error('NOT_FOUND', 'Trigger not found', 404);
      }

      if (existing.userId !== session.userId) {
        return error('FORBIDDEN', 'Access denied', 403);
      }

      // P0_urgent triggers cannot be deleted
      if (existing.triggerType === 'P0_urgent') {
        return error(
          'FORBIDDEN',
          'P0 urgent triggers cannot be deleted. They can only be modified.',
          403
        );
      }

      await prisma.shadowTrigger.delete({ where: { id } });

      return success({ deleted: true });
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to delete trigger',
        500
      );
    }
  });
}
