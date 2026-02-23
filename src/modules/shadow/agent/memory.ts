// Shadow Voice Agent — Memory System
// Manages session history, message persistence, and learned preferences.

import { prisma } from '@/lib/db';
import type { SessionMessage } from '../types';

export class ShadowMemory {
  /**
   * Retrieve the full message history for a session, in chronological order.
   */
  async getSessionHistory(
    sessionId: string,
  ): Promise<Array<{ role: string; content: string }>> {
    const messages = await prisma.shadowMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      select: {
        role: true,
        content: true,
      },
    });

    return messages;
  }

  /**
   * Retrieve the full message history with metadata for a session.
   */
  async getSessionMessages(sessionId: string): Promise<SessionMessage[]> {
    const messages = await prisma.shadowMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        contentType: true,
        intent: true,
        toolsUsed: true,
        actionsTaken: true,
        channel: true,
        createdAt: true,
      },
    });

    return messages.map((m) => ({
      id: m.id,
      role: m.role as SessionMessage['role'],
      content: m.content,
      contentType: m.contentType,
      intent: m.intent ?? undefined,
      toolsUsed: (m.toolsUsed as string[]) ?? [],
      actionsTaken: (m.actionsTaken as string[]) ?? [],
      channel: m.channel,
      createdAt: m.createdAt,
    }));
  }

  /**
   * Add a message to the session history.
   * Returns the message ID for reference.
   */
  async addMessage(
    sessionId: string,
    message: {
      role: 'user' | 'assistant' | 'system';
      content: string;
      contentType?: string;
      intent?: string;
      toolsUsed?: string[];
      actionsTaken?: string[];
      channel: string;
      confidence?: number;
      latencyMs?: number;
      telemetry?: Record<string, unknown>;
    },
  ): Promise<string> {
    const created = await prisma.shadowMessage.create({
      data: {
        sessionId,
        role: message.role,
        content: message.content,
        contentType: message.contentType ?? 'TEXT',
        intent: message.intent ?? null,
        toolsUsed: message.toolsUsed ?? [],
        actionsTaken: message.actionsTaken ?? [],
        channel: message.channel,
        confidence: message.confidence ?? null,
        latencyMs: message.latencyMs ?? null,
        telemetry: message.telemetry ?? null,
      },
    });

    // Update session message count and last activity
    await prisma.shadowVoiceSession.update({
      where: { id: sessionId },
      data: {
        messageCount: { increment: 1 },
        lastActivityAt: new Date(),
      },
    });

    return created.id;
  }

  /**
   * Get or create a session for the user.
   */
  async getOrCreateSession(params: {
    userId: string;
    channel: 'web' | 'phone' | 'mobile';
    activeEntityId?: string;
    currentPage?: string;
  }): Promise<string> {
    // Look for an active session on this channel within the last 30 minutes
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    const existing = await prisma.shadowVoiceSession.findFirst({
      where: {
        userId: params.userId,
        status: 'active',
        currentChannel: params.channel,
        lastActivityAt: { gte: cutoff },
      },
      orderBy: { lastActivityAt: 'desc' },
    });

    if (existing) {
      // Update entity/page context if changed
      await prisma.shadowVoiceSession.update({
        where: { id: existing.id },
        data: {
          activeEntityId: params.activeEntityId ?? existing.activeEntityId,
          currentPage: params.currentPage ?? existing.currentPage,
          lastActivityAt: new Date(),
        },
      });
      return existing.id;
    }

    // Create new session
    const session = await prisma.shadowVoiceSession.create({
      data: {
        userId: params.userId,
        status: 'active',
        currentChannel: params.channel,
        activeEntityId: params.activeEntityId ?? null,
        currentPage: params.currentPage ?? null,
      },
    });

    return session.id;
  }

  /**
   * End a session gracefully.
   */
  async endSession(sessionId: string): Promise<void> {
    const session = await prisma.shadowVoiceSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) return;

    const durationSeconds = Math.floor(
      (Date.now() - session.startedAt.getTime()) / 1000,
    );

    await prisma.shadowVoiceSession.update({
      where: { id: sessionId },
      data: {
        status: 'completed',
        endedAt: new Date(),
        totalDurationSeconds: durationSeconds,
      },
    });
  }

  /**
   * Get learned preferences for a user.
   * Returns a key-value map of preference name to value.
   */
  async getPreferences(userId: string): Promise<Record<string, string>> {
    const prefs = await prisma.shadowPreference.findMany({
      where: { userId },
      select: {
        preferenceKey: true,
        preferenceValue: true,
      },
    });

    const result: Record<string, string> = {};
    for (const p of prefs) {
      result[p.preferenceKey] = p.preferenceValue;
    }
    return result;
  }

  /**
   * Learn or update a user preference.
   * Tracks the source of learning for auditability.
   */
  async learnPreference(
    userId: string,
    key: string,
    value: string,
    source: string,
  ): Promise<void> {
    await prisma.shadowPreference.upsert({
      where: {
        userId_preferenceKey: { userId, preferenceKey: key },
      },
      create: {
        userId,
        preferenceKey: key,
        preferenceValue: value,
        learnedFrom: source,
        confidence: source === 'explicit' ? 1.0 : 0.7,
      },
      update: {
        preferenceValue: value,
        learnedFrom: source,
        confidence: source === 'explicit' ? 1.0 : 0.7,
      },
    });
  }

  /**
   * Get the transcript of a session as a single string for outcome extraction.
   */
  async getSessionTranscript(sessionId: string): Promise<string> {
    const messages = await prisma.shadowMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      select: {
        role: true,
        content: true,
        createdAt: true,
      },
    });

    return messages
      .map((m) => `[${m.role}] ${m.content}`)
      .join('\n');
  }
}
