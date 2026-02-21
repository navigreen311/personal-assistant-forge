// Services
export { loadTaskContext } from './services/context-loader';
export {
  buildDependencyGraph,
  findCriticalPathFromGraph,
  findBottlenecksFromGraph,
  detectCircularDependencies,
  getBlockingChain,
  getDownstreamTasks,
  suggestDependencyResolution,
} from './services/dependency-graph';
export {
  forecastTaskCompletion,
  forecastProjectCompletion,
  calculateVelocity,
  getBurndownData,
  detectVelocityAnomalies,
  forecastWithAI,
} from './services/forecasting-service';
export {
  extractEntities,
  parseTaskFromText,
  resolveEntityReferences,
  parseMultipleTasks,
} from './services/nlp-parser';
export {
  scoreTask,
  scoreBatch,
  getDailyTop3,
  reprioritize,
  suggestPriorityWithAI,
} from './services/prioritization-engine';
export {
  detectProcrastination,
  getSuggestion,
  getTaskDeferralHistory,
} from './services/procrastination-detector';
export {
  createProject,
  getProject,
  updateProject,
  deleteProject,
  listProjects,
  calculateProjectHealth,
  getProjectSummary,
} from './services/project-crud';
export {
  createRecurringConfig,
  generateNextOccurrence,
  getUpcomingRecurrences,
  adjustCadence,
  getRecurringConfigs,
  deactivateRecurring,
  checkSLACompliance,
} from './services/recurring-tasks';
export {
  getResourceAllocation,
  detectOvercommitment,
  suggestRebalancing,
} from './services/resource-allocation';
export {
  createTask,
  getTask,
  updateTask,
  deleteTask,
  listTasks,
  bulkUpdateTasks,
  getTasksByProject,
  getOverdueTasks,
  getBlockedTasks,
} from './services/task-crud';

// Types
export type {
  TaskView,
  ProjectView,
  TaskFilters,
  TaskSortOptions,
  ParsedTaskInput,
  NLPEntity,
  EisenhowerQuadrant,
  PrioritizationScore,
  PrioritizationFactor,
  DailyTop3,
  DependencyGraph,
  DependencyNode,
  DependencyEdge,
  RecurringTaskConfig,
  RecurrenceCadence,
  ProcrastinationAlert,
  CompletionForecast,
  ResourceAllocation,
  BurndownData,
  VelocityMetrics,
  TaskContext,
} from './types';
