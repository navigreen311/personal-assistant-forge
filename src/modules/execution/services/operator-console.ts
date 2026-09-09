// ============================================================================
// Operator Console / Timeline Service
// Aggregates action logs into enriched timeline entries
// ============================================================================
//
// P-09 (T-001). This file had the quietest tenancy bug in the package.
//
// `ActionLog` has no `entityId` column, and the schema is frozen. The old code
// papered over that with `extractEntityId(target)`, which returned the target
// STRING -- so `entries.filter(e => e.entityId === filters.entityId)` compared
// a target like "tasks/abc" against an entity id and essentially never matched.
// The filter looked like a tenant filter, ran on every request, and removed
// nothing: `GET /api/execution/timeline` returned every tenant's audit trail.
//
// The join that does exist is `QueuedAction`, which carries both `actionLogId`
// and `entityId`. The timeline is now built from the log rows reachable from
// this tenant's queued actions, so the scope is a real key relationship rather
// than a string coincidence -- and the entityId on each entry is the entity
// that actually owns the action, not a target string.
//
// The consequence worth stating: an ActionLog row that never went through the
// action queue (a raw audit write) no longer appears on the timeline. That is
// the fail-closed direction, and it is the right one for a console whose only
// job is to show an operator what was done on their behalf.

import prisma from '@/lib/db';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { ActionLog } from '@/shared/types';
import type {
  OperatorTimelineEntry,
  OperatorConsoleFilters,
} from '../types';

/** What the queue knows about the log rows belonging to one tenant. */
interface ScopedLogIndex {
  logIds: string[];
  ownerOf: Map<string, { entityId: string; projectId?: string }>;
}

/**
 * The ActionLog ids this tenant is allowed to see, and who owns each.
 *
 * The entity is in the WHERE clause of the QueuedAction query, so a foreign
 * log id is never in the returned set and there is no later filter to forget.
 */
async function scopedLogIndex(
  entityId: string,
  projectId?: string
): Promise<ScopedLogIndex> {
  const actions = await prisma.queuedAction.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
      // Applied last and unconditionally.
      entityId,
    },
    select: { actionLogId: true, entityId: true, projectId: true },
  });

  const ownerOf = new Map<string, { entityId: string; projectId?: string }>();
  for (const action of actions) {
    if (!action.actionLogId) continue;
    ownerOf.set(action.actionLogId, {
      entityId: action.entityId,
      projectId: action.projectId ?? undefined,
    });
  }

  return { logIds: Array.from(ownerOf.keys()), ownerOf };
}

// --- Public API ---

export async function getTimeline(
  entityId: VerifiedEntityId,
  filters: Omit<OperatorConsoleFilters, 'entityId'> = {},
  page = 1,
  pageSize = 50
): Promise<{ data: OperatorTimelineEntry[]; total: number }> {
  const index = await scopedLogIndex(entityId, filters.projectId);
  if (index.logIds.length === 0) {
    return { data: [], total: 0 };
  }

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

  // The scope, applied last and unconditionally, in the WHERE clause.
  where.id = { in: index.logIds };

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
    actionLogs.map(mapPrismaToActionLog),
    index.ownerOf
  );

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
  entryId: string,
  entityId: VerifiedEntityId
): Promise<OperatorTimelineEntry | null> {
  const index = await scopedLogIndex(entityId);
  if (!index.ownerOf.has(entryId)) return null;

  const actionLog = await prisma.actionLog.findUnique({
    where: { id: entryId },
  });

  if (!actionLog) return null;

  const entries = buildTimelineFromActionLogs(
    [mapPrismaToActionLog(actionLog)],
    index.ownerOf
  );

  return entries[0] ?? null;
}

export function buildTimelineFromActionLogs(
  actionLogs: ActionLog[],
  ownerOf?: Map<string, { entityId: string; projectId?: string }>
): OperatorTimelineEntry[] {
  return actionLogs.map((log) => {
    const owner = ownerOf?.get(log.id);
    return {
      id: log.id,
      timestamp: log.timestamp,
      actor: log.actor,
      actorName: getActorName(log.actor, log.actorId),
      actionType: log.actionType,
      target: log.target,
      description: buildDescription(log),
      blastRadius: log.blastRadius,
      status: log.status,
      entityId: owner?.entityId ?? '',
      entityName: undefined,
      projectId: owner?.projectId,
      projectName: undefined,
      relatedActions: [],
    };
  });
}

export async function getActivitySummary(
  entityId: VerifiedEntityId,
  dateRange: { from: Date; to: Date }
): Promise<{
  totalActions: number;
  byActor: Record<string, number>;
  byType: Record<string, number>;
  byBlastRadius: Record<string, number>;
  topTargets: Array<{ target: string; count: number }>;
}> {
  const index = await scopedLogIndex(entityId);

  const byActor: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const byBlastRadius: Record<string, number> = {};
  const targetCounts = new Map<string, number>();

  if (index.logIds.length === 0) {
    return {
      totalActions: 0,
      byActor,
      byType,
      byBlastRadius,
      topTargets: [],
    };
  }

  const actionLogs = await prisma.actionLog.findMany({
    where: {
      timestamp: {
        gte: dateRange.from,
        lte: dateRange.to,
      },
      id: { in: index.logIds },
    },
  });

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
  entityId: VerifiedEntityId,
  filters?: Omit<OperatorConsoleFilters, 'entityId'>
): Promise<OperatorTimelineEntry[]> {
  const result = await getTimeline(
    entityId,
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

