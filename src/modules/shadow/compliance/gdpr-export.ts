// ============================================================================
// Shadow Voice Agent — GDPR Data Export & Deletion Service
// Implements GDPR Article 15 (Right of Access) and Article 17 (Right to Erasure).
// Supports full data export, complete deletion, session-level deletion,
// and selective deletion by entity/channel/type.
// ============================================================================

import { prisma } from '@/lib/db';

// --- Types ---

export interface GDPRExportResult {
  data: Record<string, unknown>;
  format: string;
}

export interface GDPRDeleteResult {
  success: boolean;
  deletedCounts: Record<string, number>;
}

export interface SelectiveDeleteParams {
  userId: string;
  entityId?: string;
  channel?: string;
  type?: string;
}

// --- GDPR Service ---

export class GDPRService {
  /**
   * Export all user data as a JSON package (GDPR Article 15 — Right of Access).
   * Gathers all sessions, messages, consent receipts, outcomes, and auth events.
   */
  async exportUserData(userId: string): Promise<GDPRExportResult> {
    const [sessions, messages, consentReceipts, outcomes, authEvents] =
      await Promise.all([
        prisma.shadowVoiceSession.findMany({
          where: { userId },
          orderBy: { startedAt: 'desc' },
        }),
        prisma.shadowMessage.findMany({
          where: { session: { userId } },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.shadowConsentReceipt.findMany({
          where: { session: { userId } },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.shadowSessionOutcome.findMany({
          where: { session: { userId } },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.shadowAuthEvent.findMany({
          where: { session: { userId } },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

    return {
      data: {
        exportedAt: new Date().toISOString(),
        userId,
        sessions: sessions.map((s) => ({
          id: s.id,
          status: s.status,
          channel: s.currentChannel,
          entityId: s.activeEntityId,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          messageCount: s.messageCount,
          totalDurationSeconds: s.totalDurationSeconds,
          channelHistory: s.channelHistory,
          fullTranscript: s.fullTranscript,
          aiSummary: s.aiSummary,
        })),
        messages: messages.map((m) => ({
          id: m.id,
          sessionId: m.sessionId,
          role: m.role,
          content: m.content,
          contentType: m.contentType,
          intent: m.intent,
          channel: m.channel,
          createdAt: m.createdAt,
        })),
        consentReceipts: consentReceipts.map((c) => ({
          id: c.id,
          sessionId: c.sessionId,
          entityId: c.entityId,
          contactId: c.contactId,
          consentType: c.consentType,
          consentGiven: c.consentGiven,
          recordedAt: c.recordedAt,
          createdAt: c.createdAt,
        })),
        outcomes: outcomes.map((o) => ({
          id: o.id,
          sessionId: o.sessionId,
          outcomeType: o.outcomeType,
          data: o.data,
          createdAt: o.createdAt,
        })),
        authEvents: authEvents.map((a) => ({
          id: a.id,
          sessionId: a.sessionId,
          eventType: a.eventType,
          createdAt: a.createdAt,
        })),
        totalRecords:
          sessions.length +
          messages.length +
          consentReceipts.length +
          outcomes.length +
          authEvents.length,
      },
      format: 'application/json',
    };
  }

  /**
   * Delete ALL user data (GDPR Article 17 — Right to Erasure).
   * Removes all sessions, messages, consent receipts, outcomes, and auth events.
   * Returns counts of deleted records per table.
   */
  async deleteAllData(
    userId: string,
  ): Promise<GDPRDeleteResult> {
    const deletedCounts: Record<string, number> = {};

    try {
      // Get all session IDs for this user
      const sessions = await prisma.shadowVoiceSession.findMany({
        where: { userId },
        select: { id: true },
      });
      const sessionIds = sessions.map((s) => s.id);

      if (sessionIds.length > 0) {
        // Delete related records first
        const [messagesResult, outcomesResult, consentsResult, authEventsResult] =
          await Promise.all([
            prisma.shadowMessage.deleteMany({
              where: { sessionId: { in: sessionIds } },
            }),
            prisma.shadowSessionOutcome.deleteMany({
              where: { sessionId: { in: sessionIds } },
            }),
            prisma.shadowConsentReceipt.deleteMany({
              where: { sessionId: { in: sessionIds } },
            }),
            prisma.shadowAuthEvent.deleteMany({
              where: { sessionId: { in: sessionIds } },
            }),
          ]);

        deletedCounts.messages = messagesResult.count;
        deletedCounts.outcomes = outcomesResult.count;
        deletedCounts.consentReceipts = consentsResult.count;
        deletedCounts.authEvents = authEventsResult.count;
      } else {
        deletedCounts.messages = 0;
        deletedCounts.outcomes = 0;
        deletedCounts.consentReceipts = 0;
        deletedCounts.authEvents = 0;
      }

      // Delete all sessions
      const sessionsResult = await prisma.shadowVoiceSession.deleteMany({
        where: { userId },
      });
      deletedCounts.sessions = sessionsResult.count;

      // Delete retention configs for entities owned by the user
      const entities = await prisma.entity.findMany({
        where: { userId },
        select: { id: true },
      });
      const entityIds = entities.map((e) => e.id);

      if (entityIds.length > 0) {
        const retentionResult = await prisma.shadowRetentionConfig.deleteMany({
          where: { entityId: { in: entityIds } },
        });
        deletedCounts.retentionConfigs = retentionResult.count;
      } else {
        deletedCounts.retentionConfigs = 0;
      }

      return { success: true, deletedCounts };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error during deletion';
      return {
        success: false,
        deletedCounts: { ...deletedCounts, error: 0 },
      };
    }
  }

  /**
   * Delete a single session and all its associated data.
   */
  async deleteSession(sessionId: string): Promise<void> {
    const session = await prisma.shadowVoiceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Delete related records first
    await Promise.all([
      prisma.shadowMessage.deleteMany({ where: { sessionId } }),
      prisma.shadowSessionOutcome.deleteMany({ where: { sessionId } }),
      prisma.shadowConsentReceipt.deleteMany({ where: { sessionId } }),
      prisma.shadowAuthEvent.deleteMany({ where: { sessionId } }),
    ]);

    // Delete the session
    await prisma.shadowVoiceSession.delete({
      where: { id: sessionId },
    });
  }

  /**
   * Selectively delete data matching specific criteria.
   * Can filter by entity, channel, or data type.
   */
  async selectiveDelete(params: SelectiveDeleteParams): Promise<{ deletedCount: number }> {
    const { userId, entityId, channel, type } = params;
    let deletedCount = 0;

    // Build the session filter
    const sessionWhere: Record<string, unknown> = { userId };
    if (entityId) {
      sessionWhere.activeEntityId = entityId;
    }
    if (channel) {
      sessionWhere.currentChannel = channel;
    }

    // Get matching sessions
    const sessions = await prisma.shadowVoiceSession.findMany({
      where: sessionWhere,
      select: { id: true },
    });
    const sessionIds = sessions.map((s) => s.id);

    if (sessionIds.length === 0) {
      return { deletedCount: 0 };
    }

    // Delete based on type filter
    switch (type) {
      case 'messages': {
        const result = await prisma.shadowMessage.deleteMany({
          where: { sessionId: { in: sessionIds } },
        });
        deletedCount = result.count;
        break;
      }
      case 'transcripts': {
        const result = await prisma.shadowVoiceSession.updateMany({
          where: { id: { in: sessionIds } },
          data: { fullTranscript: null },
        });
        deletedCount = result.count;
        break;
      }
      case 'recordings': {
        const result = await prisma.shadowVoiceSession.updateMany({
          where: { id: { in: sessionIds } },
          data: { recordingUrls: [] },
        });
        deletedCount = result.count;
        break;
      }
      case 'outcomes': {
        const result = await prisma.shadowSessionOutcome.deleteMany({
          where: { sessionId: { in: sessionIds } },
        });
        deletedCount = result.count;
        break;
      }
      case 'consent': {
        const result = await prisma.shadowConsentReceipt.deleteMany({
          where: { sessionId: { in: sessionIds } },
        });
        deletedCount = result.count;
        break;
      }
      default: {
        // Delete everything for the matching sessions
        const [msgs, outcomes, consents, authEvts] = await Promise.all([
          prisma.shadowMessage.deleteMany({
            where: { sessionId: { in: sessionIds } },
          }),
          prisma.shadowSessionOutcome.deleteMany({
            where: { sessionId: { in: sessionIds } },
          }),
          prisma.shadowConsentReceipt.deleteMany({
            where: { sessionId: { in: sessionIds } },
          }),
          prisma.shadowAuthEvent.deleteMany({
            where: { sessionId: { in: sessionIds } },
          }),
        ]);

        // Delete the sessions themselves
        const sessResult = await prisma.shadowVoiceSession.deleteMany({
          where: { id: { in: sessionIds } },
        });

        deletedCount =
          msgs.count +
          outcomes.count +
          consents.count +
          authEvts.count +
          sessResult.count;
        break;
      }
    }

    return { deletedCount };
  }
}

// Singleton export
export const gdprService = new GDPRService();
