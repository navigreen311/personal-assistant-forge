// ============================================================================
// Shadow Voice Agent — Escalation State Machine
// v2 spec Part 9.3: notify -> call -> SMS -> second call -> phone tree.
// ============================================================================
//
// P-16, deliverable 4. THIS FILE WAS ALREADY CORRECT AND HAD NO CALLER.
// `docs/parallel-build/decision-02-throttle.md`'s amendment records how that
// was missed: a grep for `@/modules/shadow/proactive` prefix-matched four
// routes that import `.../morning-briefing`, and import-granular reachability
// was read as function-granular reachability. Until `proactive-runner.ts`, the
// `notificationEscalator` singleton had zero callers anywhere in `src/`, so
// every anti-spam control the Shadow settings page offers -- quiet hours, the
// call window, `maxCallsPerDay`, `maxCallsPerHour`, the cooldown -- was a
// stored preference nothing read.
//
// What P-16 changed here is small and deliberate:
//
//   * `preferredChannel` (Addition 7.1). The adaptive channel service decides
//     which channel a user actually answers; a downgrade has to reach the rung
//     that would otherwise have placed a call. `phone_tree` is exempt --
//     "NEVER DOWNGRADE: Crisis declarations always call".
//   * `acknowledge()`. `escalate()` already stopped when it saw an
//     `acknowledged` row, and nothing in the repository could produce one. The
//     stop condition was unreachable.
//   * `dueForNextStep()`. The ladder's `waitMinutes` were declared and never
//     consulted; a state machine that cannot tell whether the wait has elapsed
//     is a list, not a machine.
//
// The anti-spam counting is unchanged, because it is right: it counts the
// durable `ShadowOutreach` rows that record the outreach rather than keeping a
// counter, so it is correct across a restart and across instances by
// construction. That is the reason `src/engines/trust-safety/throttle-service.ts`
// was deleted rather than persisted (Decision 2).

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
  /**
   * The channel the adaptive service says this user actually answers for this
   * trigger type. When it is not a phone channel, the phone rungs of the ladder
   * are delivered on it instead. `phone_tree` is never downgraded.
   */
  preferredChannel?: string;
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
  /** Why a `blocked` result was blocked. Absent otherwise. */
  reason?: string;
  /** The `ShadowOutreach` row this call wrote, when it wrote one. */
  outreachId?: string;
}

export interface ActiveEscalation {
  notificationId: string;
  triggerType: string;
  attempts: number;
  lastAttemptAt: Date;
  priority: EscalationPriority;
  title: string;
}

export interface AcknowledgeResult {
  acknowledged: boolean;
  /** The channel the acknowledged outreach was delivered on. */
  channel: string | null;
  /** Trigger type of the acknowledged outreach, for effectiveness accounting. */
  triggerType: string | null;
  /** The escalation thread the row belonged to, if it belonged to one. */
  notificationId: string | null;
  /** Milliseconds between the outreach being recorded and this acknowledgement. */
  responseTimeMs: number | null;
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
    const { userId, notificationId, type, priority, title, content, preferredChannel } = params;

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

    // Addition 7.1 -- the adaptive downgrade, applied to the rung about to fire.
    const channel = applyChannelPreference(nextStep.channel, preferredChannel);

    // Anti-spam: check proactive config limits
    const spamCheck = await this.checkAntiSpam(userId, channel);
    if (!spamCheck.allowed) {
      // If we cannot deliver on this channel, record as blocked and skip
      const blocked = await prisma.shadowOutreach.create({
        data: {
          userId,
          triggerType: type,
          triggerEvent: notificationId,
          channel,
          status: 'blocked',
          content: `[ANTI-SPAM] ${spamCheck.reason}: ${title}`,
        },
      });

      return {
        channel,
        status: 'blocked',
        attempt: currentAttempt + 1,
        reason: spamCheck.reason,
        outreachId: blocked.id,
      };
    }

    // Record this escalation step
    const row = await prisma.shadowOutreach.create({
      data: {
        userId,
        triggerType: type,
        triggerEvent: notificationId,
        channel,
        status: 'pending',
        content: `[${priority}] ${title}: ${content}`,
      },
    });

    return {
      channel,
      status: 'escalated',
      attempt: currentAttempt + 1,
      outreachId: row.id,
    };
  }

  /**
   * Record that the user answered.
   *
   * `escalate()` has always refused to advance past an `acknowledged` row, and
   * before this method nothing in the repository could write one -- so the stop
   * condition was unreachable and the ladder ran to exhaustion for every
   * notification. `POST /api/shadow/outreach/[id]/ack` is the entry point.
   *
   * `userId` is part of the lookup rather than a check after it: acknowledging
   * another user's outreach row must be indistinguishable from acknowledging
   * one that does not exist, and one acknowledged row anywhere in a thread is
   * what `escalate()` reads to stop the ladder.
   */
  async acknowledge(params: {
    userId: string;
    outreachId: string;
    now?: Date;
  }): Promise<AcknowledgeResult> {
    const { userId, outreachId } = params;
    const now = params.now ?? new Date();

    const pending = await prisma.shadowOutreach.findFirst({
      where: {
        id: outreachId,
        userId,
        status: { in: ['pending', 'delivered'] },
      },
    });

    if (!pending) {
      return {
        acknowledged: false,
        channel: null,
        triggerType: null,
        notificationId: null,
        responseTimeMs: null,
      };
    }

    await prisma.shadowOutreach.update({
      where: { id: pending.id },
      data: { status: 'acknowledged' },
    });

    return {
      acknowledged: true,
      channel: pending.channel,
      triggerType: pending.triggerType,
      notificationId: pending.triggerEvent,
      responseTimeMs: Math.max(0, now.getTime() - pending.createdAt.getTime()),
    };
  }

  /**
   * Has the wait after the last rung elapsed?
   *
   * The ladder `waitMinutes` values were declared and never read. Without this
   * the runner would advance every unacknowledged notification on every tick,
   * turning a five-rung ladder into five notifications in five minutes.
   */
  dueForNextStep(lastAttemptAt: Date, currentAttempt: number, now: Date = new Date()): boolean {
    const previous = ESCALATION_LADDER[currentAttempt - 1];
    if (!previous) return true;
    const dueAt = lastAttemptAt.getTime() + previous.waitMinutes * 60 * 1000;
    return now.getTime() >= dueAt;
  }

  /**
   * Every notification still climbing the ladder for this user.
   *
   * Grouped from the durable rows rather than an in-flight map, for the same
   * reason `checkAntiSpam` counts rows: a map does not survive a restart, and
   * an escalation that forgets it was mid-ladder starts again at rung one.
   *
   * BLOCKED ROWS ARE COUNTED, because `escalate()` counts them: a rung that
   * anti-spam refused has been spent, and the ladder moves on rather than
   * hammering the same refused channel every tick. The two must agree. They did
   * not in the first draft of this method -- it excluded blocked rows while
   * `escalate` included them, so a notification whose phone rungs were all
   * refused during quiet hours would have sat in this list, reported as still
   * climbing, forever. That is a smaller version of the same defect this whole
   * package is about: two places counting the same thing differently, with only
   * one of them consulted by the code that acts.
   */
  async listActiveEscalations(userId: string): Promise<ActiveEscalation[]> {
    const rows = await prisma.shadowOutreach.findMany({
      where: { userId, triggerEvent: { not: null } },
      orderBy: { createdAt: 'asc' },
    });

    const byNotification = new Map<
      string,
      {
        triggerType: string;
        attempts: number;
        lastAttemptAt: Date;
        content: string | null;
        acknowledged: boolean;
      }
    >();

    for (const row of rows) {
      const key = row.triggerEvent;
      if (!key) continue;
      const existing = byNotification.get(key);
      if (existing) {
        existing.attempts += 1;
        existing.lastAttemptAt = row.createdAt;
        existing.acknowledged = existing.acknowledged || row.status === 'acknowledged';
      } else {
        byNotification.set(key, {
          triggerType: row.triggerType,
          attempts: 1,
          lastAttemptAt: row.createdAt,
          content: row.content,
          acknowledged: row.status === 'acknowledged',
        });
      }
    }

    const out: ActiveEscalation[] = [];

    byNotification.forEach((value, notificationId) => {
      if (value.acknowledged) return;
      if (value.attempts >= ESCALATION_LADDER.length) return;
      out.push({
        notificationId,
        triggerType: value.triggerType,
        attempts: value.attempts,
        lastAttemptAt: value.lastAttemptAt,
        priority: this.extractPriority(value.content),
        title: extractTitle(value.content),
      });
    });

    return out;
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

/**
 * Apply the adaptive downgrade to one rung.
 *
 * A rung that already avoids the phone is left alone -- the adaptive service
 * ranks channels by response rate and could otherwise *upgrade* rung one from
 * an in-app push to an SMS, which is the opposite of what Addition 7.1 asks
 * for. Only phone rungs move, and only downwards.
 */
export function applyChannelPreference(
  ladderChannel: string,
  preferred: string | undefined
): string {
  if (!preferred) return ladderChannel;
  if (preferred === 'phone') return ladderChannel;
  // "NEVER DOWNGRADE: Crisis declarations always call" (v3, Addition 7.1).
  if (ladderChannel === 'phone_tree') return ladderChannel;
  if (!ladderChannel.includes('phone')) return ladderChannel;
  return preferred;
}

/** The title half of a `[P1] Title: content` outreach record. */
function extractTitle(content: string | null): string {
  if (!content) return 'Notification';
  const withoutPriority = content.replace(/^\[(P0|P1|P2)\]\s*/, '');
  const colon = withoutPriority.indexOf(':');
  return colon > 0 ? withoutPriority.slice(0, colon) : withoutPriority;
}

export const notificationEscalator = new NotificationEscalator();
