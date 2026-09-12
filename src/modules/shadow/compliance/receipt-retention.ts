// ============================================================================
// P-44 — WHAT HAPPENS TO A CONSENT RECEIPT WHEN A SESSION IS DELETED, IN ONE
// PLACE, BECAUSE THREE PLACES GAVE THREE ANSWERS.
// ============================================================================
//
// Ivan's ruling, verbatim:
//
//     "404 on all three paths. A deleted session means deleted. Receipts
//     survive (they have `userId` now thanks to P-40) but session content is
//     gone. Don't preserve session data under a different label — that's the
//     kind of thing that fails a privacy audit. If someone deletes a session,
//     honor it."
//
// P-17 established the behaviour and fixed it in `gdpr-export.ts`: a consent
// receipt is the record that a human authorised an action, v3 Addition 9.3
// retains it for regulatory compliance while the transcript is erased, and
// GDPR Article 17(3)(b) is the exemption that allows it. What P-17 could not do
// from inside one file is stop the other deletion paths from disagreeing, and
// they did. As measured on master at 6cf461c, FIVE code paths deleted a Shadow
// session and no two of them treated its receipts the same way:
//
//   gdpr-export.deleteSession        scrub + detach        correct (P-17)
//   session-store.deleteById         deleteMany            DESTROYED THEM
//   DELETE /api/shadow/sessions/[id] detach, NO scrub      kept the content
//   POST  /api/shadow/history/clear  detach, NO scrub      kept the content
//   retention.ts                     deleteMany on its own 7-year clock —
//                                    CORRECT, and deliberately not a caller of
//                                    anything in this file. See below.
//
// The three wrong answers were wrong in both directions at once, which is why
// one function has to own the whole decision:
//
//   * `deleteById` is what the interactive "delete this conversation" route
//     calls. It destroyed the audit record on user request — the one outcome
//     Addition 9.3 forbids, and the identical line P-17 had already removed
//     from two other files.
//
//   * the two `updateMany({ data: { sessionId: null } })` routes retained the
//     receipt with `reasoning` intact. `reasoning` is the field that quotes the
//     conversation — `agent/core.ts` writes the classified user intent into it
//     and the confirmation route writes the phrase the user actually said. A
//     receipt kept verbatim after the user deleted the session IS session
//     content preserved under a different label, which is the specific thing
//     the ruling names.
//
// ----------------------------------------------------------------------------
// WHY `sessionId` IS NOT IN THE PAYLOAD
// ----------------------------------------------------------------------------
//
// `ShadowConsentReceipt_sessionId_fkey` is `ON DELETE SET NULL` in the baseline
// migration, so deleting the session detaches the receipt by itself. Nulling it
// here as well would be harmless on a deletion path and WRONG on the one path
// that scrubs without deleting: `gdprService.selectiveDelete({ type:
// 'consent' })` scrubs the content out of receipts whose sessions survive, and
// detaching those would orphan a receipt from a live session nobody asked to
// delete. The two routes that build their own `$transaction` still pass
// `sessionId: null` explicitly alongside `RECEIPT_CONTENT_SCRUB`, because there
// the detachment is part of the same atomic statement as the scrub.
//
// ----------------------------------------------------------------------------
// WHAT THIS FILE MUST NEVER GROW
// ----------------------------------------------------------------------------
//
// A delete. `shadow/compliance/retention.ts` holds the only permitted
// `shadowConsentReceipt.deleteMany` in `src/`, it is bucketed on the receipt's
// OWN `executedAt` against `consentReceiptsDays` (2555 by default), and it is
// not session-child deletion wearing a different name. Confusing the two would
// undo P-17. `tests/unit/architecture/consent-receipt-deletion.test.ts` asserts
// that file is still the only one, in both directions.
// ============================================================================

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

/**
 * What `reasoning` is replaced with. A fixed string, not an empty one, so a
 * reader can tell a scrubbed receipt from one that never carried reasoning.
 */
export const SCRUBBED_REASONING =
  '[SCRUBBED] conversation content erased at the user request; receipt retained for regulatory compliance';

/**
 * The fields a session deletion may take out of a consent receipt, and the only
 * ones.
 *
 * WHAT IT SCRUBS, and why this list and not a longer or shorter one:
 *
 *   messageId     -> null. The `ShadowMessage` it points at is deleted in the
 *                   same call; a dangling pointer to erased content is worse
 *                   than either keeping or removing it.
 *   reasoning     -> a fixed marker. This is the field that quotes the
 *                   conversation. It is "message content within them".
 *   sourcesCited  -> []. These cite records the same request is erasing.
 *
 * KEPT, deliberately: `actionType`, `actionDescription`, `triggerSource`,
 * `confirmationLevel`, `confirmationMethod`, `blastRadius`, `affectedCount`,
 * `financialImpact`, `reversible`, `entityId`, `executedAt`, `rolledBackAt` —
 * and `userId`, which is the most load-bearing of them. A receipt is retained
 * BECAUSE it proves who authorised the action, so scrubbing the attribution
 * would leave a row kept for a reason it can no longer serve; P-40 added that
 * column for exactly this moment. A receipt scrubbed down to a timestamp proves
 * nothing, which is the opposite of "retained for regulatory compliance".
 *
 * Typed as Prisma's own update input rather than a bare object literal so that
 * renaming or dropping one of these fields is a compile error here instead of a
 * silently ignored key at runtime.
 */
export const RECEIPT_CONTENT_SCRUB: Prisma.ShadowConsentReceiptUpdateManyMutationInput = {
  messageId: null,
  reasoning: SCRUBBED_REASONING,
  sourcesCited: [],
};

/**
 * Scrub the conversation content out of the consent receipts attached to these
 * sessions, and return how many were scrubbed.
 *
 * Called INSTEAD OF deleting them, on every path that deletes a session. The
 * count is reported to callers as `consentReceiptsRetained` rather than folded
 * into a `deletedCounts` total, so an operator reading the response cannot
 * mistake "retained" for "removed".
 *
 * Must run while `sessionId` still identifies the rows — i.e. BEFORE the
 * session is deleted, since the FK nulls the column on the way out.
 */
export async function retainAndScrubReceipts(sessionIds: string[]): Promise<number> {
  if (sessionIds.length === 0) return 0;
  const { count } = await prisma.shadowConsentReceipt.updateMany({
    where: { sessionId: { in: sessionIds } },
    data: RECEIPT_CONTENT_SCRUB,
  });
  return count;
}
