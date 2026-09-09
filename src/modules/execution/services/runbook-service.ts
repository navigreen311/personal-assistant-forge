// ============================================================================
// Autopilot Runbook Service
// Create, manage, and execute multi-step automation runbooks
// ============================================================================
//
// P-09 (T-007): two module-level `Map`s lived here. `runbookStore` shadowed the
// `Runbook` table, which already existed -- so a runbook created through the
// API was never in the table the rest of the platform reads, and vanished on
// restart. `executionStore` shadowed `RunbookExecution`. Both now point at the
// real tables; no model was added.
//
// P-09 (T-001): `Runbook.entityId` is the tenant. `RunbookExecution` has no
// entityId column, so its scope is proved on the parent runbook.
//
// ---------------------------------------------------------------------------
// RECONCILING THE INTERFACE WITH THE LANDED TABLE
// ---------------------------------------------------------------------------
// The `Runbook` interface and the `Runbook` model drifted before this run. The
// schema is frozen, so the difference is reconciled on the read side rather
// than by adding columns:
//
//   interface.tags[]      <-> model.category   a comma-joined list. The first
//                                              element is the category in the
//                                              column's documented sense, so a
//                                              category query still means what
//                                              it looks like, and the round
//                                              trip is lossless.
//   interface.lastRunStatus <-> DERIVED        from the most recent
//                                              RunbookExecution row. It was
//                                              never independent state; storing
//                                              it twice is how the two copies
//                                              come to disagree.
//   description / createdBy <-> nullable columns, defaulted on read.

import { prisma } from '@/lib/db';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type {
  Runbook,
  RunbookStep,
  RunbookExecution,
  RunbookStepResult,
} from '../types';
import { enqueueActionForEntityOwner } from './action-queue';
import { scoreAction } from './blast-radius-scorer';
import { generateJSON } from '@/lib/ai';

// --- Row <-> interface reconciliation ---

interface RunbookRow {
  id: string;
  entityId: string;
  name: string;
  description: string | null;
  steps: unknown;
  category: string;
  schedule: string | null;
  isActive: boolean;
  lastRunAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RunbookExecutionRow {
  id: string;
  runbookId: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  stepResults: unknown;
  triggeredBy: string;
}

function categoryFromTags(tags: string[] | undefined): string {
  const cleaned = (tags ?? []).map((t) => t.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(',') : 'general';
}

function tagsFromCategory(category: string): string[] {
  return category
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function toRunbook(
  row: RunbookRow,
  lastRunStatus?: Runbook['lastRunStatus']
): Runbook {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    entityId: row.entityId,
    schedule: row.schedule ?? undefined,
    steps: (row.steps as RunbookStep[]) ?? [],
    tags: tagsFromCategory(row.category),
    lastRunAt: row.lastRunAt ?? undefined,
    lastRunStatus,
    isActive: row.isActive,
    createdBy: row.createdBy ?? 'SYSTEM',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRunbookExecution(row: RunbookExecutionRow): RunbookExecution {
  return {
    id: row.id,
    runbookId: row.runbookId,
    status: row.status as RunbookExecution['status'],
    startedAt: row.startedAt,
    completedAt: row.completedAt ?? undefined,
    stepResults: (row.stepResults as RunbookStepResult[]) ?? [],
    triggeredBy: row.triggeredBy,
  };
}

/** The status of the newest execution, expressed the way the interface does. */
function executionStatusToRunStatus(
  status: string | undefined
): Runbook['lastRunStatus'] {
  if (!status) return undefined;
  if (status === 'COMPLETED') return 'SUCCESS';
  if (status === 'PAUSED') return 'PARTIAL';
  return 'FAILED';
}

async function lastRunStatusFor(
  runbookId: string
): Promise<Runbook['lastRunStatus']> {
  const latest = await prisma.runbookExecution.findFirst({
    where: { runbookId },
    orderBy: { startedAt: 'desc' },
    select: { status: true },
  });
  return executionStatusToRunStatus(latest?.status);
}

// --- Built-in Templates ---

export const BUILTIN_TEMPLATES: Omit<
  Runbook,
  'id' | 'entityId' | 'createdBy' | 'createdAt' | 'updatedAt'
>[] = [
  {
    name: 'Weekly CFO Pack',
    description:
      'Generate financial summary report, aggregate outstanding invoices, calculate cash flow projections, compile in document, notify CFO.',
    schedule: '0 9 * * 1', // Monday 9am
    steps: [
      {
        order: 1,
        name: 'Generate Financial Summary',
        description: 'Aggregate financial data for the past week',
        actionType: 'AI_ANALYSIS',
        parameters: { type: 'financial_summary', period: 'weekly' },
        requiresApproval: false,
        maxBlastRadius: 'LOW',
        continueOnFailure: false,
      },
      {
        order: 2,
        name: 'Aggregate Outstanding Invoices',
        description: 'Pull all outstanding invoices and their statuses',
        actionType: 'AI_ANALYSIS',
        parameters: { type: 'invoice_aggregation', status: 'PENDING' },
        requiresApproval: false,
        maxBlastRadius: 'LOW',
        continueOnFailure: false,
      },
      {
        order: 3,
        name: 'Calculate Cash Flow Projections',
        description: 'Project cash flow for the next 30/60/90 days',
        actionType: 'AI_ANALYSIS',
        parameters: { type: 'cash_flow_projection', periods: [30, 60, 90] },
        requiresApproval: false,
        maxBlastRadius: 'LOW',
        continueOnFailure: false,
      },
      {
        order: 4,
        name: 'Compile CFO Report Document',
        description: 'Generate formatted CFO report document',
        actionType: 'GENERATE_DOCUMENT',
        parameters: { type: 'REPORT', title: 'Weekly CFO Pack' },
        requiresApproval: false,
        maxBlastRadius: 'MEDIUM',
        continueOnFailure: false,
      },
      {
        order: 5,
        name: 'Notify CFO',
        description: 'Send CFO pack via email to the CFO',
        actionType: 'SEND_MESSAGE',
        parameters: { channel: 'EMAIL', subject: 'Weekly CFO Pack Ready' },
        requiresApproval: true,
        maxBlastRadius: 'MEDIUM',
        continueOnFailure: false,
      },
    ],
    tags: ['finance', 'weekly', 'reporting'],
    isActive: true,
  },
  {
    name: 'Client Onboarding',
    description:
      'Create contact record, create project, generate welcome email draft, schedule kickoff meeting, create onboarding task checklist.',
    steps: [
      {
        order: 1,
        name: 'Create Contact Record',
        description: 'Create a new contact for the client',
        actionType: 'CREATE_CONTACT',
        parameters: {},
        requiresApproval: false,
        maxBlastRadius: 'LOW',
        continueOnFailure: false,
      },
      {
        order: 2,
        name: 'Create Project',
        description: 'Create a new project for the client engagement',
        actionType: 'CREATE_PROJECT',
        parameters: {},
        requiresApproval: false,
        maxBlastRadius: 'LOW',
        continueOnFailure: false,
      },
      {
        order: 3,
        name: 'Generate Welcome Email Draft',
        description: 'Draft a personalized welcome email for the client',
        actionType: 'GENERATE_DOCUMENT',
        parameters: { type: 'EMAIL_DRAFT', title: 'Welcome Email' },
        requiresApproval: true,
        maxBlastRadius: 'MEDIUM',
        continueOnFailure: false,
      },
      {
        order: 4,
        name: 'Schedule Kickoff Meeting',
        description: 'Schedule a kickoff meeting with the client',
        actionType: 'CREATE_TASK',
        parameters: { title: 'Schedule Kickoff Meeting', priority: 'P0' },
        requiresApproval: false,
        maxBlastRadius: 'LOW',
        continueOnFailure: true,
      },
      {
        order: 5,
        name: 'Create Onboarding Checklist',
        description: 'Create a task checklist for the onboarding process',
        actionType: 'CREATE_TASK',
        parameters: {
          title: 'Client Onboarding Checklist',
          priority: 'P1',
        },
        requiresApproval: false,
        maxBlastRadius: 'LOW',
        continueOnFailure: true,
      },
    ],
    tags: ['onboarding', 'client', 'setup'],
    isActive: true,
  },
  {
    name: 'Close the Loop Fridays',
    description:
      'Scan all open tasks with no updates >7 days, draft follow-up messages for each, queue for review, send approved messages.',
    schedule: '0 9 * * 5', // Friday 9am
    steps: [
      {
        order: 1,
        name: 'Scan Stale Tasks',
        description: 'Find all open tasks with no updates in 7+ days',
        actionType: 'AI_ANALYSIS',
        parameters: { type: 'stale_task_scan', staleDays: 7 },
        requiresApproval: false,
        maxBlastRadius: 'LOW',
        continueOnFailure: false,
      },
      {
        order: 2,
        name: 'Draft Follow-Up Messages',
        description: 'Generate follow-up messages for each stale task owner',
        actionType: 'GENERATE_DOCUMENT',
        parameters: { type: 'follow_up_drafts' },
        requiresApproval: false,
        maxBlastRadius: 'LOW',
        continueOnFailure: false,
      },
      {
        order: 3,
        name: 'Queue Messages for Review',
        description: 'Queue all drafted messages for human review',
        actionType: 'CREATE_TASK',
        parameters: { title: 'Review follow-up messages', priority: 'P1' },
        requiresApproval: false,
        maxBlastRadius: 'LOW',
        continueOnFailure: false,
      },
      {
        order: 4,
        name: 'Send Approved Messages',
        description: 'Send all approved follow-up messages',
        actionType: 'BULK_SEND',
        parameters: { channel: 'EMAIL' },
        requiresApproval: true,
        maxBlastRadius: 'HIGH',
        continueOnFailure: true,
      },
    ],
    tags: ['follow-up', 'weekly', 'communication'],
    isActive: true,
  },
];

// --- Public API ---

export type CreateRunbookParams = Omit<
  Runbook,
  'id' | 'entityId' | 'createdAt' | 'updatedAt' | 'lastRunAt' | 'lastRunStatus'
>;

export async function createRunbook(
  params: CreateRunbookParams,
  entityId: VerifiedEntityId
): Promise<Runbook> {
  const row = await prisma.runbook.create({
    data: {
      name: params.name,
      description: params.description,
      steps: params.steps as unknown as object,
      category: categoryFromTags(params.tags),
      schedule: params.schedule ?? null,
      isActive: params.isActive,
      createdBy: params.createdBy,
      // LAST and unconditional: the caller does not name its own tenant.
      entityId,
    },
  });
  return toRunbook(row as RunbookRow);
}

export async function getRunbook(
  runbookId: string,
  entityId: VerifiedEntityId
): Promise<Runbook | null> {
  const row = await prisma.runbook.findFirst({
    where: { id: runbookId, entityId },
  });
  if (!row) return null;
  return toRunbook(row as RunbookRow, await lastRunStatusFor(runbookId));
}

export async function updateRunbook(
  runbookId: string,
  updates: Partial<CreateRunbookParams>,
  entityId: VerifiedEntityId
): Promise<Runbook> {
  const data: Record<string, unknown> = {};
  if (updates.name !== undefined) data.name = updates.name;
  if (updates.description !== undefined) data.description = updates.description;
  if (updates.steps !== undefined) data.steps = updates.steps as unknown as object;
  if (updates.tags !== undefined) data.category = categoryFromTags(updates.tags);
  if (updates.schedule !== undefined) data.schedule = updates.schedule;
  if (updates.isActive !== undefined) data.isActive = updates.isActive;

  // updateMany, not update: a unique WHERE cannot carry the entity.
  const { count } = await prisma.runbook.updateMany({
    where: { id: runbookId, entityId },
    data,
  });
  if (count === 0) {
    throw new Error(`Runbook ${runbookId} not found`);
  }

  const updated = await getRunbook(runbookId, entityId);
  if (!updated) {
    throw new Error(`Runbook ${runbookId} not found`);
  }
  return updated;
}

export async function deleteRunbook(
  runbookId: string,
  entityId: VerifiedEntityId
): Promise<void> {
  const { count } = await prisma.runbook.deleteMany({
    where: { id: runbookId, entityId },
  });
  if (count === 0) {
    throw new Error(`Runbook ${runbookId} not found`);
  }
}

export async function listRunbooks(
  entityId: VerifiedEntityId,
  filters?: { isActive?: boolean; tag?: string }
): Promise<Runbook[]> {
  const rows = await prisma.runbook.findMany({
    where: {
      ...(filters?.isActive !== undefined ? { isActive: filters.isActive } : {}),
      // Applied last and unconditionally.
      entityId,
    },
    orderBy: { createdAt: 'asc' },
  });

  // The tag filter is applied after the scoped query, not inside it: `tags` is
  // a comma-joined list in one column, so a SQL `contains` would match
  // substrings ("fin" would match "finance"). It is a display filter, not a
  // security boundary -- the boundary is the entityId in the WHERE above.
  const filtered = (rows as RunbookRow[]).filter((row) =>
    filters?.tag ? tagsFromCategory(row.category).includes(filters.tag) : true
  );

  return Promise.all(
    filtered.map(async (row) => toRunbook(row, await lastRunStatusFor(row.id)))
  );
}

export async function executeRunbook(
  runbookId: string,
  triggeredBy: string,
  entityId: VerifiedEntityId
): Promise<RunbookExecution> {
  const runbook = await getRunbook(runbookId, entityId);
  if (!runbook) {
    throw new Error(`Runbook ${runbookId} not found`);
  }

  const stepResults: RunbookStepResult[] = runbook.steps.map((step) => ({
    stepOrder: step.order,
    stepName: step.name,
    status: 'PENDING',
  }));

  const row = await prisma.runbookExecution.create({
    data: {
      runbookId,
      status: 'RUNNING',
      stepResults: stepResults as unknown as object,
      triggeredBy,
    },
  });

  const execution: RunbookExecution = toRunbookExecution({
    ...(row as RunbookExecutionRow),
    stepResults,
  });
  execution.stepResults = stepResults;

  const persist = async (): Promise<void> => {
    await prisma.runbookExecution.update({
      where: { id: execution.id },
      data: {
        status: execution.status,
        stepResults: execution.stepResults as unknown as object,
        completedAt: execution.completedAt ?? null,
      },
    });
  };

  // Execute steps sequentially
  const sortedSteps = [...runbook.steps].sort((a, b) => a.order - b.order);

  for (const step of sortedSteps) {
    const stepResult = execution.stepResults.find(
      (r) => r.stepOrder === step.order
    );
    if (!stepResult) continue;

    stepResult.status = 'RUNNING';
    stepResult.startedAt = new Date();

    try {
      // Check blast radius
      const blastScore = await scoreAction(
        step.actionType,
        `runbook-${runbookId}-step-${step.order}`,
        step.parameters,
        runbook.entityId
      );

      const blastRadiusOrder = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
      if (
        blastRadiusOrder[blastScore.overall] >
        blastRadiusOrder[step.maxBlastRadius]
      ) {
        stepResult.status = 'AWAITING_APPROVAL';
        stepResult.error = `Blast radius ${blastScore.overall} exceeds max ${step.maxBlastRadius}`;
        execution.status = 'PAUSED';
        await persist();
        break;
      }

      // Check if step requires approval
      if (step.requiresApproval) {
        stepResult.status = 'AWAITING_APPROVAL';
        execution.status = 'PAUSED';
        await persist();
        break;
      }

      // Enqueue the action. `runbook.entityId` came off a database column, not
      // off a request, so this is the trusted-provenance entry point.
      const queuedAction = await enqueueActionForEntityOwner(
        {
          actionLogId: '',
          actor: 'SYSTEM',
          actionType: step.actionType,
          target: `runbook-${runbookId}-step-${step.order}`,
          description: step.description,
          reason: `Runbook "${runbook.name}" step ${step.order}: ${step.name}`,
          impact: step.description,
          rollbackPlan: `Reverse step ${step.order} of runbook "${runbook.name}"`,
          blastRadius: blastScore.overall,
          reversible: blastScore.reversibilityScore > 0.5,
          requiresApproval: false,
        },
        runbook.entityId,
        'EXECUTE_AUTONOMOUS'
      );

      stepResult.actionId = queuedAction.id;
      stepResult.status = 'COMPLETED';
      stepResult.completedAt = new Date();
      stepResult.output = { actionId: queuedAction.id };
    } catch (err) {
      stepResult.status = 'FAILED';
      stepResult.completedAt = new Date();
      stepResult.error =
        err instanceof Error ? err.message : 'Unknown error';

      if (!step.continueOnFailure) {
        execution.status = 'FAILED';
        // Mark remaining steps as skipped
        for (const remaining of execution.stepResults) {
          if (remaining.status === 'PENDING') {
            remaining.status = 'SKIPPED';
          }
        }
        await persist();
        await recordRun(runbookId);
        return execution;
      }
    }
  }

  // Determine final status
  if (execution.status !== 'PAUSED' && execution.status !== 'FAILED') {
    const hasFailures = execution.stepResults.some(
      (r) => r.status === 'FAILED'
    );
    execution.status = hasFailures ? 'FAILED' : 'COMPLETED';
    execution.completedAt = new Date();
  }

  await persist();
  await recordRun(runbookId);

  return execution;
}

export async function getRunbookExecution(
  executionId: string,
  entityId: VerifiedEntityId
): Promise<RunbookExecution | null> {
  const row = await prisma.runbookExecution.findUnique({
    where: { id: executionId },
  });
  if (!row) return null;

  // RunbookExecution has no entityId column. Prove the scope on the parent and
  // return early -- no data crosses this line until it is proved.
  const owner = await prisma.runbook.findFirst({
    where: { id: row.runbookId, entityId },
    select: { id: true },
  });
  if (!owner) return null;

  return toRunbookExecution(row as RunbookExecutionRow);
}

export async function listRunbookExecutions(
  runbookId: string,
  entityId: VerifiedEntityId
): Promise<RunbookExecution[]> {
  const owner = await prisma.runbook.findFirst({
    where: { id: runbookId, entityId },
    select: { id: true },
  });
  if (!owner) return [];

  const rows = await prisma.runbookExecution.findMany({
    where: { runbookId },
    orderBy: { startedAt: 'desc' },
  });
  return (rows as RunbookExecutionRow[]).map(toRunbookExecution);
}

/** `lastRunAt` and `runCount` are columns; keep them honest after every run. */
async function recordRun(runbookId: string): Promise<void> {
  await prisma.runbook.updateMany({
    where: { id: runbookId },
    data: { lastRunAt: new Date(), runCount: { increment: 1 } },
  });
}

// --- Template Helper ---

export async function createFromTemplate(
  templateIndex: number,
  entityId: VerifiedEntityId,
  createdBy: string
): Promise<Runbook> {
  const template = BUILTIN_TEMPLATES[templateIndex];
  if (!template) {
    throw new Error(`Template index ${templateIndex} not found`);
  }

  return createRunbook({ ...template, createdBy }, entityId);
}

// --- Cron Expression Helper ---

export function describeCronExpression(cron: string): string {
  const parts = cron.split(' ');
  if (parts.length !== 5) return cron;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  if (dayOfWeek !== '*' && dayOfMonth === '*' && month === '*') {
    const dayNum = parseInt(dayOfWeek, 10);
    const dayName = dayNames[dayNum] ?? `day ${dayOfWeek}`;
    return `Every ${dayName} at ${hour}:${minute.padStart(2, '0')}`;
  }

  if (dayOfMonth !== '*' && month === '*') {
    return `Day ${dayOfMonth} of every month at ${hour}:${minute.padStart(2, '0')}`;
  }

  if (dayOfMonth === '*' && dayOfWeek === '*' && month === '*') {
    return `Daily at ${hour}:${minute.padStart(2, '0')}`;
  }

  return cron;
}

// --- AI-Powered Helpers ---

export async function suggestRunbookSteps(
  params: {
    actionType: string;
    description: string;
    entityId: string;
    blastRadius?: string;
  }
): Promise<RunbookStep[]> {
  try {
    const result = await generateJSON<{
      steps: Array<{
        name: string;
        description: string;
        actionType: string;
        requiresApproval: boolean;
        maxBlastRadius: string;
      }>;
    }>(`Generate runbook steps for the following automation scenario.

Action type: ${params.actionType}
Description: ${params.description}
Entity: ${params.entityId}
Blast radius: ${params.blastRadius ?? 'MEDIUM'}

Generate a sequence of steps including:
- Pre-checks and validation steps
- The main execution step(s)
- Verification steps to confirm success
- Rollback procedures if needed

Return JSON with steps array, each having: name, description, actionType, requiresApproval (boolean), maxBlastRadius (LOW/MEDIUM/HIGH/CRITICAL)`, {
      maxTokens: 1024,
      temperature: 0.4,
      system: 'You are an operations automation expert. Generate safe, well-ordered runbook steps with appropriate approval gates for risky operations.',
    });

    return result.steps.map((step, index) => ({
      order: index + 1,
      name: step.name,
      description: step.description,
      actionType: step.actionType,
      parameters: {},
      requiresApproval: step.requiresApproval,
      maxBlastRadius: (step.maxBlastRadius as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') ?? 'MEDIUM',
      continueOnFailure: false,
    }));
  } catch {
    // Fallback: return a single generic step
    return [
      {
        order: 1,
        name: params.description,
        description: params.description,
        actionType: params.actionType,
        parameters: {},
        requiresApproval: true,
        maxBlastRadius: 'MEDIUM',
        continueOnFailure: false,
      },
    ];
  }
}

export async function validateRunbookWithAI(
  runbook: Runbook
): Promise<{ valid: boolean; suggestions: string[] }> {
  try {
    const result = await generateJSON<{
      valid: boolean;
      suggestions: string[];
    }>(`Validate this automation runbook for safety and completeness.

Runbook: "${runbook.name}"
Description: ${runbook.description}
Steps: ${JSON.stringify(runbook.steps.map(s => ({ order: s.order, name: s.name, actionType: s.actionType, requiresApproval: s.requiresApproval, maxBlastRadius: s.maxBlastRadius, continueOnFailure: s.continueOnFailure })))}

Check for:
- Missing pre-validation steps
- Steps that should require approval but don't
- Missing rollback or verification steps
- Dangerous continueOnFailure settings on destructive steps
- Proper blast radius limits

Return JSON with valid (boolean) and suggestions (array of improvement suggestions).`, {
      maxTokens: 512,
      temperature: 0.3,
      system: 'You are a runbook safety reviewer. Identify potential issues with automation runbooks that could lead to data loss or service disruption.',
    });

    return result;
  } catch {
    return { valid: true, suggestions: [] };
  }
}

// --- Testing Helpers ---

/** Remove every runbook and execution. Real deletes -- there are no Maps now. */
export async function _clearRunbookStores(): Promise<void> {
  await prisma.runbookExecution.deleteMany({});
  await prisma.runbook.deleteMany({});
}
