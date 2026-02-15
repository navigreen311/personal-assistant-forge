// ============================================================================
// Autopilot Runbook Service
// Create, manage, and execute multi-step automation runbooks
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import type {
  Runbook,
  RunbookStep,
  RunbookExecution,
  RunbookStepResult,
} from '../types';
import { enqueueAction } from './action-queue';
import { scoreAction } from './blast-radius-scorer';

// --- In-Memory Stores ---

const runbookStore = new Map<string, Runbook>();
const executionStore = new Map<string, RunbookExecution>();

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

export async function createRunbook(
  params: Omit<
    Runbook,
    'id' | 'createdAt' | 'updatedAt' | 'lastRunAt' | 'lastRunStatus'
  >
): Promise<Runbook> {
  const now = new Date();
  const runbook: Runbook = {
    id: uuidv4(),
    ...params,
    createdAt: now,
    updatedAt: now,
  };
  runbookStore.set(runbook.id, runbook);
  return runbook;
}

export async function getRunbook(
  runbookId: string
): Promise<Runbook | null> {
  return runbookStore.get(runbookId) ?? null;
}

export async function updateRunbook(
  runbookId: string,
  updates: Partial<Runbook>
): Promise<Runbook> {
  const runbook = runbookStore.get(runbookId);
  if (!runbook) {
    throw new Error(`Runbook ${runbookId} not found`);
  }

  const updated: Runbook = {
    ...runbook,
    ...updates,
    id: runbook.id,
    createdAt: runbook.createdAt,
    updatedAt: new Date(),
  };
  runbookStore.set(runbookId, updated);
  return updated;
}

export async function deleteRunbook(runbookId: string): Promise<void> {
  if (!runbookStore.has(runbookId)) {
    throw new Error(`Runbook ${runbookId} not found`);
  }
  runbookStore.delete(runbookId);
}

export async function listRunbooks(
  entityId: string,
  filters?: { isActive?: boolean; tag?: string }
): Promise<Runbook[]> {
  let runbooks = Array.from(runbookStore.values()).filter(
    (r) => r.entityId === entityId
  );

  if (filters?.isActive !== undefined) {
    runbooks = runbooks.filter((r) => r.isActive === filters.isActive);
  }
  if (filters?.tag) {
    runbooks = runbooks.filter((r) => r.tags.includes(filters.tag!));
  }

  return runbooks;
}

export async function executeRunbook(
  runbookId: string,
  triggeredBy: string
): Promise<RunbookExecution> {
  const runbook = runbookStore.get(runbookId);
  if (!runbook) {
    throw new Error(`Runbook ${runbookId} not found`);
  }

  const execution: RunbookExecution = {
    id: uuidv4(),
    runbookId,
    status: 'RUNNING',
    startedAt: new Date(),
    stepResults: runbook.steps.map((step) => ({
      stepOrder: step.order,
      stepName: step.name,
      status: 'PENDING',
    })),
    triggeredBy,
  };

  executionStore.set(execution.id, execution);

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
        executionStore.set(execution.id, execution);
        break;
      }

      // Check if step requires approval
      if (step.requiresApproval) {
        stepResult.status = 'AWAITING_APPROVAL';
        execution.status = 'PAUSED';
        executionStore.set(execution.id, execution);
        break;
      }

      // Enqueue the action
      const queuedAction = await enqueueAction(
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
          entityId: runbook.entityId,
          workflowExecutionId: execution.id,
        },
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
        executionStore.set(execution.id, execution);

        // Update runbook last run
        runbook.lastRunAt = new Date();
        runbook.lastRunStatus = 'FAILED';
        runbook.updatedAt = new Date();
        runbookStore.set(runbookId, runbook);

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

  executionStore.set(execution.id, execution);

  // Update runbook last run
  runbook.lastRunAt = new Date();
  runbook.lastRunStatus =
    execution.status === 'COMPLETED'
      ? 'SUCCESS'
      : execution.status === 'PAUSED'
        ? 'PARTIAL'
        : 'FAILED';
  runbook.updatedAt = new Date();
  runbookStore.set(runbookId, runbook);

  return execution;
}

export async function getRunbookExecution(
  executionId: string
): Promise<RunbookExecution | null> {
  return executionStore.get(executionId) ?? null;
}

export async function listRunbookExecutions(
  runbookId: string
): Promise<RunbookExecution[]> {
  return Array.from(executionStore.values())
    .filter((e) => e.runbookId === runbookId)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
}

// --- Template Helper ---

export async function createFromTemplate(
  templateIndex: number,
  entityId: string,
  createdBy: string
): Promise<Runbook> {
  const template = BUILTIN_TEMPLATES[templateIndex];
  if (!template) {
    throw new Error(`Template index ${templateIndex} not found`);
  }

  return createRunbook({
    ...template,
    entityId,
    createdBy,
  });
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

// --- Testing Helpers ---

export function _clearRunbookStores(): void {
  runbookStore.clear();
  executionStore.clear();
}
