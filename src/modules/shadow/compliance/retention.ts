// ============================================================================
// Shadow Voice Agent — Data Retention Service
// ============================================================================
//
// P-17 (Sprint 6). Issue #25 asks for "retention policies + nightly cleanup
// cron". This file is the policy; `src/lib/queue/shadow-retention.ts` is the
// cron. Read this header before changing either.
//
// ---------------------------------------------------------------------------
// WHAT THIS JOB DELETES, AND WHAT IT REFUSES TO DELETE
// ---------------------------------------------------------------------------
//
//   DELETED   ShadowMessage            past `messageRetentionDays`    (365)
//   CLEARED   ShadowVoiceSession.fullTranscript
//                                      past `transcriptRetentionDays` (365)
//   CLEARED   ShadowVoiceSession.recordingUrls
//                                      past `recordingRetentionDays`  (90)
//   DELETED   ShadowVoiceSession (ended) and its ShadowSessionOutcome
//                                      past `transcriptRetentionDays` (365)
//
//   NEVER DELETED AS A CHILD OF A SESSION:
//   ShadowConsentReceipt   — its own clock, `consentRetentionDays` (2555 = 7y),
//                            measured from `executedAt`, not from the session.
//   ShadowAuthEvent        — the step-up-auth audit trail. Same clock, for the
//                            reason in AUTH EVENTS below.
//
// ---------------------------------------------------------------------------
// WHY THAT IS A CHANGE, AND WHY THE PREVIOUS BEHAVIOUR WAS DESTRUCTIVE
// ---------------------------------------------------------------------------
//
// Until this commit the session-cleanup step read:
//
//     await Promise.all([
//       prisma.shadowMessage.deleteMany({ where: { sessionId: { in: ids } } }),
//       prisma.shadowSessionOutcome.deleteMany({ where: { sessionId: { in: ids } } }),
//       prisma.shadowConsentReceipt.deleteMany({ where: { sessionId: { in: ids } } }),  // <--
//       prisma.shadowAuthEvent.deleteMany({ where: { sessionId: { in: ids } } }),       // <--
//     ]);
//
// A consent receipt is the record that a human authorised an action. It is what
// an auditor asks for and the only artefact that outlives the conversation it
// came from. Deleting it on the transcript's 365-day clock destroys the proof
// and keeps nothing that needed keeping — while the committed spec says the
// opposite twice (v3 Addition 9.1, `consent_receipt_retention_days DEFAULT 2555
// -- 7 years (regulatory)`; Addition 9.3, "Consent receipts RETAINED (legal
// requirement)").
//
// The decisive detail is that those two `deleteMany` calls were not even
// required to make the session delete succeed. From the baseline migration:
//
//     ShadowMessage_sessionId_fkey        ... ON DELETE RESTRICT
//     ShadowConsentReceipt_sessionId_fkey ... ON DELETE SET NULL
//     ShadowAuthEvent_sessionId_fkey      ... ON DELETE SET NULL
//
// `ShadowMessage` is RESTRICT, so its rows genuinely must go first. The receipt
// and the auth event are SET NULL: the schema already says they outlive their
// session and detach cleanly. The code was overriding a decision the database
// had already made correctly. Deleting the session now detaches them — which is
// Postgres doing it, not this file — and they are counted first so the number
// is reportable rather than invisible.
//
// ---------------------------------------------------------------------------
// PER-ENTITY CONFIG IS NOW APPLIED (it was loaded and then ignored)
// ---------------------------------------------------------------------------
//
// The previous version opened with:
//
//     const configs = await prisma.shadowRetentionConfig.findMany();
//     const configMap = new Map<string, RetentionConfig>();
//     for (const config of configs) configMap.set(config.entityId, toRetentionConfig(config));
//
// and then never read `configMap` again — every threshold below it came from
// `DEFAULT_RETENTION_DAYS`. An entity that set `messageRetentionDays: 30` to
// satisfy a policy got 365, and `PUT /api/shadow/retention` reported the 30
// back to them. That is this codebase's third failure mode: code that runs and
// reports success for work it did not do.
//
// Cleanup now runs once per BUCKET: one bucket per entity that has a config,
// plus one default bucket covering every entity that does not and every session
// with no entity at all. `defaultScopeFilter` is what makes the default bucket
// exact rather than "whatever is left over".
//
// ---------------------------------------------------------------------------
// AUTH EVENTS
// ---------------------------------------------------------------------------
//
// `ShadowAuthEvent` is "verification methods used per session" (v3 Addition
// 1.1) — the record of whether a step-up challenge passed or failed. It is
// security-audit evidence with exactly the properties that make a consent
// receipt regulatory, and it was being deleted by the same line for the same
// wrong reason.
//
// It has no retention column of its own, `prisma/schema.prisma` is frozen for
// this package and migration window 01 is closed, so it rides the consent-
// receipt DEFAULT clock (2555 days from `createdAt`) and is not scoped per
// entity — the model has no `entityId`, and its `sessionId` is nullable, so a
// join is not always available. `PARALLEL_BUILD_ESCALATION_P17.md` asks for the
// column. The interim choice errs toward keeping evidence.
//
// ---------------------------------------------------------------------------
// THE GUARDRAIL
// ---------------------------------------------------------------------------
//
// A nightly destructive job that deletes ten times what it deleted yesterday
// should be loud, not silent. `SHADOW_RETENTION_MAX_SESSIONS_PER_RUN` caps how many
// sessions one run may delete; over the cap the session step is REFUSED whole
// (nothing is deleted), `refused` comes back true, and an `error`-severity
// event is reported. Everything notable is reported through P-28's `report()`
// with a fixed low-cardinality fingerprint — see `reportRun` at the bottom.
// This file adds no second metrics system; it calls the one that exists.
// ============================================================================

import { prisma } from '@/lib/db';
import { report } from '@/lib/observability';

// --- Constants ---

/** Default retention periods in days */
const DEFAULT_RETENTION_DAYS = {
  recordings: 90,
  transcripts: 365,
  messages: 365,
  consentReceipts: 2555, // 7 years
} as const;

/**
 * The most sessions one cleanup run may delete before it refuses instead.
 *
 * Deliberately generous: this is a circuit breaker for "something changed the
 * thresholds" or "the clock jumped", not a throughput limit. An operator who
 * genuinely needs a larger sweep raises it explicitly, and the raise is a
 * deployment record.
 */
export const DEFAULT_MAX_SESSIONS_PER_RUN = 5_000;

/**
 * Read at CALL time, not at module load.
 *
 * A module-level `Number(process.env...)` is unchangeable once the module is
 * imported, which makes the cap untestable without a second process and makes
 * an operator's change to the variable take effect only on the next deploy. The
 * cost of reading it per run is one `Number()` per night.
 *
 * A value that is not a finite non-negative number falls back to the default
 * rather than to `NaN` — `ids.length > NaN` is always false, which would
 * silently DISABLE the guardrail, and a typo in an environment variable must
 * not be able to turn a circuit breaker off.
 */
export function maxSessionsPerRun(): number {
  const raw = process.env.SHADOW_RETENTION_MAX_SESSIONS_PER_RUN;
  if (raw === undefined || raw.trim() === '') return DEFAULT_MAX_SESSIONS_PER_RUN;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MAX_SESSIONS_PER_RUN;
}

/**
 * Public retention DTO. The field names here are the API vocabulary
 * (see `/api/shadow/retention`); the `ShadowRetentionConfig` table spells the
 * same four concepts `recordingRetentionDays` / `transcriptRetentionDays` /
 * `messageRetentionDays` / `consentRetentionDays`. `toRetentionConfig` is the
 * single place that translates between the two.
 */
export interface RetentionConfig {
  entityId: string;
  recordingsDays: number;
  transcriptsDays: number;
  messagesDays: number;
  consentReceiptsDays: number;
}

/** The columns of `ShadowRetentionConfig` this service reads. */
type RetentionConfigRow = {
  entityId: string;
  recordingRetentionDays: number;
  transcriptRetentionDays: number;
  messageRetentionDays: number;
  consentRetentionDays: number;
};

/** Translate a `ShadowRetentionConfig` row into the public DTO. */
function toRetentionConfig(row: RetentionConfigRow): RetentionConfig {
  return {
    entityId: row.entityId,
    recordingsDays: row.recordingRetentionDays ?? DEFAULT_RETENTION_DAYS.recordings,
    transcriptsDays: row.transcriptRetentionDays ?? DEFAULT_RETENTION_DAYS.transcripts,
    messagesDays: row.messageRetentionDays ?? DEFAULT_RETENTION_DAYS.messages,
    consentReceiptsDays: row.consentRetentionDays ?? DEFAULT_RETENTION_DAYS.consentReceipts,
  };
}

/** The defaults, as a `RetentionConfig` for a bucket that has no row. */
function defaultRetentionConfig(entityId: string): RetentionConfig {
  return {
    entityId,
    recordingsDays: DEFAULT_RETENTION_DAYS.recordings,
    transcriptsDays: DEFAULT_RETENTION_DAYS.transcripts,
    messagesDays: DEFAULT_RETENTION_DAYS.messages,
    consentReceiptsDays: DEFAULT_RETENTION_DAYS.consentReceipts,
  };
}

export interface RetentionCleanupResult {
  recordingsDeleted: number;
  transcriptsDeleted: number;
  messagesDeleted: number;
  sessionsDeleted: number;
  outcomesDeleted: number;
  /**
   * Consent receipts deleted because they passed their OWN retention period,
   * measured from `executedAt`. Never because a session went.
   */
  consentReceiptsDeleted: number;
  /**
   * Consent receipts that belonged to a session this run deleted and that
   * SURVIVED it, detached by the `ON DELETE SET NULL` foreign key. The old
   * code deleted exactly these rows; this is the number it was destroying.
   */
  consentReceiptsPreserved: number;
  /** Auth events past the same clock. See AUTH EVENTS in the header. */
  authEventsDeleted: number;
  /** Auth events that survived a session deletion, likewise detached. */
  authEventsPreserved: number;
  /**
   * True when the guardrail stopped the session-deletion step. Nothing in that
   * step ran; the earlier steps still did.
   */
  refused: boolean;
  errors: string[];
}

// --- Helpers ---

function daysAgo(days: number, now: Date): Date {
  const d = new Date(now.getTime());
  d.setDate(d.getDate() - days);
  return d;
}

/** One unit of cleanup: a set of sessions and the policy that applies to them. */
interface RetentionBucket {
  /** The entity whose config this is, or null for the catch-all bucket. */
  entityId: string | null;
  config: RetentionConfig;
}

/**
 * The `activeEntityId` filter that selects exactly the catch-all bucket.
 *
 * `notIn: []` is not relied on: with no configured entities the default bucket
 * is every session, and the filter is omitted entirely. With some, it is
 * "entity is null OR entity is not one of the configured ones", which is the
 * complement of the per-entity buckets by construction rather than by comment.
 */
function defaultScopeFilter(configuredEntityIds: string[]): Record<string, unknown> {
  if (configuredEntityIds.length === 0) return {};
  return {
    OR: [{ activeEntityId: null }, { activeEntityId: { notIn: configuredEntityIds } }],
  };
}

/** The same complement, for a model whose own column is `entityId`. */
function defaultEntityFilter(configuredEntityIds: string[]): Record<string, unknown> {
  if (configuredEntityIds.length === 0) return {};
  return {
    OR: [{ entityId: null }, { entityId: { notIn: configuredEntityIds } }],
  };
}

// --- Retention Service ---

export class RetentionService {
  /**
   * Run the retention cleanup job.
   *
   * Called by the nightly cron (`src/lib/queue/shadow-retention.ts`). `now` is
   * injectable so a test can age a fixture without waiting a year; production
   * never passes it.
   *
   * Every step is individually guarded: one failing step records an error and
   * the rest still run, because a cleanup that stops at the first problem
   * silently stops complying with every policy after it.
   */
  async runRetentionCleanup(now: Date = new Date()): Promise<RetentionCleanupResult> {
    const result: RetentionCleanupResult = {
      recordingsDeleted: 0,
      transcriptsDeleted: 0,
      messagesDeleted: 0,
      sessionsDeleted: 0,
      outcomesDeleted: 0,
      consentReceiptsDeleted: 0,
      consentReceiptsPreserved: 0,
      authEventsDeleted: 0,
      authEventsPreserved: 0,
      refused: false,
      errors: [],
    };

    let buckets: RetentionBucket[] = [];
    let configuredEntityIds: string[] = [];

    try {
      const configs = await prisma.shadowRetentionConfig.findMany();
      configuredEntityIds = configs.map((c) => c.entityId);
      buckets = [
        ...configs.map((c) => ({
          entityId: c.entityId,
          config: toRetentionConfig(c),
        })),
        { entityId: null, config: defaultRetentionConfig('__default__') },
      ];
    } catch (err) {
      result.errors.push(`Loading retention configs failed: ${describeError(err)}`);
      reportRun(result, now);
      return result;
    }

    for (const bucket of buckets) {
      const sessionScope =
        bucket.entityId === null
          ? defaultScopeFilter(configuredEntityIds)
          : { activeEntityId: bucket.entityId };

      // --- Expired messages -------------------------------------------------
      try {
        const { count } = await prisma.shadowMessage.deleteMany({
          where: {
            createdAt: { lt: daysAgo(bucket.config.messagesDays, now) },
            session: sessionScope,
          },
        });
        result.messagesDeleted += count;
      } catch (err) {
        result.errors.push(
          `Messages cleanup failed (${bucketName(bucket)}): ${describeError(err)}`,
        );
      }

      // --- Expired transcripts (nullify fullTranscript) ---------------------
      try {
        const { count } = await prisma.shadowVoiceSession.updateMany({
          where: {
            fullTranscript: { not: null },
            startedAt: { lt: daysAgo(bucket.config.transcriptsDays, now) },
            ...sessionScope,
          },
          data: { fullTranscript: null },
        });
        result.transcriptsDeleted += count;
      } catch (err) {
        result.errors.push(
          `Transcripts cleanup failed (${bucketName(bucket)}): ${describeError(err)}`,
        );
      }

      // --- Expired recordings (clear recordingUrls) -------------------------
      //
      // Narrowed to sessions that still hold URLs. The previous version matched
      // every old session and reported each one as a "recording deleted",
      // including the ones that never had a recording, so the number an
      // operator saw was the count of old sessions rather than of deletions.
      try {
        const { count } = await prisma.shadowVoiceSession.updateMany({
          where: {
            startedAt: { lt: daysAgo(bucket.config.recordingsDays, now) },
            NOT: { recordingUrls: { equals: [] } },
            ...sessionScope,
          },
          data: { recordingUrls: [] },
        });
        result.recordingsDeleted += count;
      } catch (err) {
        result.errors.push(
          `Recordings cleanup failed (${bucketName(bucket)}): ${describeError(err)}`,
        );
      }
    }

    // --- Expired ended sessions ---------------------------------------------
    //
    // Outside the per-bucket loop so the guardrail sees ONE total rather than
    // one per entity: a cap applied per bucket is not a cap.
    try {
      const eligible: Array<{ id: string }> = [];
      for (const bucket of buckets) {
        const sessionScope =
          bucket.entityId === null
            ? defaultScopeFilter(configuredEntityIds)
            : { activeEntityId: bucket.entityId };

        const rows = await prisma.shadowVoiceSession.findMany({
          where: {
            status: 'ended',
            endedAt: { lt: daysAgo(bucket.config.transcriptsDays, now) },
            ...sessionScope,
          },
          select: { id: true },
        });
        eligible.push(...rows);
      }

      const ids = eligible.map((s) => s.id);
      const cap = maxSessionsPerRun();

      if (ids.length > cap) {
        // Refuse the whole step. Deleting "some" of an unexpectedly large sweep
        // would leave the operator with a partial deletion and no way to tell
        // which half went.
        result.refused = true;
        result.errors.push(
          `Session cleanup refused: ${ids.length} sessions exceed the per-run cap of ` +
            `${cap}. Nothing was deleted. Raise ` +
            'SHADOW_RETENTION_MAX_SESSIONS_PER_RUN deliberately if this is expected.',
        );
      } else if (ids.length > 0) {
        // Counted BEFORE the delete, because afterwards these rows no longer
        // carry the session id that identifies them. This number is the one the
        // old code destroyed.
        result.consentReceiptsPreserved += await prisma.shadowConsentReceipt.count({
          where: { sessionId: { in: ids } },
        });
        result.authEventsPreserved += await prisma.shadowAuthEvent.count({
          where: { sessionId: { in: ids } },
        });

        // `ShadowMessage.sessionId` is ON DELETE RESTRICT, so these genuinely
        // must go first. `ShadowSessionOutcome` is the session's own summary and
        // shares its clock. Receipts and auth events are NOT listed here, and
        // that omission is the point of this commit.
        const messages = await prisma.shadowMessage.deleteMany({
          where: { sessionId: { in: ids } },
        });
        result.messagesDeleted += messages.count;

        const outcomes = await prisma.shadowSessionOutcome.deleteMany({
          where: { sessionId: { in: ids } },
        });
        result.outcomesDeleted += outcomes.count;

        const sessions = await prisma.shadowVoiceSession.deleteMany({
          where: { id: { in: ids } },
        });
        result.sessionsDeleted += sessions.count;
      }
    } catch (err) {
      result.errors.push(`Sessions cleanup failed: ${describeError(err)}`);
    }

    // --- Consent receipts, on their OWN clock -------------------------------
    //
    // The only place in this codebase that may delete a consent receipt on a
    // schedule. Bucketed by the receipt's own `entityId` column, aged from
    // `executedAt`, default 2555 days.
    for (const bucket of buckets) {
      try {
        const scope =
          bucket.entityId === null
            ? defaultEntityFilter(configuredEntityIds)
            : { entityId: bucket.entityId };

        const { count } = await prisma.shadowConsentReceipt.deleteMany({
          where: {
            executedAt: { lt: daysAgo(bucket.config.consentReceiptsDays, now) },
            ...scope,
          },
        });
        result.consentReceiptsDeleted += count;
      } catch (err) {
        result.errors.push(
          `Consent receipt cleanup failed (${bucketName(bucket)}): ${describeError(err)}`,
        );
      }
    }

    // --- Auth events, on the same regulatory clock --------------------------
    try {
      const { count } = await prisma.shadowAuthEvent.deleteMany({
        where: {
          createdAt: { lt: daysAgo(DEFAULT_RETENTION_DAYS.consentReceipts, now) },
        },
      });
      result.authEventsDeleted += count;
    } catch (err) {
      result.errors.push(`Auth event cleanup failed: ${describeError(err)}`);
    }

    reportRun(result, now);
    return result;
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
      return toRetentionConfig(config);
    }

    return defaultRetentionConfig(entityId);
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
      recordingRetentionDays:
        typeof config.recordingsDays === 'number'
          ? config.recordingsDays
          : DEFAULT_RETENTION_DAYS.recordings,
      transcriptRetentionDays:
        typeof config.transcriptsDays === 'number'
          ? config.transcriptsDays
          : DEFAULT_RETENTION_DAYS.transcripts,
      messageRetentionDays:
        typeof config.messagesDays === 'number'
          ? config.messagesDays
          : DEFAULT_RETENTION_DAYS.messages,
      consentRetentionDays:
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

    return toRetentionConfig(result);
  }
}

// ---------------------------------------------------------------------------
// Observability — P-28's recorder, extended from outside
// ---------------------------------------------------------------------------

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

function bucketName(bucket: RetentionBucket): string {
  return bucket.entityId === null ? 'default' : `entity ${bucket.entityId}`;
}

/**
 * Report a run, but only when there is something to say.
 *
 * A nightly job that reports every successful, uneventful run trains its reader
 * to ignore it, and P-28's `Severity` has no `info` rung to demote such a
 * report to. So an ordinary night — nothing deleted past a regulatory clock, no
 * errors, no refusal — is silent, and the counts still reach an operator in the
 * BullMQ job result. Three things are never silent:
 *
 *   1. a REFUSAL (the guardrail tripped);
 *   2. any consent receipt or auth event deleted on the 7-year clock, because a
 *      regulatory record leaving the database should never be something nobody
 *      was told about;
 *   3. any step that threw.
 *
 * The fingerprints are three fixed strings. `types.ts` warns that a fingerprint
 * carrying an id is "a memory leak wearing a metric's clothes"; counts go in
 * `context`, where they belong.
 */
function reportRun(result: RetentionCleanupResult, now: Date): void {
  const context = {
    at: now.toISOString(),
    messagesDeleted: result.messagesDeleted,
    sessionsDeleted: result.sessionsDeleted,
    outcomesDeleted: result.outcomesDeleted,
    transcriptsCleared: result.transcriptsDeleted,
    recordingsCleared: result.recordingsDeleted,
    consentReceiptsDeleted: result.consentReceiptsDeleted,
    consentReceiptsPreserved: result.consentReceiptsPreserved,
    authEventsDeleted: result.authEventsDeleted,
    authEventsPreserved: result.authEventsPreserved,
    errorCount: result.errors.length,
  };

  if (result.refused) {
    report({
      kind: 'manual',
      severity: 'error',
      message:
        'shadow retention cleanup REFUSED the session-deletion step: more sessions were ' +
        'eligible than the per-run cap allows. Nothing was deleted.',
      fingerprint: 'shadow:retention:refused',
      context,
    });
  }

  if (result.consentReceiptsDeleted > 0 || result.authEventsDeleted > 0) {
    report({
      kind: 'manual',
      severity: 'error',
      message:
        `shadow retention cleanup deleted ${result.consentReceiptsDeleted} consent receipt(s) ` +
        `and ${result.authEventsDeleted} auth event(s) that reached the end of the 7-year ` +
        'regulatory retention period',
      fingerprint: 'shadow:retention:regulatory-deletion',
      context,
    });
  }

  if (result.errors.length > 0) {
    report({
      kind: 'manual',
      severity: 'error',
      message: `shadow retention cleanup completed with errors: ${result.errors.join(' | ')}`,
      fingerprint: 'shadow:retention:step-failed',
      context,
    });
  }
}

// Singleton export
export const retentionService = new RetentionService();
