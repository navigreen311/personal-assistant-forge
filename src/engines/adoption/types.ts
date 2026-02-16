export interface ActivationChecklist {
  userId: string;
  startDate: Date;
  currentDay: number;
  phases: ActivationPhase[];
  overallProgress: number;
}

export interface ActivationPhase {
  name: string;
  dayRange: [number, number];
  tasks: ActivationTask[];
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE';
}

export interface ActivationTask {
  id: string;
  title: string;
  description: string;
  phase: string;
  dayTarget: number;
  isComplete: boolean;
  completedAt?: Date;
  isAhaMoment: boolean;
}

export interface TimeSavedEntry {
  id: string;
  userId: string;
  action: string;
  minutesSaved: number;
  category: string;
  timestamp: Date;
}

export interface TimeSavedSummary {
  userId: string;
  totalMinutesSaved: number;
  totalHoursSaved: number;
  byCategory: Record<string, number>;
  byDay: { date: string; minutes: number }[];
  streak: number;
  projectedMonthlySavings: number;
}

export interface Playbook {
  id: string;
  name: string;
  description: string;
  category: string;
  steps: PlaybookStep[];
  estimatedTimeSavedMinutes: number;
  activationCount: number;
  rating: number;
}

export interface PlaybookStep {
  order: number;
  title: string;
  description: string;
  actionType: 'CONFIGURE' | 'CONNECT' | 'AUTOMATE' | 'REVIEW';
  isOptional: boolean;
}

export interface CoachingRecommendation {
  id: string;
  userId: string;
  type: 'FEATURE_DISCOVERY' | 'OPTIMIZATION' | 'AUTOMATION' | 'HABIT';
  title: string;
  description: string;
  estimatedImpactMinutes: number;
  oneClickAction?: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'PENDING' | 'APPLIED' | 'DISMISSED';
}

export interface AhaMoment {
  action: string;
  description: string;
  retentionCorrelation: number;
  targetDay: number;
}

export interface ReengagementTrigger {
  userId: string;
  triggerType: 'USAGE_DROP' | 'FEATURE_ABANDONMENT' | 'STREAK_BREAK' | 'INACTIVE';
  message: string;
  suggestedAction: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  triggeredAt: Date;
}
