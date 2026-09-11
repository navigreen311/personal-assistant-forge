// ============================================================================
// Shadow Voice Agent — GDPR Data Export & Deletion Service
// Implements GDPR Article 15 (Right of Access) and Article 17 (Right to Erasure).
// Supports full data export, complete deletion, session-level deletion,
// and selective deletion by entity/channel/type.
// ============================================================================

// ============================================================================
// P-17 (Sprint 6) — A USER-REQUESTED DELETE DOES NOT DESTROY CONSENT RECEIPTS
// ============================================================================
//
// This file's three delete methods each contained
//
//     prisma.shadowConsentReceipt.deleteMany({ where: { sessionId: { in: ids } } })
//
// and, unlike `retention.ts`'s identical line, THIS ONE WAS LIVE. `gdpr-export`
// has three route importers — `/api/shadow/delete-all`,
// `/api/shadow/delete-session/[id]` and `/api/shadow/export` — so every erasure
// request a user made was already destroying the regulatory record alongside
// the conversation.
//
// The committed spec, v3 Addition 9.3, says the opposite in the delete flow
// itself:
//
//     1. Confirmation: "This will permanently delete [X] conversations, [Y]
//        recordings, and [Z] transcripts. Consent receipts will be retained for
//        regulatory compliance. ..."
//     6. Consent receipts RETAINED (legal requirement) but message content
//        within them is scrubbed
//
// That is not GDPR being ignored. Article 17(3)(b) exempts processing required
// for compliance with a legal obligation, which is exactly what a seven-year
// consent receipt is; the receipt is what proves the user authorised the action,
// and erasing it on request erases the evidence in the user's own favour too.
//
// So `scrubReceiptsForSessions` replaces every `deleteMany` over receipts here.
// WHAT IT SCRUBS, and why that list and not a longer or shorter one:
//
//   messageId      -> null.  The ShadowMessage it points at is being deleted in
//                     the same call; leaving the id behind is a dangling
//                     pointer to erased content, which is worse than either
//                     keeping or removing it.
//   reasoning      -> a fixed marker. This is the field that quotes the
//                     conversation: `core.ts` writes the classified user intent
//                     into it and the confirmation route writes the phrase the
//                     user actually said. It is "message content within them".
//   sourcesCited   -> []. These cite records the same request is erasing.
//
// KEPT, deliberately: actionType, actionDescription, triggerSource,
// confirmationLevel, confirmationMethod, blastRadius, affectedCount,
// financialImpact, reversible, entityId, executedAt, rolledBackAt -- and since
// migration window 02, `userId`. Those are the receipt, and `userId` is the
// most load-bearing of them: a receipt retained under Article 17(3)(b) is
// retained BECAUSE it proves who authorised the action, so scrubbing the
// attribution would leave a row that is kept for a reason it can no longer
// serve. It is not conversation content -- it is the identity of the person
// making the erasure request, which they already have. A receipt scrubbed down to a timestamp proves nothing, which is
// the opposite of "retained for regulatory compliance" — the point is that six
// years from now someone can establish WHAT was authorised and under WHICH
// confirmation level, without being able to read the conversation.
//
// `sessionId` needs no handling: `ShadowConsentReceipt_sessionId_fkey` is
// `ON DELETE SET NULL` in the baseline migration, so deleting the session
// detaches the receipt by itself. The schema has always said receipts outlive
// their sessions; only the application code disagreed.
//
// `ShadowAuthEvent` gets the same treatment for the same reason — it is the
// record of whether a step-up challenge passed, and it too is SET NULL — except
// that it holds no free text to scrub, so detaching is the whole of it.
// ============================================================================

import { prisma } from '@/lib/db';
import { reportError } from '@/lib/observability';

// --- Types ---

export interface GDPRExportResult {
  data: Record<string, unknown>;
  format: string;
}

export interface GDPRDeleteResult {
  success: boolean;
  deletedCounts: Record<string, number>;
  /** Why it failed, when it did. Present only on `success: false`. */
  error?: string;
}

/**
 * What `reasoning` is replaced with. A fixed string, not an empty one, so a
 * reader can tell a scrubbed receipt from one that never carried reasoning.
 */
export const SCRUBBED_REASONING =
  '[SCRUBBED] conversation content erased at the user request; receipt retained for regulatory compliance';

/**
 * Scrub the conversation content out of the consent receipts attached to these
 * sessions, and return how many were scrubbed.
 *
 * Called INSTEAD OF deleting them. The count is reported to the caller as
 * `consentReceiptsRetained` rather than folded into a `deletedCounts` total, so
 * an operator reading the response cannot mistake "retained" for "removed".
 */
async function scrubReceiptsForSessions(sessionIds: string[]): Promise<number> {
  if (sessionIds.length === 0) return 0;
  const { count } = await prisma.shadowConsentReceipt.updateMany({
    where: { sessionId: { in: sessionIds } },
    data: {
      messageId: null,
      reasoning: SCRUBBED_REASONING,
      sourcesCited: [],
    },
  });
  return count;
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
    // P-17. Receipts and auth events reached this export ONLY through
    // `session: { userId }`, and both models detach from their session -- on a
    // retention sweep, and now on an erasure request. A detached row was
    // therefore invisible to Article 15 while still being retained under
    // Article 17(3)(b): kept, and unreadable by the person it is about. That is
    // the worst of both.
    //
    // A receipt is reattached to the user through its `entityId`; an auth event
    // has its own `userId` column (`@@index([userId])` -- it exists to be
    // queried this way, and `sendSmsCode` writes events with a userId and no
    // session at all, so those were never exported either).
    //
    // MIGRATION WINDOW 02. `ShadowConsentReceipt.userId` now exists, and this
    // is the code that acts on it: the FIRST arm of the receipt `OR` below.
    // What P-17's workaround could not reach, and said so, was a detached
    // receipt with NO entity -- `core.ts` writes `activeEntity?.id ?? null`, so
    // those exist -- and the entity arm cannot find one because there is no
    // entity to join through. That receipt was retained under Article
    // 17(3)(b) and invisible under Article 15 at the same time.
    //
    // The entity arm is KEPT, not replaced. It is what finds receipts written
    // before this column existed, which have `userId` null and are the only
    // rows in every database that predates the migration. Deleting it would
    // trade one unreachable class of receipt for another.
    const ownedEntities = await prisma.entity.findMany({
      where: { userId },
      select: { id: true },
    });
    const ownedEntityIds = ownedEntities.map((e) => e.id);

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
          where: {
            OR: [
              { userId },
              { session: { userId } },
              ...(ownedEntityIds.length > 0
                ? [{ entityId: { in: ownedEntityIds } }]
                : []),
            ],
          },
          orderBy: { executedAt: 'desc' },
        }),
        prisma.shadowSessionOutcome.findMany({
          where: { session: { userId } },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.shadowAuthEvent.findMany({
          where: { OR: [{ userId }, { session: { userId } }] },
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
          // Exported, not merely queried on. An Article 15 package whose
          // receipts do not say who authorised the action is missing the field
          // that makes a receipt a receipt -- and `sessionId` beside it is null
          // on exactly the retained rows this column exists for, so a reader
          // could not otherwise tell an unattributed receipt from a detached one.
          userId: c.userId,
          sessionId: c.sessionId,
          messageId: c.messageId,
          entityId: c.entityId,
          actionType: c.actionType,
          actionDescription: c.actionDescription,
          triggerSource: c.triggerSource,
          triggerReferenceType: c.triggerReferenceType,
          triggerReferenceId: c.triggerReferenceId,
          reasoning: c.reasoning,
          sourcesCited: c.sourcesCited,
          confirmationLevel: c.confirmationLevel,
          confirmationMethod: c.confirmationMethod,
          blastRadius: c.blastRadius,
          affectedCount: c.affectedCount,
          financialImpact: c.financialImpact,
          reversible: c.reversible,
          executedAt: c.executedAt,
          rolledBackAt: c.rolledBackAt,
        })),
        outcomes: outcomes.map((o) => ({
          id: o.id,
          sessionId: o.sessionId,
          decisionsMade: o.decisionsMade,
          commitments: o.commitments,
          deadlinesSet: o.deadlinesSet,
          followUps: o.followUps,
          recordsCreated: o.recordsCreated,
          recordsUpdated: o.recordsUpdated,
          recordsLinked: o.recordsLinked,
          extractionConfidence: o.extractionConfidence,
          userVerified: o.userVerified,
          createdAt: o.createdAt,
        })),
        authEvents: authEvents.map((a) => ({
          id: a.id,
          sessionId: a.sessionId,
          method: a.method,
          result: a.result,
          riskLevel: a.riskLevel,
          actionAttempted: a.actionAttempted,
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
        // Receipts are scrubbed BEFORE the sessions go, while `sessionId` still
        // identifies them. After the delete the FK has nulled it and there is
        // no way left to find them.
        const retained = await scrubReceiptsForSessions(sessionIds);

        const [messagesResult, outcomesResult] = await Promise.all([
          prisma.shadowMessage.deleteMany({
            where: { sessionId: { in: sessionIds } },
          }),
          prisma.shadowSessionOutcome.deleteMany({
            where: { sessionId: { in: sessionIds } },
          }),
        ]);

        deletedCounts.messages = messagesResult.count;
        deletedCounts.outcomes = outcomesResult.count;
        // Named so it cannot be misread. These two rows are NOT deleted; they
        // are detached by the ON DELETE SET NULL foreign key and kept for the
        // regulatory period. See this file's header.
        deletedCounts.consentReceiptsRetained = retained;
        deletedCounts.authEventsRetained = await prisma.shadowAuthEvent.count({
          where: { sessionId: { in: sessionIds } },
        });
        deletedCounts.consentReceipts = 0;
        deletedCounts.authEvents = 0;
      } else {
        deletedCounts.messages = 0;
        deletedCounts.outcomes = 0;
        deletedCounts.consentReceipts = 0;
        deletedCounts.authEvents = 0;
        deletedCounts.consentReceiptsRetained = 0;
        deletedCounts.authEventsRetained = 0;
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
      // P-17, found by `npx eslint` warning on an unused `message`. The
      // variable was computed from the error and then DISCARDED: the route
      // turned `success: false` into a flat "Data deletion partially failed"
      // 500, and the only description of what went wrong existed for one line
      // and was thrown away. A user's erasure request failing halfway with no
      // record anywhere is the codebase's defining bug in its most consequential
      // place. It is reported now, and the reason travels with the result.
      const message = err instanceof Error ? err.message : 'Unknown error during deletion';
      reportError(err, {
        kind: 'manual',
        severity: 'error',
        fingerprint: 'shadow:gdpr:delete-all-failed',
        message: 'a user erasure request failed partway through',
        // Counts only -- no user id, which would be both high-cardinality and
        // the personal data the request was about.
        context: {
          messagesDeleted: deletedCounts.messages ?? 0,
          sessionsDeleted: deletedCounts.sessions ?? 0,
          consentReceiptsRetained: deletedCounts.consentReceiptsRetained ?? 0,
        },
      });
      return {
        success: false,
        error: message,
        deletedCounts,
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

    // Scrub the receipts first (see the header), then delete what may go.
    // `ShadowAuthEvent` is absent from this list on purpose: it holds no
    // conversation content and its FK detaches it when the session goes.
    await scrubReceiptsForSessions([sessionId]);

    await Promise.all([
      prisma.shadowMessage.deleteMany({ where: { sessionId } }),
      prisma.shadowSessionOutcome.deleteMany({ where: { sessionId } }),
    ]);

    // Delete the session
    await prisma.shadowVoiceSession.delete({
      where: { id: sessionId },
    });
  }

  /**
   * Selectively delete data matching specific criteria.
   * Can filter by entity, channel, or data type.
   *
   * `consentReceiptsRetained` is reported separately from `deletedCount` so a
   * caller cannot read "N" and conclude N receipts were removed. Receipts are
   * never removed here; see this file's header.
   */
  async selectiveDelete(
    params: SelectiveDeleteParams,
  ): Promise<{ deletedCount: number; consentReceiptsRetained: number }> {
    const { userId, entityId, channel, type } = params;
    let deletedCount = 0;
    let consentReceiptsRetained = 0;

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
      return { deletedCount: 0, consentReceiptsRetained: 0 };
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
        // "Delete all my consent receipts" is the one selective request this
        // service will not carry out. It scrubs instead, and the returned count
        // is the number scrubbed — same shape of answer, and the caller can
        // tell which happened from `consentReceiptsRetained`.
        consentReceiptsRetained = await scrubReceiptsForSessions(sessionIds);
        deletedCount = 0;
        break;
      }
      default: {
        // Scrub first, while `sessionId` still identifies the receipts.
        consentReceiptsRetained = await scrubReceiptsForSessions(sessionIds);

        const [msgs, outcomes] = await Promise.all([
          prisma.shadowMessage.deleteMany({
            where: { sessionId: { in: sessionIds } },
          }),
          prisma.shadowSessionOutcome.deleteMany({
            where: { sessionId: { in: sessionIds } },
          }),
        ]);

        // Delete the sessions themselves. The receipts and auth events detach.
        const sessResult = await prisma.shadowVoiceSession.deleteMany({
          where: { id: { in: sessionIds } },
        });

        deletedCount = msgs.count + outcomes.count + sessResult.count;
        break;
      }
    }

    return { deletedCount, consentReceiptsRetained };
  }
}

// Singleton export
export const gdprService = new GDPRService();
