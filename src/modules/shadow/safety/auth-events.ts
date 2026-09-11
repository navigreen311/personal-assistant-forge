// ============================================================================
// Shadow Voice Agent — the security log, written from one place
// ============================================================================
//
// P-17 (Sprint 6), v3 Addition 1.1 and 1.3.
//
// `ShadowAuthEvent` is the spec's `shadow_auth_events` table: "verification
// methods used per session". Before this commit exactly two things wrote to it —
// `auth-manager.sendSmsCode` / `verifySmsCode` (P-33) and
// `continuous-voiceprint.ts` — so the log recorded that an SMS code was sent
// and nothing at all about whether an ACTION was allowed to proceed, which is
// what the column `actionAttempted` exists for.
//
// Addition 1.3 ends with "-> Flag in security log + alert user via separate
// channel". This is the security-log half. The separate-channel alert is not
// built; see PARALLEL_BUILD_ESCALATION_P17.md.
//
// WHY IT NEVER THROWS. Every caller is on a path where the security decision
// has already been made: the refusal is being returned, or the action is being
// allowed. A logging failure must not convert a correct refusal into a 500 that
// a client might retry, and must not convert an allowed action into an error
// after the action ran. So the write is best-effort AND its failure is reported
// through P-28's recorder — which is the difference between this and the 553
// bare `catch {}` blocks the audit found. A dropped security-log write is
// visible in the same snapshot as everything else.
// ============================================================================

import { prisma } from '@/lib/db';
import { reportError } from '@/lib/observability';

/** The `method` vocabulary. Kept closed so the log can be grouped by it. */
export type AuthEventMethod =
  | 'caller_id'
  | 'voice_pin'
  | 'sms_code'
  | 'tap_confirm'
  | 'voiceprint'
  | 'dual'
  | 'none'
  | 'fraud_screen';

/** The `result` vocabulary. `refused` is the anti-social-engineering outcome. */
export type AuthEventResult = 'pass' | 'fail' | 'timeout' | 'refused';

export interface RecordAuthEventParams {
  userId?: string | null;
  sessionId?: string | null;
  method: AuthEventMethod;
  result: AuthEventResult;
  riskLevel?: string | null;
  actionAttempted?: string | null;
}

/**
 * Write one row to the security log. Never throws.
 *
 * Returns the row id when the write succeeded and null when it did not, so a
 * caller that wants to assert the log was written can, without being forced to.
 */
export async function recordAuthEvent(
  params: RecordAuthEventParams,
): Promise<string | null> {
  try {
    const row = await prisma.shadowAuthEvent.create({
      data: {
        userId: params.userId ?? null,
        sessionId: params.sessionId ?? null,
        method: params.method,
        result: params.result,
        riskLevel: params.riskLevel ?? null,
        actionAttempted: params.actionAttempted ?? null,
      },
    });
    return row.id;
  } catch (err) {
    reportError(err, {
      kind: 'prisma_query_error',
      severity: 'error',
      // Low cardinality: the method, never the user or the session.
      fingerprint: `shadow:auth-event:write-failed:${params.method}`,
      message: 'a Shadow security-log event could not be written',
      context: { method: params.method, result: params.result },
    });
    return null;
  }
}
