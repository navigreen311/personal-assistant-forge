// ============================================================================
// Workflow CRUD Service
// Create, read, update, delete, list, and duplicate workflows via Prisma
// ============================================================================
//
// P-09 (T-001): every function takes a VerifiedEntityId and puts it in the
// WHERE clause. `updateWorkflow` and `deleteWorkflow` used `prisma.workflow
// .update({ where: { id } })` -- a unique WHERE with no tenant in it -- so any
// caller who knew a workflow id could rename, re-graph or archive another
// tenant's workflow. They use `updateMany` with `{ id, entityId }` now, and
// `count === 0` means not-found.
//
// P-09 (P-11 finding 1): this is the missing cron PRODUCER. `registerCronTrigger`
// had no callers anywhere in the codebase, so a TIME trigger saved on a
// workflow produced a stored trigger and no schedule. Every create and update
// now reconciles the workflow's triggers with BullMQ's repeat state.

import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { WorkflowGraph, TriggerNodeConfig } from '@/modules/workflows/types';
import type { Workflow } from '@/shared/types';
import { syncCronTriggers, cronExpressionsOf } from '@/lib/queue/scheduler';

export interface CreateWorkflowParams {
  name: string;
  graph: WorkflowGraph;
  triggers: TriggerNodeConfig[];
}

export interface UpdateWorkflowParams {
  name?: string;
  graph?: WorkflowGraph;
  triggers?: TriggerNodeConfig[];
  status?: string;
}

export interface ListWorkflowFilters {
  status?: string;
}

function mapToWorkflow(record: {
  id: string;
  name: string;
  entityId: string;
  triggers: unknown;
  steps: unknown;
  status: string;
  lastRun: Date | null;
  successRate: number;
  createdAt: Date;
  updatedAt: Date;
}): Workflow {
  const triggers = record.triggers as { type: string; config: Record<string, unknown> }[];
  const stepsData = record.steps as WorkflowGraph | unknown[];

  // steps could be a WorkflowGraph (our format) or legacy array
  let steps: Workflow['steps'];
  if (stepsData && typeof stepsData === 'object' && 'nodes' in (stepsData as object)) {
    const graph = stepsData as WorkflowGraph;
    steps = graph.nodes.map((node) => ({
      id: node.id,
      type: node.type as 'ACTION' | 'CONDITION' | 'AI_DECISION' | 'HUMAN_APPROVAL' | 'DELAY',
      config: node.config as unknown as Record<string, unknown>,
      nextStepId: undefined,
      errorStepId: undefined,
    }));
  } else {
    steps = (stepsData as Workflow['steps']) || [];
  }

  return {
    id: record.id,
    name: record.name,
    entityId: record.entityId,
    triggers: triggers.map((t) => ({
      type: t.type as Workflow['triggers'][number]['type'],
      config: t.config,
    })),
    steps,
    status: record.status as Workflow['status'],
    lastRun: record.lastRun ?? undefined,
    successRate: record.successRate,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Reconcile the workflow's schedule with Redis, and never let a scheduling
 * problem lose a saved workflow.
 *
 * A cron registration failing (Redis down, say) must not roll back a write the
 * user has already been told succeeded -- but it must also not be invisible,
 * which is how a schedule with no producer went unnoticed in the first place.
 * So: log it, keep the workflow.
 */
async function reconcileSchedule(
  workflowId: string,
  triggers: unknown,
  status: string,
  previousTriggers?: unknown
): Promise<void> {
  if (
    cronExpressionsOf(triggers).length === 0 &&
    cronExpressionsOf(previousTriggers ?? triggers).length === 0
  ) {
    return;
  }

  try {
    await syncCronTriggers(workflowId, triggers, status, previousTriggers);
  } catch (err) {
    console.error(
      `[workflow-crud] cron sync failed for workflow ${workflowId}:`,
      err instanceof Error ? err.message : err
    );
  }
}

export async function createWorkflow(
  params: CreateWorkflowParams,
  entityId: VerifiedEntityId
): Promise<Workflow> {
  const { name, graph, triggers } = params;

  const triggerData = triggers.map((t) => ({
    type: t.triggerType,
    config: t as unknown as Record<string, unknown>,
  }));

  const record = await prisma.workflow.create({
    data: {
      name,
      triggers: triggerData as unknown as Prisma.InputJsonValue,
      steps: graph as unknown as Prisma.InputJsonValue,
      status: 'DRAFT',
      // LAST and unconditional: the caller does not name its own tenant.
      entityId,
    },
  });

  await reconcileSchedule(record.id, record.triggers, record.status);

  return mapToWorkflow(record);
}

export async function getWorkflow(
  workflowId: string,
  entityId: VerifiedEntityId
): Promise<Workflow | null> {
  const record = await prisma.workflow.findFirst({
    where: { id: workflowId, entityId },
  });

  if (!record) return null;
  return mapToWorkflow(record);
}

export async function updateWorkflow(
  workflowId: string,
  updates: UpdateWorkflowParams,
  entityId: VerifiedEntityId
): Promise<Workflow> {
  const existing = await prisma.workflow.findFirst({
    where: { id: workflowId, entityId },
  });
  if (!existing) {
    throw new Error(`Workflow ${workflowId} not found`);
  }

  const data: Record<string, unknown> = {};

  if (updates.name !== undefined) data.name = updates.name;
  if (updates.status !== undefined) data.status = updates.status;
  if (updates.graph !== undefined) {
    data.steps = updates.graph as unknown as Prisma.InputJsonValue;
  }
  if (updates.triggers !== undefined) {
    data.triggers = updates.triggers.map((t) => ({
      type: t.triggerType,
      config: t as unknown as Record<string, unknown>,
    })) as unknown as Prisma.InputJsonValue;
  }

  // updateMany, not update: a unique WHERE cannot carry the entity.
  const { count } = await prisma.workflow.updateMany({
    where: { id: workflowId, entityId },
    data,
  });
  if (count === 0) {
    throw new Error(`Workflow ${workflowId} not found`);
  }

  const record = await prisma.workflow.findFirst({
    where: { id: workflowId, entityId },
  });
  if (!record) {
    throw new Error(`Workflow ${workflowId} not found`);
  }

  await reconcileSchedule(
    record.id,
    record.triggers,
    record.status,
    existing.triggers
  );

  return mapToWorkflow(record);
}

export async function deleteWorkflow(
  workflowId: string,
  entityId: VerifiedEntityId
): Promise<void> {
  const { count } = await prisma.workflow.updateMany({
    where: { id: workflowId, entityId },
    data: { status: 'ARCHIVED' },
  });
  if (count === 0) {
    throw new Error(`Workflow ${workflowId} not found`);
  }

  // An archived workflow must stop firing. Before this, archiving left the
  // repeatable job in Redis -- although nothing had ever put one there.
  const record = await prisma.workflow.findFirst({
    where: { id: workflowId, entityId },
  });
  await reconcileSchedule(workflowId, record?.triggers ?? [], 'ARCHIVED');
}

export async function listWorkflows(
  entityId: VerifiedEntityId,
  filters?: ListWorkflowFilters,
  page = 1,
  pageSize = 20
): Promise<{ data: Workflow[]; total: number }> {
  const where: Record<string, unknown> = {};
  if (filters?.status) {
    where.status = filters.status;
  }
  // Applied last and unconditionally: no filter combination can widen it.
  where.entityId = entityId;

  const [records, total] = await Promise.all([
    prisma.workflow.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.workflow.count({ where }),
  ]);

  return {
    data: records.map(mapToWorkflow),
    total,
  };
}

export async function duplicateWorkflow(
  workflowId: string,
  newName: string,
  entityId: VerifiedEntityId
): Promise<Workflow> {
  const original = await prisma.workflow.findFirst({
    where: { id: workflowId, entityId },
  });

  if (!original) {
    throw new Error(`Workflow ${workflowId} not found`);
  }

  const record = await prisma.workflow.create({
    data: {
      name: newName,
      triggers: original.triggers as unknown as Prisma.InputJsonValue,
      steps: original.steps as unknown as Prisma.InputJsonValue,
      status: 'DRAFT',
      // The copy stays in the entity the original was proved to belong to.
      entityId,
    },
  });

  return mapToWorkflow(record);
}
