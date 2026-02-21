import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/helpers';
import { prisma } from '@/lib/db';
import type {
  DashboardData,
  DashboardTask,
  DashboardTriageItem,
  DashboardActivity,
  DashboardEvent,
  DashboardFollowUp,
  DashboardStats,
} from '@/modules/dashboard/types';
// Shared types not needed — dashboard types use plain strings for JSON serialization

// Compute a human-readable "time ago" string from a Date
function timeAgo(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

// Determine greeting time-of-day bucket from hour (0-23)
function getTimeOfDay(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

// Infer a dashboard event type from the CalendarEvent title (best-effort heuristic)
function inferEventType(title: string, prepPacket: unknown): 'meeting' | 'focus' | 'personal' | 'buffer' {
  const lower = title.toLowerCase();
  if (lower.includes('focus') || lower.includes('deep work') || lower.includes('block')) return 'focus';
  if (lower.includes('buffer') || lower.includes('break') || lower.includes('lunch')) return 'buffer';
  if (prepPacket) return 'meeting';
  return 'personal';
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const activeEntityId = user.activeEntityId;

    if (!activeEntityId) {
      return NextResponse.json(
        { success: false, error: 'No active entity found for user' },
        { status: 400 }
      );
    }

    // Resolve the entity name once for use across aggregations
    const entity = await prisma.entity.findUnique({
      where: { id: activeEntityId },
      select: { id: true, name: true },
    });

    if (!entity) {
      return NextResponse.json(
        { success: false, error: 'Active entity not found' },
        { status: 404 }
      );
    }

    const entityName = entity.name;

    // Compute today's date boundaries in UTC
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setUTCHours(23, 59, 59, 999);

    // Run all queries in parallel for performance
    const [
      rawTopTasks,
      rawTriageMessages,
      rawActivityFeed,
      rawTodayEvents,
      rawFollowUps,
      openTaskCount,
      overdueTaskCount,
      meetingsTodayCount,
      unreadMessageCount,
      completedTodayCount,
    ] = await Promise.all([
      // Top 3 active tasks ordered by priority then dueDate
      prisma.task.findMany({
        where: {
          entityId: activeEntityId,
          status: { notIn: ['DONE', 'CANCELLED'] },
          deletedAt: null,
        },
        orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
        take: 3,
        select: {
          id: true,
          title: true,
          priority: true,
          entityId: true,
          dueDate: true,
          dependencies: true,
          status: true,
        },
      }),

      // Top 5 messages ordered by triageScore descending
      prisma.message.findMany({
        where: {
          entityId: activeEntityId,
          deletedAt: null,
        },
        orderBy: { triageScore: 'desc' },
        take: 5,
        select: {
          id: true,
          channel: true,
          senderId: true,
          subject: true,
          body: true,
          triageScore: true,
          createdAt: true,
          contact: {
            select: { name: true },
          },
        },
      }),

      // Last 10 action log entries ordered by timestamp desc
      prisma.actionLog.findMany({
        orderBy: { timestamp: 'desc' },
        take: 10,
        select: {
          id: true,
          actor: true,
          actionType: true,
          target: true,
          reason: true,
          reversible: true,
          timestamp: true,
        },
      }),

      // Today's calendar events ordered by startTime
      prisma.calendarEvent.findMany({
        where: {
          entityId: activeEntityId,
          startTime: { gte: todayStart, lte: todayEnd },
        },
        orderBy: { startTime: 'asc' },
        select: {
          id: true,
          title: true,
          startTime: true,
          endTime: true,
          prepPacket: true,
        },
      }),

      // Placeholder for follow-up reminders (table may not exist yet)
      Promise.resolve([] as Array<{ id: string; description: string; dueDate: Date; messageId: string | null }>),

      // Count: open tasks (not DONE or CANCELLED)
      prisma.task.count({
        where: {
          entityId: activeEntityId,
          status: { notIn: ['DONE', 'CANCELLED'] },
          deletedAt: null,
        },
      }),

      // Count: overdue tasks (dueDate < now, not DONE or CANCELLED)
      prisma.task.count({
        where: {
          entityId: activeEntityId,
          dueDate: { lt: now },
          status: { notIn: ['DONE', 'CANCELLED'] },
          deletedAt: null,
        },
      }),

      // Count: meetings today (calendar events in today's window)
      prisma.calendarEvent.count({
        where: {
          entityId: activeEntityId,
          startTime: { gte: todayStart, lte: todayEnd },
        },
      }),

      // Count: messages (approximate unread)
      prisma.message.count({
        where: {
          entityId: activeEntityId,
          deletedAt: null,
        },
      }),

      // Count: tasks completed today
      prisma.task.count({
        where: {
          entityId: activeEntityId,
          status: 'DONE',
          updatedAt: { gte: todayStart, lte: todayEnd },
          deletedAt: null,
        },
      }),
    ]);

    // --- Map raw DB results to dashboard types ---

    const topTasks: DashboardTask[] = rawTopTasks.map((t: { id: string; title: string; priority: string; entityId: string; dueDate: Date | null; dependencies: string[]; status: string }) => ({
      id: t.id,
      title: t.title,
      priority: t.priority as 'P0' | 'P1' | 'P2',
      entityId: t.entityId,
      entityName,
      dueDate: t.dueDate?.toISOString(),
      dependencies: t.dependencies,
      status: t.status,
    }));

    const triageQueue: DashboardTriageItem[] = rawTriageMessages.map((m: { id: string; channel: string; senderId: string; subject: string | null; body: string; triageScore: number; createdAt: Date; contact: { name: string } | null }) => ({
      id: m.id,
      channel: m.channel,
      senderName: m.contact?.name ?? m.senderId,
      subject: m.subject ?? '(no subject)',
      preview: m.body.slice(0, 120),
      urgencyScore: m.triageScore as number,
      timeAgo: timeAgo(m.createdAt),
      entityName,
    }));

    const activityFeed: DashboardActivity[] = rawActivityFeed.map((log: { id: string; actor: string; actionType: string; target: string; reason: string; reversible: boolean; timestamp: Date }) => ({
      id: log.id,
      actor: log.actor as 'AI' | 'HUMAN' | 'SYSTEM',
      description: `${log.actionType} — ${log.target}: ${log.reason}`,
      timestamp: log.timestamp.toISOString(),
      entityName,
      undoable: log.reversible,
    }));

    const todaySchedule: DashboardEvent[] = rawTodayEvents.map((ev: { id: string; title: string; startTime: Date; endTime: Date; prepPacket: unknown }) => {
      const durationMs = ev.endTime.getTime() - ev.startTime.getTime();
      const durationMins = Math.round(durationMs / 60000);
      return {
        id: ev.id,
        title: ev.title,
        startTime: ev.startTime.toISOString(),
        endTime: ev.endTime.toISOString(),
        duration: durationMins,
        type: inferEventType(ev.title, ev.prepPacket),
        hasPrepPacket: ev.prepPacket != null,
        entityName,
      };
    });

    const followUps: DashboardFollowUp[] = rawFollowUps.map((f: { id: string; description: string; dueDate: Date; messageId: string | null }) => {
      const daysWaiting = Math.floor(
        (now.getTime() - f.dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        id: f.id,
        recipientName: f.description,
        subject: f.description,
        daysWaiting: Math.max(0, daysWaiting),
        messageId: f.messageId ?? '',
      };
    });

    const stats: DashboardStats = {
      openTasks: openTaskCount,
      overdueTasks: overdueTaskCount,
      meetingsToday: meetingsTodayCount,
      unreadMessages: unreadMessageCount,
      focusTimeToday: 0, // Requires calendar event type classification; placeholder
      focusTimeGoal: 240, // Default 4-hour focus goal in minutes
      completedToday: completedTodayCount,
      timeSavedThisWeek: 0, // Requires workflow/automation logs; placeholder
    };

    const hour = now.getHours();
    const greeting = {
      name: user.name ?? user.email,
      timeOfDay: getTimeOfDay(hour),
    };

    const dashboardData: DashboardData = {
      greeting,
      topTasks,
      triageQueue,
      activityFeed,
      todaySchedule,
      followUps,
      stats,
    };

    return NextResponse.json({ success: true, data: dashboardData });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load dashboard';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
