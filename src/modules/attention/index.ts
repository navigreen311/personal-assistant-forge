// Services
export {
  getBudget,
  consumeBudget,
  setBudget,
  resetBudget,
  deductBudget,
  setBudgetLimit,
  getBudgetHistory,
  isLowBudget,
} from './services/attention-budget-service';
export {
  getDNDConfig,
  setDND,
  isDNDActive,
  checkVIPBreakthrough,
  enableDND,
  disableDND,
  setQuietHours,
  addException,
  shouldSuppress,
} from './services/dnd-service';
export {
  bundleNotifications,
  getDigest,
  getWeeklyReview,
  bundleByPriority,
} from './services/notification-bundler';
export {
  analyzePatterns,
  getSuggestions,
  recordAction,
  getPreferences,
  suggestPriority,
  getInsights,
} from './services/notification-learning-service';
export {
  activate,
  deactivate,
  getState,
  setFocusTask,
  getFocusTask,
  clearFocusTask,
  getFocusStats,
  shouldInterrupt,
} from './services/one-thing-now-service';
export {
  routeNotification,
  getRoutingConfig,
  updateRoutingConfig,
} from './services/priority-router';

// Types
export type {
  AttentionBudget,
  PriorityRouting,
  NotificationItem,
  NotificationBundle,
  DNDConfig,
  OneThingNowState,
  NotificationLearning,
} from './types';
