// ============================================================================
// The Shadow retention cron — queue, schedule and consumer
// ============================================================================
//
// P-17 (Sprint 6), issue #25: "retention policies + nightly cleanup cron".
//
// ---------------------------------------------------------------------------
// THIS IS THE THING THE HAZARD NOTE WAS ABOUT
// ---------------------------------------------------------------------------
//
// `PARALLEL_BUILD.md` opens its HAZARD section with: `runRetentionCleanup()`
// has no caller anywhere in `src/`, the deletion path is latent, and the cron
// is "precisely the thing that makes it live — so the sprint's deliverable is
// what converts a dormant bug into nightly data loss".
//
// This file is that cron. It may only exist because
// `src/modules/shadow/compliance/retention.ts` no longer deletes a consent
// receipt or an auth event as a child of a session, gives each its own 7-year
// clock, applies each entity's configured periods instead of loading them and
// ignoring them, refuses a run that would delete more sessions than the cap,
// and reports anything notable through P-28's recorder. Read that file's header
// before changing this one. If the ordering ever inverts — a schedule landing
// before the policy is safe — the right move is to delete this file, not to
// soften that one.
//
// ---------------------------------------------------------------------------
// IT IS THE EXISTING SCHEDULER, NOT A SECOND ONE
// ---------------------------------------------------------------------------
//
// Same shape as P-16's `shadow-proactive.ts`, for the reasons stated there:
// BullMQ repeat, the same `getRedisUrl()` connection, a worker in the same
// `createAllWorkers()` list that `scripts/worker.ts` starts, and a SEPARATE
// queue rather than another job name on `workflow-cron` (whose consumer throws
// on any job it does not recognise, and a throw in BullMQ is a retry with
// backoff).
//
// ---------------------------------------------------------------------------
// WHY THERE IS NO `POST /api/shadow/retention/run`
// ---------------------------------------------------------------------------
//
// P-16 added an on-demand route beside its sweep, and was right to: a proactive
// briefing is per-user, non-destructive, and otherwise unobservable until
// tomorrow morning. This job is global and destructive. A route that lets any
// authenticated owner trigger a platform-wide deletion sweep is a liability
// that buys nothing a test cannot get from `processRetentionCleanupJob` — the
// exact function the worker runs, which `tests/db/shadow-retention.test.ts`
// calls with a real `Job`-shaped argument.

import { Queue, Worker, type Job } from 'bullmq';

import { getRedisUrl } from './connection';
import {
  retentionService,
  type RetentionCleanupResult,
} from '@/modules/shadow/compliance/retention';

export const SHADOW_RETENTION_QUEUE_NAME = 'shadow-retention';
export const RETENTION_CLEANUP_JOB_NAME = 'retention-cleanup';

/**
 * The fixed id of the one repeatable.
 *
 * It is still passed as `jobId` so BullMQ keys the repeat by it and N replicas
 * registering produce one repeat. It is NOT what this module matches on when
 * reading the repeats back -- see `isOurRepeat`.
 */
const RETENTION_CLEANUP_JOB_ID = 'shadow-retention-cleanup';

/**
 * Is this repeat entry ours?
 *
 * Matched on `name`, NOT on `id`, and that is load-bearing. On bullmq 5.81
 * `getRepeatableJobs()` returns entries shaped
 *
 *     { key, name, endDate, tz, pattern, every, next }
 *
 * with NO `id` field at all -- the repeat key is hashed, so BullMQ cannot parse
 * the job id back out of it. Code that filters `if (job.id !== SOME_ID)
 * continue` therefore skips EVERY entry, which means:
 *
 *   - a pattern change leaves the OLD repeat in place and adds the new one, so
 *     both fire -- the exact failure `ensureRetentionSchedule`'s comment below
 *     says it prevents; and
 *   - the corresponding `remove...Schedule()` removes nothing and returns 0
 *     while reporting success.
 *
 * `src/lib/queue/shadow-proactive.ts` (P-16) and
 * `src/lib/queue/scheduler.ts` (P-09/P-11) both still filter on `job.id`. They
 * are outside this package's scope and are reported in the P-17 findings;
 * `unregisterCronTrigger` is the serious one, because it is what is supposed to
 * cancel a workflow's schedule when the workflow is paused or deleted.
 *
 * `name` is a sufficient discriminator here because this queue carries exactly
 * one job name.
 */
function isOurRepeat(job: { name?: string | null }): boolean {
  return job.name === RETENTION_CLEANUP_JOB_NAME;
}

/**
 * When the sweep runs. 03:00 daily by default — the hour named in
 * `retention.ts`'s original docstring, kept so the documented behaviour and the
 * actual schedule are the same statement.
 *
 * Nightly rather than hourly on purpose: every threshold in the policy is
 * measured in days, so running more often does the same scan to delete the same
 * rows a few hours earlier.
 */
export const RETENTION_CLEANUP_CRON = process.env.SHADOW_RETENTION_CRON ?? '0 3 * * *';

let retentionQueue: Queue | null = null;

export function getShadowRetentionQueue(): Queue {
  if (!retentionQueue) {
    retentionQueue = new Queue(SHADOW_RETENTION_QUEUE_NAME, {
      connection: { url: getRedisUrl() },
    });
  }
  return retentionQueue;
}

export interface RetentionScheduleResult {
  cron: string;
  /** True when a previous repeat (a different pattern) was removed first. */
  replaced: boolean;
}

/**
 * Make Redis hold exactly one retention repeat, on the current pattern.
 *
 * Idempotent: the job id is fixed, so N worker replicas registering it produce
 * one repeatable, not N — which for a destructive job is not a tidiness point.
 * A changed pattern removes the old repeat first, because BullMQ keys a
 * repeatable by pattern as well as by id and without the removal BOTH schedules
 * keep firing.
 */
export async function ensureRetentionSchedule(
  cron: string = RETENTION_CLEANUP_CRON,
): Promise<RetentionScheduleResult> {
  const queue = getShadowRetentionQueue();

  let replaced = false;
  for (const job of await queue.getRepeatableJobs()) {
    if (!isOurRepeat(job)) continue;
    if (job.pattern === cron) continue;
    await queue.removeRepeatableByKey(job.key);
    replaced = true;
  }

  await queue.add(
    RETENTION_CLEANUP_JOB_NAME,
    {},
    { repeat: { pattern: cron }, jobId: RETENTION_CLEANUP_JOB_ID },
  );

  return { cron, replaced };
}

/** Remove the retention repeat. Used by tests and by an operator turning it off. */
export async function removeRetentionSchedule(): Promise<number> {
  const queue = getShadowRetentionQueue();
  let removed = 0;
  for (const job of await queue.getRepeatableJobs()) {
    if (!isOurRepeat(job)) continue;
    await queue.removeRepeatableByKey(job.key);
    removed += 1;
  }
  return removed;
}

/**
 * One nightly sweep.
 *
 * Exported so a test can drive the exact function the worker runs rather than a
 * hand-rolled equivalent that happens to agree with it. The full
 * `RetentionCleanupResult` is returned so it lands in the BullMQ job result:
 * "last night deleted 0 consent receipts and preserved 812" is then readable
 * from job inspection without querying Postgres.
 *
 * `now` is passed through from the job payload when present. It exists for the
 * tests, which have to age a fixture past a 365-day threshold without waiting;
 * the schedule never supplies it, so a production tick always uses wall clock.
 */
export async function processRetentionCleanupJob(
  job: Job<{ now?: string }>,
): Promise<RetentionCleanupResult> {
  const rawNow = job.data?.now;
  const now = rawNow ? new Date(rawNow) : new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Error(`shadow-retention: job carried an unparseable "now": ${String(rawNow)}`);
  }
  return retentionService.runRetentionCleanup(now);
}

/**
 * The consumer for the `shadow-retention` queue.
 *
 * Concurrency 1, and not negotiable: two overlapping sweeps would both select
 * the same expired sessions, and the second would then delete rows the first
 * had already taken — harmless in outcome but it makes every count in the job
 * result a lie, which for a deletion job is the number an auditor reads.
 */
export function createShadowRetentionWorker(options?: { concurrency?: number }): Worker {
  const worker = new Worker(
    SHADOW_RETENTION_QUEUE_NAME,
    async (job: Job) => {
      if (job.name !== RETENTION_CLEANUP_JOB_NAME) {
        throw new Error(`Unknown shadow-retention job: ${job.name}`);
      }
      return processRetentionCleanupJob(job as Job<{ now?: string }>);
    },
    {
      connection: { url: getRedisUrl() },
      concurrency: options?.concurrency ?? 1,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[shadow-retention] ${job?.id ?? 'unknown'} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[shadow-retention] Worker error:', err.message);
  });

  return worker;
}
