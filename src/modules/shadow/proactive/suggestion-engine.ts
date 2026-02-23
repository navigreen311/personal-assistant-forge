import { prisma } from '@/lib/db';

// ---- Types ----

export interface Suggestion {
  id: string;
  type: string;
  title: string;
  description: string;
  priority: string;
  action: string;
}

export interface TriggerEvaluation {
  triggerId: string;
  triggerName: string;
  shouldFire: boolean;
  channel: string;
  content: string;
}

export type TriggerType =
  | 'P0_urgent'
  | 'crisis'
  | 'workflow_blocked'
  | 'overdue_task'
  | 'morning_briefing'
  | 'eod_summary'
  | 'vip_email';

/**
 * Defines the default trigger rules.
 * P0_urgent: call immediately, cannot be disabled
 * crisis: call immediately
 * workflow_blocked: call in 15 min
 * overdue_task: push
 * morning_briefing: in_app
 * eod_summary: disabled by default
 * vip_email: push + optional call
 */
const DEFAULT_TRIGGER_RULES: Record<
  TriggerType,
  { channel: string; canDisable: boolean; defaultEnabled: boolean; cooldownMinutes: number }
> = {
  P0_urgent: { channel: 'phone', canDisable: false, defaultEnabled: true, cooldownMinutes: 0 },
  crisis: { channel: 'phone', canDisable: true, defaultEnabled: true, cooldownMinutes: 5 },
  workflow_blocked: { channel: 'phone', canDisable: true, defaultEnabled: true, cooldownMinutes: 15 },
  overdue_task: { channel: 'push', canDisable: true, defaultEnabled: true, cooldownMinutes: 60 },
  morning_briefing: { channel: 'in_app', canDisable: true, defaultEnabled: true, cooldownMinutes: 1440 },
  eod_summary: { channel: 'in_app', canDisable: true, defaultEnabled: false, cooldownMinutes: 1440 },
  vip_email: { channel: 'push', canDisable: true, defaultEnabled: true, cooldownMinutes: 30 },
};

// ---- Service ----

export class SuggestionEngine {
  /**
   * Generate proactive suggestions for a user based on current data state.
   */
  async getSuggestions(userId: string): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];

    const entities = await prisma.entity.findMany({
      where: { userId },
      select: { id: true },
    });
    const entityIds = entities.map((e) => e.id);

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // Parallel data fetches
    const [overdueTasks, urgentMessages, staleContacts, blockedWorkflows, overdueInvoices] =
      await Promise.all([
        // Overdue tasks
        prisma.task.findMany({
          where: {
            entityId: { in: entityIds },
            status: { notIn: ['DONE', 'CANCELLED'] },
            dueDate: { lt: todayStart },
            deletedAt: null,
          },
          take: 10,
          orderBy: { dueDate: 'asc' },
        }),

        // Urgent unread messages
        prisma.message.findMany({
          where: {
            entityId: { in: entityIds },
            read: false,
            triageScore: { gte: 8 },
            deletedAt: null,
          },
          take: 10,
          orderBy: { createdAt: 'desc' },
        }),

        // Contacts not touched in 30 days with high relationship score
        prisma.contact.findMany({
          where: {
            entityId: { in: entityIds },
            relationshipScore: { gte: 70 },
            lastTouch: {
              lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
            },
            deletedAt: null,
          },
          take: 5,
          orderBy: { lastTouch: 'asc' },
        }),

        // Workflows that are active but haven't run recently
        prisma.workflow.findMany({
          where: {
            entityId: { in: entityIds },
            status: 'ACTIVE',
            lastRun: {
              lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
            },
          },
          take: 5,
        }),

        // Overdue invoices
        prisma.financialRecord.findMany({
          where: {
            entityId: { in: entityIds },
            type: 'INVOICE',
            status: { in: ['PENDING', 'OVERDUE'] },
            dueDate: { lt: todayStart },
          },
          take: 5,
          orderBy: { dueDate: 'asc' },
        }),
      ]);

    // Build suggestions from overdue tasks
    for (const task of overdueTasks) {
      const daysOverdue = Math.ceil(
        (now.getTime() - (task.dueDate?.getTime() ?? now.getTime())) / (24 * 60 * 60 * 1000)
      );
      suggestions.push({
        id: `overdue-task-${task.id}`,
        type: 'overdue_task',
        title: `Overdue: ${task.title}`,
        description: `This task is ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue. Consider completing, rescheduling, or delegating.`,
        priority: task.priority === 'P0' ? 'critical' : task.priority === 'P1' ? 'high' : 'medium',
        action: `review_task:${task.id}`,
      });
    }

    // Build suggestions from urgent messages
    for (const msg of urgentMessages) {
      suggestions.push({
        id: `urgent-msg-${msg.id}`,
        type: 'urgent_message',
        title: `Urgent: ${msg.subject ?? 'No subject'}`,
        description: `High-priority message (score: ${msg.triageScore}/10) awaiting your attention.`,
        priority: msg.triageScore >= 9 ? 'critical' : 'high',
        action: `review_message:${msg.id}`,
      });
    }

    // Build suggestions from stale contacts
    for (const contact of staleContacts) {
      const daysSinceTouch = contact.lastTouch
        ? Math.ceil((now.getTime() - contact.lastTouch.getTime()) / (24 * 60 * 60 * 1000))
        : 999;
      suggestions.push({
        id: `stale-contact-${contact.id}`,
        type: 'relationship_maintenance',
        title: `Reconnect with ${contact.name}`,
        description: `No contact in ${daysSinceTouch} days. Relationship score: ${contact.relationshipScore}.`,
        priority: 'low',
        action: `contact:${contact.id}`,
      });
    }

    // Build suggestions from blocked workflows
    for (const wf of blockedWorkflows) {
      suggestions.push({
        id: `blocked-wf-${wf.id}`,
        type: 'workflow_blocked',
        title: `Check workflow: ${wf.name}`,
        description: `Active workflow hasn't run in over 7 days. May need attention.`,
        priority: 'medium',
        action: `review_workflow:${wf.id}`,
      });
    }

    // Build suggestions from overdue invoices
    for (const inv of overdueInvoices) {
      const daysOverdue = inv.dueDate
        ? Math.ceil((now.getTime() - inv.dueDate.getTime()) / (24 * 60 * 60 * 1000))
        : 0;
      suggestions.push({
        id: `overdue-inv-${inv.id}`,
        type: 'overdue_invoice',
        title: `Overdue invoice: $${inv.amount.toLocaleString()}`,
        description: `Invoice from ${inv.vendor ?? 'unknown'} is ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue.`,
        priority: inv.amount >= 5000 ? 'high' : 'medium',
        action: `review_invoice:${inv.id}`,
      });
    }

    // Sort by priority
    const priorityOrder: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };
    suggestions.sort(
      (a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3)
    );

    return suggestions;
  }

  /**
   * Evaluate all configured triggers for a user.
   * Returns which triggers should fire and on what channel.
   */
  async evaluateTriggers(userId: string): Promise<TriggerEvaluation[]> {
    const results: TriggerEvaluation[] = [];

    // Fetch user's triggers
    const triggers = await prisma.shadowTrigger.findMany({
      where: { userId, enabled: true },
    });

    const now = new Date();

    for (const trigger of triggers) {
      const triggerType = trigger.triggerType as TriggerType;
      const defaultRule = DEFAULT_TRIGGER_RULES[triggerType];

      if (!defaultRule) continue;

      // P0_urgent cannot be disabled
      if (triggerType === 'P0_urgent' && !trigger.enabled) {
        // Override: always enabled
      }

      // Check cooldown
      if (trigger.lastTriggered) {
        const cooldown = trigger.cooldownMinutes ?? defaultRule.cooldownMinutes;
        const cooldownEnd = new Date(trigger.lastTriggered.getTime() + cooldown * 60 * 1000);
        if (now < cooldownEnd) {
          results.push({
            triggerId: trigger.id,
            triggerName: trigger.triggerName,
            shouldFire: false,
            channel: defaultRule.channel,
            content: `Cooldown active until ${cooldownEnd.toISOString()}`,
          });
          continue;
        }
      }

      // Evaluate trigger conditions
      const conditions = trigger.conditions as Record<string, unknown>;
      const shouldFire = await this.evaluateConditions(userId, triggerType, conditions);

      // Determine channel from trigger action or default
      const action = trigger.action as Record<string, unknown>;
      const channel = (action?.channel as string) ?? defaultRule.channel;

      // Build content
      const content = shouldFire
        ? this.buildTriggerContent(trigger.triggerName, triggerType, conditions)
        : '';

      results.push({
        triggerId: trigger.id,
        triggerName: trigger.triggerName,
        shouldFire,
        channel,
        content,
      });

      // Update lastTriggered if fired
      if (shouldFire) {
        await prisma.shadowTrigger.update({
          where: { id: trigger.id },
          data: { lastTriggered: now },
        });
      }
    }

    return results;
  }

  /**
   * Evaluate trigger conditions against current data.
   */
  private async evaluateConditions(
    userId: string,
    triggerType: TriggerType,
    conditions: Record<string, unknown>
  ): Promise<boolean> {
    const entities = await prisma.entity.findMany({
      where: { userId },
      select: { id: true },
    });
    const entityIds = entities.map((e) => e.id);

    switch (triggerType) {
      case 'P0_urgent': {
        // Check for any P0 tasks created in last 5 minutes
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        const p0Tasks = await prisma.task.count({
          where: {
            entityId: { in: entityIds },
            priority: 'P0',
            createdAt: { gte: fiveMinAgo },
            deletedAt: null,
          },
        });
        return p0Tasks > 0;
      }

      case 'crisis': {
        // Check for notifications marked as urgent in last 5 minutes
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        const crisisNotifications = await prisma.notification.count({
          where: {
            userId,
            priority: 'urgent',
            createdAt: { gte: fiveMinAgo },
            read: false,
          },
        });
        return crisisNotifications > 0;
      }

      case 'workflow_blocked': {
        // Check for workflows that should have run but haven't
        const threshold = (conditions?.staleDays as number) ?? 3;
        const staleDate = new Date(Date.now() - threshold * 24 * 60 * 60 * 1000);
        const blockedCount = await prisma.workflow.count({
          where: {
            entityId: { in: entityIds },
            status: 'ACTIVE',
            lastRun: { lt: staleDate },
          },
        });
        return blockedCount > 0;
      }

      case 'overdue_task': {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const overdueCount = await prisma.task.count({
          where: {
            entityId: { in: entityIds },
            status: { notIn: ['DONE', 'CANCELLED'] },
            dueDate: { lt: now },
            deletedAt: null,
          },
        });
        const threshold = (conditions?.minOverdue as number) ?? 1;
        return overdueCount >= threshold;
      }

      case 'morning_briefing': {
        // Check if briefing was already delivered today
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const deliveredToday = await prisma.shadowOutreach.count({
          where: {
            userId,
            triggerType: 'morning_briefing',
            createdAt: { gte: todayStart },
          },
        });
        return deliveredToday === 0;
      }

      case 'eod_summary': {
        // Check if EOD summary was already delivered today
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const deliveredToday = await prisma.shadowOutreach.count({
          where: {
            userId,
            triggerType: 'eod_summary',
            createdAt: { gte: todayStart },
          },
        });
        return deliveredToday === 0;
      }

      case 'vip_email': {
        // Check for unread messages from VIP contacts
        const config = await prisma.shadowProactiveConfig.findUnique({
          where: { userId },
        });
        const vipContacts = (config?.vipBreakoutContacts ?? []) as string[];
        if (vipContacts.length === 0) return false;

        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        const vipMessages = await prisma.message.count({
          where: {
            entityId: { in: entityIds },
            senderId: { in: vipContacts },
            read: false,
            createdAt: { gte: fiveMinAgo },
            deletedAt: null,
          },
        });
        return vipMessages > 0;
      }

      default:
        return false;
    }
  }

  /**
   * Build human-readable content for a trigger notification.
   */
  private buildTriggerContent(
    triggerName: string,
    triggerType: TriggerType,
    _conditions: Record<string, unknown>
  ): string {
    const templates: Record<TriggerType, string> = {
      P0_urgent: `URGENT: ${triggerName} - Immediate action required.`,
      crisis: `CRISIS ALERT: ${triggerName} - Please respond immediately.`,
      workflow_blocked: `Workflow "${triggerName}" appears to be blocked and needs attention.`,
      overdue_task: `You have overdue tasks. "${triggerName}" needs review.`,
      morning_briefing: `Your morning briefing is ready.`,
      eod_summary: `Here's your end-of-day summary.`,
      vip_email: `New message from VIP contact: ${triggerName}`,
    };

    return templates[triggerType] ?? `Trigger activated: ${triggerName}`;
  }
}

export const suggestionEngine = new SuggestionEngine();
