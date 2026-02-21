// Services
export {
  calculateAccuracyMetrics,
  getAccuracyTrend,
  trackPrediction,
  recordOutcome,
  getAccuracyByModule,
  getOverallAccuracy,
  getAccuracyTrendByPredictions,
} from './services/ai-accuracy-service';
export {
  getCallAnalytics,
  getCallTrend,
  getCallsPerPeriod,
  getAverageDuration,
  getSentimentDistribution,
  getOutcomeRates,
  getTopCallers,
  getCallTrends,
} from './services/call-analytics-service';
export {
  createGoal,
  updateGoalProgress,
  getGoals,
  suggestCourseCorrection,
  completeGoal,
} from './services/goal-tracking-service';
export {
  createHabit,
  recordCompletion,
  getHabits,
  getHabit,
  getStreaks,
  deleteHabit,
  updateHabit,
  calculateCorrelations,
  calculateStreak,
  pearsonCorrelation,
} from './services/habit-tracking-service';
export {
  getCostDashboard,
  getCostAlerts,
  getCostsByModule,
  getCostsByModel,
  getCostsByPeriod,
  getTotalCost,
  getCostTrend,
  getCostForecast,
  getTokenUsageSummary,
} from './services/llm-cost-service';
export {
  calculateProductivityScore,
  getProductivityTrend,
  calculateTrend,
  getTeamScores,
  getInsights,
} from './services/productivity-scoring';
export {
  getIntendedAllocation,
  generateTimeAudit,
  detectDriftAlerts,
} from './services/time-audit-service';

// Types
export type {
  TimeAuditEntry,
  TimeAuditReport,
  DriftAlert,
  ProductivityScore,
  GoalDefinition,
  GoalMilestone,
  GoalCorrectionSuggestion,
  HabitDefinition,
  HabitCorrelation,
  AIAccuracyMetrics,
  LLMCostDashboard,
  CallAnalytics,
  TimeSavedAggregate,
} from './types';
