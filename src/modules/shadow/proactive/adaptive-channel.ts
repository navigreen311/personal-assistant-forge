import { prisma } from '@/lib/db';

// ---- Types ----

export interface ChannelStats {
  channel: string;
  triggerType: string;
  attempts: number;
  responses: number;
  responseRate: number;
  avgResponseTime: number | null;
}

// ---- Constants ----

/** Channels that always escalate to call regardless of history for these trigger types. */
const ALWAYS_CALL_TRIGGERS = new Set(['P0_urgent', 'crisis', 'vip_email']);

/** Number of ignored calls that triggers a downgrade for non-P0 triggers. */
const IGNORED_CALL_THRESHOLD = 3;

/** Rolling window in days for effectiveness tracking. */
const ROLLING_WINDOW_DAYS = 30;

/** Channel preference order (most intrusive first). */
const CHANNEL_PRIORITY = ['phone', 'sms', 'push', 'in_app', 'email'];

/** Downgrade map: if this channel is ignored, try the next one. */
const DOWNGRADE_MAP: Record<string, string> = {
  phone: 'sms',
  sms: 'push',
  push: 'in_app',
  in_app: 'email',
};

// ---- Service ----

export class AdaptiveChannelService {
  /**
   * Record that an attempt was made to reach the user on a channel.
   */
  async recordAttempt(
    userId: string,
    channel: string,
    triggerType: string
  ): Promise<void> {
    const existing = await prisma.shadowChannelEffectiveness.findUnique({
      where: {
        userId_channel_triggerType: {
          userId,
          channel,
          triggerType,
        },
      },
    });

    if (existing) {
      const newAttempts = existing.attempts + 1;
      const newRate = existing.responses / newAttempts;

      await prisma.shadowChannelEffectiveness.update({
        where: { id: existing.id },
        data: {
          attempts: newAttempts,
          responseRate: newRate,
        },
      });
    } else {
      await prisma.shadowChannelEffectiveness.create({
        data: {
          userId,
          channel,
          triggerType,
          attempts: 1,
          responses: 0,
          responseRate: 0,
          avgResponseTime: null,
        },
      });
    }
  }

  /**
   * Record that the user responded on a channel.
   */
  async recordResponse(
    userId: string,
    channel: string,
    triggerType: string,
    responseTimeMs: number
  ): Promise<void> {
    const existing = await prisma.shadowChannelEffectiveness.findUnique({
      where: {
        userId_channel_triggerType: {
          userId,
          channel,
          triggerType,
        },
      },
    });

    if (existing) {
      const newResponses = existing.responses + 1;
      const attempts = Math.max(existing.attempts, 1);
      const newRate = newResponses / attempts;

      // Rolling average of response time
      const prevAvg = existing.avgResponseTime ?? responseTimeMs;
      const newAvg = (prevAvg * (newResponses - 1) + responseTimeMs) / newResponses;

      await prisma.shadowChannelEffectiveness.update({
        where: { id: existing.id },
        data: {
          responses: newResponses,
          responseRate: newRate,
          avgResponseTime: newAvg,
        },
      });
    } else {
      // First interaction: create with 1 attempt and 1 response
      await prisma.shadowChannelEffectiveness.create({
        data: {
          userId,
          channel,
          triggerType,
          attempts: 1,
          responses: 1,
          responseRate: 1.0,
          avgResponseTime: responseTimeMs,
        },
      });
    }
  }

  /**
   * Determine the best channel to reach a user for a given trigger type and priority.
   *
   * Rules:
   * - P0/crisis/VIP always use phone.
   * - If user has ignored 3+ phone calls for non-P0 triggers, downgrade to push/SMS.
   * - If push is ignored, try SMS.
   * - Use the channel with the best response rate for the trigger type.
   */
  async getBestChannel(
    userId: string,
    triggerType: string,
    priority: string
  ): Promise<string> {
    // P0, crisis, and VIP always call
    if (
      priority === 'P0' ||
      ALWAYS_CALL_TRIGGERS.has(triggerType)
    ) {
      return 'phone';
    }

    // Fetch effectiveness data for this user and trigger type
    const stats = await prisma.shadowChannelEffectiveness.findMany({
      where: {
        userId,
        triggerType,
      },
    });

    // Check if phone calls have been ignored too many times
    const phoneStats = stats.find((s) => s.channel === 'phone');
    if (phoneStats) {
      const ignoredCalls = phoneStats.attempts - phoneStats.responses;
      if (ignoredCalls >= IGNORED_CALL_THRESHOLD) {
        // Downgrade from phone: try SMS or push based on their effectiveness
        return this.findBestAlternative(stats, 'phone');
      }
    }

    // Check if push notifications are being ignored
    const pushStats = stats.find((s) => s.channel === 'push');
    if (pushStats && pushStats.attempts > 0 && pushStats.responseRate < 0.1) {
      // Push is being ignored, try SMS
      const smsStats = stats.find((s) => s.channel === 'sms');
      if (smsStats && smsStats.responseRate > pushStats.responseRate) {
        return 'sms';
      }
    }

    // Find channel with best response rate
    if (stats.length === 0) {
      // No data yet: default based on priority
      if (priority === 'P1') return 'push';
      return 'in_app';
    }

    // Sort by response rate descending, then by avg response time ascending
    const ranked = [...stats]
      .filter((s) => s.attempts > 0)
      .sort((a, b) => {
        const rateCompare = b.responseRate - a.responseRate;
        if (Math.abs(rateCompare) > 0.05) return rateCompare;
        return (a.avgResponseTime ?? Infinity) - (b.avgResponseTime ?? Infinity);
      });

    return ranked[0]?.channel ?? 'in_app';
  }

  /**
   * Get all channel stats for a user.
   */
  async getStats(userId: string): Promise<ChannelStats[]> {
    const records = await prisma.shadowChannelEffectiveness.findMany({
      where: { userId },
    });

    return records.map((r) => ({
      channel: r.channel,
      triggerType: r.triggerType,
      attempts: r.attempts,
      responses: r.responses,
      responseRate: r.responseRate,
      avgResponseTime: r.avgResponseTime,
    }));
  }

  /**
   * Find the best alternative channel after excluding the given channel.
   */
  private findBestAlternative(
    stats: Array<{
      channel: string;
      responseRate: number;
      avgResponseTime: number | null;
      attempts: number;
    }>,
    excludeChannel: string
  ): string {
    // Try the downgrade path first
    const downgraded = DOWNGRADE_MAP[excludeChannel];
    if (downgraded) {
      const downgradeStats = stats.find((s) => s.channel === downgraded);
      // Use downgraded channel if it has reasonable response rate or no data
      if (!downgradeStats || downgradeStats.responseRate > 0.2) {
        return downgraded;
      }
    }

    // Find any channel with decent response rate
    const alternatives = stats
      .filter((s) => s.channel !== excludeChannel && s.attempts > 0)
      .sort((a, b) => b.responseRate - a.responseRate);

    return alternatives[0]?.channel ?? downgraded ?? 'in_app';
  }
}

export const adaptiveChannelService = new AdaptiveChannelService();
