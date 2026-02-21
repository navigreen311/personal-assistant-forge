// ============================================================================
// PersonalAssistantForge — Dashboard Module Types
// ============================================================================

// All date fields use string since JSON serialization converts Date to string

export interface DashboardData {
  greeting: {
    name: string;
    timeOfDay: 'morning' | 'afternoon' | 'evening';
  };
  topTasks: DashboardTask[];
  triageQueue: DashboardTriageItem[];
  activityFeed: DashboardActivity[];
  todaySchedule: DashboardEvent[];
  followUps: DashboardFollowUp[];
  stats: DashboardStats;
}

export interface DashboardTask {
  id: string;
  title: string;
  priority: 'P0' | 'P1' | 'P2';
  entityId: string;
  entityName: string;
  dueDate?: string;
  dependencies: string[];
  status: string;
}

export interface DashboardTriageItem {
  id: string;
  channel: string;
  senderName: string;
  senderAvatar?: string;
  subject: string;
  preview: string;
  urgencyScore: number; // 1-10
  timeAgo: string;
  entityName: string;
}

export interface DashboardActivity {
  id: string;
  actor: 'AI' | 'HUMAN' | 'SYSTEM';
  description: string;
  timestamp: string;
  entityName: string;
  undoable: boolean;
}

export interface DashboardEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  duration: number; // minutes
  type: 'meeting' | 'focus' | 'personal' | 'buffer';
  hasPrepPacket: boolean;
  entityName: string;
}

export interface DashboardFollowUp {
  id: string;
  recipientName: string;
  subject: string;
  daysWaiting: number;
  messageId: string;
}

export interface DashboardStats {
  openTasks: number;
  overdueTasks: number;
  meetingsToday: number;
  unreadMessages: number;
  focusTimeToday: number; // minutes
  focusTimeGoal: number; // minutes
  completedToday: number;
  timeSavedThisWeek: number; // minutes
}
