// Shadow Voice Agent — Risk Scorer
// Pure function to compute dynamic risk score for action safety gating.
// Score thresholds: >40 require PIN, >70 require PIN + SMS.

import type { RiskFactors, RiskAssessment } from '../types';

/**
 * Compute a dynamic risk score based on contextual factors.
 *
 * Each factor contributes additive points. The total determines the
 * required confirmation level:
 *   0-40  → no extra confirmation (tap or none)
 *   41-70 → voice PIN required
 *   71+   → voice PIN + SMS verification
 */
export function computeRiskScore(factors: RiskFactors): RiskAssessment {
  const breakdown: Array<{ label: string; points: number }> = [];
  let score = 0;

  // Financial amount thresholds
  if (factors.financialAmount != null) {
    if (factors.financialAmount > 5000) {
      breakdown.push({ label: 'Financial amount >$5K', points: 35 });
      score += 35;
    } else if (factors.financialAmount > 1000) {
      breakdown.push({ label: 'Financial amount >$1K', points: 20 });
      score += 20;
    }
  }

  // Blast radius
  if (factors.blastRadius === 'public') {
    breakdown.push({ label: 'Blast radius: public', points: 25 });
    score += 25;
  } else if (factors.blastRadius === 'external') {
    breakdown.push({ label: 'Blast radius: external', points: 15 });
    score += 15;
  }

  // Phone channel adds risk (no visual confirmation)
  if (factors.channel === 'phone') {
    breakdown.push({ label: 'Phone channel', points: 15 });
    score += 15;
  }

  // Outside business hours
  if (!factors.isBusinessHours) {
    breakdown.push({ label: 'Outside business hours', points: 10 });
    score += 10;
  }

  // High action velocity (>10 actions in last hour)
  if (factors.actionsInLastHour > 10) {
    breakdown.push({ label: 'High action velocity (>10/hr)', points: 15 });
    score += 15;
  }

  // First-time action type
  if (factors.isFirstTimeAction) {
    breakdown.push({ label: 'First-time action', points: 10 });
    score += 10;
  }

  // Untrusted device
  if (!factors.isTrustedDevice) {
    breakdown.push({ label: 'Untrusted device', points: 25 });
    score += 25;
  }

  // Determine required confirmation level
  let requiredConfirmation: RiskAssessment['requiredConfirmation'];
  if (score > 70) {
    requiredConfirmation = 'voice_pin_sms';
  } else if (score > 40) {
    requiredConfirmation = 'voice_pin';
  } else if (score > 20) {
    requiredConfirmation = 'tap';
  } else {
    requiredConfirmation = 'none';
  }

  return {
    score,
    factors: breakdown,
    requiredConfirmation,
  };
}

/**
 * Determine whether the current time is within business hours
 * for the given timezone.
 */
export function isBusinessHours(timezone: string): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const hourStr = formatter.format(now);
    const hour = parseInt(hourStr, 10);

    const dayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    });
    const day = dayFormatter.format(now);

    // Business hours: Mon-Fri, 9:00 - 18:00
    const isWeekday = !['Sat', 'Sun'].includes(day);
    const isDuringHours = hour >= 9 && hour < 18;

    return isWeekday && isDuringHours;
  } catch {
    // Default to business hours if timezone is invalid
    return true;
  }
}

/**
 * Check how many actions the user has performed in the last hour.
 */
export async function getActionsInLastHour(
  prisma: {
    actionLog: {
      count: (args: { where: Record<string, unknown> }) => Promise<number>;
    };
  },
  userId: string,
): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  return prisma.actionLog.count({
    where: {
      actorId: userId,
      timestamp: { gte: oneHourAgo },
    },
  });
}

/**
 * Check if this action type has been performed by the user before.
 */
export async function isFirstTimeAction(
  prisma: {
    actionLog: {
      count: (args: { where: Record<string, unknown> }) => Promise<number>;
    };
  },
  userId: string,
  actionType: string,
): Promise<boolean> {
  const count = await prisma.actionLog.count({
    where: {
      actorId: userId,
      actionType,
    },
  });
  return count === 0;
}

/**
 * Check whether the device/session is from a trusted device.
 */
export async function isTrustedDevice(
  prisma: {
    shadowTrustedDevice: {
      findFirst: (args: {
        where: Record<string, unknown>;
      }) => Promise<{ id: string } | null>;
    };
  },
  userId: string,
  deviceFingerprint?: string,
): Promise<boolean> {
  if (!deviceFingerprint) return false;

  const device = await prisma.shadowTrustedDevice.findFirst({
    where: {
      userId,
      deviceFingerprint,
      isActive: true,
    },
  });

  return device !== null;
}
