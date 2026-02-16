import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { routeNotification, getRoutingConfig, updateRoutingConfig } from '@/modules/attention/services/priority-router';

const routeNotificationSchema = z.object({
  userId: z.string().min(1),
  title: z.string().min(1),
  body: z.string(),
  source: z.string(),
  priority: z.enum(['P0', 'P1', 'P2']),
});

const updateRoutingSchema = z.object({
  userId: z.string().min(1),
  config: z.array(z.object({
    priority: z.enum(['P0', 'P1', 'P2']),
    action: z.enum(['INTERRUPT', 'NEXT_DIGEST', 'WEEKLY_REVIEW', 'SILENT']),
    channels: z.array(z.string()),
  })),
});

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) return error('VALIDATION_ERROR', 'userId is required', 400);

    const config = await getRoutingConfig(userId);
    return success(config);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.config) {
      const parsed = updateRoutingSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);
      await updateRoutingConfig(parsed.data.userId, parsed.data.config);
      return success({ updated: true });
    }

    const parsed = routeNotificationSchema.safeParse(body);
    if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

    const notification = await routeNotification(parsed.data.userId, {
      userId: parsed.data.userId,
      title: parsed.data.title,
      body: parsed.data.body,
      source: parsed.data.source,
      priority: parsed.data.priority,
    });
    return success(notification, 201);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
