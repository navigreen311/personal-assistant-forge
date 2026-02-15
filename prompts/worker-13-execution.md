# Worker 13: Execution Layer / Safe Autopilot (M18)

## Branch: ai-feature/w13-execution

Create and check out the branch `ai-feature/w13-execution` from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside these directories:

- `src/modules/execution/services/` -- Execution layer services (action queue, simulation, blast radius, rollback)
- `src/modules/execution/types/` -- Execution-specific TypeScript types
- `src/modules/execution/components/` -- Execution UI components (flight control, operator console, runbooks)
- `src/modules/execution/api/` -- Execution module internal API helpers
- `src/modules/execution/tests/` -- Execution module co-located tests
- `src/app/api/execution/` -- Next.js API routes for execution endpoints
- `src/app/(dashboard)/execution/` -- Next.js page routes for execution UI
- `tests/unit/execution/` -- Execution unit tests

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files. They define the project contracts:

1. **`prisma/schema.prisma`** -- Focus on `ActionLog` model (actor, actorId, actionType, target, reason, blastRadius, reversible, rollbackPath, status, cost, timestamp). Also note `ConsentReceipt` (actionId, description, reason, impacted, reversible, rollbackLink, confidence). These are your primary data models.
2. **`src/shared/types/index.ts`** -- Key types: `ActionLog` (status: `'PENDING' | 'EXECUTED' | 'ROLLED_BACK' | 'FAILED'`), `ActionActor` (`'AI' | 'HUMAN' | 'SYSTEM'`), `BlastRadius` (`'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'`), `ConsentReceipt`, `AutonomyLevel` (`'SUGGEST' | 'DRAFT' | 'EXECUTE_WITH_APPROVAL' | 'EXECUTE_AUTONOMOUS'`), `Task`, `Workflow`, `WorkflowStep`, `User`, `UserPreferences`.
3. **`src/shared/utils/api-response.ts`** -- Use `success()`, `error()`, `paginated()` for all API route responses.
4. **`src/lib/db/index.ts`** -- Import `prisma` from `@/lib/db` for database operations.
5. **`package.json`** -- Dependencies include `zod`, `uuid`, `date-fns`. Use these.
6. **`tsconfig.json`** -- Path alias `@/*` maps to `./src/*`.

## Requirements

### 1. Execution Module Types (`src/modules/execution/types/index.ts`)

```typescript
// --- Action Queue Types ---

export interface QueuedAction {
  id: string;
  actionLogId: string; // links to ActionLog in Prisma
  actor: 'AI' | 'HUMAN' | 'SYSTEM';
  actorId?: string;
  actionType: string;
  target: string;
  description: string; // human-readable "what"
  reason: string; // human-readable "why"
  impact: string; // human-readable "what happens"
  rollbackPlan: string; // human-readable "how to undo"
  blastRadius: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reversible: boolean;
  estimatedCost?: number;
  status: 'QUEUED' | 'APPROVED' | 'EXECUTING' | 'EXECUTED' | 'REJECTED' | 'ROLLED_BACK' | 'FAILED';
  requiresApproval: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  executedAt?: Date;
  scheduledFor?: Date; // future execution time
  entityId: string;
  projectId?: string;
  workflowExecutionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActionQueueFilters {
  status?: QueuedAction['status'];
  actor?: 'AI' | 'HUMAN' | 'SYSTEM';
  blastRadius?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  entityId?: string;
  projectId?: string;
  dateRange?: { from: Date; to: Date };
}

// --- Simulation Types ---

export interface SimulationRequest {
  actionType: string;
  target: string;
  parameters: Record<string, unknown>;
  entityId: string;
}

export interface SimulationResult {
  id: string;
  request: SimulationRequest;
  wouldDo: SimulatedEffect[];
  sideEffects: SimulatedEffect[];
  blastRadius: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reversible: boolean;
  estimatedCost: number;
  warnings: string[];
  recommendation: 'SAFE_TO_EXECUTE' | 'REVIEW_RECOMMENDED' | 'HIGH_RISK' | 'BLOCKED';
  simulatedAt: Date;
}

export interface SimulatedEffect {
  type: 'CREATE' | 'UPDATE' | 'DELETE' | 'SEND' | 'NOTIFY';
  model: string; // e.g., "Task", "Message", "Contact"
  description: string;
  affectedRecordIds?: string[];
  reversible: boolean;
}

// --- Blast Radius Types ---

export interface BlastRadiusScore {
  overall: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  factors: BlastRadiusFactor[];
  totalScore: number; // 0-100
  reversibilityScore: number; // 0-1 (1 = fully reversible)
  affectedEntitiesCount: number;
  affectedContactsCount: number;
  financialImpact: number;
  recommendation: string;
}

export interface BlastRadiusFactor {
  name: string;
  weight: number;
  score: number;
  reason: string;
}

// --- Rollback Types ---

export interface RollbackPlan {
  actionId: string;
  steps: RollbackStep[];
  estimatedDuration: number; // ms
  canAutoRollback: boolean;
  requiresManualSteps: boolean;
  manualInstructions?: string;
}

export interface RollbackStep {
  order: number;
  description: string;
  type: 'RESTORE' | 'DELETE' | 'UPDATE' | 'UNDO_SEND' | 'MANUAL';
  model?: string;
  recordId?: string;
  previousState?: Record<string, unknown>; // snapshot before action
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
}

export interface RollbackResult {
  actionId: string;
  status: 'COMPLETE' | 'PARTIAL' | 'FAILED';
  stepsCompleted: number;
  stepsFailed: number;
  stepsSkipped: number;
  details: RollbackStep[];
}

// --- Operator Console Types ---

export interface OperatorTimelineEntry {
  id: string;
  timestamp: Date;
  actor: 'AI' | 'HUMAN' | 'SYSTEM';
  actorName: string;
  actionType: string;
  target: string;
  description: string;
  blastRadius: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: string;
  entityId: string;
  entityName?: string;
  projectId?: string;
  projectName?: string;
  relatedActions: string[]; // IDs of related actions
}

export interface OperatorConsoleFilters {
  actor?: 'AI' | 'HUMAN' | 'SYSTEM';
  entityId?: string;
  projectId?: string;
  contactId?: string;
  dateRange?: { from: Date; to: Date };
  blastRadius?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  search?: string;
}

// --- Autopilot Runbook Types ---

export interface Runbook {
  id: string;
  name: string;
  description: string;
  entityId: string;
  schedule?: string; // cron expression, e.g., "0 9 * * 1" for Monday 9am
  steps: RunbookStep[];
  tags: string[];
  lastRunAt?: Date;
  lastRunStatus?: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RunbookStep {
  order: number;
  name: string;
  description: string;
  actionType: string;
  parameters: Record<string, unknown>;
  requiresApproval: boolean;
  maxBlastRadius: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  continueOnFailure: boolean;
  timeout?: number; // ms
}

export interface RunbookExecution {
  id: string;
  runbookId: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PAUSED';
  startedAt: Date;
  completedAt?: Date;
  stepResults: RunbookStepResult[];
  triggeredBy: string;
}

export interface RunbookStepResult {
  stepOrder: number;
  stepName: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED' | 'AWAITING_APPROVAL';
  actionId?: string; // links to QueuedAction
  startedAt?: Date;
  completedAt?: Date;
  output?: Record<string, unknown>;
  error?: string;
}

// --- Conditional Execution Gate Types ---

export interface ExecutionGate {
  id: string;
  name: string;
  expression: string; // e.g., "contractValue < 10000"
  description: string;
  scope: 'GLOBAL' | 'ENTITY' | 'RUNBOOK';
  entityId?: string;
  isActive: boolean;
}

// --- Cost Estimation Types ---

export interface CostEstimate {
  actionType: string;
  estimatedCost: number;
  currency: string;
  breakdown: CostBreakdownItem[];
  confidence: number; // 0-1
}

export interface CostBreakdownItem {
  item: string;
  cost: number;
  unit: string; // e.g., "per API call", "per token", "per message"
}
```

### 2. Execution Services

#### `src/modules/execution/services/action-queue.ts` -- Action Queue / Flight Control

- `enqueueAction(params: Omit<QueuedAction, 'id' | 'status' | 'createdAt' | 'updatedAt'>): Promise<QueuedAction>` -- Add action to the queue. Auto-determine `requiresApproval` based on blast radius and user autonomy level. Create corresponding `ActionLog` record in Prisma.
- `approveAction(actionId: string, approverId: string): Promise<QueuedAction>` -- Mark as approved, set approvedBy and approvedAt.
- `rejectAction(actionId: string, reason: string): Promise<QueuedAction>` -- Mark as rejected.
- `executeAction(actionId: string): Promise<QueuedAction>` -- Execute the approved action. Create `ConsentReceipt` in Prisma. Update status to EXECUTING then EXECUTED. On failure, set status to FAILED.
- `getQueuedActions(filters: ActionQueueFilters, page?: number, pageSize?: number): Promise<{ data: QueuedAction[]; total: number }>` -- Filtered, paginated list.
- `getActionById(actionId: string): Promise<QueuedAction | null>` -- Single action retrieval.
- `scheduleAction(actionId: string, scheduledFor: Date): Promise<QueuedAction>` -- Schedule for future execution.
- `bulkApprove(actionIds: string[], approverId: string): Promise<{ approved: number; failed: number }>` -- Approve multiple actions.
- `bulkReject(actionIds: string[], reason: string): Promise<{ rejected: number; failed: number }>` -- Reject multiple actions.
- Auto-approval logic: if user's `autonomyLevel` is `EXECUTE_AUTONOMOUS` and blast radius is `LOW`, auto-approve. If `EXECUTE_WITH_APPROVAL`, always queue for approval. If `SUGGEST`, only create suggestion without queuing.

#### `src/modules/execution/services/simulation-engine.ts` -- Dry-Run Simulation

- `simulateAction(request: SimulationRequest): Promise<SimulationResult>` -- Simulate an action without executing it. Generate a list of effects (what records would be created/updated/deleted), side effects (notifications triggered, downstream workflows), and warnings.
- `simulateMultipleActions(requests: SimulationRequest[]): Promise<SimulationResult[]>` -- Simulate a batch of actions and detect inter-dependencies.
- `generateImpactReport(simulationResult: SimulationResult): string` -- Generate human-readable impact summary.
- Effect simulation by action type:
  - `CREATE_TASK`: Shows task would be created, checks for duplicates, estimates project impact.
  - `SEND_MESSAGE`: Shows message would be sent, checks recipient preferences (doNotContact), flags sensitivity.
  - `UPDATE_RECORD`: Shows current vs. proposed values, identifies cascade effects.
  - `DELETE_RECORD`: Shows record details, identifies orphaned references, checks for dependencies.
  - `TRIGGER_WORKFLOW`: Shows which workflow steps would run, estimates total duration.
  - `FINANCIAL_ACTION`: Shows amount, checks approval thresholds, flags budget impact.

#### `src/modules/execution/services/blast-radius-scorer.ts` -- Blast Radius Scoring

- `scoreAction(actionType: string, target: string, parameters: Record<string, unknown>, entityId: string): Promise<BlastRadiusScore>` -- Calculate blast radius score (0-100) mapped to LOW/MEDIUM/HIGH/CRITICAL.
- Scoring factors (each weighted):
  - **Reversibility** (weight: 0.25): Can the action be undone? DELETE = high score. CREATE = low score. SEND_MESSAGE = medium (can't unsend).
  - **Scope** (weight: 0.20): How many records affected? 1 = low. 10+ = medium. 100+ = high. Mass operations = critical.
  - **Sensitivity** (weight: 0.20): Does it involve CONFIDENTIAL/RESTRICTED data? Financial data above threshold? HIPAA/GDPR data?
  - **External reach** (weight: 0.15): Does it go outside the system? API calls, sent emails, published docs = higher.
  - **Financial impact** (weight: 0.10): Dollar amount involved. $0 = low. >$1K = medium. >$10K = high. >$100K = critical.
  - **Stakeholder impact** (weight: 0.10): Affects VIP contacts? Board members? External partners?
- Thresholds: 0-25 = LOW, 26-50 = MEDIUM, 51-75 = HIGH, 76-100 = CRITICAL.
- `scoreBulkAction(actions: Array<{ actionType: string; target: string; parameters: Record<string, unknown> }>, entityId: string): Promise<BlastRadiusScore>` -- Score a batch as a whole (mass actions get aggregated blast radius).
- `getScoreExplanation(score: BlastRadiusScore): string` -- Human-readable explanation of the score.

#### `src/modules/execution/services/rollback-service.ts` -- Rollback / Undo System

- `createRollbackPlan(actionId: string): Promise<RollbackPlan>` -- Generate a rollback plan for an executed action. Inspect the action type and capture the current state of affected records as snapshots.
- `executeRollback(actionId: string): Promise<RollbackResult>` -- Execute the rollback plan step by step. For each step:
  - `RESTORE`: Use the `previousState` snapshot to restore a record.
  - `DELETE`: Delete a record that was created by the action.
  - `UPDATE`: Revert fields to their previous values.
  - `UNDO_SEND`: Mark sent messages as recalled (limited -- flag only; cannot truly unsend).
  - `MANUAL`: Log instruction for human to complete manually.
- `getRollbackPlan(actionId: string): Promise<RollbackPlan | null>` -- Retrieve existing rollback plan.
- `canRollback(actionId: string): Promise<{ canRollback: boolean; reason?: string }>` -- Check if rollback is still possible (some actions have time windows).
- Snapshot system: Before each action executes, the action queue service must capture the `previousState` of all affected records and store it in the rollback plan. This enables point-in-time restoration.

#### `src/modules/execution/services/operator-console.ts` -- Operator Console / Timeline

- `getTimeline(filters: OperatorConsoleFilters, page?: number, pageSize?: number): Promise<{ data: OperatorTimelineEntry[]; total: number }>` -- Paginated, filtered timeline of all actions.
- `getTimelineEntry(entryId: string): Promise<OperatorTimelineEntry | null>` -- Single entry with full details.
- `buildTimelineFromActionLogs(actionLogs: ActionLog[]): OperatorTimelineEntry[]` -- Transform ActionLog records into timeline entries with enriched data (resolve entity names, project names, actor names).
- `getActivitySummary(entityId: string, dateRange: { from: Date; to: Date }): Promise<{ totalActions: number; byActor: Record<string, number>; byType: Record<string, number>; byBlastRadius: Record<string, number>; topTargets: Array<{ target: string; count: number }> }>` -- Aggregated activity statistics.
- `searchTimeline(query: string, filters?: OperatorConsoleFilters): Promise<OperatorTimelineEntry[]>` -- Full-text search across timeline entries.

#### `src/modules/execution/services/runbook-service.ts` -- Autopilot Runbooks

- `createRunbook(params: Omit<Runbook, 'id' | 'createdAt' | 'updatedAt' | 'lastRunAt' | 'lastRunStatus'>): Promise<Runbook>` -- Create a new runbook.
- `getRunbook(runbookId: string): Promise<Runbook | null>` -- Retrieve a runbook.
- `updateRunbook(runbookId: string, updates: Partial<Runbook>): Promise<Runbook>` -- Update runbook.
- `deleteRunbook(runbookId: string): Promise<void>` -- Delete runbook.
- `listRunbooks(entityId: string, filters?: { isActive?: boolean; tag?: string }): Promise<Runbook[]>` -- List runbooks.
- `executeRunbook(runbookId: string, triggeredBy: string): Promise<RunbookExecution>` -- Execute runbook steps sequentially. For each step:
  1. Create a `QueuedAction` via action queue service.
  2. Run blast radius scoring.
  3. If `requiresApproval` or blast radius exceeds step's `maxBlastRadius`, pause and await approval.
  4. Execute the action.
  5. Record step result.
  6. If step fails and `continueOnFailure` is false, stop execution.
- `getRunbookExecution(executionId: string): Promise<RunbookExecution | null>` -- Get execution status.
- `listRunbookExecutions(runbookId: string): Promise<RunbookExecution[]>` -- Execution history.
- Built-in runbook templates (create as example runbooks users can clone):
  - **"Weekly CFO Pack"**: Generate financial summary report, aggregate outstanding invoices, calculate cash flow projections, compile in document, notify CFO.
  - **"Client Onboarding"**: Create contact record, create project, generate welcome email draft, schedule kickoff meeting, create onboarding task checklist.
  - **"Close the Loop Fridays"**: Scan all open tasks with no updates >7 days, draft follow-up messages for each, queue for review, send approved messages.

#### `src/modules/execution/services/cost-estimator.ts` -- Cost Estimation

- `estimateActionCost(actionType: string, parameters: Record<string, unknown>): CostEstimate` -- Estimate cost of an action.
- `estimateRunbookCost(runbook: Runbook): CostEstimate` -- Sum costs of all steps.
- Cost catalog (configurable base costs):
  - `SEND_MESSAGE`: $0.001 per email, $0.01 per SMS, $0 for in-app.
  - `CALL_API`: $0.01 per external API call.
  - `AI_ANALYSIS`: $0.02 per 1K tokens (placeholder).
  - `GENERATE_DOCUMENT`: $0.05 per document.
  - `CREATE_TASK`/`UPDATE_RECORD`/`DELETE_RECORD`: $0 (internal operations).
- `getDailyCostSummary(entityId: string, date: Date): Promise<{ totalCost: number; breakdown: CostBreakdownItem[] }>` -- Aggregate costs for a day.

#### `src/modules/execution/services/execution-gate.ts` -- Conditional Execution Gates

- `createGate(params: Omit<ExecutionGate, 'id'>): ExecutionGate` -- Create a gate.
- `evaluateGates(action: QueuedAction, context: Record<string, unknown>): Promise<{ passed: boolean; blockedBy?: ExecutionGate; reason?: string }>` -- Check all applicable gates before executing an action. Gates are evaluated in order; first failure blocks execution.
- `listGates(scope?: string, entityId?: string): ExecutionGate[]` -- List gates.
- `updateGate(gateId: string, updates: Partial<ExecutionGate>): ExecutionGate` -- Update a gate.
- `deleteGate(gateId: string): void` -- Remove a gate.
- Expression evaluation: Use safe parsing (same approach as Worker 12's condition evaluator -- recursive descent, NO `eval()`). Support: `contractValue < 10000`, `recipientCount <= 50`, `blastRadius != 'CRITICAL'`.

### 3. Execution UI Components

#### `src/modules/execution/components/FlightControl.tsx`
- Primary dashboard showing the action queue.
- Table view with columns: status (badge), actor (icon), action type, target, reason, blast radius (color-coded badge: green/yellow/orange/red), cost, scheduled time, actions.
- Inline approve/reject buttons for pending items.
- Expandable rows showing: full description, impact statement, rollback plan.
- Bulk select with bulk approve/reject.
- Filter bar: status, actor, blast radius, entity, date range.
- Auto-refresh every 10 seconds (or manual refresh button).
- Stats row at top: pending count, executed today, rolled back, total cost today.

#### `src/modules/execution/components/SimulationView.tsx`
- Modal or panel showing simulation results.
- Sections: "What would happen" (list of effects), "Side effects" (warnings), "Blast radius" (visual meter), "Cost estimate", "Recommendation" (badge).
- Buttons: "Execute for real", "Cancel", "Modify parameters".
- Compare mode: side-by-side before/after for update actions.

#### `src/modules/execution/components/OperatorConsole.tsx`
- Vertical timeline view of all system actions.
- Each entry shows: timestamp, actor avatar/icon (AI robot, human silhouette, system gear), action description, blast radius badge, entity context.
- Click entry to expand: full details, related actions, rollback button (if reversible).
- Filter sidebar: by actor, entity, project, contact, blast radius, date range, search.
- Activity summary cards at top: actions by actor pie chart (simple Tailwind bars), actions by blast radius, cost.

#### `src/modules/execution/components/RunbookEditor.tsx`
- Form for creating/editing runbooks.
- Step list with drag-and-drop reordering (HTML5 drag-and-drop, Tailwind).
- Per step: name, description, action type selector, parameter form, approval checkbox, max blast radius selector, continue-on-failure toggle, timeout input.
- Template selector: choose from built-in templates.
- Schedule configuration (cron expression helper with human-readable preview, e.g., "Every Monday at 9:00 AM").
- Preview/simulate button.
- Save and activate/deactivate toggle.

#### `src/modules/execution/components/RunbookExecutionView.tsx`
- Shows execution progress of a running/completed runbook.
- Step progress indicator (stepper with status icons).
- Per step: status, duration, output preview, action link, error details.
- Pause/resume/cancel buttons for running executions.
- Approval prompt for steps awaiting approval.

#### `src/modules/execution/components/BlastRadiusMeter.tsx`
- Reusable component displaying blast radius score.
- Visual meter: horizontal bar (green -> yellow -> orange -> red) with indicator.
- Below: score number, label (LOW/MEDIUM/HIGH/CRITICAL), reversibility indicator.
- Expandable factor breakdown: each factor name, weight, score, reason.
- Props: `{ score: BlastRadiusScore }`.

#### `src/modules/execution/components/CostDisplay.tsx`
- Reusable component showing cost estimates.
- Total cost with currency.
- Breakdown table: item, cost, unit.
- Confidence indicator (low/medium/high).
- Warning for high-cost actions.
- Props: `{ estimate: CostEstimate }`.

### 4. API Routes

#### `src/app/api/execution/queue/route.ts` -- Action queue operations
```typescript
// GET /api/execution/queue?status=QUEUED&blastRadius=HIGH&entityId=xxx&page=1&pageSize=20
// Response: ApiResponse<QueuedAction[]> with pagination

// POST /api/execution/queue
// Body: { actionType, target, description, reason, impact, rollbackPlan, blastRadius, entityId, ... }
// Response: ApiResponse<QueuedAction>
```

#### `src/app/api/execution/queue/[id]/route.ts` -- Single action operations
```typescript
// GET /api/execution/queue/:id -> ApiResponse<QueuedAction>
// PATCH /api/execution/queue/:id -> Body: { action: 'APPROVE' | 'REJECT' | 'EXECUTE' | 'SCHEDULE', ... }
// DELETE /api/execution/queue/:id -> cancel queued action -> ApiResponse<{ cancelled: true }>
```

#### `src/app/api/execution/queue/bulk/route.ts` -- Bulk operations
```typescript
// POST /api/execution/queue/bulk
// Body: { action: 'APPROVE' | 'REJECT', actionIds: string[], approverId?: string, reason?: string }
// Response: ApiResponse<{ processed: number; failed: number }>
```

#### `src/app/api/execution/simulate/route.ts` -- Simulation
```typescript
// POST /api/execution/simulate
// Body: { actionType, target, parameters, entityId }
// Response: ApiResponse<SimulationResult>
```

#### `src/app/api/execution/rollback/[id]/route.ts` -- Rollback operations
```typescript
// GET /api/execution/rollback/:id -> get rollback plan -> ApiResponse<RollbackPlan>
// POST /api/execution/rollback/:id -> execute rollback -> ApiResponse<RollbackResult>
```

#### `src/app/api/execution/timeline/route.ts` -- Operator timeline
```typescript
// GET /api/execution/timeline?actor=AI&entityId=xxx&from=2026-01-01&to=2026-02-15&page=1&pageSize=50
// Response: ApiResponse<OperatorTimelineEntry[]> with pagination
```

#### `src/app/api/execution/timeline/summary/route.ts` -- Activity summary
```typescript
// GET /api/execution/timeline/summary?entityId=xxx&from=2026-02-01&to=2026-02-15
// Response: ApiResponse<ActivitySummary>
```

#### `src/app/api/execution/runbooks/route.ts` -- Runbook CRUD
```typescript
// GET /api/execution/runbooks?entityId=xxx&isActive=true -> ApiResponse<Runbook[]>
// POST /api/execution/runbooks -> Body: Runbook creation params -> ApiResponse<Runbook>
```

#### `src/app/api/execution/runbooks/[id]/route.ts` -- Single runbook operations
```typescript
// GET /api/execution/runbooks/:id -> ApiResponse<Runbook>
// PUT /api/execution/runbooks/:id -> Body: updates -> ApiResponse<Runbook>
// DELETE /api/execution/runbooks/:id -> ApiResponse<{ deleted: true }>
```

#### `src/app/api/execution/runbooks/[id]/execute/route.ts` -- Execute runbook
```typescript
// POST /api/execution/runbooks/:id/execute
// Body: { triggeredBy }
// Response: ApiResponse<RunbookExecution>
```

#### `src/app/api/execution/runbooks/[id]/executions/route.ts` -- Runbook execution history
```typescript
// GET /api/execution/runbooks/:id/executions -> ApiResponse<RunbookExecution[]>
```

#### `src/app/api/execution/gates/route.ts` -- Execution gates CRUD
```typescript
// GET /api/execution/gates?scope=GLOBAL&entityId=xxx -> ApiResponse<ExecutionGate[]>
// POST /api/execution/gates -> Body: ExecutionGate params -> ApiResponse<ExecutionGate>
// PUT /api/execution/gates -> Body: { id, ...updates } -> ApiResponse<ExecutionGate>
// DELETE /api/execution/gates -> Body: { id } -> ApiResponse<{ deleted: true }>
```

#### `src/app/api/execution/costs/route.ts` -- Cost operations
```typescript
// POST /api/execution/costs/estimate
// Body: { actionType, parameters }
// Response: ApiResponse<CostEstimate>

// GET /api/execution/costs/summary?entityId=xxx&date=2026-02-15
// Response: ApiResponse<DailyCostSummary>
```

### 5. Dashboard Pages

#### `src/app/(dashboard)/execution/page.tsx` -- Flight Control Page
- Renders `FlightControl` as the primary view.
- Stats bar at top with live counts.
- Quick filters for common views: "Pending Approval", "High Risk", "Today's Executions".

#### `src/app/(dashboard)/execution/console/page.tsx` -- Operator Console Page
- Renders `OperatorConsole` with full timeline.
- Filter sidebar.
- Activity summary cards.

#### `src/app/(dashboard)/execution/runbooks/page.tsx` -- Runbooks Page
- List of all runbooks with `RunbookEditor` modal for create/edit.
- Template gallery for built-in runbook templates.
- Active runbook executions at the top.

#### `src/app/(dashboard)/execution/runbooks/[id]/page.tsx` -- Single Runbook Page
- Renders `RunbookEditor` for editing.
- Execution history below with `RunbookExecutionView`.

#### `src/app/(dashboard)/execution/layout.tsx` -- Execution Section Layout
- Tabs: Flight Control, Operator Console, Runbooks, Gates.
- Pending approval badge count visible across tabs.

## Acceptance Criteria

1. All TypeScript types compile without errors.
2. Blast radius scorer produces correct scores for all factor combinations (verify with test matrix).
3. Blast radius thresholds: LOW (0-25), MEDIUM (26-50), HIGH (51-75), CRITICAL (76-100).
4. Simulation engine produces accurate effect lists without any database mutations.
5. Rollback service correctly reverses CREATE, UPDATE, and DELETE actions using snapshots.
6. Action queue correctly auto-approves LOW blast radius actions for EXECUTE_AUTONOMOUS users.
7. Action queue requires approval for all actions from EXECUTE_WITH_APPROVAL users.
8. Execution gates block actions that fail condition checks.
9. Runbook execution pauses at approval-required steps.
10. Cost estimator produces reasonable estimates for all action types.
11. Operator console timeline aggregates data from ActionLog with enrichment.
12. All API routes validate input with Zod and return `ApiResponse<T>` format.
13. No modifications to shared types, api-response, db/index, or prisma schema.
14. All unit tests pass.
15. No `any` types.

## Implementation Steps

1. **Read context files**: Read all files listed in the Context section.
2. **Create branch**: `git checkout -b ai-feature/w13-execution`
3. **Create execution types**: `src/modules/execution/types/index.ts`
4. **Implement blast radius scorer**: `src/modules/execution/services/blast-radius-scorer.ts`
5. **Implement simulation engine**: `src/modules/execution/services/simulation-engine.ts`
6. **Implement action queue**: `src/modules/execution/services/action-queue.ts`
7. **Implement rollback service**: `src/modules/execution/services/rollback-service.ts`
8. **Implement operator console**: `src/modules/execution/services/operator-console.ts`
9. **Implement runbook service**: `src/modules/execution/services/runbook-service.ts` with 3 built-in templates.
10. **Implement cost estimator**: `src/modules/execution/services/cost-estimator.ts`
11. **Implement execution gates**: `src/modules/execution/services/execution-gate.ts`
12. **Build UI components**: All 7 components in `src/modules/execution/components/`.
13. **Create API routes**: All 12 route files under `src/app/api/execution/`.
14. **Create dashboard pages**: 5 pages under `src/app/(dashboard)/execution/`.
15. **Write tests**: All test files.
16. **Type-check**: `npx tsc --noEmit`
17. **Run tests**: `npx jest tests/unit/execution/`

## Tests

### `tests/unit/execution/blast-radius-scorer.test.ts`
```typescript
describe('BlastRadiusScorer', () => {
  describe('scoreAction', () => {
    it('should score CREATE_TASK as LOW (reversible, single record, internal)');
    it('should score DELETE_CONTACT as HIGH (irreversible, affects relationships)');
    it('should score SEND_MESSAGE to 1 recipient as LOW');
    it('should score SEND_MESSAGE to 100+ recipients as CRITICAL');
    it('should score financial action under $1K as MEDIUM');
    it('should score financial action over $100K as CRITICAL');
    it('should increase score for CONFIDENTIAL data sensitivity');
    it('should increase score for HIPAA/GDPR regulated data');
    it('should increase score for VIP contact impact');
    it('should produce overall score 0-25 for LOW');
    it('should produce overall score 26-50 for MEDIUM');
    it('should produce overall score 51-75 for HIGH');
    it('should produce overall score 76-100 for CRITICAL');
  });

  describe('scoreBulkAction', () => {
    it('should aggregate scores for batch of actions');
    it('should elevate blast radius for mass operations');
  });

  describe('getScoreExplanation', () => {
    it('should return human-readable explanation');
    it('should list all contributing factors');
  });
});
```

### `tests/unit/execution/simulation-engine.test.ts`
```typescript
describe('SimulationEngine', () => {
  describe('simulateAction', () => {
    it('should simulate CREATE_TASK with expected effects');
    it('should simulate SEND_MESSAGE with side effects (notification)');
    it('should simulate DELETE_RECORD with cascade warnings');
    it('should NOT create any database records during simulation');
    it('should include blast radius score in result');
    it('should include cost estimate in result');
    it('should flag irreversible actions in warnings');
  });

  describe('generateImpactReport', () => {
    it('should produce readable impact summary');
    it('should include effect count and types');
  });
});
```

### `tests/unit/execution/action-queue.test.ts`
```typescript
describe('ActionQueue', () => {
  describe('enqueueAction', () => {
    it('should create queued action with QUEUED status');
    it('should auto-approve LOW blast radius for EXECUTE_AUTONOMOUS users');
    it('should require approval for EXECUTE_WITH_APPROVAL users');
    it('should only suggest for SUGGEST autonomy level');
    it('should create ActionLog record in database');
  });

  describe('approveAction', () => {
    it('should update status to APPROVED');
    it('should set approvedBy and approvedAt');
    it('should reject approval for non-QUEUED actions');
  });

  describe('executeAction', () => {
    it('should execute approved actions');
    it('should create ConsentReceipt');
    it('should update status to EXECUTED on success');
    it('should update status to FAILED on error');
    it('should refuse to execute non-approved actions');
  });

  describe('bulkApprove', () => {
    it('should approve multiple actions');
    it('should report count of approved and failed');
  });
});
```

### `tests/unit/execution/rollback-service.test.ts`
```typescript
describe('RollbackService', () => {
  describe('createRollbackPlan', () => {
    it('should generate plan with correct step count');
    it('should capture previous state snapshots');
    it('should mark non-reversible actions as requiring manual steps');
  });

  describe('executeRollback', () => {
    it('should execute steps in reverse order');
    it('should restore records from snapshots');
    it('should delete records created by the original action');
    it('should report partial rollback when some steps fail');
    it('should update ActionLog status to ROLLED_BACK');
  });

  describe('canRollback', () => {
    it('should return true for reversible actions');
    it('should return false for already rolled back actions');
    it('should return false for irreversible actions');
  });
});
```

### `tests/unit/execution/runbook-service.test.ts`
```typescript
describe('RunbookService', () => {
  describe('executeRunbook', () => {
    it('should execute all steps sequentially');
    it('should pause at approval-required steps');
    it('should stop on failure if continueOnFailure is false');
    it('should continue on failure if continueOnFailure is true');
    it('should respect step timeout');
    it('should block steps exceeding maxBlastRadius');
    it('should update lastRunAt and lastRunStatus');
  });

  describe('CRUD', () => {
    it('should create runbook with all required fields');
    it('should list runbooks filtered by entity and active status');
    it('should delete runbook');
  });
});
```

### `tests/unit/execution/cost-estimator.test.ts`
```typescript
describe('CostEstimator', () => {
  describe('estimateActionCost', () => {
    it('should return $0 for CREATE_TASK');
    it('should return $0.001 for SEND_MESSAGE via email');
    it('should return $0.01 for SEND_MESSAGE via SMS');
    it('should return $0.01 for CALL_API');
    it('should return $0.05 for GENERATE_DOCUMENT');
    it('should include breakdown items');
  });

  describe('estimateRunbookCost', () => {
    it('should sum costs of all steps');
    it('should return correct total and breakdown');
  });
});
```

### `tests/unit/execution/execution-gate.test.ts`
```typescript
describe('ExecutionGate', () => {
  describe('evaluateGates', () => {
    it('should pass when all gates are satisfied');
    it('should block when gate condition fails');
    it('should return the blocking gate and reason');
    it('should evaluate "contractValue < 10000" correctly');
    it('should evaluate "recipientCount <= 50" correctly');
    it('should evaluate "blastRadius != CRITICAL" correctly');
    it('should only evaluate gates matching action scope');
  });
});
```

## Commit Strategy

Make atomic commits in this order:

1. `feat(execution): add comprehensive execution layer types for queue, simulation, rollback, runbooks, gates, and costs`
   - Files: `src/modules/execution/types/index.ts`
2. `feat(execution): implement blast radius scoring service with weighted factors`
   - Files: `src/modules/execution/services/blast-radius-scorer.ts`
3. `feat(execution): implement dry-run simulation engine with effect analysis`
   - Files: `src/modules/execution/services/simulation-engine.ts`
4. `feat(execution): implement action queue with auto-approval and autonomy-aware gating`
   - Files: `src/modules/execution/services/action-queue.ts`
5. `feat(execution): implement rollback service with snapshot-based restoration`
   - Files: `src/modules/execution/services/rollback-service.ts`
6. `feat(execution): implement operator console timeline with activity aggregation`
   - Files: `src/modules/execution/services/operator-console.ts`
7. `feat(execution): implement runbook service with built-in templates`
   - Files: `src/modules/execution/services/runbook-service.ts`
8. `feat(execution): implement cost estimator and conditional execution gates`
   - Files: `src/modules/execution/services/cost-estimator.ts`, `execution-gate.ts`
9. `feat(execution): add flight control, simulation, and operator console UI components`
   - Files: `src/modules/execution/components/FlightControl.tsx`, `SimulationView.tsx`, `OperatorConsole.tsx`
10. `feat(execution): add runbook editor, execution view, blast radius meter, and cost display components`
    - Files: `src/modules/execution/components/RunbookEditor.tsx`, `RunbookExecutionView.tsx`, `BlastRadiusMeter.tsx`, `CostDisplay.tsx`
11. `feat(execution): add API routes for queue, simulation, rollback, timeline, runbooks, gates, and costs`
    - Files: `src/app/api/execution/**/*.ts`
12. `feat(execution): add dashboard pages for flight control, operator console, and runbooks`
    - Files: `src/app/(dashboard)/execution/**/*.tsx`
13. `test(execution): add unit tests for blast radius, simulation, queue, rollback, runbooks, costs, and gates`
    - Files: `tests/unit/execution/*.test.ts`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
