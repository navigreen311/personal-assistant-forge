// Mock Prisma client before imports
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    actionLog: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
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
  });

  // ─── getTimeline ───────────────────────────────────────────────────

  describe('getTimeline', () => {
    it('should return empty data and zero total when no logs exist', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(0);

      const result = await getTimeline({});

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

      const result = await getTimeline({});

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.data[0].id).toBe('log-1');
      expect(result.data[0].actorName).toBe('PAF AI Assistant');
      expect(result.data[1].actorName).toBe('User user-abc');
    });

    it('should filter by actor at the database level', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(0);

      await getTimeline({ actor: 'SYSTEM' });

      const whereArg = (prisma.actionLog.findMany as jest.Mock).mock.calls[0][0].where;
      expect(whereArg.actor).toBe('SYSTEM');
    });

    it('should filter by dateRange at the database level', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(0);

      const from = new Date('2026-01-01');
      const to = new Date('2026-01-31');
      await getTimeline({ dateRange: { from, to } });

      const whereArg = (prisma.actionLog.findMany as jest.Mock).mock.calls[0][0].where;
      expect(whereArg.timestamp).toEqual({ gte: from, lte: to });
    });

    it('should filter by blastRadius at the database level', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(0);

      await getTimeline({ blastRadius: 'HIGH' });

      const whereArg = (prisma.actionLog.findMany as jest.Mock).mock.calls[0][0].where;
      expect(whereArg.blastRadius).toBe('HIGH');
    });

    it('should apply pagination correctly', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(0);

      await getTimeline({}, 3, 20);

      const findArgs = (prisma.actionLog.findMany as jest.Mock).mock.calls[0][0];
      expect(findArgs.skip).toBe(40); // (3-1) * 20
      expect(findArgs.take).toBe(20);
    });

    it('should filter by entityId in-memory after DB query', async () => {
      const mockLogs = [
        makePrismaActionLog({ id: 'log-1', target: 'entity-A' }),
        makePrismaActionLog({ id: 'log-2', target: 'entity-B' }),
      ];
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue(mockLogs);
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(2);

      const result = await getTimeline({ entityId: 'entity-A' });

      // entityId is extracted from target, so only 'entity-A' target should match
      expect(result.data).toHaveLength(1);
      expect(result.data[0].entityId).toBe('entity-A');
    });

    it('should filter by search term across description, actionType, target, and actorName', async () => {
      const mockLogs = [
        makePrismaActionLog({ id: 'log-1', actor: 'AI', actionType: 'CREATE_TASK', target: 'tasks', reason: 'Creating' }),
        makePrismaActionLog({ id: 'log-2', actor: 'SYSTEM', actionType: 'DELETE_RECORD', target: 'contacts', reason: 'Cleanup' }),
      ];
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue(mockLogs);
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(2);

      // Search for "delete" should match the second entry's actionType
      const result = await getTimeline({ search: 'delete' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('log-2');
    });

    it('should use default page=1 and pageSize=50', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(0);

      await getTimeline({});

      const findArgs = (prisma.actionLog.findMany as jest.Mock).mock.calls[0][0];
      expect(findArgs.skip).toBe(0);
      expect(findArgs.take).toBe(50);
      expect(findArgs.orderBy).toEqual({ timestamp: 'desc' });
    });
  });

  // ─── getTimelineEntry ─────────────────────────────────────────────

  describe('getTimelineEntry', () => {
    it('should return null when the entry does not exist', async () => {
      (prisma.actionLog.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await getTimelineEntry('nonexistent-id');

      expect(result).toBeNull();
      expect(prisma.actionLog.findUnique).toHaveBeenCalledWith({
        where: { id: 'nonexistent-id' },
      });
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

      const result = await getTimelineEntry('entry-42');

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
      expect(result[0].entityId).toBe('tasks'); // extractEntityId returns target
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

      const result = await getActivitySummary('entity-1', {
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

      const result = await getActivitySummary('entity-1', {
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

      const result = await getActivitySummary('entity-1', {
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

      const result = await getActivitySummary('entity-1', {
        from: new Date('2026-01-01'),
        to: new Date('2026-01-31'),
      });

      expect(result.topTargets.length).toBeLessThanOrEqual(10);
    });

    it('should pass the date range to the Prisma query', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);

      const from = new Date('2026-02-01');
      const to = new Date('2026-02-28');
      await getActivitySummary('entity-1', { from, to });

      expect(prisma.actionLog.findMany).toHaveBeenCalledWith({
        where: {
          timestamp: { gte: from, lte: to },
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

      const result = await searchTimeline('email');

      // Should find the entry because 'email' is in actionType 'SEND_EMAIL'
      expect(result).toHaveLength(1);
      expect(result[0].actionType).toBe('SEND_EMAIL');
    });

    it('should merge additional filters with the search query', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(0);

      await searchTimeline('task', { actor: 'AI', blastRadius: 'LOW' });

      const findArgs = (prisma.actionLog.findMany as jest.Mock).mock.calls[0][0];
      expect(findArgs.where.actor).toBe('AI');
      expect(findArgs.where.blastRadius).toBe('LOW');
    });

    it('should use pageSize of 100 for search', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(0);

      await searchTimeline('anything');

      const findArgs = (prisma.actionLog.findMany as jest.Mock).mock.calls[0][0];
      expect(findArgs.take).toBe(100);
    });

    it('should return empty array when no matches found', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(0);

      const result = await searchTimeline('nonexistent-xyz');
      expect(result).toEqual([]);
    });
  });
});
