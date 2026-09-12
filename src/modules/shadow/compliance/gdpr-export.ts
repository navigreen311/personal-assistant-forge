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
// So a scrub replaces every `deleteMany` over receipts here. P-44 moved that
// scrub out to `./receipt-retention` — unchanged — because four OTHER code paths
// delete a Shadow session and three of them disagreed with this file about what
// happens to its receipts. The list below is now documented beside the payload
// there, and repeated here because this is the file the ruling was written about.
//
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
import { SCRUBBED_REASONING, retainAndScrubReceipts } from './receipt-retention';
import { ownedSessions } from '../interfaces/session-store';

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

// P-44. `SCRUBBED_REASONING` and the function that applies it moved to
// `./receipt-retention`, unchanged, because four other code paths delete a
// Shadow session and three of them disagreed with this one about what happens
// to its receipts. Re-exported under the name this file has always published so
// its importers are unaffected.
export { SCRUBBED_REASONING };

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
        const retained = await retainAndScrubReceipts(sessionIds);

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
   * Article 17 for ONE session: the user's "delete this conversation".
   *
   * P-44 changed two things about this method and both were defects of the same
   * shape.
   *
   * IT TAKES THE OWNER NOW. It used to be `deleteSession(sessionId)` — a
   * `findUnique` on a bare id, then a `delete` on a bare id, with `userId`
   * nowhere in the signature. The only thing standing between a caller-supplied
   * cuid and another tenant's session was a hand-written
   * `if (voiceSession.userId !== session.userId) return 403` in
   * `/api/shadow/delete-session/[id]`, which is a check in the caller instead of
   * in the accessor — the pattern P-30 removed from 49 route helpers and P-41
   * removed from this module's eleven. A second route file reaching this method
   * and forgetting the check would have been a cross-tenant delete.
   *
   * IT HAS ONE IMPLEMENTATION NOW. The body was a near-copy of
   * `OwnedSessionStore.deleteById`, and "near" is the entire finding: the two
   * copies disagreed about consent receipts, so the SAME user action produced
   * two different regulatory outcomes depending on which route they hit. It
   * delegates instead, so the ruling cannot be honoured on one path and not the
   * other. The scrub that used to live here now lives in `deleteById`, which is
   * where the deletion lives.
   */
  async deleteSession(sessionId: string, userId: string): Promise<void> {
    await ownedSessions(userId).deleteById(sessionId);
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
        consentReceiptsRetained = await retainAndScrubReceipts(sessionIds);
        deletedCount = 0;
        break;
      }
      default: {
        // Scrub first, while `sessionId` still identifies the receipts.
        consentReceiptsRetained = await retainAndScrubReceipts(sessionIds);

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
