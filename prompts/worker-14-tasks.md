# Worker 14: Task & Project Command Center (M3)

## Branch: ai-feature/w14-tasks

Create and check out the branch `ai-feature/w14-tasks` from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside these directories:

- `src/modules/tasks/services/` -- Task and project management services
- `src/modules/tasks/types/` -- Task-specific TypeScript types
- `src/modules/tasks/components/` -- Task and project UI components
- `src/modules/tasks/api/` -- Task module internal API helpers
- `src/modules/tasks/tests/` -- Task module co-located tests
- `src/app/api/tasks/` -- Next.js API routes for task endpoints
- `src/app/(dashboard)/tasks/` -- Next.js page routes for task UI
- `src/app/(dashboard)/projects/` -- Next.js page routes for project UI
- `tests/unit/tasks/` -- Task unit tests

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files. They define the project contracts:

1. **`prisma/schema.prisma`** -- Focus on `Task` model (title, description, entityId, projectId, priority, status, dueDate, dependencies[], assigneeId, createdFrom, tags[]) and `Project` model (name, entityId, description, milestones Json, status, health). Note the relation: Task belongs to Project, both belong to Entity.
2. **`src/shared/types/index.ts`** -- Key types: `Task` (id, title, description, entityId, projectId, priority: `Priority`, status: `TaskStatus`, dueDate, dependencies[], assigneeId, createdFrom, tags[], createdAt, updatedAt), `Project` (id, name, entityId, description, milestones: `Milestone[]`, status, health: `ProjectHealth`), `Milestone` (id, title, dueDate, status), `Priority` (`'P0' | 'P1' | 'P2'`), `TaskStatus` (`'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED'`), `ProjectHealth` (`'GREEN' | 'YELLOW' | 'RED'`), `CalendarEvent`, `Contact`, `Message`.
3. **`src/shared/utils/api-response.ts`** -- Use `success()`, `error()`, `paginated()` for all API route responses.
4. **`src/lib/db/index.ts`** -- Import `prisma` from `@/lib/db` for database operations.
5. **`package.json`** -- Dependencies include `zod`, `uuid`, `date-fns`. Use these.
6. **`tsconfig.json`** -- Path alias `@/*` maps to `./src/*`.

## Requirements

### 1. Task Module Types (`src/modules/tasks/types/index.ts`)

```typescript
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
  projectName?: string; // resolved to projectId later
  assigneeName?: string; // resolved to assigneeId later
  tags?: string[];
  entityName?: string; // resolved to entityId later
  confidence: number; // 0-1 overall parsing confidence
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
  overallScore: number; // 0-100, higher = more important
  quadrant: EisenhowerQuadrant;
  factors: PrioritizationFactor[];
  recommendation: string;
}

export interface PrioritizationFactor {
  name: string;
  weight: number;
  score: number; // 0-100
  reason: string;
}

export interface DailyTop3 {
  date: Date;
  tasks: Array<{
    task: Task;
    score: PrioritizationScore;
    estimatedDuration?: number; // minutes
  }>;
  reasoning: string;
}

// --- Dependency Graph Types ---

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  criticalPath: string[]; // ordered task IDs on critical path
  bottlenecks: string[]; // task IDs that block the most downstream tasks
}

export interface DependencyNode {
  taskId: string;
  taskTitle: string;
  status: string;
  priority: string;
  dueDate?: Date;
  depth: number; // distance from root
  blockedByCount: number;
  blockingCount: number;
  isCriticalPath: boolean;
  isBottleneck: boolean;
  position: { x: number; y: number }; // for visual layout
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
  slaHours?: number; // hours within which task should be completed
  autoAdjust: boolean; // adjust cadence based on completion patterns
  lastGenerated?: Date;
  isActive: boolean;
}

export type RecurrenceCadence =
  | { type: 'DAILY' }
  | { type: 'WEEKLY'; dayOfWeek: number } // 0=Sun
  | { type: 'BIWEEKLY'; dayOfWeek: number }
  | { type: 'MONTHLY'; dayOfMonth: number }
  | { type: 'QUARTERLY'; month: number; dayOfMonth: number }
  | { type: 'CUSTOM'; cronExpression: string };

// --- Procrastination & Forecasting Types ---

export interface ProcrastinationAlert {
  taskId: string;
  taskTitle: string;
  deferrals: number; // times the task has been deferred
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
  confidence: number; // 0-1
  velocity: number; // tasks per day/week
  remainingTasks: number;
  historicalData: { period: string; completed: number }[];
  risks: string[];
}

// --- Resource Allocation Types ---

export interface ResourceAllocation {
  userId: string;
  userName: string;
  totalCapacityHours: number; // per week
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
  currentVelocity: number; // tasks per week
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
```

### 2. Task Services

#### `src/modules/tasks/services/task-crud.ts` -- Task CRUD Operations

- `createTask(params: { title: string; entityId: string; description?: string; projectId?: string; priority?: Priority; status?: TaskStatus; dueDate?: Date; dependencies?: string[]; assigneeId?: string; tags?: string[]; createdFrom?: { type: string; sourceId: string } }): Promise<Task>` -- Create a task via Prisma. Validate that entityId exists. If projectId provided, validate it belongs to same entity.
- `getTask(taskId: string): Promise<Task | null>` -- Fetch single task.
- `updateTask(taskId: string, updates: Partial<{ title: string; description: string; priority: Priority; status: TaskStatus; dueDate: Date; dependencies: string[]; assigneeId: string; projectId: string; tags: string[] }>): Promise<Task>` -- Update task fields. Track status transitions for procrastination detection (if dueDate is pushed back, increment deferral count).
- `deleteTask(taskId: string): Promise<void>` -- Set status to CANCELLED (soft delete).
- `listTasks(filters: TaskFilters, sort?: TaskSortOptions, page?: number, pageSize?: number): Promise<{ data: Task[]; total: number }>` -- Filtered, sorted, paginated list from Prisma.
- `bulkUpdateTasks(taskIds: string[], updates: Partial<{ status: TaskStatus; priority: Priority; assigneeId: string; projectId: string }>): Promise<{ updated: number }>` -- Bulk update.
- `getTasksByProject(projectId: string, filters?: TaskFilters): Promise<Task[]>` -- All tasks for a project.
- `getOverdueTasks(entityId: string): Promise<Task[]>` -- Tasks past due date that are not DONE/CANCELLED.
- `getBlockedTasks(entityId: string): Promise<Task[]>` -- Tasks with BLOCKED status or unresolved dependencies.

#### `src/modules/tasks/services/project-crud.ts` -- Project CRUD Operations

- `createProject(params: { name: string; entityId: string; description?: string; milestones?: Milestone[] }): Promise<Project>` -- Create project via Prisma.
- `getProject(projectId: string): Promise<Project | null>` -- Fetch with milestones.
- `updateProject(projectId: string, updates: Partial<{ name: string; description: string; milestones: Milestone[]; status: TaskStatus; health: ProjectHealth }>): Promise<Project>` -- Update project.
- `deleteProject(projectId: string): Promise<void>` -- Archive project (set status to CANCELLED).
- `listProjects(entityId: string, filters?: { status?: string; health?: string }, page?: number, pageSize?: number): Promise<{ data: Project[]; total: number }>` -- Paginated list.
- `calculateProjectHealth(projectId: string): Promise<ProjectHealth>` -- Auto-calculate health based on: overdue tasks ratio, blocked tasks, milestone progress, velocity trend. GREEN = on track, YELLOW = at risk, RED = behind.
- `getProjectSummary(projectId: string): Promise<{ project: Project; taskCounts: Record<TaskStatus, number>; completionPercent: number; nextMilestone?: Milestone; health: ProjectHealth }>` -- Rich project summary.

#### `src/modules/tasks/services/nlp-parser.ts` -- Natural Language Task Parsing

- `parseTaskFromText(input: string): Promise<ParsedTaskInput>` -- Parse natural language into structured task data.
- `extractEntities(text: string): NLPEntity[]` -- Extract all recognized entities from text.
- Entity extraction rules (regex-based with normalization):
  - **Dates**: "tomorrow", "next Monday", "March 15", "in 3 days", "end of week", "by Friday", "due 3/15" -> normalized to ISO date using `date-fns`.
  - **Priorities**: "urgent", "high priority", "P0", "important", "low priority", "P2", "critical" -> normalized to P0/P1/P2.
  - **People**: "for Marcus", "assign to Sarah", "with Dr. Martinez" -> extract person name.
  - **Projects**: "for the EHR project", "in Downtown Development", "under HIPAA Audit" -> extract project reference.
  - **Tags**: "#healthcare", "#urgent", "tag: finance" -> extract tags.
  - **Action verbs**: "review", "call", "email", "schedule", "submit", "follow up", "draft" -> inform task title.
- `resolveEntityReferences(parsed: ParsedTaskInput, entityId: string): Promise<{ projectId?: string; assigneeId?: string; entityId: string }>` -- Look up project and assignee IDs from parsed names via Prisma.
- `parseMultipleTasks(input: string): Promise<ParsedTaskInput[]>` -- Parse input containing multiple tasks (separated by newlines, numbered lists, or "and" conjunctions).

#### `src/modules/tasks/services/prioritization-engine.ts` -- Smart Prioritization

- `scoreTask(task: Task, entityId: string): Promise<PrioritizationScore>` -- Calculate prioritization score.
- Scoring factors (each weighted, sum to 1.0):
  - **Urgency** (weight: 0.20): Based on due date proximity. Overdue = 100. Due today = 90. Due this week = 70. Due this month = 50. No due date = 30.
  - **Revenue impact** (weight: 0.20): Inferred from project's entity type and financial records. Tasks linked to high-value projects score higher. Look for financial records associated with the project/entity.
  - **Deadline pressure** (weight: 0.15): Ratio of remaining work to remaining time. More work + less time = higher score.
  - **Stakeholder importance** (weight: 0.15): Is the task assigned by/for a VIP contact? Is it from a P0 priority source?
  - **Strategic alignment** (weight: 0.10): Tags matching entity's core focus areas. E.g., HIPAA task for MedLink Pro entity scores higher.
  - **Dependency impact** (weight: 0.10): How many other tasks does this block? More downstream blockers = higher score.
  - **Completion momentum** (weight: 0.10): Is this task 80% done? Quick wins that are nearly complete score higher.
- Eisenhower classification:
  - DO_FIRST: urgent AND important (score > 75, due soon)
  - SCHEDULE: NOT urgent AND important (score > 50, not due soon)
  - DELEGATE: urgent AND NOT important (score < 50, due soon)
  - ELIMINATE: NOT urgent AND NOT important (score < 25, not due soon)
- `scoreBatch(tasks: Task[], entityId: string): Promise<PrioritizationScore[]>` -- Score multiple tasks efficiently.
- `getDailyTop3(userId: string, entityId: string): Promise<DailyTop3>` -- Each morning: return the 3 highest-leverage tasks with reasoning.
- `reprioritize(entityId: string): Promise<{ reranked: number; changes: Array<{ taskId: string; oldPriority: string; newPriority: string }> }>` -- Re-evaluate all active tasks and suggest priority adjustments.

#### `src/modules/tasks/services/dependency-graph.ts` -- Dependency Graphing

- `buildDependencyGraph(projectId: string): Promise<DependencyGraph>` -- Build the full dependency graph for a project. Fetch all tasks, resolve dependency links, calculate positions using a topological sort layout.
- `findCriticalPath(graph: DependencyGraph): string[]` -- Identify the longest chain of dependent tasks (critical path). Uses task due dates and estimated durations to determine the path with zero slack.
- `findBottlenecks(graph: DependencyGraph): string[]` -- Tasks that block the most downstream tasks. Sorted by blocking count descending.
- `detectCircularDependencies(tasks: Task[]): string[][]` -- Return arrays of task ID cycles. Use DFS-based cycle detection.
- `getBlockingChain(taskId: string): Promise<Task[]>` -- Trace the chain of tasks blocking a given task (recursive upward).
- `getDownstreamTasks(taskId: string): Promise<Task[]>` -- All tasks that directly or transitively depend on this task.
- `suggestDependencyResolution(blockedTaskId: string): Promise<string>` -- Suggest how to unblock: complete the blocker, reassign it, break the dependency, or escalate.

#### `src/modules/tasks/services/recurring-tasks.ts` -- Recurring Task Intelligence

- `createRecurringConfig(params: Omit<RecurringTaskConfig, 'id' | 'lastGenerated'>): RecurringTaskConfig` -- Define a recurring task template.
- `generateNextOccurrence(configId: string): Promise<Task>` -- Create the next task instance from the template.
- `getUpcomingRecurrences(entityId: string, days?: number): Promise<Array<{ config: RecurringTaskConfig; nextDue: Date }>>` -- List upcoming recurring tasks.
- `adjustCadence(configId: string): Promise<RecurringTaskConfig>` -- Analyze completion patterns. If tasks are consistently completed early, suggest shorter cadence. If consistently late, suggest longer cadence or SLA adjustment. Only auto-adjust if `autoAdjust` is true.
- `getRecurringConfigs(entityId: string): Promise<RecurringTaskConfig[]>` -- List all configs.
- `deactivateRecurring(configId: string): Promise<void>` -- Deactivate.
- `checkSLACompliance(configId: string): Promise<{ compliant: boolean; averageCompletionHours: number; slaHours: number; complianceRate: number }>` -- Check SLA adherence for recurring tasks.

#### `src/modules/tasks/services/procrastination-detector.ts` -- Procrastination Detection

- `detectProcrastination(entityId: string): Promise<ProcrastinationAlert[]>` -- Scan all active tasks for procrastination signals.
- Signals:
  - Due date deferred 2+ times.
  - Task in TODO status for > 14 days with no activity.
  - Task in IN_PROGRESS for > 7 days with no updates.
  - Task repeatedly moved between TODO and IN_PROGRESS without progress.
- `getSuggestion(alert: ProcrastinationAlert): string` -- Generate actionable suggestion:
  - BREAK_DOWN: "This task may be too large. Try breaking it into 3-5 smaller subtasks."
  - DELEGATE: "Consider delegating this to [suggested assignee based on tags/project]."
  - ELIMINATE: "This task has been deferred 5 times. Consider whether it's still needed."
  - SCHEDULE_NOW: "Block 90 minutes on your calendar to complete this."
- `getTaskDeferralHistory(taskId: string): Promise<Array<{ date: Date; oldDueDate?: Date; newDueDate?: Date }>>` -- Track deferral history (stored via task update logs).

#### `src/modules/tasks/services/forecasting-service.ts` -- Completion Forecasting

- `forecastTaskCompletion(taskId: string): Promise<CompletionForecast>` -- Predict when a task will be completed based on historical patterns.
- `forecastProjectCompletion(projectId: string): Promise<CompletionForecast>` -- Predict project completion based on velocity and remaining work.
- `calculateVelocity(entityId: string, projectId?: string, weeks?: number): Promise<VelocityMetrics>` -- Calculate task completion velocity over the specified period.
- `getBurndownData(projectId: string): Promise<BurndownData>` -- Calculate burndown chart data: ideal line from start to target, actual remaining tasks over time.
- `detectVelocityAnomalies(metrics: VelocityMetrics): string[]` -- Flag significant drops or spikes in velocity.

#### `src/modules/tasks/services/resource-allocation.ts` -- Resource Allocation

- `getResourceAllocation(entityId: string): Promise<ResourceAllocation[]>` -- For all assignees in the entity, calculate their allocated hours based on assigned tasks.
- `detectOvercommitment(entityId: string): Promise<ResourceAllocation[]>` -- Return only over-committed resources.
- `suggestRebalancing(entityId: string): Promise<Array<{ taskId: string; fromUserId: string; toUserId: string; reason: string }>>` -- Suggest task reassignments to balance load.
- Default capacity: 40 hours/week. Task hours estimated from priority (P0=4h, P1=2h, P2=1h as defaults) unless specified.

#### `src/modules/tasks/services/context-loader.ts` -- Task Context Loading

- `loadTaskContext(taskId: string): Promise<TaskContext>` -- Gather all related documents, messages, contacts, notes, and URLs associated with a task.
- Query strategy:
  - Documents: Search by task's tags and project.
  - Messages: Search by task's `createdFrom.sourceId` or mentions of task title.
  - Contacts: Task assignee + contacts mentioned in related messages.
  - Notes: Knowledge entries tagged with task's tags or project.
  - URLs: Extract from related documents and messages.
  - Previous activity: ActionLog entries targeting this task.

### 3. Task UI Components

#### `src/modules/tasks/components/TaskListView.tsx`
- Sortable list of tasks.
- Columns: checkbox (for bulk select), priority (colored badge P0=red, P1=yellow, P2=blue), title (clickable), status (badge), due date (with overdue highlighting in red), assignee (avatar/initials), project, tags.
- Inline edit: click priority/status badges to cycle values.
- Drag-and-drop to reorder (HTML5 DnD).
- Bulk action bar: change status, change priority, assign, move to project, delete.
- Empty state with helpful message.

#### `src/modules/tasks/components/TaskKanbanView.tsx`
- Kanban board with columns for each `TaskStatus` (TODO, IN_PROGRESS, BLOCKED, DONE, CANCELLED).
- Cards show: priority badge, title, due date, assignee avatar, tags.
- Drag cards between columns to update status (HTML5 DnD).
- Column headers show count.
- Collapsible columns for DONE and CANCELLED.
- Add task button at top of TODO column.

#### `src/modules/tasks/components/TaskTableView.tsx`
- Full spreadsheet-style table with all task fields.
- Sortable columns (click header to sort).
- Resizable columns.
- Inline editing for all fields.
- Row selection with checkbox.
- Export button (CSV format).

#### `src/modules/tasks/components/TaskDetailPanel.tsx`
- Slide-out panel for viewing/editing a single task.
- Sections: Title (editable), Description (rich text area), Priority selector, Status selector, Due date picker, Assignee selector, Project selector, Tags input, Dependencies list (with add/remove).
- Context section: shows `TaskContext` data (related docs, messages, contacts).
- Activity log: recent changes to this task.
- Subtask list (tasks that depend on this one or share a parent).
- Delete / Archive button.

#### `src/modules/tasks/components/TaskCreateForm.tsx`
- Quick create form with NLP input field.
- Type naturally (e.g., "Review Q4 financials for EHR project by Friday P0") and see parsed preview.
- Parsed fields shown below input: extracted title, priority, due date, project, tags with edit capability.
- Confidence indicator for each parsed field.
- Manual override for all fields.
- "Create" and "Create & Add Another" buttons.

#### `src/modules/tasks/components/PriorityMatrix.tsx`
- 2x2 Eisenhower matrix visualization.
- Quadrants: DO FIRST (top-left), SCHEDULE (top-right), DELEGATE (bottom-left), ELIMINATE (bottom-right).
- Tasks plotted as dots/cards in their quadrant.
- Click task to open detail panel.
- Drag between quadrants to re-prioritize.

#### `src/modules/tasks/components/DependencyGraphView.tsx`
- Visual dependency graph rendered with SVG.
- Nodes: task cards with status/priority badges.
- Edges: arrows showing blocking relationships (red for blocked, green for completed dependencies).
- Critical path highlighted in bold.
- Bottleneck nodes highlighted with warning icon.
- Click node to view task details.
- Pan and zoom controls.

#### `src/modules/tasks/components/DailyTop3.tsx`
- Card component showing the day's top 3 prioritized tasks.
- Each task shows: rank number, title, priority badge, due date, score, brief reasoning.
- "Start working" button that opens context loader.
- "Dismiss" to remove and see the next suggestion.
- Appears on dashboard and can be embedded in other views.

#### `src/modules/tasks/components/ProjectDashboard.tsx`
- Multi-project overview.
- Cards for each project showing: name, health badge (GREEN/YELLOW/RED), completion %, task counts by status, next milestone, velocity trend icon.
- Click card to navigate to project detail.
- Sort by: health, completion, name, last updated.
- Filter by entity.

#### `src/modules/tasks/components/ProjectDetailView.tsx`
- Header: project name, description, health badge, completion %.
- View switcher: KANBAN, LIST, GANTT (placeholder), TIMELINE (placeholder).
- Milestone tracker: horizontal timeline with milestone markers (completed = check, upcoming = dot, overdue = red).
- Burndown chart (simple Tailwind-based SVG chart showing ideal vs actual lines).
- Velocity widget showing tasks/week trend.
- Resource allocation bar chart showing assignee utilization.
- Task section using the selected view (delegates to TaskKanbanView/TaskListView).

#### `src/modules/tasks/components/ProcrastinationAlerts.tsx`
- Banner or card list showing procrastination alerts.
- Each alert: task title, deferral count, days since creation, suggestion with action button.
- Suggestion actions: "Break Down" opens subtask creator, "Delegate" opens assignee picker, "Eliminate" confirms cancellation, "Schedule Now" opens calendar.
- Dismissable alerts.

### 4. API Routes

#### `src/app/api/tasks/route.ts` -- Task CRUD
```typescript
// POST /api/tasks
// Body: { title, entityId, description?, projectId?, priority?, dueDate?, dependencies?, assigneeId?, tags?, createdFrom? }
// Response: ApiResponse<Task>

// GET /api/tasks?entityId=xxx&status=TODO,IN_PROGRESS&priority=P0,P1&projectId=xxx&search=xxx&page=1&pageSize=20&sort=priority:desc
// Response: ApiResponse<Task[]> with pagination
```

#### `src/app/api/tasks/[id]/route.ts` -- Single task
```typescript
// GET /api/tasks/:id -> ApiResponse<Task>
// PUT /api/tasks/:id -> Body: partial updates -> ApiResponse<Task>
// DELETE /api/tasks/:id -> soft delete (CANCELLED) -> ApiResponse<{ cancelled: true }>
```

#### `src/app/api/tasks/parse/route.ts` -- NLP parsing
```typescript
// POST /api/tasks/parse
// Body: { text: string, entityId: string }
// Response: ApiResponse<ParsedTaskInput>
```

#### `src/app/api/tasks/prioritize/route.ts` -- Prioritization
```typescript
// POST /api/tasks/prioritize
// Body: { taskIds?: string[], entityId: string }
// Response: ApiResponse<PrioritizationScore[]>

// GET /api/tasks/prioritize/daily-top3?userId=xxx&entityId=xxx
// Response: ApiResponse<DailyTop3>
```

#### `src/app/api/tasks/dependencies/route.ts` -- Dependency graph
```typescript
// GET /api/tasks/dependencies?projectId=xxx
// Response: ApiResponse<DependencyGraph>
```

#### `src/app/api/tasks/forecast/route.ts` -- Forecasting
```typescript
// GET /api/tasks/forecast?taskId=xxx -> task completion forecast
// GET /api/tasks/forecast?projectId=xxx -> project completion forecast
// Response: ApiResponse<CompletionForecast>
```

#### `src/app/api/tasks/procrastination/route.ts` -- Procrastination alerts
```typescript
// GET /api/tasks/procrastination?entityId=xxx
// Response: ApiResponse<ProcrastinationAlert[]>
```

#### `src/app/api/tasks/bulk/route.ts` -- Bulk operations
```typescript
// PATCH /api/tasks/bulk
// Body: { taskIds: string[], updates: { status?, priority?, assigneeId?, projectId? } }
// Response: ApiResponse<{ updated: number }>
```

#### `src/app/api/tasks/recurring/route.ts` -- Recurring tasks
```typescript
// GET /api/tasks/recurring?entityId=xxx -> list recurring configs
// POST /api/tasks/recurring -> create recurring config
// PUT /api/tasks/recurring -> update config
// DELETE /api/tasks/recurring -> deactivate config
```

#### `src/app/(dashboard)/projects/` routes use project-crud service directly via server components.

### 5. Dashboard Pages

#### `src/app/(dashboard)/tasks/page.tsx` -- Task Command Center
- View switcher (List / Kanban / Table).
- Filter bar with all TaskFilters.
- `DailyTop3` component pinned at top.
- `ProcrastinationAlerts` banner if alerts exist.
- `TaskCreateForm` accessible via "New Task" button.
- `TaskDetailPanel` slides in on task click.

#### `src/app/(dashboard)/tasks/[id]/page.tsx` -- Single Task Page
- Full `TaskDetailPanel` rendered as a page (not slide-out).
- Context section with `TaskContext` data.
- Dependency sub-graph showing this task's immediate blockers and dependents.

#### `src/app/(dashboard)/projects/page.tsx` -- Projects Dashboard
- `ProjectDashboard` showing all projects.
- "New Project" button.
- Filter by entity, health, status.

#### `src/app/(dashboard)/projects/[id]/page.tsx` -- Single Project Page
- `ProjectDetailView` with full project data.
- Milestones, burndown, velocity, resource allocation.
- Task views within the project scope.

#### `src/app/(dashboard)/tasks/layout.tsx` -- Tasks Section Layout
- Tabs: Tasks, Priority Matrix, Dependencies.
- Quick stats: total open, overdue, blocked, completed today.

## Acceptance Criteria

1. All TypeScript types compile without errors.
2. Task CRUD creates, reads, updates, and deletes tasks in Prisma.
3. Project CRUD with health auto-calculation (GREEN/YELLOW/RED).
4. NLP parser extracts dates, priorities, people, projects, and tags from natural language.
5. Prioritization engine produces scores with all 7 factors and correct Eisenhower classification.
6. Daily Top 3 returns the highest-leverage tasks with reasoning.
7. Dependency graph correctly identifies critical paths and bottlenecks.
8. Circular dependency detection catches cycles.
9. Procrastination detector identifies deferred/stale tasks with actionable suggestions.
10. Completion forecasting uses historical velocity data.
11. Burndown chart data correctly shows ideal vs actual remaining.
12. Resource allocation detects over-commitment.
13. All API routes validate input with Zod and return `ApiResponse<T>` format.
14. UI components use Tailwind only.
15. No modifications to shared types, api-response, db/index, or prisma schema.
16. All unit tests pass.
17. No `any` types.

## Implementation Steps

1. **Read context files**: Read all files listed in the Context section.
2. **Create branch**: `git checkout -b ai-feature/w14-tasks`
3. **Create task types**: `src/modules/tasks/types/index.ts`
4. **Implement task CRUD**: `src/modules/tasks/services/task-crud.ts`
5. **Implement project CRUD**: `src/modules/tasks/services/project-crud.ts`
6. **Implement NLP parser**: `src/modules/tasks/services/nlp-parser.ts`
7. **Implement prioritization engine**: `src/modules/tasks/services/prioritization-engine.ts`
8. **Implement dependency graph**: `src/modules/tasks/services/dependency-graph.ts`
9. **Implement recurring tasks**: `src/modules/tasks/services/recurring-tasks.ts`
10. **Implement procrastination detector**: `src/modules/tasks/services/procrastination-detector.ts`
11. **Implement forecasting service**: `src/modules/tasks/services/forecasting-service.ts`
12. **Implement resource allocation**: `src/modules/tasks/services/resource-allocation.ts`
13. **Implement context loader**: `src/modules/tasks/services/context-loader.ts`
14. **Build task UI components**: All 11 components in `src/modules/tasks/components/`.
15. **Create API routes**: All 9 route files under `src/app/api/tasks/`.
16. **Create dashboard pages**: All pages under `src/app/(dashboard)/tasks/` and `src/app/(dashboard)/projects/`.
17. **Write tests**: All test files.
18. **Type-check**: `npx tsc --noEmit`
19. **Run tests**: `npx jest tests/unit/tasks/`

## Tests

### `tests/unit/tasks/nlp-parser.test.ts`
```typescript
describe('NLPParser', () => {
  describe('parseTaskFromText', () => {
    it('should parse "Review Q4 financials by Friday P0" correctly');
    it('should parse "Call Dr. Martinez tomorrow about HIPAA audit" correctly');
    it('should parse "Schedule team meeting next Monday at 2pm" correctly');
    it('should parse "Submit proposal for Downtown Development by March 15" correctly');
    it('should parse "#urgent Follow up with Bobby about property" correctly');
    it('should handle plain text without entities as title-only');
    it('should normalize "tomorrow" to correct date');
    it('should normalize "urgent" to P0');
    it('should normalize "low priority" to P2');
    it('should extract multiple tags');
    it('should set confidence based on extraction count');
  });

  describe('parseMultipleTasks', () => {
    it('should parse newline-separated tasks');
    it('should parse numbered list of tasks');
    it('should handle "and" conjunction between tasks');
  });

  describe('extractEntities', () => {
    it('should extract DATE entities');
    it('should extract PRIORITY entities');
    it('should extract PERSON entities');
    it('should extract PROJECT entities');
    it('should extract TAG entities');
    it('should return start/end indices for each entity');
  });
});
```

### `tests/unit/tasks/prioritization-engine.test.ts`
```typescript
describe('PrioritizationEngine', () => {
  describe('scoreTask', () => {
    it('should give highest score to overdue P0 tasks blocking others');
    it('should give low score to P2 tasks with no due date');
    it('should weight revenue impact from associated financial records');
    it('should boost score for VIP stakeholder tasks');
    it('should boost score for tasks aligned with entity compliance profile');
    it('should boost score for nearly-complete tasks (momentum)');
    it('should produce score between 0 and 100');
  });

  describe('Eisenhower classification', () => {
    it('should classify urgent+important as DO_FIRST');
    it('should classify not-urgent+important as SCHEDULE');
    it('should classify urgent+not-important as DELEGATE');
    it('should classify not-urgent+not-important as ELIMINATE');
  });

  describe('getDailyTop3', () => {
    it('should return exactly 3 tasks');
    it('should return tasks sorted by score descending');
    it('should include reasoning for each task');
    it('should exclude DONE and CANCELLED tasks');
  });
});
```

### `tests/unit/tasks/dependency-graph.test.ts`
```typescript
describe('DependencyGraph', () => {
  describe('buildDependencyGraph', () => {
    it('should build graph with correct nodes and edges');
    it('should calculate node depth from root');
    it('should calculate blockedByCount and blockingCount');
  });

  describe('findCriticalPath', () => {
    it('should find longest dependency chain');
    it('should handle tasks with no dependencies');
    it('should handle parallel branches');
  });

  describe('findBottlenecks', () => {
    it('should identify tasks blocking the most downstream tasks');
    it('should return empty array when no dependencies');
  });

  describe('detectCircularDependencies', () => {
    it('should detect simple A->B->A cycle');
    it('should detect complex A->B->C->A cycle');
    it('should return empty array when no cycles');
  });
});
```

### `tests/unit/tasks/procrastination-detector.test.ts`
```typescript
describe('ProcrastinationDetector', () => {
  describe('detectProcrastination', () => {
    it('should flag tasks deferred 2+ times');
    it('should flag TODO tasks older than 14 days');
    it('should flag IN_PROGRESS tasks with no updates for 7 days');
    it('should not flag recently created tasks');
    it('should not flag DONE/CANCELLED tasks');
  });

  describe('getSuggestion', () => {
    it('should suggest BREAK_DOWN for large deferred tasks');
    it('should suggest DELEGATE for tasks with available assignees');
    it('should suggest ELIMINATE for tasks deferred 5+ times');
    it('should suggest SCHEDULE_NOW for moderately deferred tasks');
  });
});
```

### `tests/unit/tasks/forecasting-service.test.ts`
```typescript
describe('ForecastingService', () => {
  describe('calculateVelocity', () => {
    it('should calculate tasks completed per week');
    it('should detect increasing velocity trend');
    it('should detect decreasing velocity trend');
  });

  describe('forecastProjectCompletion', () => {
    it('should predict completion date based on velocity');
    it('should include confidence level');
    it('should identify risks when velocity is declining');
  });

  describe('getBurndownData', () => {
    it('should generate ideal remaining line');
    it('should generate actual remaining data points');
    it('should handle empty project');
  });
});
```

### `tests/unit/tasks/task-crud.test.ts`
```typescript
describe('TaskCRUD', () => {
  describe('createTask', () => {
    it('should create task with required fields');
    it('should validate entityId exists');
    it('should validate projectId belongs to entity');
    it('should default status to TODO');
    it('should default priority to P1');
  });

  describe('listTasks', () => {
    it('should filter by status');
    it('should filter by priority');
    it('should filter by multiple statuses');
    it('should filter by date range');
    it('should search by title');
    it('should paginate results');
    it('should sort by specified field');
  });

  describe('getOverdueTasks', () => {
    it('should return tasks past due date');
    it('should exclude DONE and CANCELLED');
  });
});
```

## Commit Strategy

Make atomic commits in this order:

1. `feat(tasks): add comprehensive task and project management types`
   - Files: `src/modules/tasks/types/index.ts`
2. `feat(tasks): implement task CRUD service with filtering, sorting, and pagination`
   - Files: `src/modules/tasks/services/task-crud.ts`
3. `feat(tasks): implement project CRUD service with health auto-calculation`
   - Files: `src/modules/tasks/services/project-crud.ts`
4. `feat(tasks): implement NLP parser for natural language task creation`
   - Files: `src/modules/tasks/services/nlp-parser.ts`
5. `feat(tasks): implement smart prioritization engine with Eisenhower classification`
   - Files: `src/modules/tasks/services/prioritization-engine.ts`
6. `feat(tasks): implement dependency graphing with critical path and bottleneck detection`
   - Files: `src/modules/tasks/services/dependency-graph.ts`
7. `feat(tasks): implement recurring tasks, procrastination detection, and forecasting`
   - Files: `src/modules/tasks/services/recurring-tasks.ts`, `procrastination-detector.ts`, `forecasting-service.ts`
8. `feat(tasks): implement resource allocation and context loader services`
   - Files: `src/modules/tasks/services/resource-allocation.ts`, `context-loader.ts`
9. `feat(tasks): add task view components (list, kanban, table, detail panel, create form)`
   - Files: `src/modules/tasks/components/TaskListView.tsx`, `TaskKanbanView.tsx`, `TaskTableView.tsx`, `TaskDetailPanel.tsx`, `TaskCreateForm.tsx`
10. `feat(tasks): add priority matrix, dependency graph, daily top 3, and procrastination UI`
    - Files: `src/modules/tasks/components/PriorityMatrix.tsx`, `DependencyGraphView.tsx`, `DailyTop3.tsx`, `ProcrastinationAlerts.tsx`
11. `feat(tasks): add project dashboard and detail view components`
    - Files: `src/modules/tasks/components/ProjectDashboard.tsx`, `ProjectDetailView.tsx`
12. `feat(tasks): add API routes for task CRUD, parsing, prioritization, dependencies, forecasting, and bulk operations`
    - Files: `src/app/api/tasks/**/*.ts`
13. `feat(tasks): add dashboard pages for task command center and project management`
    - Files: `src/app/(dashboard)/tasks/**/*.tsx`, `src/app/(dashboard)/projects/**/*.tsx`
14. `test(tasks): add unit tests for NLP parser, prioritization, dependencies, procrastination, and forecasting`
    - Files: `tests/unit/tasks/*.test.ts`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
