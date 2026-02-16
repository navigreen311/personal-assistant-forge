import type { ReengagementTrigger } from './types';

// Simulated user activity data (placeholder for database-backed tracking)
interface UserActivity {
  lastLogin: Date;
  dailyUsage7DayAvg: number;
  currentDayUsage: number;
  activationDay: number; // how many days since sign-up
  featuresUsedWeek1: string[];
  featuresUsedRecent: string[];
  lastStreakLength: number;
  currentStreakBroken: boolean;
}

// In-memory activity store
const userActivity = new Map<string, UserActivity>();

function getDefaultActivity(): UserActivity {
  return {
    lastLogin: new Date(),
    dailyUsage7DayAvg: 10,
    currentDayUsage: 10,
    activationDay: 1,
    featuresUsedWeek1: [],
    featuresUsedRecent: [],
    lastStreakLength: 0,
    currentStreakBroken: false,
  };
}

export function setUserActivity(userId: string, activity: Partial<UserActivity>): void {
  const existing = userActivity.get(userId) ?? getDefaultActivity();
  userActivity.set(userId, { ...existing, ...activity });
}

export async function checkForReengagementTriggers(userId: string): Promise<ReengagementTrigger[]> {
  const activity = userActivity.get(userId) ?? getDefaultActivity();
  const triggers: ReengagementTrigger[] = [];
  const now = new Date();

  // USAGE_DROP: Daily usage drops > 50% from 7-day average
  if (activity.dailyUsage7DayAvg > 0 && activity.currentDayUsage < activity.dailyUsage7DayAvg * 0.5) {
    triggers.push({
      userId,
      triggerType: 'USAGE_DROP',
      message: `Your activity has dropped significantly. You used to average ${activity.dailyUsage7DayAvg} actions/day but only had ${activity.currentDayUsage} today.`,
      suggestedAction: 'Check your automation dashboard for opportunities to re-engage with key workflows.',
      severity: 'MEDIUM',
      triggeredAt: now,
    });
  }

  // FEATURE_ABANDONMENT: Feature used in week 1 but not recently
  const abandonedFeatures = activity.featuresUsedWeek1.filter(
    f => !activity.featuresUsedRecent.includes(f)
  );
  if (abandonedFeatures.length > 0) {
    triggers.push({
      userId,
      triggerType: 'FEATURE_ABANDONMENT',
      message: `You haven't used ${abandonedFeatures.join(', ')} recently. These features saved you time in your first week.`,
      suggestedAction: `Re-enable ${abandonedFeatures[0]} to continue saving time.`,
      severity: 'LOW',
      triggeredAt: now,
    });
  }

  // STREAK_BREAK: Time-saved streak broken after 5+ day streak
  if (activity.currentStreakBroken && activity.lastStreakLength >= 5) {
    triggers.push({
      userId,
      triggerType: 'STREAK_BREAK',
      message: `Your ${activity.lastStreakLength}-day time-saving streak was broken! Keep the momentum going.`,
      suggestedAction: 'Complete one quick automation to restart your streak.',
      severity: 'MEDIUM',
      triggeredAt: now,
    });
  }

  // INACTIVE: No login in 3+ days during first 30 days, or 7+ days after
  const daysSinceLogin = Math.floor(
    (now.getTime() - activity.lastLogin.getTime()) / (24 * 60 * 60 * 1000)
  );
  const inactiveThreshold = activity.activationDay <= 30 ? 3 : 7;
  if (daysSinceLogin >= inactiveThreshold) {
    triggers.push({
      userId,
      triggerType: 'INACTIVE',
      message: activity.activationDay <= 30
        ? `We haven't seen you in ${daysSinceLogin} days. Your onboarding journey is waiting!`
        : `Welcome back! It's been ${daysSinceLogin} days. Here's what your AI assistant handled while you were away.`,
      suggestedAction: activity.activationDay <= 30
        ? 'Continue your activation checklist to unlock more time savings.'
        : 'Review your delegation inbox and pending approvals.',
      severity: daysSinceLogin >= 7 ? 'HIGH' : 'MEDIUM',
      triggeredAt: now,
    });
  }

  return triggers;
}

export function generateReengagementMessage(trigger: ReengagementTrigger): string {
  const prefix = trigger.severity === 'HIGH' ? 'We miss you!' : 'Quick tip:';
  return `${prefix} ${trigger.message} ${trigger.suggestedAction}`;
}
