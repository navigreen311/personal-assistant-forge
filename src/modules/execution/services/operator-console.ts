// ============================================================================
// Operator Console / Timeline Service
// Aggregates action logs into enriched timeline entries
// ============================================================================

import prisma from '@/lib/db';
import type { ActionLog } from '@/shared/types';
import type {
  OperatorTimelineEntry,
  OperatorConsoleFilters,
} from '../types';

// --- Public API ---

export async function getTimeline(
  filters: OperatorConsoleFilters,
  page = 1,
  pageSize = 50
): Promise<{ data: OperatorTimelineEntry[]; total: number }> {
  const where: Record<string, unknown> = {};

  if (filters.actor) {
    where.actor = filters.actor;
  }
  if (filters.dateRange) {
    where.timestamp = {
      gte: filters.dateRange.from,
      lte: filters.dateRange.to,
    };
  }
  if (filters.blastRadius) {
    where.blastRadius = filters.blastRadius;
  }

  const [actionLogs, total] = await Promise.all([
    prisma.actionLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.actionLog.count({ where }),
  ]);

  let entries = buildTimelineFromActionLogs(
    actionLogs.map(mapPrismaToActionLog)
  );

  // Apply additional filters that can't be done at DB level
  if (filters.entityId) {
    entries = entries.filter((e) => e.entityId === filters.entityId);
  }
  if (filters.projectId) {
    entries = entries.filter((e) => e.projectId === filters.projectId);
  }
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    entries = entries.filter(
      (e) =>
        e.description.toLowerCase().includes(searchLower) ||
        e.actionType.toLowerCase().includes(searchLower) ||
        e.target.toLowerCase().includes(searchLower) ||
        e.actorName.toLowerCase().includes(searchLower)
    );
  }

  return { data: entries, total };
}

export async function getTimelineEntry(
  entryId: string
): Promise<OperatorTimelineEntry | null> {
  const actionLog = await prisma.actionLog.findUnique({
    where: { id: entryId },
  });

  if (!actionLog) return null;

  const entries = buildTimelineFromActionLogs([
    mapPrismaToActionLog(actionLog),
  ]);

  return entries[0] ?? null;
}

export function buildTimelineFromActionLogs(
  actionLogs: ActionLog[]
): OperatorTimelineEntry[] {
  return actionLogs.map((log) => ({
    id: log.id,
    timestamp: log.timestamp,
    actor: log.actor,
    actorName: getActorName(log.actor, log.actorId),
    actionType: log.actionType,
    target: log.target,
    description: buildDescription(log),
    blastRadius: log.blastRadius,
    status: log.status,
    entityId: extractEntityId(log.target),
    entityName: undefined,
    projectId: undefined,
    projectName: undefined,
    relatedActions: [],
  }));
}

export async function getActivitySummary(
  entityId: string,
  dateRange: { from: Date; to: Date }
): Promise<{
  totalActions: number;
  byActor: Record<string, number>;
  byType: Record<string, number>;
  byBlastRadius: Record<string, number>;
  topTargets: Array<{ target: string; count: number }>;
}> {
  const actionLogs = await prisma.actionLog.findMany({
    where: {
      timestamp: {
        gte: dateRange.from,
        lte: dateRange.to,
      },
    },
  });

  const byActor: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const byBlastRadius: Record<string, number> = {};
  const targetCounts = new Map<string, number>();

  for (const log of actionLogs) {
    byActor[log.actor] = (byActor[log.actor] ?? 0) + 1;
    byType[log.actionType] = (byType[log.actionType] ?? 0) + 1;
    byBlastRadius[log.blastRadius] =
      (byBlastRadius[log.blastRadius] ?? 0) + 1;
    targetCounts.set(log.target, (targetCounts.get(log.target) ?? 0) + 1);
  }

  const topTargets = Array.from(targetCounts.entries())
    .map(([target, count]) => ({ target, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalActions: actionLogs.length,
    byActor,
    byType,
    byBlastRadius,
    topTargets,
  };
}

export async function searchTimeline(
  query: string,
  filters?: OperatorConsoleFilters
): Promise<OperatorTimelineEntry[]> {
  const result = await getTimeline(
    { ...filters, search: query },
    1,
    100
  );
  return result.data;
}

// --- Helpers ---

function mapPrismaToActionLog(prismaLog: {
  id: string;
  actor: string;
  actorId: string | null;
  actionType: string;
  target: string;
  reason: string;
  blastRadius: string;
  reversible: boolean;
  rollbackPath: string | null;
  status: string;
  cost: number | null;
  timestamp: Date;
}): ActionLog {
  return {
    id: prismaLog.id,
    actor: prismaLog.actor as ActionLog['actor'],
    actorId: prismaLog.actorId ?? undefined,
    actionType: prismaLog.actionType,
    target: prismaLog.target,
    reason: prismaLog.reason,
    blastRadius: prismaLog.blastRadius as ActionLog['blastRadius'],
    reversible: prismaLog.reversible,
    rollbackPath: prismaLog.rollbackPath ?? undefined,
    status: prismaLog.status as ActionLog['status'],
    cost: prismaLog.cost ?? undefined,
    timestamp: prismaLog.timestamp,
  };
}

function getActorName(actor: string, actorId?: string): string {
  switch (actor) {
    case 'AI':
      return 'PAF AI Assistant';
    case 'SYSTEM':
      return 'System';
    case 'HUMAN':
      return actorId ? `User ${actorId.slice(0, 8)}` : 'Human Operator';
    default:
      return actor;
  }
}

function buildDescription(log: ActionLog): string {
  const actorName = getActorName(log.actor, log.actorId);
  return `${actorName} performed ${log.actionType} on ${log.target}: ${log.reason}`;
}

function extractEntityId(target: string): string {
  // Entity ID may be embedded in the target string
  // For now return the target as entity context
  return target;
}
