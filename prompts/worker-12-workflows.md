# Worker 12: Automation & Workflow Engine (M12)

## Branch: ai-feature/w12-workflows

Create and check out the branch `ai-feature/w12-workflows` from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside these directories:

- `src/modules/workflows/services/` -- Workflow engine services (executor, triggers, actions, AI nodes)
- `src/modules/workflows/types/` -- Workflow-specific TypeScript types
- `src/modules/workflows/components/` -- Workflow UI components (designer, node palette, execution log)
- `src/modules/workflows/api/` -- Workflow module internal API helpers
- `src/modules/workflows/tests/` -- Workflow module co-located tests
- `src/app/api/workflows/` -- Next.js API routes for workflow endpoints
- `src/app/(dashboard)/workflows/` -- Next.js page routes for workflow UI
- `src/lib/queue/` -- BullMQ job queue setup and worker definitions
- `tests/unit/workflows/` -- Workflow unit tests

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files. They define the project contracts:

1. **`prisma/schema.prisma`** -- Note the `Workflow` model with `triggers` (Json), `steps` (Json), `status`, `lastRun`, `successRate`. Also note `ActionLog` for audit trails and `Rule` for condition evaluation.
2. **`src/shared/types/index.ts`** -- Key types: `Workflow`, `WorkflowStep` (type: `'ACTION' | 'CONDITION' | 'AI_DECISION' | 'HUMAN_APPROVAL' | 'DELAY'`), `WorkflowTrigger` (`'TIME' | 'EVENT' | 'CONDITION' | 'MANUAL' | 'VOICE'`), `ActionLog`, `ActionActor`, `BlastRadius`, `AutonomyLevel`, `ConsentReceipt`.
3. **`src/shared/utils/api-response.ts`** -- Use `success()`, `error()`, `paginated()` for all API route responses.
4. **`src/lib/db/index.ts`** -- Import `prisma` from `@/lib/db` for database operations.
5. **`package.json`** -- Dependencies include `bullmq` and `ioredis` (already installed). Also `zod`, `uuid`, `date-fns`.
6. **`tsconfig.json`** -- Path alias `@/*` maps to `./src/*`.

## Requirements

### 1. Workflow Module Types (`src/modules/workflows/types/index.ts`)

```typescript
// --- Node Types for Visual Designer ---

export type WorkflowNodeType =
  | 'TRIGGER'
  | 'ACTION'
  | 'CONDITION'
  | 'AI_DECISION'
  | 'HUMAN_APPROVAL'
  | 'DELAY'
  | 'LOOP'
  | 'ERROR_HANDLER'
  | 'SUB_WORKFLOW';

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  label: string;
  config: WorkflowNodeConfig;
  position: { x: number; y: number }; // for visual designer
  inputs: string[];  // incoming edge IDs
  outputs: string[]; // outgoing edge IDs
}

export interface WorkflowEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  condition?: string; // expression for conditional branches
  label?: string;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// --- Node Configuration Types ---

export type WorkflowNodeConfig =
  | TriggerNodeConfig
  | ActionNodeConfig
  | ConditionNodeConfig
  | AIDecisionNodeConfig
  | HumanApprovalNodeConfig
  | DelayNodeConfig
  | LoopNodeConfig
  | ErrorHandlerNodeConfig
  | SubWorkflowNodeConfig;

export interface TriggerNodeConfig {
  nodeType: 'TRIGGER';
  triggerType: 'TIME' | 'EVENT' | 'CONDITION' | 'MANUAL' | 'VOICE' | 'WEBHOOK';
  cronExpression?: string; // for TIME triggers
  eventName?: string; // for EVENT triggers
  webhookPath?: string; // for WEBHOOK triggers
  conditionExpression?: string; // for CONDITION triggers
}

export interface ActionNodeConfig {
  nodeType: 'ACTION';
  actionType: ActionType;
  parameters: Record<string, unknown>;
  retryPolicy?: RetryPolicy;
  timeout?: number; // ms
}

export type ActionType =
  | 'SEND_MESSAGE'
  | 'CREATE_TASK'
  | 'UPDATE_RECORD'
  | 'GENERATE_DOCUMENT'
  | 'CALL_API'
  | 'TRIGGER_AI_ANALYSIS'
  | 'SEND_NOTIFICATION'
  | 'CREATE_EVENT'
  | 'UPDATE_CONTACT'
  | 'LOG_FINANCIAL'
  | 'EXECUTE_SCRIPT';

export interface ConditionNodeConfig {
  nodeType: 'CONDITION';
  expression: string; // e.g., "data.amount > 10000"
  trueOutputId: string;
  falseOutputId: string;
}

export interface AIDecisionNodeConfig {
  nodeType: 'AI_DECISION';
  decisionType: 'CLASSIFY' | 'SCORE' | 'DRAFT' | 'SUMMARIZE' | 'RECOMMEND' | 'EXTRACT';
  prompt: string;
  model?: string;
  outputMapping: Record<string, string>; // maps AI output fields to workflow variables
  confidenceThreshold?: number; // below this, route to human review
}

export interface HumanApprovalNodeConfig {
  nodeType: 'HUMAN_APPROVAL';
  approverIds: string[];
  message: string;
  timeoutHours: number;
  escalateAfter?: number; // hours before escalation
  escalateTo?: string[]; // user IDs
  requiredApprovals: number; // e.g., 1 of 3 approvers
}

export interface DelayNodeConfig {
  nodeType: 'DELAY';
  delayMs?: number;
  delayUntil?: string; // ISO datetime or cron expression for "next Monday 9am"
  delayType: 'FIXED' | 'UNTIL' | 'BUSINESS_HOURS';
}

export interface LoopNodeConfig {
  nodeType: 'LOOP';
  collection: string; // variable name containing the array
  iteratorVariable: string; // variable name for current item
  bodyNodeIds: string[]; // nodes to execute per iteration
  maxIterations: number; // safety limit
}

export interface ErrorHandlerNodeConfig {
  nodeType: 'ERROR_HANDLER';
  errorTypes: string[]; // which errors to catch
  retryPolicy?: RetryPolicy;
  fallbackNodeId?: string;
  notifyOnError: boolean;
}

export interface SubWorkflowNodeConfig {
  nodeType: 'SUB_WORKFLOW';
  workflowId: string;
  inputMapping: Record<string, string>;
  outputMapping: Record<string, string>;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
  backoffMultiplier: number;
  maxBackoffMs: number;
}

// --- Execution Types ---

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'PENDING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'ROLLED_BACK';
  triggeredBy: string; // user ID, "SYSTEM", or "CRON"
  triggerType: string;
  startedAt: Date;
  completedAt?: Date;
  currentNodeId?: string;
  variables: Record<string, unknown>; // workflow context variables
  stepResults: StepExecutionResult[];
  error?: string;
}

export interface StepExecutionResult {
  nodeId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  startedAt: Date;
  completedAt?: Date;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error?: string;
  retryCount: number;
}

export interface WorkflowSimulationResult {
  workflowId: string;
  steps: SimulatedStep[];
  estimatedDuration: number; // ms
  estimatedCost: number;
  warnings: string[];
  wouldExecute: boolean;
}

export interface SimulatedStep {
  nodeId: string;
  nodeLabel: string;
  wouldDo: string; // human-readable description
  impact: string;
  reversible: boolean;
  estimatedDuration: number;
}

// --- Agent Orchestration Types ---

export type AgentDomain = 'COMMUNICATION' | 'SCHEDULING' | 'RESEARCH' | 'FINANCE' | 'LEGAL' | 'GENERAL';

export interface AgentConfig {
  id: string;
  name: string;
  domain: AgentDomain;
  capabilities: string[];
  autonomyLevel: 'SUGGEST' | 'DRAFT' | 'EXECUTE_WITH_APPROVAL' | 'EXECUTE_AUTONOMOUS';
  accuracyScore: number; // 0-1, updated based on outcomes
  handoffProtocol: HandoffProtocol;
}

export interface HandoffProtocol {
  triggerConditions: string[]; // when to hand off to another agent
  targetAgentDomain: AgentDomain;
  contextFields: string[]; // which workflow variables to pass
  requiresHumanApproval: boolean;
}

export interface AgentCollaboration {
  id: string;
  primaryAgentId: string;
  collaboratorAgentIds: string[];
  workflowExecutionId: string;
  status: 'ACTIVE' | 'COMPLETED' | 'FAILED';
  handoffs: AgentHandoff[];
}

export interface AgentHandoff {
  fromAgentId: string;
  toAgentId: string;
  reason: string;
  context: Record<string, unknown>;
  timestamp: Date;
}

// --- Integration Hub Types ---

export type IntegrationType = 'GOOGLE_WORKSPACE' | 'SLACK' | 'NOTION' | 'QUICKBOOKS' | 'CUSTOM_REST' | 'CUSTOM_WEBHOOK';

export interface IntegrationConfig {
  id: string;
  type: IntegrationType;
  name: string;
  credentials: Record<string, string>; // encrypted references, not raw secrets
  baseUrl?: string;
  headers?: Record<string, string>;
  isActive: boolean;
  lastSyncAt?: Date;
}
```

### 2. BullMQ Job Queue Setup (`src/lib/queue/`)

#### `src/lib/queue/connection.ts` -- Redis/BullMQ connection
```typescript
// Create IORedis connection for BullMQ
// Use env var REDIS_URL (default: redis://localhost:6379)
// Export the connection instance for reuse
```

#### `src/lib/queue/workflow-queue.ts` -- Workflow execution queue
- Queue name: `workflow-execution`
- `enqueueWorkflowExecution(executionId: string, workflowId: string, variables: Record<string, unknown>, delay?: number): Promise<string>` -- Add job to queue.
- `enqueueStepExecution(executionId: string, nodeId: string, input: Record<string, unknown>): Promise<string>` -- Add individual step job.
- `getJobStatus(jobId: string): Promise<{ status: string; progress: number }>` -- Check job status.
- `cancelJob(jobId: string): Promise<void>` -- Cancel a queued/active job.

#### `src/lib/queue/workflow-worker.ts` -- BullMQ worker for workflow jobs
- Process `workflow-execution` jobs.
- For each job: load workflow graph, walk through nodes in execution order, execute each step, update execution status.
- Handle errors: catch per-step, apply retry policies, route to error handler nodes.
- Emit progress events as steps complete.
- Log all actions to `ActionLog` table via Prisma.

#### `src/lib/queue/scheduler.ts` -- Cron-based workflow trigger scheduler
- `registerCronTrigger(workflowId: string, cronExpression: string): void` -- Schedule a recurring workflow.
- `unregisterCronTrigger(workflowId: string): void` -- Remove scheduled workflow.
- `getScheduledWorkflows(): { workflowId: string; cron: string; nextRun: Date }[]` -- List active schedules.
- Use BullMQ's built-in repeat/cron capability for scheduling.

### 3. Workflow Services

#### `src/modules/workflows/services/workflow-crud.ts` -- Workflow CRUD

- `createWorkflow(params: { name: string; entityId: string; graph: WorkflowGraph; triggers: TriggerNodeConfig[] }): Promise<Workflow>` -- Create workflow with graph in Prisma. Save graph nodes/edges as `steps` JSON. Save triggers as `triggers` JSON.
- `getWorkflow(workflowId: string): Promise<Workflow | null>` -- Fetch workflow with parsed graph.
- `updateWorkflow(workflowId: string, updates: Partial<{ name: string; graph: WorkflowGraph; triggers: TriggerNodeConfig[]; status: string }>): Promise<Workflow>` -- Update workflow.
- `deleteWorkflow(workflowId: string): Promise<void>` -- Soft-delete (set status to ARCHIVED).
- `listWorkflows(entityId: string, filters?: { status?: string }, page?: number, pageSize?: number): Promise<{ data: Workflow[]; total: number }>` -- Paginated list.
- `duplicateWorkflow(workflowId: string, newName: string): Promise<Workflow>` -- Clone a workflow.

#### `src/modules/workflows/services/workflow-executor.ts` -- Core Execution Engine

- `executeWorkflow(workflowId: string, triggeredBy: string, triggerType: string, initialVariables?: Record<string, unknown>): Promise<WorkflowExecution>` -- Start a full workflow execution.
- `executeNode(execution: WorkflowExecution, node: WorkflowNode): Promise<StepExecutionResult>` -- Execute a single node based on its type. Dispatch to the appropriate handler:
  - `ACTION` -> `executeActionNode()`
  - `CONDITION` -> `evaluateCondition()`
  - `AI_DECISION` -> `executeAIDecision()`
  - `HUMAN_APPROVAL` -> `requestHumanApproval()`
  - `DELAY` -> `scheduleDelay()`
  - `LOOP` -> `executeLoop()`
  - `ERROR_HANDLER` -> registered as catch handler
- `getNextNodes(graph: WorkflowGraph, currentNodeId: string, conditionResult?: boolean): WorkflowNode[]` -- Determine next nodes to execute based on edges and conditions.
- `pauseExecution(executionId: string): Promise<void>` -- Pause at current step.
- `resumeExecution(executionId: string): Promise<void>` -- Resume from paused step.
- `cancelExecution(executionId: string): Promise<void>` -- Cancel and mark as CANCELLED.
- `getExecution(executionId: string): Promise<WorkflowExecution | null>` -- Get execution status and step results.
- `listExecutions(workflowId: string, page?: number, pageSize?: number): Promise<{ data: WorkflowExecution[]; total: number }>` -- Paginated execution history.

#### `src/modules/workflows/services/action-handlers.ts` -- Action Node Implementations

Implement handlers for each `ActionType`:

- `handleSendMessage(params: Record<string, unknown>): Promise<Record<string, unknown>>` -- Create a Message record. Parameters: `channel`, `recipientId`, `entityId`, `subject`, `body`.
- `handleCreateTask(params: Record<string, unknown>): Promise<Record<string, unknown>>` -- Create a Task record. Parameters: `title`, `entityId`, `priority`, `dueDate`, `projectId`.
- `handleUpdateRecord(params: Record<string, unknown>): Promise<Record<string, unknown>>` -- Generic update for any Prisma model. Parameters: `model`, `id`, `data`.
- `handleGenerateDocument(params: Record<string, unknown>): Promise<Record<string, unknown>>` -- Create a Document record from template. Parameters: `title`, `entityId`, `type`, `templateId`, `variables`.
- `handleCallAPI(params: Record<string, unknown>): Promise<Record<string, unknown>>` -- Make an HTTP request. Parameters: `url`, `method`, `headers`, `body`. Return response data. Include timeout handling.
- `handleTriggerAIAnalysis(params: Record<string, unknown>): Promise<Record<string, unknown>>` -- Placeholder for AI analysis. Parameters: `prompt`, `data`. Return mock analysis result with comment for where LLM API call would go.
- `handleSendNotification(params: Record<string, unknown>): Promise<Record<string, unknown>>` -- Log notification (placeholder). Parameters: `userId`, `message`, `channel`.
- `handleCreateEvent(params: Record<string, unknown>): Promise<Record<string, unknown>>` -- Create CalendarEvent. Parameters: `title`, `entityId`, `startTime`, `endTime`, `participantIds`.
- Each handler must: validate parameters with Zod, execute the action, return structured output, log to ActionLog.

#### `src/modules/workflows/services/condition-evaluator.ts` -- Condition & Expression Engine

- `evaluateExpression(expression: string, context: Record<string, unknown>): boolean` -- Evaluate a condition expression against workflow variables. Support: comparison operators (`>`, `<`, `>=`, `<=`, `==`, `!=`), logical operators (`&&`, `||`, `!`), nested property access (`data.contact.score > 80`), string operations (`includes`, `startsWith`).
- `validateExpression(expression: string): { valid: boolean; error?: string }` -- Check expression syntax without evaluating.
- Use a safe expression parser -- do NOT use `eval()`. Implement a simple recursive descent parser or use a whitelist approach for operators.

#### `src/modules/workflows/services/ai-decision-service.ts` -- AI Decision Node

- `executeAIDecision(config: AIDecisionNodeConfig, context: Record<string, unknown>): Promise<{ decision: Record<string, unknown>; confidence: number }>` -- Process an AI decision step.
- `classifyInput(prompt: string, input: string, categories: string[]): Promise<{ category: string; confidence: number }>` -- Classification.
- `scoreInput(prompt: string, input: string, criteria: string[]): Promise<{ score: number; breakdown: Record<string, number> }>` -- Scoring.
- `draftContent(prompt: string, context: Record<string, unknown>): Promise<{ content: string; confidence: number }>` -- Content drafting.
- `summarizeInput(prompt: string, input: string, maxLength?: number): Promise<{ summary: string }>` -- Summarization.
- Implementation: All methods are placeholders that return mock responses with realistic structure. Include comments explaining where OpenAI/Anthropic API calls would integrate. If confidence is below `confidenceThreshold`, flag for human review.

#### `src/modules/workflows/services/approval-service.ts` -- Human-in-the-Loop Approvals

- `requestApproval(config: HumanApprovalNodeConfig, executionId: string, stepData: Record<string, unknown>): Promise<{ approvalId: string; status: 'PENDING' }>` -- Create an approval request.
- `submitApproval(approvalId: string, approverId: string, approved: boolean, comment?: string): Promise<{ status: 'APPROVED' | 'REJECTED' }>` -- Process an approval decision.
- `getApprovalStatus(approvalId: string): Promise<{ approvalId: string; status: string; approvals: number; required: number; responses: ApprovalResponse[] }>` -- Check approval progress.
- `getPendingApprovals(userId: string): Promise<ApprovalRequest[]>` -- List all pending approvals for a user.
- `ApprovalRequest` type: `{ id, executionId, workflowName, stepLabel, message, requiredApprovals, currentApprovals, createdAt, expiresAt }`.
- `ApprovalResponse` type: `{ approverId, approved, comment, respondedAt }`.
- Escalation: If `escalateAfter` hours pass without enough approvals, send notification to `escalateTo` users.

#### `src/modules/workflows/services/simulation-service.ts` -- Dry-Run Simulation

- `simulateWorkflow(workflowId: string, variables?: Record<string, unknown>): Promise<WorkflowSimulationResult>` -- Walk through the workflow graph without executing actions. For each node, generate a `SimulatedStep` describing what WOULD happen.
- `estimateDuration(graph: WorkflowGraph): number` -- Estimate total execution time based on node types and delay configs.
- `estimateCost(graph: WorkflowGraph): number` -- Estimate execution cost (API calls, AI tokens, etc.).
- `validateGraph(graph: WorkflowGraph): { valid: boolean; errors: string[] }` -- Check for: disconnected nodes, cycles (unless in loops), missing required configs, unreachable nodes.

#### `src/modules/workflows/services/execution-logger.ts` -- Audit Trail

- `logExecution(execution: WorkflowExecution): Promise<void>` -- Write execution record.
- `logStepResult(executionId: string, result: StepExecutionResult): Promise<void>` -- Write step result to ActionLog.
- `getExecutionLog(executionId: string): Promise<ActionLog[]>` -- Retrieve full audit trail.
- `rollbackExecution(executionId: string): Promise<{ rolledBack: StepExecutionResult[]; failed: StepExecutionResult[] }>` -- Attempt to reverse executed steps in reverse order using each step's rollback path.

#### `src/modules/workflows/services/agent-orchestrator.ts` -- Agent Orchestration

- `registerAgent(config: AgentConfig): void` -- Register an agent with its domain and capabilities.
- `getAgentForDomain(domain: AgentDomain): AgentConfig | null` -- Find the best agent for a domain.
- `executeAutonomousWorkflow(workflowId: string, agentId: string, maxSteps?: number): Promise<WorkflowExecution>` -- Run a workflow with an agent, applying guardrails.
- `handoff(fromAgentId: string, toAgentId: string, context: Record<string, unknown>, executionId: string): Promise<AgentHandoff>` -- Transfer execution context between agents.
- `adjustAutonomy(agentId: string, newLevel: string): void` -- Progressive autonomy: increase/decrease based on accuracy history.
- Guardrails: agents with `EXECUTE_AUTONOMOUS` level can only execute actions with `BlastRadius` of `LOW` or `MEDIUM`. `HIGH` and `CRITICAL` always require human approval regardless of autonomy level.

#### `src/modules/workflows/services/integration-hub.ts` -- Integration Management

- `registerIntegration(config: Omit<IntegrationConfig, 'id'>): IntegrationConfig` -- Add a new integration.
- `getIntegration(id: string): IntegrationConfig | null` -- Retrieve integration config.
- `listIntegrations(activeOnly?: boolean): IntegrationConfig[]` -- List all integrations.
- `executeIntegrationAction(integrationId: string, action: string, params: Record<string, unknown>): Promise<Record<string, unknown>>` -- Execute an action through an integration. For `CUSTOM_REST`: make HTTP request. For others: placeholder with structured mock responses.
- `testConnection(integrationId: string): Promise<{ connected: boolean; latencyMs: number; error?: string }>` -- Test integration connectivity.

### 4. Workflow UI Components

#### `src/modules/workflows/components/WorkflowDesigner.tsx`
- Visual canvas for building workflows using a node-based graph editor.
- Use a custom implementation or React Flow-compatible data structures (import React Flow only if adding to package.json is acceptable; otherwise build a simplified drag-and-drop canvas with Tailwind).
- IMPORTANT: Since you cannot modify package.json, build a simplified visual designer using HTML5 drag-and-drop API + SVG for edges + Tailwind for styling. No external graph library.
- Nodes rendered as cards with type-specific icons and config summaries.
- Edges drawn as SVG paths between node connection points.
- Double-click node to open config panel.
- Toolbar: add node, delete selected, zoom in/out, fit view, undo/redo.

#### `src/modules/workflows/components/NodePalette.tsx`
- Sidebar panel listing all available node types.
- Grouped by category: Triggers, Actions, Logic, AI, Human.
- Each item shows icon, name, and brief description.
- Drag from palette onto canvas to add.

#### `src/modules/workflows/components/NodeConfigPanel.tsx`
- Slide-out panel for configuring a selected node.
- Dynamic form based on node type (renders appropriate fields for each config type).
- Validation feedback on invalid configurations.
- Test button to dry-run a single node with sample data.

#### `src/modules/workflows/components/WorkflowList.tsx`
- Table/list of all workflows for the current entity.
- Columns: name, status (badge), trigger type, last run, success rate, actions.
- Filter by status (ACTIVE, PAUSED, DRAFT, ARCHIVED).
- Search by name.
- Actions: edit, duplicate, activate/pause, delete, view executions.

#### `src/modules/workflows/components/ExecutionTimeline.tsx`
- Vertical timeline showing execution progress.
- Each step shows: node label, status (icon + color), duration, input/output preview.
- Expandable details for each step.
- Real-time updates for running executions (poll-based or placeholder for WebSocket).

#### `src/modules/workflows/components/ApprovalPanel.tsx`
- List of pending approval requests for the current user.
- Each request shows: workflow name, step description, submitted data, approve/reject buttons, comment field.
- Badge count on tab/nav for pending approvals.

### 5. API Routes

#### `src/app/api/workflows/route.ts` -- CRUD
```typescript
// POST /api/workflows -- Create workflow
// Body: { name, entityId, graph: WorkflowGraph, triggers: TriggerNodeConfig[] }
// Response: ApiResponse<Workflow>

// GET /api/workflows?entityId=xxx&status=ACTIVE&page=1&pageSize=20
// Response: ApiResponse<Workflow[]> with pagination
```

#### `src/app/api/workflows/[id]/route.ts` -- Single workflow operations
```typescript
// GET /api/workflows/:id -> ApiResponse<Workflow>
// PUT /api/workflows/:id -> Body: partial updates -> ApiResponse<Workflow>
// DELETE /api/workflows/:id -> archives -> ApiResponse<{ archived: true }>
```

#### `src/app/api/workflows/[id]/trigger/route.ts` -- Manual trigger
```typescript
// POST /api/workflows/:id/trigger
// Body: { triggeredBy, variables? }
// Response: ApiResponse<WorkflowExecution>
```

#### `src/app/api/workflows/[id]/simulate/route.ts` -- Dry-run simulation
```typescript
// POST /api/workflows/:id/simulate
// Body: { variables? }
// Response: ApiResponse<WorkflowSimulationResult>
```

#### `src/app/api/workflows/[id]/executions/route.ts` -- Execution history
```typescript
// GET /api/workflows/:id/executions?page=1&pageSize=20
// Response: ApiResponse<WorkflowExecution[]> with pagination
```

#### `src/app/api/workflows/[id]/executions/[executionId]/route.ts` -- Single execution
```typescript
// GET /api/workflows/:id/executions/:executionId -> ApiResponse<WorkflowExecution>
// DELETE /api/workflows/:id/executions/:executionId -> cancel -> ApiResponse<{ cancelled: true }>
```

#### `src/app/api/workflows/[id]/executions/[executionId]/rollback/route.ts`
```typescript
// POST /api/workflows/:id/executions/:executionId/rollback
// Response: ApiResponse<{ rolledBack: string[]; failed: string[] }>
```

#### `src/app/api/workflows/approvals/route.ts` -- Approval management
```typescript
// GET /api/workflows/approvals?userId=xxx -> pending approvals -> ApiResponse<ApprovalRequest[]>
// POST /api/workflows/approvals -> Body: { approvalId, approverId, approved, comment? } -> ApiResponse<{ status }>
```

### 6. Dashboard Pages

#### `src/app/(dashboard)/workflows/page.tsx` -- Workflow List Page
- Renders `WorkflowList` as main content.
- "Create Workflow" button opens the designer.
- Stats bar: total active, total executions today, success rate, pending approvals.

#### `src/app/(dashboard)/workflows/[id]/page.tsx` -- Workflow Designer Page
- Renders `WorkflowDesigner` with `NodePalette` sidebar and `NodeConfigPanel` slide-out.
- Top bar: workflow name (editable), status toggle (draft/active/paused), save, simulate, trigger buttons.

#### `src/app/(dashboard)/workflows/[id]/executions/page.tsx` -- Execution History Page
- Renders `ExecutionTimeline` for the selected workflow.
- Filter by date range and status.
- Click execution to see full step-by-step details.

#### `src/app/(dashboard)/workflows/layout.tsx` -- Workflows Section Layout
- Shared layout with tabs: All Workflows, Approvals, Integrations.
- Approval badge count.

## Acceptance Criteria

1. All TypeScript types compile without errors.
2. Workflow CRUD creates, reads, updates, and deletes workflows in Prisma.
3. Workflow executor walks the graph correctly, respecting conditions and branches.
4. Condition evaluator safely parses expressions WITHOUT using `eval()`.
5. Action handlers create proper records in the database for each action type.
6. Simulation service produces accurate dry-run results without side effects.
7. Human approval flow supports multi-approver with escalation.
8. Agent orchestrator enforces blast radius guardrails.
9. BullMQ queue integration enqueues and dequeues workflow jobs.
10. Execution logger writes tamper-proof audit trail to ActionLog.
11. Rollback reverses steps in correct reverse order.
12. All API routes validate input with Zod and return `ApiResponse<T>` format.
13. Visual designer components render node graph with drag-and-drop.
14. No modifications to shared types, api-response, db/index, or prisma schema.
15. All unit tests pass.
16. No `any` types.

## Implementation Steps

1. **Read context files**: Read all files listed in the Context section.
2. **Create branch**: `git checkout -b ai-feature/w12-workflows`
3. **Create workflow types**: `src/modules/workflows/types/index.ts`
4. **Set up BullMQ queue**: `src/lib/queue/connection.ts`, `workflow-queue.ts`, `workflow-worker.ts`, `scheduler.ts`
5. **Implement workflow CRUD**: `src/modules/workflows/services/workflow-crud.ts`
6. **Implement condition evaluator**: `src/modules/workflows/services/condition-evaluator.ts`
7. **Implement action handlers**: `src/modules/workflows/services/action-handlers.ts`
8. **Implement AI decision service**: `src/modules/workflows/services/ai-decision-service.ts`
9. **Implement approval service**: `src/modules/workflows/services/approval-service.ts`
10. **Implement workflow executor**: `src/modules/workflows/services/workflow-executor.ts`
11. **Implement simulation service**: `src/modules/workflows/services/simulation-service.ts`
12. **Implement execution logger**: `src/modules/workflows/services/execution-logger.ts`
13. **Implement agent orchestrator**: `src/modules/workflows/services/agent-orchestrator.ts`
14. **Implement integration hub**: `src/modules/workflows/services/integration-hub.ts`
15. **Build UI components**: All 6 components in `src/modules/workflows/components/`.
16. **Create API routes**: All 8 route files under `src/app/api/workflows/`.
17. **Create dashboard pages**: 4 pages under `src/app/(dashboard)/workflows/`.
18. **Write tests**: All test files.
19. **Type-check**: `npx tsc --noEmit`
20. **Run tests**: `npx jest tests/unit/workflows/`

## Tests

### `tests/unit/workflows/workflow-executor.test.ts`
```typescript
describe('WorkflowExecutor', () => {
  describe('executeWorkflow', () => {
    it('should execute a simple linear workflow (trigger -> action -> action)');
    it('should follow true branch on condition node');
    it('should follow false branch on condition node');
    it('should pause at human approval nodes');
    it('should handle delay nodes by scheduling future execution');
    it('should execute loop nodes for each item in collection');
    it('should catch errors and route to error handler nodes');
    it('should update execution status throughout the process');
  });

  describe('getNextNodes', () => {
    it('should return connected nodes via edges');
    it('should filter by condition result for condition nodes');
    it('should return empty array for terminal nodes');
  });

  describe('cancelExecution', () => {
    it('should mark execution as CANCELLED');
    it('should stop processing further steps');
  });
});
```

### `tests/unit/workflows/condition-evaluator.test.ts`
```typescript
describe('ConditionEvaluator', () => {
  describe('evaluateExpression', () => {
    it('should evaluate "amount > 1000" with context { amount: 1500 } as true');
    it('should evaluate "status == ACTIVE" correctly');
    it('should evaluate nested properties "contact.score > 80"');
    it('should evaluate AND expressions "amount > 100 && status == PENDING"');
    it('should evaluate OR expressions "priority == P0 || priority == P1"');
    it('should evaluate NOT expressions "!isArchived"');
    it('should evaluate string contains "name.includes(Dr)"');
    it('should return false for invalid expressions without throwing');
    it('should NOT use eval() internally');
  });

  describe('validateExpression', () => {
    it('should validate correct expressions');
    it('should reject expressions with function calls');
    it('should reject expressions with assignment operators');
  });
});
```

### `tests/unit/workflows/action-handlers.test.ts`
```typescript
describe('ActionHandlers', () => {
  describe('handleCreateTask', () => {
    it('should create a task with provided parameters');
    it('should validate required parameters (title, entityId)');
    it('should log action to ActionLog');
    it('should return created task data');
  });

  describe('handleSendMessage', () => {
    it('should create a message record');
    it('should validate channel and recipient');
  });

  describe('handleCallAPI', () => {
    it('should make HTTP request with provided params');
    it('should timeout after configured duration');
    it('should return response data');
  });
});
```

### `tests/unit/workflows/simulation-service.test.ts`
```typescript
describe('SimulationService', () => {
  describe('simulateWorkflow', () => {
    it('should return simulated steps for each node');
    it('should describe what each action would do');
    it('should calculate estimated duration');
    it('should flag irreversible actions');
    it('should not create any database records');
  });

  describe('validateGraph', () => {
    it('should pass for valid connected graph');
    it('should fail for disconnected nodes');
    it('should fail for missing required configs');
    it('should detect unreachable nodes');
  });
});
```

### `tests/unit/workflows/approval-service.test.ts`
```typescript
describe('ApprovalService', () => {
  describe('requestApproval', () => {
    it('should create approval request with PENDING status');
    it('should set expiration based on timeoutHours');
  });

  describe('submitApproval', () => {
    it('should record approval response');
    it('should mark as APPROVED when required approvals met');
    it('should mark as REJECTED on rejection');
    it('should prevent duplicate responses from same approver');
  });

  describe('getPendingApprovals', () => {
    it('should return only pending approvals for the user');
    it('should exclude expired approvals');
  });
});
```

### `tests/unit/workflows/agent-orchestrator.test.ts`
```typescript
describe('AgentOrchestrator', () => {
  describe('executeAutonomousWorkflow', () => {
    it('should execute steps within guardrails');
    it('should block HIGH blast radius actions for autonomous agents');
    it('should allow LOW blast radius actions autonomously');
    it('should respect maxSteps limit');
  });

  describe('handoff', () => {
    it('should transfer context between agents');
    it('should record handoff in collaboration log');
  });

  describe('adjustAutonomy', () => {
    it('should increase autonomy for high-accuracy agents');
    it('should decrease autonomy for low-accuracy agents');
  });
});
```

## Commit Strategy

Make atomic commits in this order:

1. `feat(workflows): add comprehensive workflow and agent orchestration types`
   - Files: `src/modules/workflows/types/index.ts`
2. `feat(queue): set up BullMQ connection, workflow queue, worker, and cron scheduler`
   - Files: `src/lib/queue/connection.ts`, `workflow-queue.ts`, `workflow-worker.ts`, `scheduler.ts`
3. `feat(workflows): implement workflow CRUD service with Prisma`
   - Files: `src/modules/workflows/services/workflow-crud.ts`
4. `feat(workflows): implement safe condition evaluator without eval()`
   - Files: `src/modules/workflows/services/condition-evaluator.ts`
5. `feat(workflows): implement action node handlers for all action types`
   - Files: `src/modules/workflows/services/action-handlers.ts`
6. `feat(workflows): implement AI decision and human approval services`
   - Files: `src/modules/workflows/services/ai-decision-service.ts`, `approval-service.ts`
7. `feat(workflows): implement core workflow executor with graph traversal`
   - Files: `src/modules/workflows/services/workflow-executor.ts`
8. `feat(workflows): implement simulation service and execution logger with rollback`
   - Files: `src/modules/workflows/services/simulation-service.ts`, `execution-logger.ts`
9. `feat(workflows): implement agent orchestrator with guardrails and handoff protocols`
   - Files: `src/modules/workflows/services/agent-orchestrator.ts`
10. `feat(workflows): implement integration hub with pluggable providers`
    - Files: `src/modules/workflows/services/integration-hub.ts`
11. `feat(workflows): add visual workflow designer and node components`
    - Files: `src/modules/workflows/components/*.tsx`
12. `feat(workflows): add API routes for workflow CRUD, execution, simulation, and approvals`
    - Files: `src/app/api/workflows/**/*.ts`
13. `feat(workflows): add dashboard pages for workflow list, designer, and execution history`
    - Files: `src/app/(dashboard)/workflows/**/*.tsx`
14. `test(workflows): add unit tests for executor, evaluator, handlers, simulation, approvals, and agents`
    - Files: `tests/unit/workflows/*.test.ts`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
