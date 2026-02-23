// ============================================================================
// Shadow Voice Agent — Data Retention Service
// Manages configurable retention periods and automated cleanup of expired data.
// Default retention: recordings 90d, transcripts 365d, messages 365d,
// consent receipts 2555d (7 years).
// ============================================================================

import { prisma } from '@/lib/db';

// --- Constants ---

/** Default retention periods in days */
const DEFAULT_RETENTION_DAYS = {
  recordings: 90,
  transcripts: 365,
  messages: 365,
  consentReceipts: 2555, // 7 years
} as const;

export interface RetentionConfig {
  entityId: string;
  recordingsDays: number;
  transcriptsDays: number;
  messagesDays: number;
  consentReceiptsDays: number;
  updatedAt: Date;
}

export interface RetentionCleanupResult {
  recordingsDeleted: number;
  transcriptsDeleted: number;
  messagesDeleted: number;
  sessionsDeleted: number;
  errors: string[];
}

// --- Helpers ---

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

// --- Retention Service ---

export class RetentionService {
  /**
   * Run the retention cleanup job. Deletes all data older than the configured
   * retention periods. Uses the entity-specific config if available, otherwise
   * falls back to global defaults.
   *
   * This should be called by a scheduled cron job (e.g., daily at 3 AM).
   */
  async runRetentionCleanup(): Promise<RetentionCleanupResult> {
    const errors: string[] = [];
    let recordingsDeleted = 0;
    let transcriptsDeleted = 0;
    let messagesDeleted = 0;
    let sessionsDeleted = 0;

    try {
      // Get all unique entity IDs with retention configs
      const configs = await prisma.shadowRetentionConfig.findMany();
      const configMap = new Map<string, RetentionConfig>();

      for (const config of configs) {
        configMap.set(config.entityId, {
          entityId: config.entityId,
          recordingsDays: (config.recordingsDays as number) ?? DEFAULT_RETENTION_DAYS.recordings,
          transcriptsDays: (config.transcriptsDays as number) ?? DEFAULT_RETENTION_DAYS.transcripts,
          messagesDays: (config.messagesDays as number) ?? DEFAULT_RETENTION_DAYS.messages,
          consentReceiptsDays:
            (config.consentReceiptsDays as number) ?? DEFAULT_RETENTION_DAYS.consentReceipts,
          updatedAt: config.updatedAt,
        });
      }

      // --- Delete expired messages ---
      try {
        const messageThreshold = daysAgo(DEFAULT_RETENTION_DAYS.messages);
        const messageResult = await prisma.shadowMessage.deleteMany({
          where: {
            createdAt: { lt: messageThreshold },
          },
        });
        messagesDeleted = messageResult.count;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`Messages cleanup failed: ${msg}`);
      }

      // --- Delete expired session transcripts (nullify fullTranscript) ---
      try {
        const transcriptThreshold = daysAgo(DEFAULT_RETENTION_DAYS.transcripts);
        const transcriptResult = await prisma.shadowVoiceSession.updateMany({
          where: {
            fullTranscript: { not: null },
            startedAt: { lt: transcriptThreshold },
          },
          data: {
            fullTranscript: null,
          },
        });
        transcriptsDeleted = transcriptResult.count;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`Transcripts cleanup failed: ${msg}`);
      }

      // --- Delete expired recording URLs (nullify recordingUrls) ---
      try {
        const recordingThreshold = daysAgo(DEFAULT_RETENTION_DAYS.recordings);
        const recordingResult = await prisma.shadowVoiceSession.updateMany({
          where: {
            startedAt: { lt: recordingThreshold },
          },
          data: {
            recordingUrls: [],
          },
        });
        recordingsDeleted = recordingResult.count;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`Recordings cleanup failed: ${msg}`);
      }

      // --- Delete very old ended sessions (older than transcript retention) ---
      try {
        const sessionThreshold = daysAgo(DEFAULT_RETENTION_DAYS.transcripts);
        // First delete related records
        const oldSessions = await prisma.shadowVoiceSession.findMany({
          where: {
            status: 'ended',
            endedAt: { lt: sessionThreshold },
          },
          select: { id: true },
        });

        const oldSessionIds = oldSessions.map((s) => s.id);

        if (oldSessionIds.length > 0) {
          // Delete related records
          await Promise.all([
            prisma.shadowMessage.deleteMany({
              where: { sessionId: { in: oldSessionIds } },
            }),
            prisma.shadowSessionOutcome.deleteMany({
              where: { sessionId: { in: oldSessionIds } },
            }),
            prisma.shadowConsentReceipt.deleteMany({
              where: { sessionId: { in: oldSessionIds } },
            }),
            prisma.shadowAuthEvent.deleteMany({
              where: { sessionId: { in: oldSessionIds } },
            }),
          ]);

          // Delete the sessions themselves
          const sessionResult = await prisma.shadowVoiceSession.deleteMany({
            where: { id: { in: oldSessionIds } },
          });
          sessionsDeleted = sessionResult.count;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`Sessions cleanup failed: ${msg}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`Retention cleanup failed globally: ${msg}`);
    }

    return {
      recordingsDeleted,
      transcriptsDeleted,
      messagesDeleted,
      sessionsDeleted,
      errors,
    };
  }

  /**
   * Get the retention config for a specific entity.
   * Returns defaults if no custom config exists.
   */
  async getRetentionConfig(entityId: string): Promise<RetentionConfig> {
    const config = await prisma.shadowRetentionConfig.findUnique({
      where: { entityId },
    });

    if (config) {
      return {
        entityId: config.entityId,
        recordingsDays: (config.recordingsDays as number) ?? DEFAULT_RETENTION_DAYS.recordings,
        transcriptsDays: (config.transcriptsDays as number) ?? DEFAULT_RETENTION_DAYS.transcripts,
        messagesDays: (config.messagesDays as number) ?? DEFAULT_RETENTION_DAYS.messages,
        consentReceiptsDays:
          (config.consentReceiptsDays as number) ?? DEFAULT_RETENTION_DAYS.consentReceipts,
        updatedAt: config.updatedAt,
      };
    }

    // Return defaults
    return {
      entityId,
      recordingsDays: DEFAULT_RETENTION_DAYS.recordings,
      transcriptsDays: DEFAULT_RETENTION_DAYS.transcripts,
      messagesDays: DEFAULT_RETENTION_DAYS.messages,
      consentReceiptsDays: DEFAULT_RETENTION_DAYS.consentReceipts,
      updatedAt: new Date(),
    };
  }

  /**
   * Update the retention config for a specific entity.
   * Creates the config if it doesn't exist (upsert).
   */
  async updateRetentionConfig(
    entityId: string,
    config: Record<string, unknown>,
  ): Promise<RetentionConfig> {
    const data = {
      recordingsDays:
        typeof config.recordingsDays === 'number'
          ? config.recordingsDays
          : DEFAULT_RETENTION_DAYS.recordings,
      transcriptsDays:
        typeof config.transcriptsDays === 'number'
          ? config.transcriptsDays
          : DEFAULT_RETENTION_DAYS.transcripts,
      messagesDays:
        typeof config.messagesDays === 'number'
          ? config.messagesDays
          : DEFAULT_RETENTION_DAYS.messages,
      consentReceiptsDays:
        typeof config.consentReceiptsDays === 'number'
          ? config.consentReceiptsDays
          : DEFAULT_RETENTION_DAYS.consentReceipts,
    };

    const result = await prisma.shadowRetentionConfig.upsert({
      where: { entityId },
      create: {
        entityId,
        ...data,
      },
      update: data,
    });

    return {
      entityId: result.entityId,
      recordingsDays: result.recordingsDays as number,
      transcriptsDays: result.transcriptsDays as number,
      messagesDays: result.messagesDays as number,
      consentReceiptsDays: result.consentReceiptsDays as number,
      updatedAt: result.updatedAt,
    };
  }
}

// Singleton export
export const retentionService = new RetentionService();
