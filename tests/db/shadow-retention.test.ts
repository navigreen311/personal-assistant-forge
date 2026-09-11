/**
 * P-17 (Sprint 6) — THE NIGHTLY RETENTION CRON, PROVED AGAINST A REAL DATABASE.
 *
 * ============================================================================
 * WHY THIS FILE IS THE FIRST THING A REVIEWER SHOULD READ
 * ============================================================================
 *
 * `PARALLEL_BUILD.md`'s HAZARD section says that wiring issue #25's cron "as
 * the code stands today will delete regulatory records on the wrong schedule",
 * and that `runRetentionCleanup()` having no caller is the only reason it has
 * never caused harm. This package adds the caller. So the burden here is not
 * "the job runs" — it is "the job deletes exactly what it should and refuses
 * exactly what it should", asserted on rows in Postgres after the function the
 * BullMQ worker calls has actually run.
 *
 * Every test drives `processRetentionCleanupJob` — the literal job handler from
 * `src/lib/queue/shadow-retention.ts`, with a `Job`-shaped argument — or a
 * route handler with a real session cookie. Nothing calls
 * `retentionService.runRetentionCleanup()` directly, because a test that did
 * would pass equally well against a version with no cron at all, which is the
 * failure this whole run has spent thirty-one packages undoing.
 *
 * ============================================================================
 * WHY THE MUTATION PROOF FOR THIS FILE NEEDS A SCRATCH DATABASE
 * ============================================================================
 *
 * A deletion is not observable from the process that performed it: the row is
 * gone either way, and a mocked Prisma would report the same counts whether the
 * receipt survived or not (which is exactly how the old code's own unit tests
 * stayed green over `shadowConsentReceipt.deleteMany`). So every assertion
 * below is a `findUnique`/`count` against a real Postgres — the `paf_p17`
 * scratch database — AFTER the job ran, on rows the test did not write in the
 * same statement.
 *
 * Requires a real Postgres and a real Redis.
 */

import { db, setupTestDatabase } from '../helpers/db';
import { createTenant, createTwoTenants, type Tenant } from '../helpers/factories';
import { readJson, requestAs } from '../helpers/session';

import {
  processRetentionCleanupJob,
  ensureRetentionSchedule,
  removeRetentionSchedule,
  getShadowRetentionQueue,
  RETENTION_CLEANUP_JOB_NAME,
} from '@/lib/queue/shadow-retention';
import { recorder } from '@/lib/observability';
import { SCRUBBED_REASONING } from '@/modules/shadow/compliance/gdpr-export';

import { POST as deleteAllPOST } from '@/app/api/shadow/delete-all/route';
import { POST as deleteSessionPOST } from '@/app/api/shadow/delete-session/[id]/route';
import { POST as exportPOST } from '@/app/api/shadow/export/route';
import { PUT as retentionPUT } from '@/app/api/shadow/retention/route';

setupTestDatabase();

afterAll(async () => {
  await removeRetentionSchedule().catch(() => undefined);
  await getShadowRetentionQueue().close();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Envelope<T> = { success: boolean; data: T };

const DAY_MS = 24 * 60 * 60 * 1000;

/** A fixed "now" so no assertion depends on when the suite runs. */
const NOW = new Date('2026-09-10T03:00:00.000Z');

function daysBefore(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS);
}

/** The exact argument the worker's handler receives, minus BullMQ's methods. */
function cleanupJob(now: Date = NOW) {
  return {
    name: RETENTION_CLEANUP_JOB_NAME,
    data: { now: now.toISOString() },
  } as Parameters<typeof processRetentionCleanupJob>[0];
}

/**
 * An ended session, aged, with one message, one outcome, one consent receipt
 * and one auth event attached.
 *
 * `createdAt` / `startedAt` / `endedAt` / `executedAt` are all set explicitly:
 * every one of them is a threshold in the policy, and a fixture that let any of
 * them default to `now()` would be testing the default rather than the rule.
 */
async function agedSession(
  tenant: Tenant,
  opts: {
    endedDaysAgo: number;
    receiptDaysAgo: number;
    messageDaysAgo?: number;
    entityId?: string | null;
    transcript?: string | null;
    recordingUrls?: string[];
  },
) {
  const entityId = opts.entityId === undefined ? tenant.entity.id : opts.entityId;

  const session = await db.shadowVoiceSession.create({
    data: {
      userId: tenant.user.id,
      status: 'ended',
      currentChannel: 'web',
      activeEntityId: entityId,
      startedAt: daysBefore(opts.endedDaysAgo + 1),
      endedAt: daysBefore(opts.endedDaysAgo),
      lastActivityAt: daysBefore(opts.endedDaysAgo),
      fullTranscript: opts.transcript ?? 'the whole conversation',
      recordingUrls: opts.recordingUrls ?? ['https://example.test/rec.mp3'],
    },
  });

  const message = await db.shadowMessage.create({
    data: {
      sessionId: session.id,
      role: 'user',
      content: 'please pay the invoice',
      channel: 'web',
      createdAt: daysBefore(opts.messageDaysAgo ?? opts.endedDaysAgo + 1),
    },
  });

  const outcome = await db.shadowSessionOutcome.create({
    data: { sessionId: session.id },
  });

  const receipt = await db.shadowConsentReceipt.create({
    data: {
      sessionId: session.id,
      messageId: message.id,
      actionType: 'make_payment',
      actionDescription: 'Paid invoice INV-042 for $4,200',
      triggerSource: 'user_request',
      reasoning: 'User said "yes, pay it" on the phone',
      confirmationLevel: 'VOICE_PIN',
      blastRadius: 'external',
      reversible: false,
      entityId,
      executedAt: daysBefore(opts.receiptDaysAgo),
    },
  });

  const authEvent = await db.shadowAuthEvent.create({
    data: {
      userId: tenant.user.id,
      sessionId: session.id,
      method: 'voice_pin',
      result: 'pass',
      riskLevel: 'high',
      actionAttempted: 'make_payment',
      createdAt: daysBefore(opts.receiptDaysAgo),
    },
  });

  return { session, message, outcome, receipt, authEvent };
}

// ===========================================================================
// 1. THE HAZARD
// ===========================================================================

describe('the retention cron and the seven-year record', () => {
  it('deletes an expired session and its transcript, and KEEPS the consent receipt', async () => {
    const tenant = await createTenant();

    // Ended 400 days ago: past the 365-day transcript/session clock.
    // Receipt executed 400 days ago too: nowhere near the 2555-day clock.
    const { session, message, outcome, receipt, authEvent } = await agedSession(tenant, {
      endedDaysAgo: 400,
      receiptDaysAgo: 400,
    });

    const result = await processRetentionCleanupJob(cleanupJob());

    // --- What the job deleted ---------------------------------------------
    expect(await db.shadowVoiceSession.findUnique({ where: { id: session.id } })).toBeNull();
    expect(await db.shadowMessage.findUnique({ where: { id: message.id } })).toBeNull();
    expect(
      await db.shadowSessionOutcome.findUnique({ where: { id: outcome.id } }),
    ).toBeNull();
    expect(result.sessionsDeleted).toBe(1);

    // --- What the job refused to delete -----------------------------------
    //
    // This is the whole package. Before this commit the same job issued
    // `shadowConsentReceipt.deleteMany({ where: { sessionId: { in: ids } } })`
    // and this row would not exist.
    const survivingReceipt = await db.shadowConsentReceipt.findUnique({
      where: { id: receipt.id },
    });
    expect(survivingReceipt).not.toBeNull();

    // Detached, not orphaned: the ON DELETE SET NULL foreign key did this, and
    // the receipt keeps everything that makes it evidence.
    expect(survivingReceipt?.sessionId).toBeNull();
    expect(survivingReceipt?.actionType).toBe('make_payment');
    expect(survivingReceipt?.actionDescription).toBe('Paid invoice INV-042 for $4,200');
    expect(survivingReceipt?.confirmationLevel).toBe('VOICE_PIN');
    expect(survivingReceipt?.blastRadius).toBe('external');
    expect(survivingReceipt?.entityId).toBe(tenant.entity.id);

    const survivingAuthEvent = await db.shadowAuthEvent.findUnique({
      where: { id: authEvent.id },
    });
    expect(survivingAuthEvent).not.toBeNull();
    expect(survivingAuthEvent?.sessionId).toBeNull();
    expect(survivingAuthEvent?.result).toBe('pass');

    // --- And the survivors are COUNTED, not merely spared ------------------
    expect(result.consentReceiptsPreserved).toBe(1);
    expect(result.authEventsPreserved).toBe(1);
    expect(result.consentReceiptsDeleted).toBe(0);
    expect(result.authEventsDeleted).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.refused).toBe(false);
  });

  it('deletes a consent receipt only once it passes its OWN 7-year clock', async () => {
    const tenant = await createTenant();

    // Same session age for both. The only difference is the receipt's own age.
    const young = await agedSession(tenant, { endedDaysAgo: 400, receiptDaysAgo: 2554 });
    const old = await agedSession(tenant, { endedDaysAgo: 400, receiptDaysAgo: 2556 });

    const result = await processRetentionCleanupJob(cleanupJob());

    expect(
      await db.shadowConsentReceipt.findUnique({ where: { id: young.receipt.id } }),
    ).not.toBeNull();
    expect(
      await db.shadowConsentReceipt.findUnique({ where: { id: old.receipt.id } }),
    ).toBeNull();
    expect(result.consentReceiptsDeleted).toBe(1);

    // One day either side of 2555. A clock that was "about seven years" would
    // pass a test with a wider gap and still be the wrong clock.
  });

  it('honours a longer consent retention period configured for the entity', async () => {
    const tenant = await createTenant();

    await db.shadowRetentionConfig.create({
      data: { entityId: tenant.entity.id, consentRetentionDays: 3650 },
    });

    // 2556 days: past the DEFAULT 2555, inside this entity's configured 3650.
    const { receipt } = await agedSession(tenant, {
      endedDaysAgo: 400,
      receiptDaysAgo: 2556,
    });

    const result = await processRetentionCleanupJob(cleanupJob());

    expect(
      await db.shadowConsentReceipt.findUnique({ where: { id: receipt.id } }),
    ).not.toBeNull();
    expect(result.consentReceiptsDeleted).toBe(0);
  });
});

// ===========================================================================
// 2. PER-ENTITY CONFIG IS APPLIED (it used to be loaded and ignored)
// ===========================================================================

describe('per-entity retention config', () => {
  it('applies one entity’s shorter message retention without touching another’s', async () => {
    const { tenantA, tenantB } = await createTwoTenants();

    // A keeps messages for 30 days. B has no config, so B gets the 365 default.
    await db.shadowRetentionConfig.create({
      data: { entityId: tenantA.entity.id, messageRetentionDays: 30 },
    });

    // A session that is NOT old enough to be deleted, so the only thing that
    // can remove the message is the message clock itself.
    const sessionA = await db.shadowVoiceSession.create({
      data: {
        userId: tenantA.user.id,
        status: 'active',
        currentChannel: 'web',
        activeEntityId: tenantA.entity.id,
        startedAt: daysBefore(100),
      },
    });
    const sessionB = await db.shadowVoiceSession.create({
      data: {
        userId: tenantB.user.id,
        status: 'active',
        currentChannel: 'web',
        activeEntityId: tenantB.entity.id,
        startedAt: daysBefore(100),
      },
    });

    const msgA = await db.shadowMessage.create({
      data: {
        sessionId: sessionA.id,
        role: 'user',
        content: 'sixty days old, under a thirty-day policy',
        channel: 'web',
        createdAt: daysBefore(60),
      },
    });
    const msgB = await db.shadowMessage.create({
      data: {
        sessionId: sessionB.id,
        role: 'user',
        content: 'sixty days old, under the default policy',
        channel: 'web',
        createdAt: daysBefore(60),
      },
    });

    const result = await processRetentionCleanupJob(cleanupJob());

    // The assertion the old code could not have passed: it read every config
    // into a Map and then used DEFAULT_RETENTION_DAYS for every threshold, so
    // BOTH of these would still be here.
    expect(await db.shadowMessage.findUnique({ where: { id: msgA.id } })).toBeNull();
    expect(await db.shadowMessage.findUnique({ where: { id: msgB.id } })).not.toBeNull();
    expect(result.messagesDeleted).toBe(1);
  });

  it('the config a user sets through PUT /api/shadow/retention is the one the cron uses', async () => {
    // The route and the job, end to end. A stored preference with no observable
    // consequence is the failure mode this run exists to close, and until this
    // commit `PUT /api/shadow/retention` was exactly that: it wrote the row,
    // read it back to the user, and the sweep ignored it.
    const tenant = await createTenant();

    const put = await retentionPUT(
      requestAs(tenant, '/api/shadow/retention', {
        method: 'PUT',
        body: { entityId: tenant.entity.id, messagesDays: 10 },
      }),
    );
    expect(put.status).toBe(200);

    const session = await db.shadowVoiceSession.create({
      data: {
        userId: tenant.user.id,
        status: 'active',
        currentChannel: 'web',
        activeEntityId: tenant.entity.id,
        startedAt: daysBefore(50),
      },
    });
    const msg = await db.shadowMessage.create({
      data: {
        sessionId: session.id,
        role: 'user',
        content: 'twenty days old',
        channel: 'web',
        createdAt: daysBefore(20),
      },
    });

    await processRetentionCleanupJob(cleanupJob());

    expect(await db.shadowMessage.findUnique({ where: { id: msg.id } })).toBeNull();
  });

  it('a session with no entity falls in the default bucket rather than nobody’s', async () => {
    const tenant = await createTenant();

    // One configured entity exists, which is what makes the default bucket a
    // complement rather than "everything". A bucket built as `notIn: [...]`
    // that forgot the null case would skip this session entirely and it would
    // never be cleaned up by anything.
    await db.shadowRetentionConfig.create({
      data: { entityId: tenant.entity.id, messageRetentionDays: 30 },
    });

    const orphan = await db.shadowVoiceSession.create({
      data: {
        userId: tenant.user.id,
        status: 'active',
        currentChannel: 'web',
        activeEntityId: null,
        startedAt: daysBefore(500),
      },
    });
    const oldMsg = await db.shadowMessage.create({
      data: {
        sessionId: orphan.id,
        role: 'user',
        content: 'four hundred days old, no entity',
        channel: 'web',
        createdAt: daysBefore(400),
      },
    });
    const youngMsg = await db.shadowMessage.create({
      data: {
        sessionId: orphan.id,
        role: 'user',
        content: 'sixty days old, no entity',
        channel: 'web',
        createdAt: daysBefore(60),
      },
    });

    await processRetentionCleanupJob(cleanupJob());

    // Default bucket: 365 days. The 400-day message goes, the 60-day one stays
    // (it is NOT subject to the configured entity's 30-day policy either).
    expect(await db.shadowMessage.findUnique({ where: { id: oldMsg.id } })).toBeNull();
    expect(await db.shadowMessage.findUnique({ where: { id: youngMsg.id } })).not.toBeNull();
  });
});

// ===========================================================================
// 3. TRANSCRIPTS AND RECORDINGS
// ===========================================================================

describe('transcripts and recordings', () => {
  it('clears a transcript at 365 days and a recording at 90, without deleting the session', async () => {
    const tenant = await createTenant();

    // Active, so the session-deletion step cannot be what changed these.
    const session = await db.shadowVoiceSession.create({
      data: {
        userId: tenant.user.id,
        status: 'active',
        currentChannel: 'phone',
        activeEntityId: tenant.entity.id,
        startedAt: daysBefore(100),
        fullTranscript: 'still inside the 365-day transcript window',
        recordingUrls: ['https://example.test/a.mp3'],
      },
    });

    const result = await processRetentionCleanupJob(cleanupJob());

    const after = await db.shadowVoiceSession.findUnique({ where: { id: session.id } });
    expect(after).not.toBeNull();
    // 100 days: past the 90-day recording window, inside the 365-day transcript
    // window. One goes, one stays, from the same row and the same run.
    expect(after?.recordingUrls).toEqual([]);
    expect(after?.fullTranscript).toBe('still inside the 365-day transcript window');
    expect(result.recordingsDeleted).toBe(1);
    expect(result.transcriptsDeleted).toBe(0);
  });

  it('counts a recording clear only when there was a recording to clear', async () => {
    // The old version matched every session older than 90 days and reported
    // each one as a "recording deleted", so the number an operator read was the
    // count of old sessions.
    const tenant = await createTenant();
    await db.shadowVoiceSession.create({
      data: {
        userId: tenant.user.id,
        status: 'active',
        currentChannel: 'web',
        activeEntityId: tenant.entity.id,
        startedAt: daysBefore(300),
        recordingUrls: [],
      },
    });

    const result = await processRetentionCleanupJob(cleanupJob());
    expect(result.recordingsDeleted).toBe(0);
  });
});

// ===========================================================================
// 4. THE GUARDRAIL AND THE OBSERVABILITY
// ===========================================================================

describe('the guardrail and what an operator is told', () => {
  beforeEach(() => {
    recorder.reset();
  });

  it('refuses the whole session-deletion step over the per-run cap, and deletes nothing', async () => {
    const tenant = await createTenant();
    const a = await agedSession(tenant, { endedDaysAgo: 400, receiptDaysAgo: 400 });
    const b = await agedSession(tenant, { endedDaysAgo: 400, receiptDaysAgo: 400 });

    // The cap is read from the environment on every run (see
    // `maxSessionsPerRun` in retention.ts), which is what makes it settable
    // here at all -- and what lets an operator change it without a deploy.
    const previous = process.env.SHADOW_RETENTION_MAX_SESSIONS_PER_RUN;
    process.env.SHADOW_RETENTION_MAX_SESSIONS_PER_RUN = '1';

    try {
      const result = await processRetentionCleanupJob(cleanupJob());

      expect(result.refused).toBe(true);
      expect(result.sessionsDeleted).toBe(0);
      // Not "some of them". Two sessions were eligible against a cap of one and
      // NEITHER went: a partial sweep would leave an operator unable to say
      // which half is gone.
      expect(
        await db.shadowVoiceSession.findUnique({ where: { id: a.session.id } }),
      ).not.toBeNull();
      expect(
        await db.shadowVoiceSession.findUnique({ where: { id: b.session.id } }),
      ).not.toBeNull();

      // ...and it is LOUD. P-28's recorder, extended from outside: a fixed
      // low-cardinality fingerprint, error severity, counts in the context.
      const fingerprints = recorder.snapshot().counters.map((c) => c.fingerprint);
      expect(fingerprints).toContain('shadow:retention:refused');
      const refusal = recorder
        .snapshot()
        .recent.find((e) => e.fingerprint === 'shadow:retention:refused');
      expect(refusal?.severity).toBe('error');
      expect(refusal?.context.sessionsDeleted).toBe(0);
    } finally {
      if (previous === undefined) delete process.env.SHADOW_RETENTION_MAX_SESSIONS_PER_RUN;
      else process.env.SHADOW_RETENTION_MAX_SESSIONS_PER_RUN = previous;
    }
  });

  it('a malformed cap falls back to the default instead of disabling the guardrail', async () => {
    // `Number('lots')` is NaN and `n > NaN` is false, so a typo in the
    // environment variable would have turned the circuit breaker OFF silently.
    const { maxSessionsPerRun, DEFAULT_MAX_SESSIONS_PER_RUN } = await import(
      '@/modules/shadow/compliance/retention'
    );
    const previous = process.env.SHADOW_RETENTION_MAX_SESSIONS_PER_RUN;
    try {
      process.env.SHADOW_RETENTION_MAX_SESSIONS_PER_RUN = 'lots';
      expect(maxSessionsPerRun()).toBe(DEFAULT_MAX_SESSIONS_PER_RUN);
      process.env.SHADOW_RETENTION_MAX_SESSIONS_PER_RUN = '-1';
      expect(maxSessionsPerRun()).toBe(DEFAULT_MAX_SESSIONS_PER_RUN);
      process.env.SHADOW_RETENTION_MAX_SESSIONS_PER_RUN = '0';
      expect(maxSessionsPerRun()).toBe(0);
    } finally {
      if (previous === undefined) delete process.env.SHADOW_RETENTION_MAX_SESSIONS_PER_RUN;
      else process.env.SHADOW_RETENTION_MAX_SESSIONS_PER_RUN = previous;
    }
  });

  it('reports every regulatory deletion at error severity, and stays silent on an ordinary night', async () => {
    const tenant = await createTenant();

    // An ordinary night: a session expires, nothing regulatory is touched.
    await agedSession(tenant, { endedDaysAgo: 400, receiptDaysAgo: 400 });
    await processRetentionCleanupJob(cleanupJob());

    expect(
      recorder.snapshot().counters.map((c) => c.fingerprint),
    ).not.toContain('shadow:retention:regulatory-deletion');

    // A 7-year-old receipt leaving the database is never silent.
    recorder.reset();
    await agedSession(tenant, { endedDaysAgo: 400, receiptDaysAgo: 2600 });
    const result = await processRetentionCleanupJob(cleanupJob());
    expect(result.consentReceiptsDeleted).toBe(1);

    const event = recorder
      .snapshot()
      .recent.find((e) => e.fingerprint === 'shadow:retention:regulatory-deletion');
    expect(event).toBeDefined();
    expect(event?.severity).toBe('error');
    expect(event?.context.consentReceiptsDeleted).toBe(1);
  });
});

// ===========================================================================
// 5. THE SCHEDULE ITSELF
// ===========================================================================

describe('the schedule', () => {
  it('registers exactly one nightly repeatable, however many times it is called', async () => {
    await removeRetentionSchedule();

    const first = await ensureRetentionSchedule('0 3 * * *');
    const second = await ensureRetentionSchedule('0 3 * * *');
    expect(first.cron).toBe('0 3 * * *');
    expect(second.replaced).toBe(false);

    const jobs = (await getShadowRetentionQueue().getRepeatableJobs()).filter(
      (j) => j.name === RETENTION_CLEANUP_JOB_NAME,
    );
    // N worker replicas booting must not produce N nightly deletion sweeps.
    expect(jobs).toHaveLength(1);
    expect(jobs[0].pattern).toBe('0 3 * * *');
  });

  it('replaces a repeatable when the pattern changes rather than running both', async () => {
    await removeRetentionSchedule();
    await ensureRetentionSchedule('0 3 * * *');
    const changed = await ensureRetentionSchedule('30 4 * * *');
    expect(changed.replaced).toBe(true);

    // The assertion that catches the bullmq-5 `job.id` trap: a filter on `id`
    // matches nothing, so BOTH patterns would be registered and the sweep would
    // run twice a night on two different schedules.
    const jobs = (await getShadowRetentionQueue().getRepeatableJobs()).filter(
      (j) => j.name === RETENTION_CLEANUP_JOB_NAME,
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0].pattern).toBe('30 4 * * *');

    await removeRetentionSchedule();
  });

  it('throws rather than sweeping when the job carries an unusable clock', async () => {
    // `now` exists for the tests. A malformed one must fail the job, not fall
    // back to `new Date()` -- silently sweeping against wall clock when the
    // caller asked for a specific instant is a destructive job doing something
    // other than what it was told.
    await expect(
      processRetentionCleanupJob({
        name: RETENTION_CLEANUP_JOB_NAME,
        data: { now: 'not-a-date' },
      } as Parameters<typeof processRetentionCleanupJob>[0]),
    ).rejects.toThrow(/unparseable/);
  });
});

// ===========================================================================
// 6. THE ERASURE ROUTES — the same rule, on the path that was already live
// ===========================================================================

describe('a user-requested erasure keeps the consent receipt and scrubs it', () => {
  it('POST /api/shadow/delete-all retains and scrubs rather than deleting', async () => {
    const tenant = await createTenant();
    const { session, message, receipt } = await agedSession(tenant, {
      endedDaysAgo: 1,
      receiptDaysAgo: 1,
    });

    const res = await deleteAllPOST(
      requestAs(tenant, '/api/shadow/delete-all', {
        method: 'POST',
        body: { confirmationToken: 'DELETE-ALL-MY-DATA' },
      }),
    );
    expect(res.status).toBe(200);

    const body = await readJson<
      Envelope<{
        deletedCounts: Record<string, number>;
        consentReceiptsRetained: boolean;
        notice: string;
      }>
    >(res);

    // The conversation is gone.
    expect(await db.shadowVoiceSession.findUnique({ where: { id: session.id } })).toBeNull();
    expect(await db.shadowMessage.findUnique({ where: { id: message.id } })).toBeNull();

    // The receipt is not. This route has been LIVE this whole time -- unlike
    // the retention cron, which had no caller -- so this is the deletion that
    // was actually destroying regulatory records in production.
    const after = await db.shadowConsentReceipt.findUnique({ where: { id: receipt.id } });
    expect(after).not.toBeNull();
    expect(after?.actionType).toBe('make_payment');
    expect(after?.actionDescription).toBe('Paid invoice INV-042 for $4,200');
    expect(after?.confirmationLevel).toBe('VOICE_PIN');

    // ...and the conversation content inside it IS gone, per Addition 9.3.
    expect(after?.reasoning).toBe(SCRUBBED_REASONING);
    expect(after?.reasoning).not.toContain('yes, pay it');
    expect(after?.messageId).toBeNull();
    expect(after?.sourcesCited).toEqual([]);

    // And the response says so, rather than telling the user everything went.
    expect(body.data.consentReceiptsRetained).toBe(true);
    expect(body.data.notice).toMatch(/retained for regulatory compliance/i);
    expect(body.data.deletedCounts.consentReceipts).toBe(0);
    expect(body.data.deletedCounts.consentReceiptsRetained).toBe(1);
  });

  it('POST /api/shadow/delete-session/[id] does the same for one conversation', async () => {
    const tenant = await createTenant();
    const { session, receipt } = await agedSession(tenant, {
      endedDaysAgo: 1,
      receiptDaysAgo: 1,
    });

    const res = await deleteSessionPOST(
      requestAs(tenant, `/api/shadow/delete-session/${session.id}`, { method: 'POST' }),
      { params: Promise.resolve({ id: session.id }) },
    );
    expect(res.status).toBe(200);

    expect(await db.shadowVoiceSession.findUnique({ where: { id: session.id } })).toBeNull();
    const after = await db.shadowConsentReceipt.findUnique({ where: { id: receipt.id } });
    expect(after).not.toBeNull();
    expect(after?.sessionId).toBeNull();
    expect(after?.reasoning).toBe(SCRUBBED_REASONING);
  });

  it('a detached receipt is still exportable under Article 15', async () => {
    // The failure this closes: `exportUserData` found receipts only through
    // `session: { userId }`. Retain-and-detach without this fix would have left
    // a record kept about a user that the user could no longer obtain -- the
    // worst of both articles.
    const tenant = await createTenant();
    const { session, receipt } = await agedSession(tenant, {
      endedDaysAgo: 1,
      receiptDaysAgo: 1,
    });

    await deleteSessionPOST(
      requestAs(tenant, `/api/shadow/delete-session/${session.id}`, { method: 'POST' }),
      { params: Promise.resolve({ id: session.id }) },
    );

    const res = await exportPOST(
      requestAs(tenant, '/api/shadow/export', { method: 'POST' }),
    );
    expect(res.status).toBe(200);
    const body = await readJson<
      Envelope<{
        data: { consentReceipts: Array<{ id: string; reasoning: string | null }> };
        format: string;
      }>
    >(res);

    const exported = body.data.data.consentReceipts.find((r) => r.id === receipt.id);
    expect(exported).toBeDefined();
    expect(exported?.reasoning).toBe(SCRUBBED_REASONING);
  });

  it('one tenant’s erasure does not touch another tenant’s receipts', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const mine = await agedSession(tenantA, { endedDaysAgo: 1, receiptDaysAgo: 1 });
    const theirs = await agedSession(tenantB, { endedDaysAgo: 1, receiptDaysAgo: 1 });

    await deleteAllPOST(
      requestAs(tenantA, '/api/shadow/delete-all', {
        method: 'POST',
        body: { confirmationToken: 'DELETE-ALL-MY-DATA' },
      }),
    );

    expect(
      await db.shadowVoiceSession.findUnique({ where: { id: theirs.session.id } }),
    ).not.toBeNull();
    const theirReceipt = await db.shadowConsentReceipt.findUnique({
      where: { id: theirs.receipt.id },
    });
    expect(theirReceipt?.reasoning).toBe('User said "yes, pay it" on the phone');

    const myReceipt = await db.shadowConsentReceipt.findUnique({
      where: { id: mine.receipt.id },
    });
    expect(myReceipt?.reasoning).toBe(SCRUBBED_REASONING);
  });
});
