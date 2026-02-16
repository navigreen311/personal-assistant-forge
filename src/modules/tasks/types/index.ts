import type { Task, TaskStatus, Priority, ProjectHealth } from '@/shared/types';

// --- Task View Types ---

export type TaskView = 'LIST' | 'KANBAN' | 'TABLE';
export type ProjectView = 'KANBAN' | 'LIST' | 'GANTT' | 'TIMELINE';

export interface TaskFilters {
  status?: TaskStatus | TaskStatus[];
  priority?: Priority | Priority[];
  entityId?: string;
  projectId?: string;
  assigneeId?: string;
  tags?: string[];
  dueDateRange?: { from?: Date; to?: Date };
  search?: string;
  hasNoDueDate?: boolean;
  isOverdue?: boolean;
  isBlocked?: boolean;
}

export interface TaskSortOptions {
  field: 'priority' | 'dueDate' | 'createdAt' | 'updatedAt' | 'title' | 'status';
  direction: 'asc' | 'desc';
}

// --- NLP Parsing Types ---

export interface ParsedTaskInput {
  title: string;
  description?: string;
  priority?: 'P0' | 'P1' | 'P2';
  dueDate?: Date;
  projectName?: string;
  assigneeName?: string;
  tags?: string[];
  entityName?: string;
  confidence: number;
  rawInput: string;
}

export interface NLPEntity {
  type: 'DATE' | 'PRIORITY' | 'PERSON' | 'PROJECT' | 'TAG' | 'ACTION_VERB';
  value: string;
  normalized: string;
  startIndex: number;
  endIndex: number;
}

// --- Prioritization Types ---

export type EisenhowerQuadrant = 'DO_FIRST' | 'SCHEDULE' | 'DELEGATE' | 'ELIMINATE';

export interface PrioritizationScore {
  taskId: string;
  overallScore: number;
  quadrant: EisenhowerQuadrant;
  factors: PrioritizationFactor[];
  recommendation: string;
}

export interface PrioritizationFactor {
  name: string;
  weight: number;
  score: number;
  reason: string;
}

export interface DailyTop3 {
  date: Date;
  tasks: Array<{
    task: Task;
    score: PrioritizationScore;
    estimatedDuration?: number;
  }>;
  reasoning: string;
}

// --- Dependency Graph Types ---

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  criticalPath: string[];
  bottlenecks: string[];
}

export interface DependencyNode {
  taskId: string;
  taskTitle: string;
  status: string;
  priority: string;
  dueDate?: Date;
  depth: number;
  blockedByCount: number;
  blockingCount: number;
  isCriticalPath: boolean;
  isBottleneck: boolean;
  position: { x: number; y: number };
}

export interface DependencyEdge {
  fromTaskId: string;
  toTaskId: string;
  type: 'BLOCKS' | 'DEPENDS_ON';
}

// --- Recurring Task Types ---

export interface RecurringTaskConfig {
  id: string;
  taskTemplateId: string;
  cadence: RecurrenceCadence;
  nextDue: Date;
  slaHours?: number;
  autoAdjust: boolean;
  lastGenerated?: Date;
  isActive: boolean;
}

export type RecurrenceCadence =
  | { type: 'DAILY' }
  | { type: 'WEEKLY'; dayOfWeek: number }
  | { type: 'BIWEEKLY'; dayOfWeek: number }
  | { type: 'MONTHLY'; dayOfMonth: number }
  | { type: 'QUARTERLY'; month: number; dayOfMonth: number }
  | { type: 'CUSTOM'; cronExpression: string };

// --- Procrastination & Forecasting Types ---

export interface ProcrastinationAlert {
  taskId: string;
  taskTitle: string;
  deferrals: number;
  originalDueDate?: Date;
  currentDueDate?: Date;
  daysSinceCreation: number;
  suggestion: 'BREAK_DOWN' | 'DELEGATE' | 'ELIMINATE' | 'SCHEDULE_NOW';
  reason: string;
}

export interface CompletionForecast {
  taskId?: string;
  projectId?: string;
  predictedCompletionDate: Date;
  confidence: number;
  velocity: number;
  remainingTasks: number;
  historicalData: { period: string; completed: number }[];
  risks: string[];
}

// --- Resource Allocation Types ---

export interface ResourceAllocation {
  userId: string;
  userName: string;
  totalCapacityHours: number;
  allocatedHours: number;
  utilizationPercent: number;
  tasks: Array<{ taskId: string; taskTitle: string; estimatedHours: number }>;
  isOvercommitted: boolean;
  overcommitmentHours?: number;
}

// --- Burndown / Velocity Types ---

export interface BurndownData {
  projectId: string;
  dataPoints: Array<{
    date: Date;
    idealRemaining: number;
    actualRemaining: number;
  }>;
  totalTasks: number;
  completedTasks: number;
  startDate: Date;
  targetDate: Date;
}

export interface VelocityMetrics {
  entityId: string;
  projectId?: string;
  currentVelocity: number;
  averageVelocity: number;
  trend: 'INCREASING' | 'STABLE' | 'DECREASING';
  weeklyData: Array<{ week: string; completed: number }>;
}

// --- Context Loading Types ---

export interface TaskContext {
  taskId: string;
  relatedDocuments: Array<{ id: string; title: string; type: string }>;
  relatedMessages: Array<{ id: string; subject?: string; channel: string; preview: string }>;
  relatedContacts: Array<{ id: string; name: string; role?: string }>;
  relatedNotes: string[];
  linkedUrls: string[];
  previousActivity: Array<{ action: string; date: Date; actor: string }>;
}
