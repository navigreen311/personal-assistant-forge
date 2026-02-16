// ============================================================================
// Workflow CRUD Service
// Create, read, update, delete, list, and duplicate workflows via Prisma
// ============================================================================

import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import type { WorkflowGraph, TriggerNodeConfig } from '@/modules/workflows/types';
import type { Workflow } from '@/shared/types';

export interface CreateWorkflowParams {
  name: string;
  entityId: string;
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

export async function createWorkflow(params: CreateWorkflowParams): Promise<Workflow> {
  const { name, entityId, graph, triggers } = params;

  const triggerData = triggers.map((t) => ({
    type: t.triggerType,
    config: t as unknown as Record<string, unknown>,
  }));

  const record = await prisma.workflow.create({
    data: {
      name,
      entityId,
      triggers: triggerData as unknown as Prisma.InputJsonValue,
      steps: graph as unknown as Prisma.InputJsonValue,
      status: 'DRAFT',
    },
  });

  return mapToWorkflow(record);
}

export async function getWorkflow(workflowId: string): Promise<Workflow | null> {
  const record = await prisma.workflow.findUnique({
    where: { id: workflowId },
  });

  if (!record) return null;
  return mapToWorkflow(record);
}

export async function updateWorkflow(
  workflowId: string,
  updates: UpdateWorkflowParams
): Promise<Workflow> {
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

  const record = await prisma.workflow.update({
    where: { id: workflowId },
    data,
  });

  return mapToWorkflow(record);
}

export async function deleteWorkflow(workflowId: string): Promise<void> {
  await prisma.workflow.update({
    where: { id: workflowId },
    data: { status: 'ARCHIVED' },
  });
}

export async function listWorkflows(
  entityId: string,
  filters?: ListWorkflowFilters,
  page = 1,
  pageSize = 20
): Promise<{ data: Workflow[]; total: number }> {
  const where: Record<string, unknown> = { entityId };
  if (filters?.status) {
    where.status = filters.status;
  }

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
  newName: string
): Promise<Workflow> {
  const original = await prisma.workflow.findUnique({
    where: { id: workflowId },
  });

  if (!original) {
    throw new Error(`Workflow ${workflowId} not found`);
  }

  const record = await prisma.workflow.create({
    data: {
      name: newName,
      entityId: original.entityId,
      triggers: original.triggers as unknown as Prisma.InputJsonValue,
      steps: original.steps as unknown as Prisma.InputJsonValue,
      status: 'DRAFT',
    },
  });

  return mapToWorkflow(record);
}
