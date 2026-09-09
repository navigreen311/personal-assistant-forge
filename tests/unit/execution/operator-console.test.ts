// Mock Prisma client before imports
//
// P-09: the timeline is no longer built from every ActionLog row in the window.
// `ActionLog` has no entityId column and the schema is frozen, so the scope now
// comes from `QueuedAction`, which carries both the log id and the entity. That
// means these tests need the queue delegate too -- and it is what makes the
// tenancy assertions below possible at all.
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    actionLog: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
    queuedAction: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

import {
  getTimeline,
  getTimelineEntry,
  buildTimelineFromActionLogs,
  getActivitySummary,
  searchTimeline,
} from '@/modules/execution/services/operator-console';
import prisma from '@/lib/db';
import type { ActionLog } from '@/shared/types';
import { verifiedEntityIdForTest } from '../../helpers/factories';

const ENTITY = verifiedEntityIdForTest('entity-1');
const OTHER_ENTITY = verifiedEntityIdForTest('entity-2');

/**
 * Say which ActionLog ids this entity's queued actions point at.
 *
 * This IS the scope: `scopedLogIndex` reads it with the entity in the WHERE
 * clause, so anything not listed here is unreachable for that tenant.
 */
function ownsLogs(entityId: string, ...logIds: string[]): void {
  (prisma.queuedAction.findMany as jest.Mock).mockImplementation(
    async (args: { where: { entityId: string } }) =>
      args.where.entityId === entityId
        ? logIds.map((actionLogId) => ({ actionLogId, entityId, projectId: null }))
        : []
  );
}

// Helper to build a mock Prisma ActionLog record
function makePrismaActionLog(overrides: Partial<{
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
}> = {}) {
  return {
    id: overrides.id ?? 'log-1',
    actor: overrides.actor ?? 'AI',
    actorId: overrides.actorId ?? null,
    actionType: overrides.actionType ?? 'CREATE_TASK',
    target: overrides.target ?? 'tasks',
    reason: overrides.reason ?? 'User requested',
    blastRadius: overrides.blastRadius ?? 'LOW',
    reversible: overrides.reversible ?? true,
    rollbackPath: overrides.rollbackPath ?? null,
    status: overrides.status ?? 'EXECUTED',
    cost: overrides.cost ?? null,
    timestamp: overrides.timestamp ?? new Date('2026-01-15T12:00:00Z'),
  };
}

describe('OperatorConsole', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Unless a test says otherwise, every log id in play belongs to ENTITY.
    ownsLogs(ENTITY, 'log-1', 'log-2', 'entry-42');
  });

  // ─── getTimeline ───────────────────────────────────────────────────

  describe('getTimeline', () => {
    it('should return empty data and zero total when no logs exist', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(0);

      const result = await getTimeline(ENTITY, {});

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should return timeline entries mapped from action logs', async () => {
      const mockLogs = [
        makePrismaActionLog({ id: 'log-1', actor: 'AI', actionType: 'CREATE_TASK', target: 'tasks' }),
        makePrismaActionLog({ id: 'log-2', actor: 'HUMAN', actorId: 'user-abc12345-rest', actionType: 'DELETE', target: 'contacts' }),
      ];
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue(mockLogs);
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(2);

      const result = await getTimeline(ENTITY, {});

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.data[0].id).toBe('log-1');
      expect(result.data[0].actorName).toBe('PAF AI Assistant');
      expect(result.data[1].actorName).toBe('User user-abc');
    });

    it('should filter by actor at the database level', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(0);

      await getTimeline(ENTITY, { actor: 'SYSTEM' });

      const whereArg = (prisma.actionLog.findMany as jest.Mock).mock.calls[0][0].where;
      expect(whereArg.actor).toBe('SYSTEM');
    });

    it('should filter by dateRange at the database level', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(0);

      const from = new Date('2026-01-01');
      const to = new Date('2026-01-31');
      await getTimeline(ENTITY, { dateRange: { from, to } });

      const whereArg = (prisma.actionLog.findMany as jest.Mock).mock.calls[0][0].where;
      expect(whereArg.timestamp).toEqual({ gte: from, lte: to });
    });

    it('should filter by blastRadius at the database level', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(0);

      await getTimeline(ENTITY, { blastRadius: 'HIGH' });

      const whereArg = (prisma.actionLog.findMany as jest.Mock).mock.calls[0][0].where;
      expect(whereArg.blastRadius).toBe('HIGH');
    });

    it('should apply pagination correctly', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(0);

      await getTimeline(ENTITY, {}, 3, 20);

      const findArgs = (prisma.actionLog.findMany as jest.Mock).mock.calls[0][0];
      expect(findArgs.skip).toBe(40); // (3-1) * 20
      expect(findArgs.take).toBe(20);
    });

    it('puts the tenant scope in the WHERE clause, not in a post-filter', async () => {
      // CORRECTED BY P-09. This test used to be called "should filter by
      // entityId in-memory after DB query" and it passed -- against a filter
      // that compared an entity id to a TARGET STRING and therefore matched
      // nothing. The filter ran on every request and removed nothing, so
      // GET /api/execution/timeline returned every tenant's audit trail.
      //
      // The scope is now the set of log ids reachable from this entity's queued
      // actions, and it is in the query.
      ownsLogs(ENTITY, 'log-1');
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([
        makePrismaActionLog({ id: 'log-1' }),
      ]);
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(1);

      const result = await getTimeline(ENTITY, {});

      const whereArg = (prisma.actionLog.findMany as jest.Mock).mock.calls[0][0].where;
      expect(whereArg.id).toEqual({ in: ['log-1'] });
      expect(result.data[0].entityId).toBe(ENTITY);
    });

    it('returns nothing for a tenant with no actions, without querying logs', async () => {
      // Fail closed, and fail early: an entity that owns no queued actions can
      // reach no log rows, so the log query is never issued at all.
      ownsLogs(ENTITY, 'log-1');

      const result = await getTimeline(OTHER_ENTITY, {});

      expect(result).toEqual({ data: [], total: 0 });
      expect(prisma.actionLog.findMany).not.toHaveBeenCalled();
    });

    it('should filter by search term across description, actionType, target, and actorName', async () => {
      const mockLogs = [
        makePrismaActionLog({ id: 'log-1', actor: 'AI', actionType: 'CREATE_TASK', target: 'tasks', reason: 'Creating' }),
        makePrismaActionLog({ id: 'log-2', actor: 'SYSTEM', actionType: 'DELETE_RECORD', target: 'contacts', reason: 'Cleanup' }),
      ];
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue(mockLogs);
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(2);

      // Search for "delete" should match the second entry's actionType
      const result = await getTimeline(ENTITY, { search: 'delete' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('log-2');
    });

    it('should use default page=1 and pageSize=50', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(0);

      await getTimeline(ENTITY, {});

      const findArgs = (prisma.actionLog.findMany as jest.Mock).mock.calls[0][0];
      expect(findArgs.skip).toBe(0);
      expect(findArgs.take).toBe(50);
      expect(findArgs.orderBy).toEqual({ timestamp: 'desc' });
    });
  });

  // ─── getTimelineEntry ─────────────────────────────────────────────

  describe('getTimelineEntry', () => {
    it('should return null when the entry does not exist', async () => {
      ownsLogs(ENTITY, 'nonexistent-id');
      (prisma.actionLog.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await getTimelineEntry('nonexistent-id', ENTITY);

      expect(result).toBeNull();
      expect(prisma.actionLog.findUnique).toHaveBeenCalledWith({
        where: { id: 'nonexistent-id' },
      });
    });

    it("returns null for another tenant's entry, without reading it", async () => {
      ownsLogs(OTHER_ENTITY, 'entry-42');

      const result = await getTimelineEntry('entry-42', ENTITY);

      expect(result).toBeNull();
      expect(prisma.actionLog.findUnique).not.toHaveBeenCalled();
    });

    it('should return a mapped timeline entry when found', async () => {
      const mockLog = makePrismaActionLog({
        id: 'entry-42',
        actor: 'HUMAN',
        actorId: 'user-abcd1234',
        actionType: 'SEND_EMAIL',
        target: 'messages',
      });
      (prisma.actionLog.findUnique as jest.Mock).mockResolvedValue(mockLog);

      const result = await getTimelineEntry('entry-42', ENTITY);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('entry-42');
      expect(result!.actorName).toBe('User user-abc');
      expect(result!.actionType).toBe('SEND_EMAIL');
      expect(result!.target).toBe('messages');
      expect(result!.description).toContain('SEND_EMAIL');
      expect(result!.description).toContain('messages');
    });
  });

  // ─── buildTimelineFromActionLogs ───────────────────────────────────

  describe('buildTimelineFromActionLogs', () => {
    it('should return an empty array for empty input', () => {
      const result = buildTimelineFromActionLogs([]);
      expect(result).toEqual([]);
    });

    it('should map ActionLog fields to OperatorTimelineEntry', () => {
      const logs: ActionLog[] = [
        {
          id: 'log-1',
          actor: 'AI',
          actorId: undefined,
          actionType: 'CREATE_TASK',
          target: 'tasks',
          reason: 'Requested by user',
          blastRadius: 'LOW',
          reversible: true,
          rollbackPath: undefined,
          status: 'EXECUTED',
          cost: undefined,
          timestamp: new Date('2026-02-01T10:00:00Z'),
        },
      ];

      const result = buildTimelineFromActionLogs(logs);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('log-1');
      expect(result[0].actor).toBe('AI');
      expect(result[0].actorName).toBe('PAF AI Assistant');
      expect(result[0].actionType).toBe('CREATE_TASK');
      expect(result[0].target).toBe('tasks');
      expect(result[0].blastRadius).toBe('LOW');
      expect(result[0].status).toBe('EXECUTED');
      // CORRECTED BY P-09: this used to assert `entityId === 'tasks'` with the
      // comment "extractEntityId returns target". Returning the target string
      // as an entity id is what made the tenant filter a no-op. With no owner
      // index supplied, the entry now carries no entity rather than a wrong one.
      expect(result[0].entityId).toBe('');
      expect(result[0].entityName).toBeUndefined();
      expect(result[0].projectId).toBeUndefined();
      expect(result[0].projectName).toBeUndefined();
      expect(result[0].relatedActions).toEqual([]);
    });

    it('should generate correct actor names for different actor types', () => {
      const logs: ActionLog[] = [
        {
          id: 'ai-log',
          actor: 'AI',
          actionType: 'a',
          target: 't',
          reason: 'r',
          blastRadius: 'LOW',
          reversible: true,
          status: 'EXECUTED',
          timestamp: new Date(),
        },
        {
          id: 'system-log',
          actor: 'SYSTEM',
          actionType: 'a',
          target: 't',
          reason: 'r',
          blastRadius: 'LOW',
          reversible: true,
          status: 'EXECUTED',
          timestamp: new Date(),
        },
        {
          id: 'human-log-with-id',
          actor: 'HUMAN',
          actorId: 'usr-12345678-abcd',
          actionType: 'a',
          target: 't',
          reason: 'r',
          blastRadius: 'LOW',
          reversible: true,
          status: 'EXECUTED',
          timestamp: new Date(),
        },
        {
          id: 'human-log-no-id',
          actor: 'HUMAN',
          actionType: 'a',
          target: 't',
          reason: 'r',
          blastRadius: 'LOW',
          reversible: true,
          status: 'EXECUTED',
          timestamp: new Date(),
        },
      ];

      const result = buildTimelineFromActionLogs(logs);

      expect(result[0].actorName).toBe('PAF AI Assistant');
      expect(result[1].actorName).toBe('System');
      expect(result[2].actorName).toBe('User usr-1234');
      expect(result[3].actorName).toBe('Human Operator');
    });

    it('should build correct description strings', () => {
      const logs: ActionLog[] = [
        {
          id: 'log-1',
          actor: 'SYSTEM',
          actionType: 'CLEANUP',
          target: 'old-records',
          reason: 'Scheduled maintenance',
          blastRadius: 'MEDIUM',
          reversible: false,
          status: 'EXECUTED',
          timestamp: new Date(),
        },
      ];

      const result = buildTimelineFromActionLogs(logs);

      expect(result[0].description).toBe(
        'System performed CLEANUP on old-records: Scheduled maintenance'
      );
    });
  });

  // ─── getActivitySummary ────────────────────────────────────────────

  describe('getActivitySummary', () => {
    it('should return zero counts when no logs exist in range', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getActivitySummary(ENTITY, {
        from: new Date('2026-01-01'),
        to: new Date('2026-01-31'),
      });

      expect(result.totalActions).toBe(0);
      expect(result.byActor).toEqual({});
      expect(result.byType).toEqual({});
      expect(result.byBlastRadius).toEqual({});
      expect(result.topTargets).toEqual([]);
    });

    it('should aggregate action logs by actor, type, and blast radius', async () => {
      const mockLogs = [
        makePrismaActionLog({ actor: 'AI', actionType: 'CREATE_TASK', blastRadius: 'LOW', target: 'tasks' }),
        makePrismaActionLog({ actor: 'AI', actionType: 'CREATE_TASK', blastRadius: 'LOW', target: 'tasks' }),
        makePrismaActionLog({ actor: 'HUMAN', actionType: 'DELETE', blastRadius: 'HIGH', target: 'contacts' }),
        makePrismaActionLog({ actor: 'SYSTEM', actionType: 'CLEANUP', blastRadius: 'MEDIUM', target: 'tasks' }),
      ];
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue(mockLogs);

      const result = await getActivitySummary(ENTITY, {
        from: new Date('2026-01-01'),
        to: new Date('2026-01-31'),
      });

      expect(result.totalActions).toBe(4);
      expect(result.byActor).toEqual({ AI: 2, HUMAN: 1, SYSTEM: 1 });
      expect(result.byType).toEqual({ CREATE_TASK: 2, DELETE: 1, CLEANUP: 1 });
      expect(result.byBlastRadius).toEqual({ LOW: 2, HIGH: 1, MEDIUM: 1 });
    });

    it('should return topTargets sorted by count descending', async () => {
      const mockLogs = [
        makePrismaActionLog({ target: 'tasks' }),
        makePrismaActionLog({ target: 'tasks' }),
        makePrismaActionLog({ target: 'tasks' }),
        makePrismaActionLog({ target: 'contacts' }),
        makePrismaActionLog({ target: 'contacts' }),
        makePrismaActionLog({ target: 'messages' }),
      ];
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue(mockLogs);

      const result = await getActivitySummary(ENTITY, {
        from: new Date('2026-01-01'),
        to: new Date('2026-01-31'),
      });

      expect(result.topTargets[0]).toEqual({ target: 'tasks', count: 3 });
      expect(result.topTargets[1]).toEqual({ target: 'contacts', count: 2 });
      expect(result.topTargets[2]).toEqual({ target: 'messages', count: 1 });
    });

    it('should limit topTargets to at most 10 entries', async () => {
      // Create 12 unique targets
      const mockLogs = Array.from({ length: 12 }, (_, i) =>
        makePrismaActionLog({ target: `target-${i}` })
      );
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue(mockLogs);

      const result = await getActivitySummary(ENTITY, {
        from: new Date('2026-01-01'),
        to: new Date('2026-01-31'),
      });

      expect(result.topTargets.length).toBeLessThanOrEqual(10);
    });

    it('should pass the date range to the Prisma query', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);

      const from = new Date('2026-02-01');
      const to = new Date('2026-02-28');
      await getActivitySummary(ENTITY, { from, to });

      expect(prisma.actionLog.findMany).toHaveBeenCalledWith({
        where: {
          timestamp: { gte: from, lte: to },
          // The scope, alongside the date range.
          id: { in: ['log-1', 'log-2', 'entry-42'] },
        },
      });
    });
  });

  // ─── searchTimeline ────────────────────────────────────────────────

  describe('searchTimeline', () => {
    it('should delegate to getTimeline with search filter applied', async () => {
      const mockLogs = [
        makePrismaActionLog({ id: 'log-1', actionType: 'SEND_EMAIL', target: 'messages', reason: 'Follow up' }),
      ];
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue(mockLogs);
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(1);

      const result = await searchTimeline('email', ENTITY);

      // Should find the entry because 'email' is in actionType 'SEND_EMAIL'
      expect(result).toHaveLength(1);
      expect(result[0].actionType).toBe('SEND_EMAIL');
    });

    it('should merge additional filters with the search query', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(0);

      await searchTimeline('task', ENTITY, { actor: 'AI', blastRadius: 'LOW' });

      const findArgs = (prisma.actionLog.findMany as jest.Mock).mock.calls[0][0];
      expect(findArgs.where.actor).toBe('AI');
      expect(findArgs.where.blastRadius).toBe('LOW');
    });

    it('should use pageSize of 100 for search', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(0);

      await searchTimeline('anything', ENTITY);

      const findArgs = (prisma.actionLog.findMany as jest.Mock).mock.calls[0][0];
      expect(findArgs.take).toBe(100);
    });

    it('should return empty array when no matches found', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(0);

      const result = await searchTimeline('nonexistent-xyz', ENTITY);
      expect(result).toEqual([]);
    });
  });
});
