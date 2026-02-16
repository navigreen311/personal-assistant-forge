import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { routeNotification, getRoutingConfig, updateRoutingConfig } from '@/modules/attention/services/priority-router';

const routeNotificationSchema = z.object({
  title: z.string().min(1),
  body: z.string(),
  source: z.string(),
  priority: z.enum(['P0', 'P1', 'P2']),
});

const updateRoutingSchema = z.object({
  config: z.array(z.object({
    priority: z.enum(['P0', 'P1', 'P2']),
    action: z.enum(['INTERRUPT', 'NEXT_DIGEST', 'WEEKLY_REVIEW', 'SILENT']),
    channels: z.array(z.string()),
  })),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const config = await getRoutingConfig(session.userId);
      return success(config);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();

      if (body.config) {
        const parsed = updateRoutingSchema.safeParse(body);
        if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);
        await updateRoutingConfig(session.userId, parsed.data.config);
        return success({ updated: true });
      }

      const parsed = routeNotificationSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      const notification = await routeNotification(session.userId, {
        userId: session.userId,
        title: parsed.data.title,
        body: parsed.data.body,
        source: parsed.data.source,
        priority: parsed.data.priority,
      });
      return success(notification, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
