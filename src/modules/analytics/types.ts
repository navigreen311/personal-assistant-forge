export interface TimeAuditEntry {
  date: string;              // ISO date
  category: string;          // e.g., "deep_work", "meetings", "email", "admin", "personal"
  intendedMinutes: number;
  actualMinutes: number;
  driftMinutes: number;      // actual - intended
  driftPercent: number;
}

export interface TimeAuditReport {
  userId: string;
  periodStart: Date;
  periodEnd: Date;
  entries: TimeAuditEntry[];
  totalDriftMinutes: number;
  worstDriftCategory: string;
  alerts: DriftAlert[];
}

export interface DriftAlert {
  category: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  suggestedAction: string;
}

export interface ProductivityScore {
  userId: string;
  date: string;
  overallScore: number;       // 0-100
  dimensions: {
    highPriorityCompletion: number;   // % of P0/P1 tasks completed on time
    focusTimeAchieved: number;        // % of intended focus time realized
    goalProgress: number;             // weekly goal completion rate
    meetingEfficiency: number;        // prep time / meeting time ratio
    communicationSpeed: number;       // avg response time to P0 messages
  };
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
}

export interface GoalDefinition {
  id: string;
  userId: string;
  entityId?: string;
  title: string;
  description?: string;
  framework: 'OKR' | 'SMART' | 'CUSTOM';
  targetValue: number;
  currentValue: number;
  unit: string;
  milestones: GoalMilestone[];
  startDate: Date;
  endDate: Date;
  status: 'ON_TRACK' | 'AT_RISK' | 'BEHIND' | 'COMPLETE' | 'ABANDONED';
  autoProgress: boolean;     // auto-update progress from linked tasks/workflows
  linkedTaskIds: string[];
  linkedWorkflowIds: string[];
}

export interface GoalMilestone {
  id: string;
  title: string;
  targetValue: number;
  targetDate: Date;
  isComplete: boolean;
  completedAt?: Date;
}

export interface GoalCorrectionSuggestion {
  goalId: string;
  currentPace: number;
  requiredPace: number;
  suggestion: string;
  adjustedEndDate?: Date;
}

export interface HabitDefinition {
  id: string;
  userId: string;
  name: string;
  frequency: 'DAILY' | 'WEEKDAY' | 'WEEKLY';
  streak: number;
  longestStreak: number;
  successRate: number;        // last 30 days
  completionHistory: { date: string; completed: boolean }[];
  correlations: HabitCorrelation[];
}

export interface HabitCorrelation {
  habitName: string;
  metric: string;             // e.g., "productivity_score", "focus_time"
  correlationCoefficient: number;  // -1 to 1
  description: string;        // e.g., "Morning exercise correlates with 12% higher productivity"
}

export interface AIAccuracyMetrics {
  period: string;             // e.g., "2026-02-W7"
  triageAccuracy: number;     // % of correctly classified messages
  draftApprovalRate: number;  // % of AI drafts approved without edits
  predictionAccuracy: number; // % of deadline/outcome predictions correct
  automationSuccess: number;  // % of workflows completing without error
  overallScore: number;
}

export interface LLMCostDashboard {
  entityId: string;
  period: string;
  totalCostUsd: number;
  byFeature: { feature: string; cost: number; tokenCount: number }[];
  budgetCapUsd: number;
  percentUsed: number;
  projectedMonthEnd: number;
  alerts: string[];
}

export interface CallAnalytics {
  entityId: string;
  period: string;
  totalCalls: number;
  connectRate: number;
  averageDuration: number;
  outcomeDistribution: Record<string, number>;  // CallOutcome -> count
  sentimentAverage: number;
  roiPerCallType: { callType: string; averageRevenue: number; averageCost: number; roi: number }[];
  insights: string[];
}

export interface TimeSavedAggregate {
  userId: string;
  totalMinutesSaved: number;
  bySource: { source: string; minutes: number }[];
  dailyTrend: { date: string; minutes: number }[];
}
