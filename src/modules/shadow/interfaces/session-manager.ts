// ============================================================================
// Shadow Voice Agent — Session Manager
// Manages voice session lifecycle: create, pause, resume, handoff, end, cleanup.
// Enforces one-active-session-per-user rule.
// ============================================================================
//
// P-41 — EVERY METHOD THAT ADDRESSES A SESSION IS REACHED THROUGH ITS OWNER.
//
// `sessionManager.getSession(id)` used to exist and took a bare cuid. It ran
// `findUnique({ where: { id } })`, so the row crossed the tenancy boundary
// before anybody checked it, and the eleven route files that call this module
// each re-checked `voiceSession.userId !== session.userId` by hand afterwards.
// Two callers in `web-chat.ts` did not.
//
// The public surface is now:
//
//     sessionManager.forUser(session.userId).getSession(id)
//
// `forUser` returns a `ShadowSessionScope` bound to one user, and every read
// and write it performs goes through `OwnedSessionStore` in `./session-store`,
// which holds the user id privately and merges it into the `where`. This file
// does not import `@/lib/db` and `eslint.config.mjs` forbids it from doing so,
// so a method added here cannot reach a session row except through the scope.
// Read `./session-store.ts`'s header first — it carries the full reasoning,
// including why the axis is `userId` and not `entityId`.
//
// A session that is not this user's is reported exactly as a session that does
// not exist: `getSession` returns null, and the lifecycle methods throw the
// pre-existing `Session <id> not found`. The two cases are the same code path,
// not two branches that happen to agree.

import type {
  VoiceSession,
  StartSessionParams,
  ListSessionsParams,
  ListSessionsResult,
  CleanupResult,
  ChannelHistoryEntry,
  SessionChannel,
} from './types';
import {
  ownedSessions,
  updateStaleSessionsAcrossAllUsers,
  type OwnedSessionStore,
  type SessionUpdate,
} from './session-store';

// --- Constants ---

/** Minutes of inactivity before a session is auto-paused */
const IDLE_PAUSE_MINUTES = 10;

/** Minutes of inactivity before a session is auto-ended */
const IDLE_END_MINUTES = 120;

// --- Types ---

/**
 * `StartSessionParams` without the owner.
 *
 * The owner comes from the scope, so it cannot disagree with the caller's
 * authenticated user. `StartSessionParams` itself is unchanged in `./types`.
 */
export type StartSessionInput = Omit<StartSessionParams, 'userId'>;

// --- Helpers ---

/**
 * Read a `ShadowVoiceSession.channelHistory` Json column as typed entries.
 * The column is untyped `Json`, so entries are validated rather than asserted;
 * anything that is not a well-formed entry is dropped.
 */
function readChannelHistory(value: unknown): ChannelHistoryEntry[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): ChannelHistoryEntry[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.channel !== 'string' || typeof record.enteredAt !== 'string') {
      return [];
    }
    return [
      {
        channel: record.channel as SessionChannel,
        enteredAt: record.enteredAt,
        ...(typeof record.exitedAt === 'string' ? { exitedAt: record.exitedAt } : {}),
      },
    ];
  });
}

/** A `Json` column read as a list of strings, dropping anything else. */
function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

/** A `Json` column read as a list, without asserting what is in it. */
function readUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * The database row a `VoiceSession`.
 *
 * Takes the row shape the store returns rather than `Record<string, unknown>`,
 * which is what removed the nine `as unknown as Record<string, unknown>` casts
 * this file used to carry at every call site.
 */
function mapDbSessionToVoiceSession(dbSession: {
  id: string;
  userId: string;
  status: string;
  currentChannel: string;
  channelHistory: unknown;
  activeEntityId: string | null;
  currentPage: string | null;
  currentWorkflowId: string | null;
  currentWorkflowStep: number | null;
  recordingUrls: unknown;
  fullTranscript: string | null;
  aiSummary: string | null;
  approvals: unknown;
  startedAt: Date;
  lastActivityAt: Date;
  endedAt: Date | null;
  totalDurationSeconds: number;
  messageCount: number;
}): VoiceSession {
  return {
    id: dbSession.id,
    userId: dbSession.userId,
    status: dbSession.status as VoiceSession['status'],
    currentChannel: dbSession.currentChannel as SessionChannel,
    channelHistory: readChannelHistory(dbSession.channelHistory),
    activeEntityId: dbSession.activeEntityId ?? null,
    currentPage: dbSession.currentPage ?? null,
    currentWorkflowId: dbSession.currentWorkflowId ?? null,
    currentWorkflowStep: dbSession.currentWorkflowStep ?? null,
    recordingUrls: readStringArray(dbSession.recordingUrls),
    fullTranscript: dbSession.fullTranscript ?? null,
    aiSummary: dbSession.aiSummary ?? null,
    approvals: readUnknownArray(dbSession.approvals),
    startedAt: dbSession.startedAt,
    lastActivityAt: dbSession.lastActivityAt,
    endedAt: dbSession.endedAt ?? null,
    totalDurationSeconds: dbSession.totalDurationSeconds ?? 0,
    messageCount: dbSession.messageCount ?? 0,
  };
}

/** Close the open channel-history entry, if there is one. */
function closeCurrentChannel(history: ChannelHistoryEntry[], at: Date): void {
  if (history.length === 0) return;
  const lastEntry = history[history.length - 1];
  if (!lastEntry.exitedAt) {
    lastEntry.exitedAt = at.toISOString();
  }
}

/** The fields `touchSession` will merge from an untyped caller payload. */
const TOUCHABLE_FIELDS = [
  'currentPage',
  'currentWorkflowId',
  'currentWorkflowStep',
  'fullTranscript',
  'aiSummary',
] as const;

type TouchableField = (typeof TOUCHABLE_FIELDS)[number];

function isTouchableField(key: string): key is TouchableField {
  return (TOUCHABLE_FIELDS as readonly string[]).includes(key);
}

// --- Session Manager, bound to one user ---

/**
 * The session lifecycle, for exactly one user.
 *
 * Obtain one with `sessionManager.forUser(userId)`. No method here takes a user
 * id, so no call site can pass the wrong one or transpose two cuids; the owner
 * is fixed when the scope is created and merged into every query by
 * `OwnedSessionStore`.
 */
export class ShadowSessionScope {
  readonly #store: OwnedSessionStore;

  constructor(store: OwnedSessionStore) {
    this.#store = store;
  }

  /** The user this scope acts for. */
  get userId(): string {
    return this.#store.userId;
  }

  /**
   * The session, or a throw that does not say which of the two reasons applied.
   *
   * "Not yours" and "does not exist" produce the identical message, because the
   * store cannot tell them apart either: it ran one `findFirst` filtered on
   * both columns. See `./session-store.ts` on why that is deliberate.
   */
  async #requireOwned(sessionId: string) {
    const session = await this.#store.findById(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return session;
  }

  /**
   * Start a new voice session. If the user already has an active session, return it.
   * Enforces the one-active-session-per-user rule.
   */
  async startSession(params: StartSessionInput): Promise<VoiceSession> {
    const { channel, entityId, currentPage } = params;

    // Check for existing active session
    const existing = await this.#store.findActive();
    if (existing) {
      return mapDbSessionToVoiceSession(existing);
    }

    const now = new Date();
    const initialHistory: ChannelHistoryEntry[] = [
      { channel, enteredAt: now.toISOString() },
    ];

    const session = await this.#store.create({
      status: 'active',
      currentChannel: channel,
      channelHistory: initialHistory,
      activeEntityId: entityId ?? null,
      currentPage: currentPage ?? null,
      startedAt: now,
      lastActivityAt: now,
      messageCount: 0,
      totalDurationSeconds: 0,
    });

    return mapDbSessionToVoiceSession(session);
  }

  /**
   * Get the currently active session for this user.
   */
  async getActiveSession(): Promise<VoiceSession | null> {
    const session = await this.#store.findActive();
    if (!session) return null;
    return mapDbSessionToVoiceSession(session);
  }

  /**
   * Get one of this user's sessions by ID.
   *
   * Returns null for a session that does not exist AND for a session that
   * belongs to somebody else — one query, one answer, no oracle.
   */
  async getSession(sessionId: string): Promise<VoiceSession | null> {
    const session = await this.#store.findById(sessionId);
    if (!session) return null;
    return mapDbSessionToVoiceSession(session);
  }

  /**
   * Handoff session to a new channel. Updates currentChannel, appends to channelHistory,
   * and sets lastActivityAt.
   */
  async handoffChannel(sessionId: string, newChannel: string): Promise<VoiceSession> {
    const session = await this.#requireOwned(sessionId);

    if (session.status !== 'active') {
      throw new Error(`Cannot handoff channel on a ${session.status} session`);
    }

    const now = new Date();
    const history = readChannelHistory(session.channelHistory);

    closeCurrentChannel(history, now);

    // Add new channel entry
    history.push({
      channel: newChannel as SessionChannel,
      enteredAt: now.toISOString(),
    });

    const updated = await this.#store.updateById(sessionId, {
      currentChannel: newChannel,
      channelHistory: history,
      lastActivityAt: now,
    });

    return mapDbSessionToVoiceSession(updated);
  }

  /**
   * Pause a session. Sets status to "paused" and saves all state.
   */
  async pauseSession(sessionId: string): Promise<VoiceSession> {
    const session = await this.#requireOwned(sessionId);

    if (session.status === 'ended') {
      throw new Error('Cannot pause an ended session');
    }

    if (session.status === 'paused') {
      return mapDbSessionToVoiceSession(session);
    }

    const now = new Date();
    const history = readChannelHistory(session.channelHistory);

    closeCurrentChannel(history, now);

    const updated = await this.#store.updateById(sessionId, {
      status: 'paused',
      channelHistory: history,
      lastActivityAt: now,
    });

    return mapDbSessionToVoiceSession(updated);
  }

  /**
   * Resume a paused session. Sets status to "active", optionally updates channel.
   */
  async resumeSession(sessionId: string, channel?: string): Promise<VoiceSession> {
    const session = await this.#requireOwned(sessionId);

    if (session.status === 'ended') {
      throw new Error('Cannot resume an ended session');
    }

    if (session.status === 'active') {
      return mapDbSessionToVoiceSession(session);
    }

    // Enforce one-active-session-per-user: end any other active sessions.
    // The store scopes this to the owner; `session.userId` is no longer read
    // off the fetched row, because a row fetched by id used to be the only
    // thing that decided which user's sessions an `updateMany` would end.
    await this.#store.endOtherActiveSessions(sessionId, new Date());

    const now = new Date();
    const history = readChannelHistory(session.channelHistory);
    const resumeChannel = (channel ?? session.currentChannel) as SessionChannel;

    // Add new channel entry for the resumed session
    history.push({
      channel: resumeChannel,
      enteredAt: now.toISOString(),
    });

    const updated = await this.#store.updateById(sessionId, {
      status: 'active',
      currentChannel: resumeChannel,
      channelHistory: history,
      lastActivityAt: now,
    });

    return mapDbSessionToVoiceSession(updated);
  }

  /**
   * End a session. Sets status to "ended", computes totalDurationSeconds.
   */
  async endSession(sessionId: string): Promise<VoiceSession> {
    const session = await this.#requireOwned(sessionId);

    if (session.status === 'ended') {
      return mapDbSessionToVoiceSession(session);
    }

    const now = new Date();
    const history = readChannelHistory(session.channelHistory);

    closeCurrentChannel(history, now);

    // Calculate total duration from startedAt to now
    const totalDurationSeconds = Math.round(
      (now.getTime() - new Date(session.startedAt).getTime()) / 1000,
    );

    const updated = await this.#store.updateById(sessionId, {
      status: 'ended',
      endedAt: now,
      channelHistory: history,
      lastActivityAt: now,
      totalDurationSeconds,
    });

    return mapDbSessionToVoiceSession(updated);
  }

  /**
   * Touch a session: increment messageCount and update lastActivityAt.
   * Optionally merge in additional field updates.
   */
  async touchSession(sessionId: string, updates?: Record<string, unknown>): Promise<void> {
    const session = await this.#requireOwned(sessionId);

    const data: SessionUpdate = {
      messageCount: session.messageCount + 1,
      lastActivityAt: new Date(),
    };

    // Merge in any safe updates (currentPage, currentWorkflowId, etc.). The
    // allow-list is unchanged; `SessionUpdate` now also makes the write typed,
    // so a field outside it is a compile error as well as a runtime no-op.
    if (updates) {
      for (const [key, value] of Object.entries(updates)) {
        if (!isTouchableField(key)) continue;
        const text = typeof value === 'string' ? value : null;
        switch (key) {
          case 'currentPage':
            data.currentPage = text;
            break;
          case 'currentWorkflowId':
            data.currentWorkflowId = text;
            break;
          case 'currentWorkflowStep':
            data.currentWorkflowStep = typeof value === 'number' ? value : null;
            break;
          case 'fullTranscript':
            data.fullTranscript = text;
            break;
          case 'aiSummary':
            data.aiSummary = text;
            break;
        }
      }
    }

    await this.#store.updateById(sessionId, data);
  }

  /**
   * List this user's sessions with pagination and optional status filter.
   */
  async listSessions(params?: ListSessionsParams): Promise<ListSessionsResult> {
    const limit = Math.min(100, Math.max(1, params?.limit ?? 20));
    const offset = Math.max(0, params?.offset ?? 0);

    const { sessions, total } = await this.#store.page({
      ...(params?.status ? { status: params.status } : {}),
      skip: offset,
      take: limit,
    });

    return {
      sessions: sessions.map((s) => mapDbSessionToVoiceSession(s)),
      total,
    };
  }

  /**
   * Delete a session with its messages and its outcome.
   *
   * P-44: consent receipts and auth events are NOT deleted. They are retained
   * (the receipt's conversation content scrubbed) and detached, because each is
   * a record that a human authorised something and v3 Addition 9.3 requires it
   * outlive a user-requested deletion. `OwnedSessionStore.deleteById` documents
   * the full list of what goes and what survives.
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.#store.deleteById(sessionId);
  }
}

// --- The factory, and the one platform-wide sweep ---

export class SessionManager {
  /**
   * The session lifecycle for one user.
   *
   * This is the only entry point. It is a factory rather than a first argument
   * on every method so that a session id and a user id can never be swapped:
   * they are not adjacent parameters of the same call.
   */
  forUser(userId: string): ShadowSessionScope {
    return new ShadowSessionScope(ownedSessions(userId));
  }

  /**
   * Clean up stale sessions, for every user on the platform:
   * - Pause sessions idle > IDLE_PAUSE_MINUTES (10 min)
   * - End sessions idle > IDLE_END_MINUTES (2 hours)
   * Returns counts of paused and ended sessions.
   *
   * Deliberately NOT on `ShadowSessionScope`: it is a maintenance sweep, it
   * addresses no row by id, and it therefore cannot be aimed at a tenant. It
   * also has no caller in `src/` — see `updateStaleSessionsAcrossAllUsers`.
   */
  async cleanupStaleSessions(): Promise<CleanupResult> {
    const now = new Date();
    const pauseThreshold = new Date(now.getTime() - IDLE_PAUSE_MINUTES * 60 * 1000);
    const endThreshold = new Date(now.getTime() - IDLE_END_MINUTES * 60 * 1000);

    // End sessions that have been idle for > 2 hours (both active and paused)
    const ended = await updateStaleSessionsAcrossAllUsers({
      fromStatuses: ['active', 'paused'],
      idleBefore: endThreshold,
      status: 'ended',
      endedAt: now,
    });

    // Pause sessions that have been idle for > 10 min but < 2 hours (only active)
    const paused = await updateStaleSessionsAcrossAllUsers({
      fromStatuses: ['active'],
      idleBefore: pauseThreshold,
      idleAtOrAfter: endThreshold,
      status: 'paused',
    });

    return { paused, ended };
  }
}

// Singleton export
export const sessionManager = new SessionManager();
