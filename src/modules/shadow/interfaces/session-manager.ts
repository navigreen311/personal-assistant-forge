// ============================================================================
// Shadow Voice Agent — Session Manager
// Manages voice session lifecycle: create, pause, resume, handoff, end, cleanup.
// Enforces one-active-session-per-user rule.
// ============================================================================

import { prisma } from '@/lib/db';
import type {
  VoiceSession,
  StartSessionParams,
  ListSessionsParams,
  ListSessionsResult,
  CleanupResult,
  ChannelHistoryEntry,
  SessionChannel,
} from './types';

// --- Constants ---

/** Minutes of inactivity before a session is auto-paused */
const IDLE_PAUSE_MINUTES = 10;

/** Minutes of inactivity before a session is auto-ended */
const IDLE_END_MINUTES = 120;

// --- Helpers ---

function mapDbSessionToVoiceSession(dbSession: Record<string, unknown>): VoiceSession {
  return {
    id: dbSession.id as string,
    userId: dbSession.userId as string,
    status: dbSession.status as VoiceSession['status'],
    currentChannel: dbSession.currentChannel as SessionChannel,
    channelHistory: (dbSession.channelHistory ?? []) as ChannelHistoryEntry[],
    activeEntityId: (dbSession.activeEntityId as string | null) ?? null,
    currentPage: (dbSession.currentPage as string | null) ?? null,
    currentWorkflowId: (dbSession.currentWorkflowId as string | null) ?? null,
    currentWorkflowStep: (dbSession.currentWorkflowStep as number | null) ?? null,
    recordingUrls: (dbSession.recordingUrls ?? []) as string[],
    fullTranscript: (dbSession.fullTranscript as string | null) ?? null,
    aiSummary: (dbSession.aiSummary as string | null) ?? null,
    approvals: (dbSession.approvals ?? []) as unknown[],
    startedAt: dbSession.startedAt as Date,
    lastActivityAt: dbSession.lastActivityAt as Date,
    endedAt: (dbSession.endedAt as Date | null) ?? null,
    totalDurationSeconds: (dbSession.totalDurationSeconds as number) ?? 0,
    messageCount: (dbSession.messageCount as number) ?? 0,
  };
}

// --- Session Manager ---

export class SessionManager {
  /**
   * Start a new voice session. If the user already has an active session, return it.
   * Enforces the one-active-session-per-user rule.
   */
  async startSession(params: StartSessionParams): Promise<VoiceSession> {
    const { userId, channel, entityId, currentPage } = params;

    // Check for existing active session
    const existing = await prisma.shadowVoiceSession.findFirst({
      where: { userId, status: 'active' },
      orderBy: { startedAt: 'desc' },
    });

    if (existing) {
      return mapDbSessionToVoiceSession(existing as unknown as Record<string, unknown>);
    }

    const now = new Date();
    const initialHistory: ChannelHistoryEntry[] = [
      { channel, enteredAt: now.toISOString() },
    ];

    const session = await prisma.shadowVoiceSession.create({
      data: {
        userId,
        status: 'active',
        currentChannel: channel,
        channelHistory: initialHistory as unknown as Parameters<typeof prisma.shadowVoiceSession.create>[0]['data']['channelHistory'],
        activeEntityId: entityId ?? null,
        currentPage: currentPage ?? null,
        startedAt: now,
        lastActivityAt: now,
        messageCount: 0,
        totalDurationSeconds: 0,
      },
    });

    return mapDbSessionToVoiceSession(session as unknown as Record<string, unknown>);
  }

  /**
   * Get the currently active session for a user.
   */
  async getActiveSession(userId: string): Promise<VoiceSession | null> {
    const session = await prisma.shadowVoiceSession.findFirst({
      where: { userId, status: 'active' },
      orderBy: { startedAt: 'desc' },
    });

    if (!session) return null;
    return mapDbSessionToVoiceSession(session as unknown as Record<string, unknown>);
  }

  /**
   * Get a session by ID.
   */
  async getSession(sessionId: string): Promise<VoiceSession | null> {
    const session = await prisma.shadowVoiceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) return null;
    return mapDbSessionToVoiceSession(session as unknown as Record<string, unknown>);
  }

  /**
   * Handoff session to a new channel. Updates currentChannel, appends to channelHistory,
   * and sets lastActivityAt.
   */
  async handoffChannel(sessionId: string, newChannel: string): Promise<VoiceSession> {
    const session = await prisma.shadowVoiceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status !== 'active') {
      throw new Error(`Cannot handoff channel on a ${session.status} session`);
    }

    const now = new Date();
    const history = (session.channelHistory ?? []) as ChannelHistoryEntry[];

    // Close the current channel entry
    if (history.length > 0) {
      const lastEntry = history[history.length - 1];
      if (!lastEntry.exitedAt) {
        lastEntry.exitedAt = now.toISOString();
      }
    }

    // Add new channel entry
    history.push({
      channel: newChannel as SessionChannel,
      enteredAt: now.toISOString(),
    });

    const updated = await prisma.shadowVoiceSession.update({
      where: { id: sessionId },
      data: {
        currentChannel: newChannel,
        channelHistory: history as unknown as Parameters<typeof prisma.shadowVoiceSession.update>[0]['data']['channelHistory'],
        lastActivityAt: now,
      },
    });

    return mapDbSessionToVoiceSession(updated as unknown as Record<string, unknown>);
  }

  /**
   * Pause a session. Sets status to "paused" and saves all state.
   */
  async pauseSession(sessionId: string): Promise<VoiceSession> {
    const session = await prisma.shadowVoiceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status === 'ended') {
      throw new Error('Cannot pause an ended session');
    }

    if (session.status === 'paused') {
      return mapDbSessionToVoiceSession(session as unknown as Record<string, unknown>);
    }

    const now = new Date();
    const history = (session.channelHistory ?? []) as ChannelHistoryEntry[];

    // Close the current channel entry
    if (history.length > 0) {
      const lastEntry = history[history.length - 1];
      if (!lastEntry.exitedAt) {
        lastEntry.exitedAt = now.toISOString();
      }
    }

    const updated = await prisma.shadowVoiceSession.update({
      where: { id: sessionId },
      data: {
        status: 'paused',
        channelHistory: history as unknown as Parameters<typeof prisma.shadowVoiceSession.update>[0]['data']['channelHistory'],
        lastActivityAt: now,
      },
    });

    return mapDbSessionToVoiceSession(updated as unknown as Record<string, unknown>);
  }

  /**
   * Resume a paused session. Sets status to "active", optionally updates channel.
   */
  async resumeSession(sessionId: string, channel?: string): Promise<VoiceSession> {
    const session = await prisma.shadowVoiceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status === 'ended') {
      throw new Error('Cannot resume an ended session');
    }

    if (session.status === 'active') {
      return mapDbSessionToVoiceSession(session as unknown as Record<string, unknown>);
    }

    // Enforce one-active-session-per-user: end any other active sessions
    await prisma.shadowVoiceSession.updateMany({
      where: {
        userId: session.userId,
        status: 'active',
        id: { not: sessionId },
      },
      data: {
        status: 'ended',
        endedAt: new Date(),
      },
    });

    const now = new Date();
    const history = (session.channelHistory ?? []) as ChannelHistoryEntry[];
    const resumeChannel = (channel ?? session.currentChannel) as SessionChannel;

    // Add new channel entry for the resumed session
    history.push({
      channel: resumeChannel,
      enteredAt: now.toISOString(),
    });

    const updated = await prisma.shadowVoiceSession.update({
      where: { id: sessionId },
      data: {
        status: 'active',
        currentChannel: resumeChannel,
        channelHistory: history as unknown as Parameters<typeof prisma.shadowVoiceSession.update>[0]['data']['channelHistory'],
        lastActivityAt: now,
      },
    });

    return mapDbSessionToVoiceSession(updated as unknown as Record<string, unknown>);
  }

  /**
   * End a session. Sets status to "ended", computes totalDurationSeconds.
   */
  async endSession(sessionId: string): Promise<VoiceSession> {
    const session = await prisma.shadowVoiceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status === 'ended') {
      return mapDbSessionToVoiceSession(session as unknown as Record<string, unknown>);
    }

    const now = new Date();
    const history = (session.channelHistory ?? []) as ChannelHistoryEntry[];

    // Close the current channel entry
    if (history.length > 0) {
      const lastEntry = history[history.length - 1];
      if (!lastEntry.exitedAt) {
        lastEntry.exitedAt = now.toISOString();
      }
    }

    // Calculate total duration from startedAt to now
    const totalDurationSeconds = Math.round(
      (now.getTime() - new Date(session.startedAt).getTime()) / 1000,
    );

    const updated = await prisma.shadowVoiceSession.update({
      where: { id: sessionId },
      data: {
        status: 'ended',
        endedAt: now,
        channelHistory: history as unknown as Parameters<typeof prisma.shadowVoiceSession.update>[0]['data']['channelHistory'],
        lastActivityAt: now,
        totalDurationSeconds,
      },
    });

    return mapDbSessionToVoiceSession(updated as unknown as Record<string, unknown>);
  }

  /**
   * Touch a session: increment messageCount and update lastActivityAt.
   * Optionally merge in additional field updates.
   */
  async touchSession(sessionId: string, updates?: Record<string, unknown>): Promise<void> {
    const session = await prisma.shadowVoiceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const data: Record<string, unknown> = {
      messageCount: session.messageCount + 1,
      lastActivityAt: new Date(),
    };

    // Merge in any safe updates (currentPage, currentWorkflowId, etc.)
    if (updates) {
      const allowedFields = new Set([
        'currentPage',
        'currentWorkflowId',
        'currentWorkflowStep',
        'fullTranscript',
        'aiSummary',
      ]);
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.has(key)) {
          data[key] = value;
        }
      }
    }

    await prisma.shadowVoiceSession.update({
      where: { id: sessionId },
      data,
    });
  }

  /**
   * List sessions for a user with pagination and optional status filter.
   */
  async listSessions(
    userId: string,
    params?: ListSessionsParams,
  ): Promise<ListSessionsResult> {
    const limit = Math.min(100, Math.max(1, params?.limit ?? 20));
    const offset = Math.max(0, params?.offset ?? 0);

    const where: Record<string, unknown> = { userId };
    if (params?.status) {
      where.status = params.status;
    }

    const [sessions, total] = await Promise.all([
      prisma.shadowVoiceSession.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.shadowVoiceSession.count({ where }),
    ]);

    return {
      sessions: sessions.map((s) =>
        mapDbSessionToVoiceSession(s as unknown as Record<string, unknown>),
      ),
      total,
    };
  }

  /**
   * Delete a session and all its associated messages, outcomes, consent receipts, and auth events.
   */
  async deleteSession(sessionId: string): Promise<void> {
    const session = await prisma.shadowVoiceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Delete related records first (cascade may not cover all relations)
    await Promise.all([
      prisma.shadowMessage.deleteMany({ where: { sessionId } }),
      prisma.shadowSessionOutcome.deleteMany({ where: { sessionId } }),
      prisma.shadowConsentReceipt.deleteMany({ where: { sessionId } }),
      prisma.shadowAuthEvent.deleteMany({ where: { sessionId } }),
    ]);

    await prisma.shadowVoiceSession.delete({
      where: { id: sessionId },
    });
  }

  /**
   * Clean up stale sessions:
   * - Pause sessions idle > IDLE_PAUSE_MINUTES (10 min)
   * - End sessions idle > IDLE_END_MINUTES (2 hours)
   * Returns counts of paused and ended sessions.
   */
  async cleanupStaleSessions(): Promise<CleanupResult> {
    const now = new Date();
    const pauseThreshold = new Date(now.getTime() - IDLE_PAUSE_MINUTES * 60 * 1000);
    const endThreshold = new Date(now.getTime() - IDLE_END_MINUTES * 60 * 1000);

    // End sessions that have been idle for > 2 hours (both active and paused)
    const endResult = await prisma.shadowVoiceSession.updateMany({
      where: {
        status: { in: ['active', 'paused'] },
        lastActivityAt: { lt: endThreshold },
      },
      data: {
        status: 'ended',
        endedAt: now,
      },
    });

    // Pause sessions that have been idle for > 10 min but < 2 hours (only active)
    const pauseResult = await prisma.shadowVoiceSession.updateMany({
      where: {
        status: 'active',
        lastActivityAt: {
          lt: pauseThreshold,
          gte: endThreshold,
        },
      },
      data: {
        status: 'paused',
      },
    });

    return {
      paused: pauseResult.count,
      ended: endResult.count,
    };
  }
}

// Singleton export
export const sessionManager = new SessionManager();
