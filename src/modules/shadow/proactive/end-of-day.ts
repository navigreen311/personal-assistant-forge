// ============================================================================
// Shadow Voice Agent — End-of-Day Summary
// ============================================================================
//
// P-16, deliverable 3. The v2 spec lists an `eod_summary` trigger type
// (Part 9.2, `call_on_eod_summary`) and `/api/shadow/config` has stored
// `endOfDayEnabled`, `endOfDayTime`, `endOfDayChannel` and `endOfDayContent`
// preferences since it was written. Nothing generated a summary and nothing
// delivered one: the four preferences were write-only.
//
// This is the counterpart of `morning-briefing.ts` and deliberately mirrors its
// shape -- `generateSummary` / `deliverSummary`, a `Notification` row plus a
// `ShadowOutreach` row -- so the cron in `proactive-runner.ts` treats the two
// the same way and neither can drift into having a delivery path the other
// lacks.
//
// ----------------------------------------------------------------------------
// ONE HONEST APPROXIMATION, STATED RATHER THAN HIDDEN
// ----------------------------------------------------------------------------
//
// "Tasks you closed today" is computed as `status DONE` with `updatedAt` inside
// today. `Task` has no `completedAt` column and the schema is frozen, so a task
// marked DONE last week and edited today counts. The field is named `closedToday`
// rather than `completedToday` for that reason. It is not stuffed into a `Json`
// column to fake a column that does not exist.

import { prisma } from '@/lib/db';

// ---- Types ----

export type EodTask = {
  title: string;
  priority: string;
};

export type EodContent = {
  tasks: {
    closedToday: number;
    stillOpen: number;
    overdue: number;
    carryOver: EodTask[];
  };
  inbox: {
    unread: number;
    urgentUnread: number;
  };
  calendar: {
    tomorrowEvents: number;
    firstTomorrowAt: string | null;
  };
  finance: {
    overdueInvoices: number;
  };
  summary: string;
};

// ---- Helpers ----

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function buildEodSummary(content: Omit<EodContent, 'summary'>): string {
  const parts: string[] = [];

  parts.push(
    `You closed ${content.tasks.closedToday} ${plural(content.tasks.closedToday, 'task', 'tasks')} today.`
  );

  if (content.tasks.overdue > 0) {
    parts.push(
      `${content.tasks.overdue} ${plural(content.tasks.overdue, 'task is', 'tasks are')} still overdue.`
    );
  } else if (content.tasks.stillOpen > 0) {
    parts.push(
      `${content.tasks.stillOpen} ${plural(content.tasks.stillOpen, 'task remains', 'tasks remain')} open, none overdue.`
    );
  } else {
    parts.push('Nothing is left open.');
  }

  if (content.inbox.urgentUnread > 0) {
    parts.push(
      `${content.inbox.urgentUnread} urgent ${plural(content.inbox.urgentUnread, 'message is', 'messages are')} still unread.`
    );
  } else if (content.inbox.unread > 0) {
    parts.push(
      `${content.inbox.unread} unread ${plural(content.inbox.unread, 'message', 'messages')}, none urgent.`
    );
  }

  if (content.finance.overdueInvoices > 0) {
    parts.push(
      `${content.finance.overdueInvoices} overdue ${plural(content.finance.overdueInvoices, 'invoice', 'invoices')} still need chasing.`
    );
  }

  if (content.calendar.tomorrowEvents > 0) {
    const first = content.calendar.firstTomorrowAt
      ? `, starting at ${content.calendar.firstTomorrowAt}`
      : '';
    parts.push(
      `Tomorrow you have ${content.calendar.tomorrowEvents} ${plural(content.calendar.tomorrowEvents, 'event', 'events')}${first}.`
    );
  } else {
    parts.push('Tomorrow is clear.');
  }

  return parts.join(' ');
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// ---- Service ----

export class EndOfDaySummaryService {
  /**
   * Build today's end-of-day summary from real rows.
   */
  async generateSummary(userId: string, now: Date = new Date()): Promise<EodContent> {
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowEnd = new Date(todayEnd.getTime() + 24 * 60 * 60 * 1000);

    const entities = await prisma.entity.findMany({
      where: { userId },
      select: { id: true },
    });
    const entityIds = entities.map((e) => e.id);

    const [closedToday, openTasks, overdueTasks, carryOver, unread, urgentUnread, tomorrow, overdueInvoices] =
      await Promise.all([
        prisma.task.count({
          where: {
            entityId: { in: entityIds },
            status: 'DONE',
            updatedAt: { gte: todayStart, lte: todayEnd },
            deletedAt: null,
          },
        }),
        prisma.task.count({
          where: {
            entityId: { in: entityIds },
            status: { notIn: ['DONE', 'CANCELLED'] },
            deletedAt: null,
          },
        }),
        prisma.task.count({
          where: {
            entityId: { in: entityIds },
            status: { notIn: ['DONE', 'CANCELLED'] },
            dueDate: { lt: todayStart },
            deletedAt: null,
          },
        }),
        prisma.task.findMany({
          where: {
            entityId: { in: entityIds },
            status: { notIn: ['DONE', 'CANCELLED'] },
            deletedAt: null,
          },
          orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
          take: 5,
          select: { title: true, priority: true },
        }),
        prisma.message.count({
          where: { entityId: { in: entityIds }, read: false, deletedAt: null },
        }),
        prisma.message.count({
          where: {
            entityId: { in: entityIds },
            read: false,
            triageScore: { gte: 8 },
            deletedAt: null,
          },
        }),
        prisma.calendarEvent.findMany({
          where: {
            entityId: { in: entityIds },
            startTime: { gte: tomorrowStart, lte: tomorrowEnd },
          },
          orderBy: { startTime: 'asc' },
          select: { startTime: true },
        }),
        prisma.financialRecord.count({
          where: {
            entityId: { in: entityIds },
            type: 'INVOICE',
            status: { in: ['PENDING', 'OVERDUE'] },
            dueDate: { lt: todayStart },
          },
        }),
      ]);

    const withoutSummary: Omit<EodContent, 'summary'> = {
      tasks: {
        closedToday,
        stillOpen: openTasks,
        overdue: overdueTasks,
        carryOver: carryOver.map((t) => ({ title: t.title, priority: t.priority })),
      },
      inbox: { unread, urgentUnread },
      calendar: {
        tomorrowEvents: tomorrow.length,
        firstTomorrowAt: tomorrow[0] ? formatTime(tomorrow[0].startTime) : null,
      },
      finance: { overdueInvoices },
    };

    return { ...withoutSummary, summary: buildEodSummary(withoutSummary) };
  }

  /**
   * Deliver the summary: one `Notification` the user sees and one
   * `ShadowOutreach` row that records the delivery.
   *
   * `ShadowOutreach` is the idempotency key as well as the record --
   * `proactive-runner` refuses to deliver a second `eod_summary` on a day that
   * already has one, exactly as `suggestion-engine`'s `eod_summary` condition
   * already assumed something would be writing.
   */
  async deliverSummary(
    userId: string,
    options: { channel?: string; now?: Date } = {}
  ): Promise<{ channel: string; delivered: boolean }> {
    const now = options.now ?? new Date();
    const channel = options.channel ?? 'in_app';
    const content = await this.generateSummary(userId, now);

    await prisma.notification.create({
      data: {
        userId,
        type: 'system',
        title: 'End-of-Day Summary',
        body: content.summary,
        priority: 'normal',
        metadata: {
          briefingType: 'end_of_day',
          tasks: content.tasks,
          inbox: content.inbox,
          calendar: content.calendar,
          finance: content.finance,
        },
      },
    });

    await prisma.shadowOutreach.create({
      data: {
        userId,
        triggerType: 'eod_summary',
        channel,
        status: 'delivered',
        content: content.summary,
      },
    });

    return { channel, delivered: true };
  }
}

export const endOfDaySummaryService = new EndOfDaySummaryService();
