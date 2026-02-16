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
