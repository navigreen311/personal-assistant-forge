import { prisma } from '@/lib/db';

// ---- Types ----

export type EscalationPriority = 'P0' | 'P1' | 'P2';

export interface EscalationParams {
  userId: string;
  notificationId: string;
  type: string;
  priority: EscalationPriority;
  title: string;
  content: string;
  sourceType?: string;
  sourceId?: string;
}

export interface EscalationStep {
  channel: string;
  waitMinutes: number;
}

export interface EscalationState {
  notificationId: string;
  userId: string;
  priority: EscalationPriority;
  currentAttempt: number;
  currentChannel: string;
  status: 'pending' | 'acknowledged' | 'escalated' | 'exhausted';
  startedAt: Date;
  lastEscalatedAt: Date | null;
  acknowledged: boolean;
}

export interface EscalationResult {
  channel: string;
  status: string;
  attempt: number;
}

// ---- Escalation ladder ----

const ESCALATION_LADDER: Array<{ channel: string; waitMinutes: number }> = [
  { channel: 'in_app_push', waitMinutes: 5 },
  { channel: 'phone_sms', waitMinutes: 15 },
  { channel: 'sms_action_links', waitMinutes: 15 },
  { channel: 'phone_call_2', waitMinutes: 15 },
  { channel: 'phone_tree', waitMinutes: 0 }, // final step, crisis only
];

// ---- Service ----

export class NotificationEscalator {
  /**
   * Escalate a notification through the escalation ladder.
   * Each call advances one step if the prior step was not acknowledged.
   */
  async escalate(params: EscalationParams): Promise<EscalationResult> {
    const { userId, notificationId, type, priority, title, content, sourceType, sourceId } = params;

    // Load existing escalation state from outreach records
    const existingOutreach = await prisma.shadowOutreach.findMany({
      where: {
        userId,
        triggerEvent: notificationId,
        triggerType: type,
      },
      orderBy: { createdAt: 'desc' },
    });

    const currentAttempt = existingOutreach.length;
    const acknowledged = existingOutreach.some((o) => o.status === 'acknowledged');

    // If already acknowledged, do not escalate further
    if (acknowledged) {
      return {
        channel: existingOutreach[0]?.channel ?? 'in_app_push',
        status: 'acknowledged',
        attempt: currentAttempt,
      };
    }

    // Determine next step
    const nextStep = this.getNextEscalationStep(currentAttempt, priority);

    if (!nextStep) {
      return {
        channel: existingOutreach[0]?.channel ?? 'phone_tree',
        status: 'exhausted',
        attempt: currentAttempt,
      };
    }

    // Anti-spam: check proactive config limits
    const spamCheck = await this.checkAntiSpam(userId, nextStep.channel);
    if (!spamCheck.allowed) {
      // If we cannot deliver on this channel, record as blocked and skip
      await prisma.shadowOutreach.create({
        data: {
          userId,
          triggerType: type,
          triggerEvent: notificationId,
          channel: nextStep.channel,
          status: 'blocked',
          content: `[ANTI-SPAM] ${spamCheck.reason}: ${title}`,
        },
      });

      return {
        channel: nextStep.channel,
        status: 'blocked',
        attempt: currentAttempt + 1,
      };
    }

    // Record this escalation step
    await prisma.shadowOutreach.create({
      data: {
        userId,
        triggerType: type,
        triggerEvent: notificationId,
        channel: nextStep.channel,
        status: 'pending',
        content: `[${priority}] ${title}: ${content}`,
      },
    });

    return {
      channel: nextStep.channel,
      status: 'escalated',
      attempt: currentAttempt + 1,
    };
  }

  /**
   * Load the current escalation state for a notification.
   */
  async getEscalationState(notificationId: string): Promise<EscalationState | null> {
    const outreach = await prisma.shadowOutreach.findMany({
      where: { triggerEvent: notificationId },
      orderBy: { createdAt: 'asc' },
    });

    if (outreach.length === 0) return null;

    const first = outreach[0];
    const last = outreach[outreach.length - 1];
    const acknowledged = outreach.some((o) => o.status === 'acknowledged');

    let status: EscalationState['status'] = 'pending';
    if (acknowledged) {
      status = 'acknowledged';
    } else if (outreach.length >= ESCALATION_LADDER.length) {
      status = 'exhausted';
    } else if (outreach.length > 1) {
      status = 'escalated';
    }

    return {
      notificationId,
      userId: first.userId,
      priority: this.extractPriority(first.content),
      currentAttempt: outreach.length,
      currentChannel: last.channel,
      status,
      startedAt: first.createdAt,
      lastEscalatedAt: outreach.length > 1 ? last.createdAt : null,
      acknowledged,
    };
  }

  /**
   * Get the next escalation step based on current attempt and priority.
   * Step 5 (phone_tree) is only available for P0 (crisis-level) priority.
   */
  getNextEscalationStep(
    currentAttempt: number,
    priority: string
  ): EscalationStep | null {
    if (currentAttempt >= ESCALATION_LADDER.length) return null;

    const step = ESCALATION_LADDER[currentAttempt];

    // Phone tree is only for P0 crisis
    if (step.channel === 'phone_tree' && priority !== 'P0') {
      return null;
    }

    return { channel: step.channel, waitMinutes: step.waitMinutes };
  }

  /**
   * Check anti-spam rules from proactive config.
   */
  private async checkAntiSpam(
    userId: string,
    channel: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const config = await prisma.shadowProactiveConfig.findUnique({
      where: { userId },
    });

    if (!config) return { allowed: true };

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;

    // Check quiet hours for phone/SMS channels
    const isPhoneChannel = channel.includes('phone') || channel.includes('sms');
    if (isPhoneChannel) {
      const quietStart = config.quietHoursStart;
      const quietEnd = config.quietHoursEnd;
      if (this.isInQuietHours(currentTimeStr, quietStart, quietEnd)) {
        return { allowed: false, reason: 'Quiet hours active' };
      }

      // Check call window
      const windowStart = config.callWindowStart;
      const windowEnd = config.callWindowEnd;
      if (!this.isInWindow(currentTimeStr, windowStart, windowEnd)) {
        return { allowed: false, reason: 'Outside call window' };
      }
    }

    // Check max calls per day
    if (isPhoneChannel) {
      const dayStart = new Date(now);
      dayStart.setHours(0, 0, 0, 0);
      const callsToday = await prisma.shadowOutreach.count({
        where: {
          userId,
          channel: { contains: 'phone' },
          createdAt: { gte: dayStart },
          status: { not: 'blocked' },
        },
      });
      if (callsToday >= config.maxCallsPerDay) {
        return { allowed: false, reason: 'Max calls per day reached' };
      }
    }

    // Check max calls per hour
    if (isPhoneChannel) {
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const callsThisHour = await prisma.shadowOutreach.count({
        where: {
          userId,
          channel: { contains: 'phone' },
          createdAt: { gte: hourAgo },
          status: { not: 'blocked' },
        },
      });
      if (callsThisHour >= config.maxCallsPerHour) {
        return { allowed: false, reason: 'Max calls per hour reached' };
      }
    }

    // Check cooldown
    if (config.cooldownMinutes > 0) {
      const cooldownStart = new Date(now.getTime() - config.cooldownMinutes * 60 * 1000);
      const recentOutreach = await prisma.shadowOutreach.findFirst({
        where: {
          userId,
          channel,
          createdAt: { gte: cooldownStart },
          status: { not: 'blocked' },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (recentOutreach) {
        return { allowed: false, reason: 'Cooldown period active' };
      }
    }

    return { allowed: true };
  }

  private isInQuietHours(current: string, start: string, end: string): boolean {
    // Handles overnight quiet hours (e.g., 22:00 -> 07:00)
    if (start <= end) {
      return current >= start && current < end;
    }
    // Overnight: 22:00 to 07:00
    return current >= start || current < end;
  }

  private isInWindow(current: string, start: string, end: string): boolean {
    return current >= start && current <= end;
  }

  private extractPriority(content: string | null): EscalationPriority {
    if (!content) return 'P2';
    const match = content.match(/\[(P0|P1|P2)\]/);
    return (match?.[1] as EscalationPriority) ?? 'P2';
  }
}

export const notificationEscalator = new NotificationEscalator();
