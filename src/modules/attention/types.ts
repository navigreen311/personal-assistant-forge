export interface AttentionBudget {
  userId: string;
  dailyBudget: number;
  usedToday: number;
  remaining: number;
  resetAt: Date;
}

export interface PriorityRouting {
  priority: 'P0' | 'P1' | 'P2';
  action: 'INTERRUPT' | 'NEXT_DIGEST' | 'WEEKLY_REVIEW' | 'SILENT';
  channels: string[];
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  body: string;
  source: string;
  priority: 'P0' | 'P1' | 'P2';
  routedAction: 'INTERRUPT' | 'NEXT_DIGEST' | 'WEEKLY_REVIEW' | 'SILENT';
  isRead: boolean;
  isBundled: boolean;
  bundleId?: string;
  createdAt: Date;
}

export interface NotificationBundle {
  id: string;
  userId: string;
  title: string;
  itemCount: number;
  items: NotificationItem[];
  priority: 'P0' | 'P1' | 'P2';
  createdAt: Date;
}

export interface DNDConfig {
  userId: string;
  isActive: boolean;
  mode: 'MANUAL' | 'FOCUS_HOURS' | 'CALENDAR_AWARE' | 'SMART';
  vipBreakthroughEnabled: boolean;
  vipContactIds: string[];
  startTime?: string;
  endTime?: string;
  /**
   * P-36 (ESC-5): when a timed do-not-disturb ends. This used to exist only
   * inside `reason` as `JSON.stringify({ expiresAt })`, with no column to store
   * it and no reader to enforce it, so no timed DND had ever expired. It is now
   * a real column and `getDNDConfig` enforces it on read.
   */
  expiresAt?: Date;
  /** Kept for the existing callers. Now DERIVED from `expiresAt` on read, so it
   *  survives a restart instead of being returned once and lost. */
  reason?: string;
}

export interface OneThingNowState {
  userId: string;
  isActive: boolean;
  currentTask?: { taskId: string; title: string; startedAt: Date };
  blockedNotifications: number;
  sessionDuration: number;
}

export interface NotificationLearning {
  userId: string;
  patterns: { source: string; averageOpenRate: number; averageResponseTime: number; preferredTime: string }[];
  suggestions: string[];
}
