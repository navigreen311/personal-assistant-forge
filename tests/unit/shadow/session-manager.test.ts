// ============================================================================
// Shadow Voice Agent — Session Manager Tests
// Tests for session lifecycle: start, pause, resume, end, handoff, cleanup, delete
// ============================================================================

jest.mock('@/lib/db', () => ({
  prisma: {
    shadowVoiceSession: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
    shadowMessage: {
      deleteMany: jest.fn(),
    },
    shadowSessionOutcome: {
      deleteMany: jest.fn(),
    },
    shadowConsentReceipt: {
      deleteMany: jest.fn(),
    },
    shadowAuthEvent: {
      deleteMany: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import {
  SessionManager,
  type ShadowSessionScope,
} from '@/modules/shadow/interfaces/session-manager';

const mockSession = prisma.shadowVoiceSession as jest.Mocked<typeof prisma.shadowVoiceSession>;
const mockMessage = prisma.shadowMessage as jest.Mocked<typeof prisma.shadowMessage>;
const mockOutcome = prisma.shadowSessionOutcome as jest.Mocked<typeof prisma.shadowSessionOutcome>;
const mockConsent = prisma.shadowConsentReceipt as jest.Mocked<typeof prisma.shadowConsentReceipt>;
const mockAuthEvent = prisma.shadowAuthEvent as jest.Mocked<typeof prisma.shadowAuthEvent>;

describe('SessionManager', () => {
  // P-41. `manager` is now only the factory and the one platform-wide sweep;
  // every method that addresses a session by id lives on the per-user scope, so
  // the subject under test is `sessions`, which is bound to `userId` and cannot
  // be asked about anybody else's row.
  let manager: SessionManager;
  let sessions: ShadowSessionScope;

  const userId = 'user-123';
  const sessionId = 'session-abc';
  const now = new Date('2026-02-23T12:00:00.000Z');

  const baseDbSession = {
    id: sessionId,
    userId,
    status: 'active',
    currentChannel: 'web',
    channelHistory: [{ channel: 'web', enteredAt: '2026-02-23T12:00:00.000Z' }],
    activeEntityId: 'entity-1',
    currentPage: '/dashboard',
    currentWorkflowId: null,
    currentWorkflowStep: null,
    recordingUrls: [],
    fullTranscript: null,
    aiSummary: null,
    approvals: [],
    startedAt: now,
    lastActivityAt: now,
    endedAt: null,
    totalDurationSeconds: 0,
    messageCount: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(now);
    manager = new SessionManager();
    sessions = manager.forUser(userId);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // --- startSession ---

  describe('startSession', () => {
    it('should create a new session when none exists', async () => {
      (mockSession.findFirst as jest.Mock).mockResolvedValue(null);
      (mockSession.create as jest.Mock).mockResolvedValue({ ...baseDbSession });

      const result = await sessions.startSession({
        channel: 'web',
        entityId: 'entity-1',
        currentPage: '/dashboard',
      });

      expect(mockSession.findFirst).toHaveBeenCalledWith({
        where: { userId, status: 'active' },
        orderBy: { startedAt: 'desc' },
      });
      expect(mockSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          status: 'active',
          currentChannel: 'web',
          activeEntityId: 'entity-1',
          currentPage: '/dashboard',
        }),
      });
      expect(result.id).toBe(sessionId);
      expect(result.status).toBe('active');
      expect(result.currentChannel).toBe('web');
    });

    it('should return existing active session instead of creating a new one', async () => {
      (mockSession.findFirst as jest.Mock).mockResolvedValue({ ...baseDbSession });

      const result = await sessions.startSession({
        channel: 'phone',
      });

      expect(mockSession.findFirst).toHaveBeenCalled();
      expect(mockSession.create).not.toHaveBeenCalled();
      expect(result.id).toBe(sessionId);
      expect(result.currentChannel).toBe('web'); // Existing session's channel, not the requested one
    });

    it('should create session with default null values for optional fields', async () => {
      (mockSession.findFirst as jest.Mock).mockResolvedValue(null);
      (mockSession.create as jest.Mock).mockResolvedValue({
        ...baseDbSession,
        activeEntityId: null,
        currentPage: null,
      });

      await sessions.startSession({ channel: 'mobile' });

      expect(mockSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          activeEntityId: null,
          currentPage: null,
          currentChannel: 'mobile',
        }),
      });
    });
  });

  // --- getActiveSession ---

  describe('getActiveSession', () => {
    it('should return active session if one exists', async () => {
      (mockSession.findFirst as jest.Mock).mockResolvedValue({ ...baseDbSession });

      const result = await sessions.getActiveSession();

      expect(result).not.toBeNull();
      expect(result!.id).toBe(sessionId);
      expect(result!.status).toBe('active');
    });

    it('should return null if no active session exists', async () => {
      (mockSession.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await sessions.getActiveSession();

      expect(result).toBeNull();
    });
  });

  // --- getSession ---

  describe('getSession', () => {
    // THIS CASE USED TO ENCODE THE DEFECT. It read:
    //
    //     const result = await manager.getSession(sessionId);
    //     expect(mockSession.findUnique).toHaveBeenCalledWith({
    //       where: { id: sessionId },
    //     });
    //     expect(result).not.toBeNull();
    //
    // "fetch a session by id and assert it comes back" passes just as well
    // against a version with no tenancy at all -- it asserted the bug. It now
    // asserts the owner is in the filter, which is the thing that can regress.
    it('should return session by ID, filtered by its owner', async () => {
      (mockSession.findFirst as jest.Mock).mockResolvedValue({ ...baseDbSession });

      const result = await sessions.getSession(sessionId);

      expect(mockSession.findFirst).toHaveBeenCalledWith({
        where: { id: sessionId, userId },
      });
      expect(result).not.toBeNull();
      expect(result!.id).toBe(sessionId);
    });

    it('should return null if session not found', async () => {
      (mockSession.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await sessions.getSession('nonexistent');

      expect(result).toBeNull();
    });
  });

  // --- handoffChannel ---

  describe('handoffChannel', () => {
    it('should update channel and append to channel history', async () => {
      (mockSession.findFirst as jest.Mock).mockResolvedValue({ ...baseDbSession });
      (mockSession.update as jest.Mock).mockResolvedValue({
        ...baseDbSession,
        currentChannel: 'phone',
        channelHistory: [
          { channel: 'web', enteredAt: '2026-02-23T12:00:00.000Z', exitedAt: '2026-02-23T12:00:00.000Z' },
          { channel: 'phone', enteredAt: '2026-02-23T12:00:00.000Z' },
        ],
      });

      const result = await sessions.handoffChannel(sessionId, 'phone');

      expect(mockSession.update).toHaveBeenCalledWith({
        where: { id: sessionId, userId },
        data: expect.objectContaining({
          currentChannel: 'phone',
          channelHistory: expect.arrayContaining([
            expect.objectContaining({ channel: 'web', exitedAt: expect.any(String) }),
            expect.objectContaining({ channel: 'phone', enteredAt: expect.any(String) }),
          ]),
        }),
      });
      expect(result.currentChannel).toBe('phone');
    });

    it('should throw if session not found', async () => {
      (mockSession.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        sessions.handoffChannel('nonexistent', 'phone'),
      ).rejects.toThrow('Session nonexistent not found');
    });

    it('should throw if session is not active', async () => {
      (mockSession.findFirst as jest.Mock).mockResolvedValue({
        ...baseDbSession,
        status: 'paused',
      });

      await expect(
        sessions.handoffChannel(sessionId, 'phone'),
      ).rejects.toThrow('Cannot handoff channel on a paused session');
    });
  });

  // --- pauseSession ---

  describe('pauseSession', () => {
    it('should pause an active session', async () => {
      (mockSession.findFirst as jest.Mock).mockResolvedValue({ ...baseDbSession });
      (mockSession.update as jest.Mock).mockResolvedValue({
        ...baseDbSession,
        status: 'paused',
      });

      const result = await sessions.pauseSession(sessionId);

      expect(mockSession.update).toHaveBeenCalledWith({
        where: { id: sessionId, userId },
        data: expect.objectContaining({
          status: 'paused',
        }),
      });
      expect(result.status).toBe('paused');
    });

    it('should return already-paused session without update', async () => {
      const pausedSession = { ...baseDbSession, status: 'paused' };
      (mockSession.findFirst as jest.Mock).mockResolvedValue(pausedSession);

      const result = await sessions.pauseSession(sessionId);

      expect(mockSession.update).not.toHaveBeenCalled();
      expect(result.status).toBe('paused');
    });

    it('should throw if session is ended', async () => {
      (mockSession.findFirst as jest.Mock).mockResolvedValue({
        ...baseDbSession,
        status: 'ended',
      });

      await expect(sessions.pauseSession(sessionId)).rejects.toThrow(
        'Cannot pause an ended session',
      );
    });

    it('should throw if session not found', async () => {
      (mockSession.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(sessions.pauseSession('nonexistent')).rejects.toThrow(
        'Session nonexistent not found',
      );
    });

    it('should close the current channel history entry on pause', async () => {
      (mockSession.findFirst as jest.Mock).mockResolvedValue({ ...baseDbSession });
      (mockSession.update as jest.Mock).mockResolvedValue({
        ...baseDbSession,
        status: 'paused',
      });

      await sessions.pauseSession(sessionId);

      expect(mockSession.update).toHaveBeenCalledWith({
        where: { id: sessionId, userId },
        data: expect.objectContaining({
          channelHistory: expect.arrayContaining([
            expect.objectContaining({
              channel: 'web',
              exitedAt: expect.any(String),
            }),
          ]),
        }),
      });
    });
  });

  // --- resumeSession ---

  describe('resumeSession', () => {
    it('should resume a paused session', async () => {
      const pausedSession = { ...baseDbSession, status: 'paused' };
      (mockSession.findFirst as jest.Mock).mockResolvedValue(pausedSession);
      (mockSession.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (mockSession.update as jest.Mock).mockResolvedValue({
        ...baseDbSession,
        status: 'active',
      });

      const result = await sessions.resumeSession(sessionId);

      expect(mockSession.update).toHaveBeenCalledWith({
        where: { id: sessionId, userId },
        data: expect.objectContaining({
          status: 'active',
        }),
      });
      expect(result.status).toBe('active');
    });

    it('should resume with a different channel if provided', async () => {
      const pausedSession = { ...baseDbSession, status: 'paused' };
      (mockSession.findFirst as jest.Mock).mockResolvedValue(pausedSession);
      (mockSession.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (mockSession.update as jest.Mock).mockResolvedValue({
        ...baseDbSession,
        status: 'active',
        currentChannel: 'phone',
      });

      const result = await sessions.resumeSession(sessionId, 'phone');

      expect(mockSession.update).toHaveBeenCalledWith({
        where: { id: sessionId, userId },
        data: expect.objectContaining({
          currentChannel: 'phone',
        }),
      });
      expect(result.currentChannel).toBe('phone');
    });

    it('should end other active sessions before resuming (one-active rule)', async () => {
      const pausedSession = { ...baseDbSession, status: 'paused' };
      (mockSession.findFirst as jest.Mock).mockResolvedValue(pausedSession);
      (mockSession.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (mockSession.update as jest.Mock).mockResolvedValue({
        ...baseDbSession,
        status: 'active',
      });

      await sessions.resumeSession(sessionId);

      expect(mockSession.updateMany).toHaveBeenCalledWith({
        where: {
          userId,
          status: 'active',
          id: { not: sessionId },
        },
        data: {
          status: 'ended',
          endedAt: expect.any(Date),
        },
      });
    });

    it('should return already-active session without update', async () => {
      (mockSession.findFirst as jest.Mock).mockResolvedValue({ ...baseDbSession });

      const result = await sessions.resumeSession(sessionId);

      expect(mockSession.update).not.toHaveBeenCalled();
      expect(result.status).toBe('active');
    });

    it('should throw if session is ended', async () => {
      (mockSession.findFirst as jest.Mock).mockResolvedValue({
        ...baseDbSession,
        status: 'ended',
      });

      await expect(sessions.resumeSession(sessionId)).rejects.toThrow(
        'Cannot resume an ended session',
      );
    });
  });

  // --- endSession ---

  describe('endSession', () => {
    it('should end a session and calculate duration', async () => {
      const startTime = new Date('2026-02-23T11:30:00.000Z');
      const activeSession = { ...baseDbSession, startedAt: startTime };
      (mockSession.findFirst as jest.Mock).mockResolvedValue(activeSession);
      (mockSession.update as jest.Mock).mockResolvedValue({
        ...activeSession,
        status: 'ended',
        endedAt: now,
        totalDurationSeconds: 1800, // 30 minutes
      });

      const result = await sessions.endSession(sessionId);

      expect(mockSession.update).toHaveBeenCalledWith({
        where: { id: sessionId, userId },
        data: expect.objectContaining({
          status: 'ended',
          endedAt: expect.any(Date),
          totalDurationSeconds: 1800,
        }),
      });
      expect(result.status).toBe('ended');
      expect(result.totalDurationSeconds).toBe(1800);
    });

    it('should return already-ended session without update', async () => {
      (mockSession.findFirst as jest.Mock).mockResolvedValue({
        ...baseDbSession,
        status: 'ended',
        endedAt: now,
      });

      const result = await sessions.endSession(sessionId);

      expect(mockSession.update).not.toHaveBeenCalled();
      expect(result.status).toBe('ended');
    });

    it('should close the current channel history entry on end', async () => {
      (mockSession.findFirst as jest.Mock).mockResolvedValue({ ...baseDbSession });
      (mockSession.update as jest.Mock).mockResolvedValue({
        ...baseDbSession,
        status: 'ended',
      });

      await sessions.endSession(sessionId);

      expect(mockSession.update).toHaveBeenCalledWith({
        where: { id: sessionId, userId },
        data: expect.objectContaining({
          channelHistory: expect.arrayContaining([
            expect.objectContaining({
              channel: 'web',
              exitedAt: expect.any(String),
            }),
          ]),
        }),
      });
    });

    it('should throw if session not found', async () => {
      (mockSession.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(sessions.endSession('nonexistent')).rejects.toThrow(
        'Session nonexistent not found',
      );
    });
  });

  // --- Full Lifecycle ---

  describe('session lifecycle: start -> pause -> resume -> end', () => {
    it('should complete a full lifecycle', async () => {
      // Step 1: Start
      (mockSession.findFirst as jest.Mock).mockResolvedValue(null);
      (mockSession.create as jest.Mock).mockResolvedValue({ ...baseDbSession });

      const started = await sessions.startSession({
        channel: 'web',
        entityId: 'entity-1',
      });
      expect(started.status).toBe('active');

      // Step 2: Pause
      (mockSession.findFirst as jest.Mock).mockResolvedValue({ ...baseDbSession });
      (mockSession.update as jest.Mock).mockResolvedValue({
        ...baseDbSession,
        status: 'paused',
      });

      const paused = await sessions.pauseSession(sessionId);
      expect(paused.status).toBe('paused');

      // Step 3: Resume
      (mockSession.findFirst as jest.Mock).mockResolvedValue({
        ...baseDbSession,
        status: 'paused',
      });
      (mockSession.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (mockSession.update as jest.Mock).mockResolvedValue({
        ...baseDbSession,
        status: 'active',
      });

      const resumed = await sessions.resumeSession(sessionId);
      expect(resumed.status).toBe('active');

      // Step 4: End
      (mockSession.findFirst as jest.Mock).mockResolvedValue({ ...baseDbSession });
      (mockSession.update as jest.Mock).mockResolvedValue({
        ...baseDbSession,
        status: 'ended',
        endedAt: now,
        totalDurationSeconds: 600,
      });

      const ended = await sessions.endSession(sessionId);
      expect(ended.status).toBe('ended');
      expect(ended.endedAt).toBeTruthy();
    });
  });

  // --- touchSession ---

  describe('touchSession', () => {
    it('should increment messageCount and update lastActivityAt', async () => {
      (mockSession.findFirst as jest.Mock).mockResolvedValue({
        ...baseDbSession,
        messageCount: 5,
      });
      (mockSession.update as jest.Mock).mockResolvedValue({});

      await sessions.touchSession(sessionId);

      expect(mockSession.update).toHaveBeenCalledWith({
        where: { id: sessionId, userId },
        data: expect.objectContaining({
          messageCount: 6,
          lastActivityAt: expect.any(Date),
        }),
      });
    });

    it('should merge allowed field updates', async () => {
      (mockSession.findFirst as jest.Mock).mockResolvedValue({
        ...baseDbSession,
        messageCount: 3,
      });
      (mockSession.update as jest.Mock).mockResolvedValue({});

      await sessions.touchSession(sessionId, {
        currentPage: '/contacts',
        currentWorkflowId: 'wf-1',
      });

      expect(mockSession.update).toHaveBeenCalledWith({
        where: { id: sessionId, userId },
        data: expect.objectContaining({
          messageCount: 4,
          currentPage: '/contacts',
          currentWorkflowId: 'wf-1',
        }),
      });
    });

    it('should ignore disallowed field updates', async () => {
      (mockSession.findFirst as jest.Mock).mockResolvedValue({
        ...baseDbSession,
        messageCount: 0,
      });
      (mockSession.update as jest.Mock).mockResolvedValue({});

      await sessions.touchSession(sessionId, {
        status: 'ended', // Not allowed
        userId: 'hacker', // Not allowed
        currentPage: '/safe-page', // Allowed
      });

      const updateCall = (mockSession.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.status).toBeUndefined();
      expect(updateCall.data.userId).toBeUndefined();
      expect(updateCall.data.currentPage).toBe('/safe-page');
    });

    it('should throw if session not found', async () => {
      (mockSession.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(sessions.touchSession('nonexistent')).rejects.toThrow(
        'Session nonexistent not found',
      );
    });
  });

  // --- listSessions ---

  describe('listSessions', () => {
    it('should list sessions with pagination', async () => {
      const rows = [baseDbSession, { ...baseDbSession, id: 'session-2' }];
      (mockSession.findMany as jest.Mock).mockResolvedValue(rows);
      (mockSession.count as jest.Mock).mockResolvedValue(2);

      const result = await sessions.listSessions({ limit: 10, offset: 0 });

      expect(result.sessions).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(mockSession.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { startedAt: 'desc' },
        skip: 0,
        take: 10,
      });
    });

    it('should filter by status', async () => {
      (mockSession.findMany as jest.Mock).mockResolvedValue([]);
      (mockSession.count as jest.Mock).mockResolvedValue(0);

      await sessions.listSessions({ status: 'ended' });

      expect(mockSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId, status: 'ended' },
        }),
      );
    });

    it('should use default pagination values', async () => {
      (mockSession.findMany as jest.Mock).mockResolvedValue([]);
      (mockSession.count as jest.Mock).mockResolvedValue(0);

      await sessions.listSessions();

      expect(mockSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
        }),
      );
    });

    it('should clamp limit to 100', async () => {
      (mockSession.findMany as jest.Mock).mockResolvedValue([]);
      (mockSession.count as jest.Mock).mockResolvedValue(0);

      await sessions.listSessions({ limit: 500 });

      expect(mockSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        }),
      );
    });
  });

  // --- deleteSession ---

  describe('deleteSession', () => {
    it('should delete session and all related records', async () => {
      (mockSession.findFirst as jest.Mock).mockResolvedValue({ ...baseDbSession });
      (mockMessage.deleteMany as jest.Mock).mockResolvedValue({ count: 5 });
      (mockOutcome.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
      (mockConsent.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });
      (mockAuthEvent.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      (mockSession.delete as jest.Mock).mockResolvedValue({});

      await sessions.deleteSession(sessionId);

      expect(mockMessage.deleteMany).toHaveBeenCalledWith({
        where: { sessionId },
      });
      expect(mockOutcome.deleteMany).toHaveBeenCalledWith({
        where: { sessionId },
      });
      expect(mockConsent.deleteMany).toHaveBeenCalledWith({
        where: { sessionId },
      });
      expect(mockAuthEvent.deleteMany).toHaveBeenCalledWith({
        where: { sessionId },
      });
      expect(mockSession.delete).toHaveBeenCalledWith({
        where: { id: sessionId, userId },
      });
    });

    it('should throw if session not found', async () => {
      (mockSession.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(sessions.deleteSession('nonexistent')).rejects.toThrow(
        'Session nonexistent not found',
      );
    });
  });

  // --- the guard that covers every case above ---

  describe('P-41: no session is ever addressed by id alone', () => {
    // `findUnique` is still in the `@/lib/db` mock on purpose. It is the only
    // ShadowVoiceSession method whose `where` cannot be a filter-only object in
    // the old code's style, and it was the delegate all seven by-id reads used.
    // Asserting it is never reached makes this a claim about the module rather
    // than about the twelve call sites the cases above happen to visit: a new
    // method that reaches for it fails here even if nobody writes a case for
    // it.
    it('never calls findUnique on shadowVoiceSession, in any lifecycle method', async () => {
      (mockSession.findFirst as jest.Mock).mockResolvedValue({ ...baseDbSession });
      (mockSession.update as jest.Mock).mockResolvedValue({ ...baseDbSession });
      (mockSession.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (mockSession.findMany as jest.Mock).mockResolvedValue([]);
      (mockSession.count as jest.Mock).mockResolvedValue(0);
      (mockSession.create as jest.Mock).mockResolvedValue({ ...baseDbSession });
      (mockSession.delete as jest.Mock).mockResolvedValue({});
      (mockMessage.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      (mockOutcome.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      (mockConsent.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      (mockAuthEvent.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });

      await sessions.getSession(sessionId);
      await sessions.getActiveSession();
      await sessions.listSessions();
      await sessions.touchSession(sessionId);
      await sessions.handoffChannel(sessionId, 'phone');
      await sessions.pauseSession(sessionId);
      await sessions.deleteSession(sessionId);
      // `resumeSession` needs a paused row to get past its early return.
      (mockSession.findFirst as jest.Mock).mockResolvedValue({
        ...baseDbSession,
        status: 'paused',
      });
      await sessions.resumeSession(sessionId);
      await sessions.endSession(sessionId);

      expect(mockSession.findUnique).not.toHaveBeenCalled();
    });

    it('puts the owner in every where clause that names an id', async () => {
      (mockSession.findFirst as jest.Mock).mockResolvedValue({ ...baseDbSession });
      (mockSession.update as jest.Mock).mockResolvedValue({ ...baseDbSession });
      (mockSession.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (mockSession.delete as jest.Mock).mockResolvedValue({});
      (mockMessage.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      (mockOutcome.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      (mockConsent.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      (mockAuthEvent.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });

      await sessions.touchSession(sessionId);
      await sessions.handoffChannel(sessionId, 'phone');
      await sessions.pauseSession(sessionId);
      await sessions.endSession(sessionId);
      await sessions.deleteSession(sessionId);

      const calls = [
        ...(mockSession.findFirst as jest.Mock).mock.calls,
        ...(mockSession.update as jest.Mock).mock.calls,
        ...(mockSession.delete as jest.Mock).mock.calls,
      ].map((call) => call[0].where as Record<string, unknown>);

      // Every single one of them, not "at least one": a filter that names an
      // id and omits the owner is the whole defect, and it only takes one.
      expect(calls.length).toBeGreaterThan(0);
      for (const where of calls) {
        if (where.id === undefined) continue;
        expect(where).toEqual({ id: sessionId, userId });
      }
    });

    it('refuses to build a store with no owner rather than filtering on undefined', () => {
      // `where: { userId: undefined }` is not an error in Prisma -- it is "no
      // filter", which is exactly the cross-tenant read this package closed. So
      // an empty user id has to fail at construction, not at query time.
      expect(() => manager.forUser('')).toThrow('non-empty userId');
    });
  });

  // --- cleanupStaleSessions ---

  describe('cleanupStaleSessions', () => {
    it('should end sessions idle for > 2 hours and pause sessions idle for > 10 minutes', async () => {
      (mockSession.updateMany as jest.Mock)
        .mockResolvedValueOnce({ count: 3 }) // ended
        .mockResolvedValueOnce({ count: 5 }); // paused

      const result = await manager.cleanupStaleSessions();

      expect(result.ended).toBe(3);
      expect(result.paused).toBe(5);

      // First call: end sessions idle > 2 hours
      const endCall = (mockSession.updateMany as jest.Mock).mock.calls[0][0];
      expect(endCall.where.status).toEqual({ in: ['active', 'paused'] });
      expect(endCall.data.status).toBe('ended');

      // Second call: pause sessions idle > 10 min but < 2 hours
      const pauseCall = (mockSession.updateMany as jest.Mock).mock.calls[1][0];
      expect(pauseCall.where.status).toBe('active');
      expect(pauseCall.data.status).toBe('paused');
    });

    it('should use correct time thresholds', async () => {
      (mockSession.updateMany as jest.Mock)
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 });

      await manager.cleanupStaleSessions();

      // End threshold: 2 hours ago
      const endCall = (mockSession.updateMany as jest.Mock).mock.calls[0][0];
      const endThreshold = endCall.where.lastActivityAt.lt;
      const expectedEndThreshold = new Date(now.getTime() - 120 * 60 * 1000);
      expect(endThreshold.getTime()).toBe(expectedEndThreshold.getTime());

      // Pause threshold: 10 minutes ago
      const pauseCall = (mockSession.updateMany as jest.Mock).mock.calls[1][0];
      const pauseThreshold = pauseCall.where.lastActivityAt.lt;
      const expectedPauseThreshold = new Date(now.getTime() - 10 * 60 * 1000);
      expect(pauseThreshold.getTime()).toBe(expectedPauseThreshold.getTime());
    });

    it('should return zero counts when no stale sessions exist', async () => {
      (mockSession.updateMany as jest.Mock)
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 });

      const result = await manager.cleanupStaleSessions();

      expect(result.paused).toBe(0);
      expect(result.ended).toBe(0);
    });
  });
});
