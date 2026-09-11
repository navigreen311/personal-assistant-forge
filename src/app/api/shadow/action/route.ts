// ============================================================================
// POST /api/shadow/action — the user answers a confirmation card
// ============================================================================
//
// P-17 (Sprint 6). v3 Addition 2.1 (consent receipts, P0), Addition 1.2
// (risk-based step-up auth, P0), Addition 1.3 (anti-social-engineering, P0).
//
// ---------------------------------------------------------------------------
// WHAT THIS ROUTE DID BEFORE
// ---------------------------------------------------------------------------
//
// It wrote one `ShadowMessage` reading `Action response: confirm:make_payment`
// and returned `Action "confirm:make_payment" confirmed.` That was all of it.
// No auth was required, no fraud screen ran, and NO CONSENT RECEIPT WAS
// WRITTEN — on the one route in the platform whose entire purpose is a human
// authorising something the agent proposed.
//
// `ShadowAgent.buildConfirmationResponse` produces those cards precisely when
// an action is too risky to execute unasked: it is reached when the effective
// confirmation level is `confirm_phrase`, `voice_pin` or `voice_pin_sms`. So
// the higher the risk, the more certainly the flow arrived here — and here is
// where nothing was checked and nothing was recorded.
//
// ---------------------------------------------------------------------------
// THE THREE MODULES THIS WIRES, ALL OF WHICH HAD ZERO CALLERS
// ---------------------------------------------------------------------------
//
//   safety/fraud-detector.ts  — 0 external importers. Its own header says the
//                               patterns are "evaluated before any action
//                               proceeds". They were evaluated nowhere.
//   safety/auth-manager.ts    — 0 external importers. `determineAuthRequired`
//                               computed a PIN/SMS requirement nobody asked for
//                               and nobody enforced.
//   safety/consent-receipt.ts — `createReceipt` reachable only from
//                               `recording-consent.recordConsent`, which itself
//                               has no caller. The P0 provenance record was
//                               never written from any action path.
//
// ---------------------------------------------------------------------------
// ORDER, AND WHY IT IS THIS ORDER
// ---------------------------------------------------------------------------
//
//   1. own the session          — nothing else may run for someone else's session
//   2. record the response      — BEFORE any refusal. "Don't log this" is one of
//                                 the fraud patterns; a gate that discarded the
//                                 message it refused would be granting it.
//   3. fraud screen             — refuses regardless of a valid PIN, per 1.3.
//                                 So it runs BEFORE auth, not after: an action
//                                 that must be refused must not become allowed
//                                 by supplying the right second factor.
//   4. compute risk server-side — from the same `computeRiskScore` the agent
//                                 uses. The client never sends a risk score;
//                                 a caller-supplied risk number is a caller-
//                                 supplied auth requirement.
//   5. step-up auth             — PIN and/or SMS per `determineAuthRequired`.
//   6. consent receipt          — written ONLY after 3, 4 and 5 pass, so its
//                                 existence means the action was authorised,
//                                 which is the only thing that makes a receipt
//                                 worth keeping for seven years.
//
// A CANCEL writes no receipt. Nothing was authorised, and a receipt for a
// declined action would be the audit trail asserting the opposite of what
// happened.
//
// ---------------------------------------------------------------------------
// BACKWARD COMPATIBILITY
// ---------------------------------------------------------------------------
//
// `src/hooks/useShadowContext.ts` sends `{ sessionId, actionId, response }` and
// nothing else. Every new field is optional. `actionType` is DERIVED from the
// response when it is not sent, because the action cards the agent builds carry
// it: the options are `confirm:<intent>` / `cancel` and the card id is
// `confirm-<intent>-<timestamp>` (`agent/core.ts`,
// `buildConfirmationResponse`). A confirmation whose action cannot be
// identified at all is refused rather than guessed — see `UNKNOWN_ACTION`.
//
// What is NOT backward compatible, deliberately: a high-risk confirmation now
// returns 401 with `{ required: { pin, smsCode } }` instead of succeeding. The
// UI has no PIN prompt yet, so that flow is incomplete on the client — but the
// failure is now a visible 401 rather than an invisible unauthenticated
// approval of a payment. See the P-17 report for the UI item not reached.
// ============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withRole } from '@/shared/middleware/auth';

import { prisma } from '@/lib/db';
import { sessionManager } from '@/modules/shadow/interfaces/session-manager';
import { storeShadowMessage } from '@/modules/shadow/compliance/message-store';
import { consentReceiptService } from '@/modules/shadow/safety/consent-receipt';
import { classifyAction } from '@/modules/shadow/safety/action-classifier';
import { detectFraud } from '@/modules/shadow/safety/fraud-detector';
import { shadowAuthManager } from '@/modules/shadow/safety/auth-manager';
import { recordAuthEvent, type AuthEventMethod } from '@/modules/shadow/safety/auth-events';
import { computeRiskScore, isBusinessHours } from '@/modules/shadow/agent/risk-scorer';

const SourceCitationSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
  label: z.string().optional(),
});

const ActionResponseSchema = z.object({
  sessionId: z.string().min(1),
  actionId: z.string().min(1),
  response: z.string().min(1),
  /** The action being confirmed. Derived from `response`/`actionId` when absent. */
  actionType: z.string().min(1).optional(),
  /** Second factors, supplied only when a previous call said they were required. */
  pin: z.string().min(1).optional(),
  smsCode: z.string().min(1).optional(),
  /** Identifies the device for the trusted-device check (Addition 1.1). */
  deviceFingerprint: z.string().min(1).optional(),
  /** Provenance the caller can attach to the receipt (Addition 2.2). */
  sourcesCited: z.array(SourceCitationSchema).max(20).optional(),
  financialImpact: z.number().nonnegative().optional(),
  affectedCount: z.number().int().nonnegative().optional(),
});

/** What the user's answer to the card means. */
type Decision =
  | { kind: 'confirm'; actionType: string }
  | { kind: 'cancel' }
  | { kind: 'unknown' };

/**
 * Read the decision out of the card response.
 *
 * The vocabulary is the one `agent/core.ts` writes into the card:
 *   options: [{ action: `confirm:${intent}` }, { action: 'cancel' }]
 *   id:      `confirm-${intent}-${Date.now()}`
 *
 * An explicit `actionType` in the body wins over both, so a caller that knows
 * exactly what it is confirming is never second-guessed by a string parse.
 */
function decide(
  response: string,
  actionId: string,
  explicitActionType?: string,
): Decision {
  const normalised = response.trim().toLowerCase();

  if (normalised === 'cancel' || normalised.startsWith('cancel:')) {
    return { kind: 'cancel' };
  }

  if (explicitActionType) {
    return { kind: 'confirm', actionType: explicitActionType };
  }

  if (normalised.startsWith('confirm:')) {
    const actionType = response.trim().slice('confirm:'.length);
    if (actionType.length > 0) return { kind: 'confirm', actionType };
  }

  // `confirm-<actionType>-<epoch ms>`. Split from the RIGHT, because an action
  // type contains dashes far more often than a card id contains two of them.
  const fromCard = /^confirm-(.+)-\d+$/.exec(actionId);
  if (fromCard?.[1]) return { kind: 'confirm', actionType: fromCard[1] };

  return { kind: 'unknown' };
}

/** The `confirmationMethod` recorded on the receipt, from the factors used. */
function confirmationMethodOf(pinUsed: boolean, smsUsed: boolean): string {
  if (pinUsed && smsUsed) return 'dual';
  if (pinUsed) return 'voice_pin';
  if (smsUsed) return 'sms_code';
  return 'tap';
}

/** The `method` recorded on the security-log row, from the same two facts. */
function authEventMethodOf(pinUsed: boolean, smsUsed: boolean): AuthEventMethod {
  if (pinUsed && smsUsed) return 'dual';
  if (pinUsed) return 'voice_pin';
  if (smsUsed) return 'sms_code';
  return 'tap_confirm';
}

export async function POST(request: NextRequest) {
  return withRole(request, ['owner', 'admin', 'member'], async (req, session) => {
    try {
      const body = await req.json();
      const parsed = ActionResponseSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const {
        sessionId,
        actionId,
        response: userResponse,
        actionType: explicitActionType,
        pin,
        smsCode,
        deviceFingerprint,
        sourcesCited,
        financialImpact,
        affectedCount,
      } = parsed.data;

      // --- 1. Verify session ownership -----------------------------------
      // P-41: the scope IS the ownership check. A session id in a request body
      // is a caller-supplied cuid; `forUser` merges the authenticated user
      // into the where clause, so another tenant's session reads as missing.
      const sessions = sessionManager.forUser(session.userId);

      const voiceSession = await sessions.getSession(sessionId);
      if (!voiceSession) {
        return error('NOT_FOUND', 'Session not found', 404);
      }

      const channel = voiceSession.currentChannel;
      const decision = decide(userResponse, actionId, explicitActionType);

      // --- 2. Record the response, before anything can refuse it ----------
      const actionMessage = await storeShadowMessage({
        sessionId,
        role: 'user',
        content: `Action response: ${userResponse}`,
        channel,
        actionsTaken: [
          { actionId, response: userResponse, respondedAt: new Date().toISOString() },
        ],
      });

      await sessions.touchSession(sessionId);

      // --- 3. Anti-social-engineering screen ------------------------------
      //
      // Runs before auth on purpose: Addition 1.3's list is headed "ALWAYS
      // REFUSE (even with valid PIN)". A screen placed after the PIN check
      // would be one a correct PIN gets past.
      const fraud = detectFraud({
        input: userResponse,
        actionType: decision.kind === 'confirm' ? decision.actionType : undefined,
        context: { channel, isFinancial: (financialImpact ?? 0) > 0 },
      });

      if (fraud.isFraudulent) {
        await recordAuthEvent({
          userId: session.userId,
          sessionId,
          method: 'fraud_screen',
          result: 'refused',
          riskLevel: fraud.severity.toLowerCase(),
          actionAttempted: fraud.pattern,
        });
        return error('ACTION_REFUSED', fraud.message, 403);
      }

      // --- Cancel: nothing was authorised, so nothing is receipted --------
      if (decision.kind === 'cancel') {
        await recordAuthEvent({
          userId: session.userId,
          sessionId,
          method: 'tap_confirm',
          result: 'fail',
          riskLevel: 'info',
          actionAttempted: 'cancelled',
        });
        return success({
          id: actionMessage.id,
          content: 'Cancelled. Nothing was done.',
          contentType: 'TEXT',
          confirmed: false,
          receiptId: null,
          timestamp: new Date().toISOString(),
        });
      }

      if (decision.kind === 'unknown') {
        // Refusing beats guessing. Guessing an action type here would decide
        // which confirmation level applies, and getting that wrong downgrades
        // a payment to a tap.
        return error(
          'UNKNOWN_ACTION',
          'Could not determine which action this response confirms. Send `actionType` explicitly.',
          400,
        );
      }

      const { actionType } = decision;
      const classification = classifyAction(actionType);

      // --- 4. Risk, computed here and never accepted from the client ------
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const [actionsInLastHour, priorActions, user] = await Promise.all([
        prisma.actionLog.count({
          where: { actorId: session.userId, timestamp: { gte: oneHourAgo } },
        }),
        prisma.actionLog.count({
          where: { actorId: session.userId, actionType },
        }),
        prisma.user.findUnique({
          where: { id: session.userId },
          select: { timezone: true },
        }),
      ]);

      const deviceTrusted = deviceFingerprint
        ? await shadowAuthManager.isTrustedDevice(session.userId, deviceFingerprint)
        : false;

      const risk = computeRiskScore({
        financialAmount: financialImpact,
        blastRadius: classification.blastRadius,
        channel,
        isBusinessHours: isBusinessHours(user?.timezone ?? 'UTC'),
        actionsInLastHour,
        isFirstTimeAction: priorActions === 0,
        isTrustedDevice: deviceTrusted,
      });

      // --- 5. Step-up authentication --------------------------------------
      const required = await shadowAuthManager.determineAuthRequired({
        userId: session.userId,
        action: actionType,
        riskScore: risk.score,
        channel,
        deviceIdentifier: deviceFingerprint,
      });

      let pinUsed = false;
      let smsUsed = false;

      if (required.requiresPin) {
        const ok = pin ? await shadowAuthManager.verifyPin(session.userId, pin) : false;
        if (!ok) {
          await recordAuthEvent({
            userId: session.userId,
            sessionId,
            method: 'voice_pin',
            result: 'fail',
            riskLevel: required.requiresSmsCode ? 'high' : 'medium',
            actionAttempted: actionType,
          });
          return error(
            'STEP_UP_REQUIRED',
            pin
              ? 'That PIN is not correct.'
              : `This action requires your voice PIN. ${required.reason}`,
            401,
            // The client needs to know WHICH factors to collect, and the risk
            // score is what makes the demand explicable rather than arbitrary.
            {
              required: { pin: true, smsCode: required.requiresSmsCode },
              riskScore: risk.score,
              riskFactors: risk.factors,
              actionType,
            },
          );
        }
        pinUsed = true;
      }

      if (required.requiresSmsCode) {
        const ok = smsCode
          ? await shadowAuthManager.verifySmsCode(session.userId, smsCode)
          : false;
        if (!ok) {
          await recordAuthEvent({
            userId: session.userId,
            sessionId,
            method: 'sms_code',
            result: 'fail',
            riskLevel: 'high',
            actionAttempted: actionType,
          });
          return error(
            'STEP_UP_REQUIRED',
            smsCode
              ? 'That code is not correct or has expired.'
              : `This action requires an SMS verification code. ${required.reason}`,
            401,
            {
              required: { pin: required.requiresPin, smsCode: true },
              riskScore: risk.score,
              riskFactors: risk.factors,
              actionType,
            },
          );
        }
        smsUsed = true;
      }

      await recordAuthEvent({
        userId: session.userId,
        sessionId,
        method: authEventMethodOf(pinUsed, smsUsed),
        result: 'pass',
        riskLevel:
          risk.score > 70 ? 'high' : risk.score > 40 ? 'medium' : 'low',
        actionAttempted: actionType,
      });

      // --- 6. The consent receipt ------------------------------------------
      //
      // Through `consentReceiptService`, not `prisma.shadowConsentReceipt`
      // directly: the service is what enriches the row from `classifyAction`,
      // so `confirmationLevel`, `blastRadius` and `reversible` come from the
      // one classification table rather than from whatever the call site
      // believed. `eslint.config.mjs` now forbids the direct create.
      const receipt = await consentReceiptService.createReceipt({
        sessionId,
        messageId: actionMessage.id,
        actionType,
        actionDescription: classification.description,
        // The spec's `trigger_source` vocabulary: user_request, proactive,
        // workflow_step, notification. A confirmation card answered by a human
        // is a user request, and the card is the reference object.
        triggerSource: 'user_request',
        triggerReferenceType: 'action_card',
        triggerReferenceId: actionId,
        reasoning:
          `Confirmed by the user through an action card on the ${channel} channel. ` +
          `Risk score ${risk.score}` +
          (risk.factors.length > 0
            ? ` (${risk.factors.map((f) => f.label).join(', ')})`
            : '') +
          `. Auth: ${required.reason}`,
        sourcesCited: (sourcesCited ?? []).map((s) =>
          s.label ? `${s.type}:${s.id} (${s.label})` : `${s.type}:${s.id}`,
        ),
        confirmationMethod: confirmationMethodOf(pinUsed, smsUsed),
        affectedCount,
        financialImpact,
        entityId: voiceSession.activeEntityId ?? undefined,
      });

      return success({
        id: actionMessage.id,
        content: `Action "${userResponse}" confirmed.`,
        contentType: 'TEXT',
        confirmed: true,
        // The id is returned so a client can offer "View receipt", which is the
        // second button on the card in Addition 2.3.
        receiptId: receipt.id,
        riskScore: risk.score,
        confirmationMethod: confirmationMethodOf(pinUsed, smsUsed),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process action';
      return error('ACTION_FAILED', message, 500);
    }
  });
}
