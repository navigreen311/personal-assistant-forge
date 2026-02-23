import { prisma } from '@/lib/db';

// ---- Types ----

export interface BriefingCalendarEvent {
  title: string;
  time: string;
  type: string;
}

export interface BriefingTask {
  title: string;
  priority: string;
  dueDate?: string;
}

export interface BriefingRecommendation {
  action: string;
  reason: string;
  priority: string;
}

export interface BriefingContent {
  calendar: {
    events: BriefingCalendarEvent[];
    conflicts: number;
  };
  inbox: {
    total: number;
    urgent: number;
    needsReply: number;
    fyi: number;
  };
  tasks: {
    overdue: number;
    dueToday: number;
    topPriorities: BriefingTask[];
  };
  finance: {
    overdueInvoices: number;
    cashFlowAlert?: string;
    budgetWarnings: string[];
  };
  recommendations: BriefingRecommendation[];
  summary: string;
}

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

function detectConflicts(events: Array<{ startTime: Date; endTime: Date }>): number {
  let conflicts = 0;
  const sorted = [...events].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].startTime < sorted[i].endTime) {
        conflicts++;
      }
    }
  }
  return conflicts;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function categorizeEvent(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('standup') || lower.includes('sync') || lower.includes('meeting')) return 'meeting';
  if (lower.includes('lunch') || lower.includes('break')) return 'break';
  if (lower.includes('focus') || lower.includes('deep work')) return 'focus';
  if (lower.includes('call') || lower.includes('phone')) return 'call';
  if (lower.includes('interview')) return 'interview';
  if (lower.includes('review')) return 'review';
  return 'event';
}

function buildNaturalSummary(content: Omit<BriefingContent, 'summary'>): string {
  const parts: string[] = [];

  // Calendar
  if (content.calendar.events.length > 0) {
    parts.push(
      `You have ${content.calendar.events.length} event${content.calendar.events.length !== 1 ? 's' : ''} today.`
    );
    if (content.calendar.conflicts > 0) {
      parts.push(`There ${content.calendar.conflicts === 1 ? 'is' : 'are'} ${content.calendar.conflicts} scheduling conflict${content.calendar.conflicts !== 1 ? 's' : ''} to resolve.`);
    }
  } else {
    parts.push('Your calendar is clear today.');
  }

  // Inbox
  if (content.inbox.urgent > 0) {
    parts.push(`${content.inbox.urgent} urgent message${content.inbox.urgent !== 1 ? 's' : ''} need${content.inbox.urgent === 1 ? 's' : ''} your attention.`);
  }
  if (content.inbox.needsReply > 0) {
    parts.push(`${content.inbox.needsReply} message${content.inbox.needsReply !== 1 ? 's' : ''} awaiting your reply.`);
  }

  // Tasks
  if (content.tasks.overdue > 0) {
    parts.push(`${content.tasks.overdue} task${content.tasks.overdue !== 1 ? 's are' : ' is'} overdue.`);
  }
  if (content.tasks.dueToday > 0) {
    parts.push(`${content.tasks.dueToday} task${content.tasks.dueToday !== 1 ? 's' : ''} due today.`);
  }

  // Finance
  if (content.finance.overdueInvoices > 0) {
    parts.push(`${content.finance.overdueInvoices} overdue invoice${content.finance.overdueInvoices !== 1 ? 's' : ''} require follow-up.`);
  }
  if (content.finance.cashFlowAlert) {
    parts.push(content.finance.cashFlowAlert);
  }

  // Recommendations
  if (content.recommendations.length > 0) {
    const top = content.recommendations[0];
    parts.push(`Top recommendation: ${top.action}`);
  }

  return parts.join(' ');
}

// ---- Service ----

export class MorningBriefingService {
  /**
   * Generate today's morning briefing content from real data.
   */
  async generateBriefing(userId: string): Promise<BriefingContent> {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    // Resolve entity IDs owned by this user
    const entities = await prisma.entity.findMany({
      where: { userId },
      select: { id: true },
    });
    const entityIds = entities.map((e) => e.id);

    // Parallel data fetch
    const [
      calendarEvents,
      unreadMessages,
      overdueTasks,
      todayTasks,
      topPriorityTasks,
      overdueFinancials,
      budgetAlerts,
    ] = await Promise.all([
      // Calendar: today's events across all entities
      prisma.calendarEvent.findMany({
        where: {
          entityId: { in: entityIds },
          startTime: { gte: todayStart, lte: todayEnd },
        },
        orderBy: { startTime: 'asc' },
      }),

      // Inbox: unread messages
      prisma.message.findMany({
        where: {
          entityId: { in: entityIds },
          read: false,
          deletedAt: null,
        },
      }),

      // Tasks: overdue (past due, not done)
      prisma.task.findMany({
        where: {
          entityId: { in: entityIds },
          status: { notIn: ['DONE', 'CANCELLED'] },
          dueDate: { lt: todayStart },
          deletedAt: null,
        },
      }),

      // Tasks: due today
      prisma.task.findMany({
        where: {
          entityId: { in: entityIds },
          status: { notIn: ['DONE', 'CANCELLED'] },
          dueDate: { gte: todayStart, lte: todayEnd },
          deletedAt: null,
        },
      }),

      // Tasks: top priorities (P0 or P1, not done)
      prisma.task.findMany({
        where: {
          entityId: { in: entityIds },
          status: { notIn: ['DONE', 'CANCELLED'] },
          priority: { in: ['P0', 'P1'] },
          deletedAt: null,
        },
        orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
        take: 5,
      }),

      // Finance: overdue invoices
      prisma.financialRecord.findMany({
        where: {
          entityId: { in: entityIds },
          type: 'INVOICE',
          status: { in: ['PENDING', 'OVERDUE'] },
          dueDate: { lt: todayStart },
        },
      }),

      // Budget alerts: budgets that are >80% spent
      prisma.budget.findMany({
        where: {
          entityId: { in: entityIds },
          status: 'active',
        },
      }),
    ]);

    // Build calendar section
    const conflicts = detectConflicts(calendarEvents);
    const calendarSection = {
      events: calendarEvents.map((e) => ({
        title: e.title,
        time: formatTime(e.startTime),
        type: categorizeEvent(e.title),
      })),
      conflicts,
    };

    // Build inbox section
    const urgentMessages = unreadMessages.filter((m) => m.triageScore >= 8);
    const needsReplyMessages = unreadMessages.filter(
      (m) => m.intent === 'NEEDS_REPLY' || m.intent === 'QUESTION'
    );
    const fyiMessages = unreadMessages.filter((m) => m.triageScore <= 3);
    const inboxSection = {
      total: unreadMessages.length,
      urgent: urgentMessages.length,
      needsReply: needsReplyMessages.length,
      fyi: fyiMessages.length,
    };

    // Build tasks section
    const tasksSection = {
      overdue: overdueTasks.length,
      dueToday: todayTasks.length,
      topPriorities: topPriorityTasks.map((t) => ({
        title: t.title,
        priority: t.priority,
        dueDate: t.dueDate?.toISOString(),
      })),
    };

    // Build finance section
    const budgetWarnings: string[] = [];
    for (const b of budgetAlerts) {
      if (b.amount > 0) {
        const pct = (b.spent / b.amount) * 100;
        if (pct >= 90) {
          budgetWarnings.push(`${b.name} budget is ${Math.round(pct)}% spent`);
        } else if (pct >= 80) {
          budgetWarnings.push(`${b.name} budget is approaching limit (${Math.round(pct)}% spent)`);
        }
      }
    }

    const overdueTotal = overdueFinancials.reduce((sum, r) => sum + r.amount, 0);
    const cashFlowAlert =
      overdueTotal > 0
        ? `$${overdueTotal.toLocaleString()} in overdue receivables.`
        : undefined;

    const financeSection = {
      overdueInvoices: overdueFinancials.length,
      cashFlowAlert,
      budgetWarnings,
    };

    // Build recommendations
    const recommendations: BriefingRecommendation[] = [];

    if (conflicts > 0) {
      recommendations.push({
        action: `Resolve ${conflicts} calendar conflict${conflicts !== 1 ? 's' : ''}`,
        reason: 'Overlapping meetings detected today',
        priority: 'high',
      });
    }

    if (urgentMessages.length > 0) {
      recommendations.push({
        action: `Review ${urgentMessages.length} urgent message${urgentMessages.length !== 1 ? 's' : ''}`,
        reason: 'High-priority messages awaiting response',
        priority: 'high',
      });
    }

    if (overdueTasks.length > 0) {
      recommendations.push({
        action: `Address ${overdueTasks.length} overdue task${overdueTasks.length !== 1 ? 's' : ''}`,
        reason: 'Tasks past their due date',
        priority: 'high',
      });
    }

    if (overdueFinancials.length > 0) {
      recommendations.push({
        action: `Follow up on ${overdueFinancials.length} overdue invoice${overdueFinancials.length !== 1 ? 's' : ''}`,
        reason: `$${overdueTotal.toLocaleString()} outstanding`,
        priority: 'medium',
      });
    }

    if (budgetWarnings.length > 0) {
      recommendations.push({
        action: 'Review budget utilization',
        reason: budgetWarnings[0],
        priority: 'medium',
      });
    }

    // Sort recommendations by priority
    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    recommendations.sort(
      (a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2)
    );

    const contentWithoutSummary = {
      calendar: calendarSection,
      inbox: inboxSection,
      tasks: tasksSection,
      finance: financeSection,
      recommendations,
    };

    return {
      ...contentWithoutSummary,
      summary: buildNaturalSummary(contentWithoutSummary),
    };
  }

  /**
   * Deliver the briefing via the user's preferred channel.
   */
  async deliverBriefing(
    userId: string
  ): Promise<{ channel: string; delivered: boolean }> {
    // Fetch proactive config to determine delivery channel
    const config = await prisma.shadowProactiveConfig.findUnique({
      where: { userId },
    });

    const channel = config?.briefingChannel ?? 'in_app';
    const briefingEnabled = config?.briefingEnabled ?? true;

    if (!briefingEnabled) {
      return { channel, delivered: false };
    }

    // Generate briefing content
    const content = await this.generateBriefing(userId);

    // Create in-app notification for the briefing
    await prisma.notification.create({
      data: {
        userId,
        type: 'system',
        title: 'Morning Briefing',
        body: content.summary,
        priority: 'normal',
        metadata: {
          briefingType: 'morning',
          calendar: content.calendar,
          inbox: content.inbox,
          tasks: content.tasks,
          finance: content.finance,
          recommendations: content.recommendations,
        },
      },
    });

    // Record outreach
    await prisma.shadowOutreach.create({
      data: {
        userId,
        triggerType: 'morning_briefing',
        channel,
        status: 'delivered',
        content: content.summary,
      },
    });

    return { channel, delivered: true };
  }
}

export const morningBriefingService = new MorningBriefingService();
