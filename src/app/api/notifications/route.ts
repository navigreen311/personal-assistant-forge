import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/shared/middleware/auth';
import { success, error, paginated } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import type { AuthSession } from '@/lib/auth/types';

// --- Types ---

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: 'info' | 'warning' | 'error' | 'success';
  source: string;
  isRead: boolean;
  actionUrl?: string;
  createdAt: Date;
}

// --- Validation ---

const markReadSchema = z.union([
  z.object({ ids: z.array(z.string().min(1)).min(1) }),
  z.object({ all: z.literal(true) }),
]);

const deleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

// --- Helpers ---

// The Prisma schema does not have a Notification model, so we use the ActionLog
// table as a backing store with a convention: notifications are ActionLogs
// where actionType = 'NOTIFICATION'. This avoids schema changes.

function actionLogToNotification(log: {
  id: string;
  actorId: string | null;
  target: string;
  reason: string;
  blastRadius: string;
  status: string;
  rollbackPath: string | null;
  actionType: string;
  timestamp: Date;
}): Notification {
  // We encode notification metadata in the JSON fields:
  // target = title, reason = body, blastRadius = type, rollbackPath = actionUrl
  // status = 'EXECUTED' means read, 'PENDING' means unread
  return {
    id: log.id,
    userId: log.actorId ?? '',
    title: log.target,
    body: log.reason,
    type: (['info', 'warning', 'error', 'success'].includes(log.blastRadius.toLowerCase())
      ? log.blastRadius.toLowerCase()
      : 'info') as Notification['type'],
    source: log.actionType === 'NOTIFICATION' ? 'system' : log.actionType,
    isRead: log.status === 'EXECUTED',
    actionUrl: log.rollbackPath ?? undefined,
    createdAt: log.timestamp,
  };
}

// --- Handlers ---

async function handleGet(req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const url = new URL(req.url);
    const readParam = url.searchParams.get('read');
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');

    const limit = Math.min(Math.max(parseInt(limitParam ?? '50', 10) || 50, 1), 100);
    const offset = Math.max(parseInt(offsetParam ?? '0', 10) || 0, 0);

    // Build where clause
    const where: Record<string, unknown> = {
      actorId: session.userId,
      actionType: 'NOTIFICATION',
    };

    if (readParam === 'true') {
      where.status = 'EXECUTED';
    } else if (readParam === 'false') {
      where.status = 'PENDING';
    }

    const [logs, total] = await Promise.all([
      prisma.actionLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.actionLog.count({ where }),
    ]);

    const notifications = logs.map(actionLogToNotification);
    const page = Math.floor(offset / limit) + 1;
    return paginated(notifications, total, page, limit);
  } catch (err) {
    console.error('[notifications] GET error:', err);
    return error('INTERNAL_ERROR', 'Failed to load notifications', 500);
  }
}

async function handlePatch(req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const body = await req.json();
    const parsed = markReadSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid request body', 400, {
        issues: parsed.error.issues,
      });
    }

    let updated: number;

    if ('all' in parsed.data && parsed.data.all) {
      const result = await prisma.actionLog.updateMany({
        where: {
          actorId: session.userId,
          actionType: 'NOTIFICATION',
          status: 'PENDING',
        },
        data: { status: 'EXECUTED' },
      });
      updated = result.count;
    } else if ('ids' in parsed.data) {
      const result = await prisma.actionLog.updateMany({
        where: {
          id: { in: parsed.data.ids },
          actorId: session.userId,
          actionType: 'NOTIFICATION',
        },
        data: { status: 'EXECUTED' },
      });
      updated = result.count;
    } else {
      updated = 0;
    }

    return success({ updated });
  } catch (err) {
    console.error('[notifications] PATCH error:', err);
    return error('INTERNAL_ERROR', 'Failed to update notifications', 500);
  }
}

async function handleDelete(req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const body = await req.json();
    const parsed = deleteSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid request body', 400, {
        issues: parsed.error.issues,
      });
    }

    const result = await prisma.actionLog.deleteMany({
      where: {
        id: { in: parsed.data.ids },
        actorId: session.userId,
        actionType: 'NOTIFICATION',
      },
    });

    return success({ deleted: result.count });
  } catch (err) {
    console.error('[notifications] DELETE error:', err);
    return error('INTERNAL_ERROR', 'Failed to delete notifications', 500);
  }
}

// --- Route Exports ---

export async function GET(req: NextRequest): Promise<Response> {
  return withAuth(req, handleGet);
}

export async function PATCH(req: NextRequest): Promise<Response> {
  return withAuth(req, handlePatch);
}

export async function DELETE(req: NextRequest): Promise<Response> {
  return withAuth(req, handleDelete);
}
