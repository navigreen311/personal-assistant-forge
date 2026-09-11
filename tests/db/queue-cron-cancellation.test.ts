/**
 * P-41 — A CRON SCHEDULE CAN BE CANCELLED, AND A PATTERN CHANGE LEAVES ONE.
 *
 * ============================================================================
 * WHAT WAS WRONG
 * ============================================================================
 *
 * On bullmq 5.81 `Queue.getRepeatableJobs()` returns entries shaped
 *
 *     { key, name, endDate, tz, pattern, every, next }
 *
 * with NO `id` field: the repeat key is an md5 hash of the job name and repeat
 * options, and BullMQ cannot parse a job id back out of it. Two modules
 * filtered those entries with `if (job.id !== SOME_ID) continue`, which skips
 * EVERY entry:
 *
 *   - `src/lib/queue/scheduler.ts :: unregisterCronTrigger` removed nothing, so
 *     pausing or deleting an ACTIVE workflow left its repeat firing forever;
 *     `getScheduledWorkflows` parsed the same absent field and reported an
 *     empty list while the repeats kept firing.
 *   - `src/lib/queue/shadow-proactive.ts :: ensureProactiveSchedule` /
 *     `removeProactiveSchedule` left the old repeat in place on a pattern
 *     change and added the new one, so BOTH fired, and could not turn the sweep
 *     off at all.
 *
 * P-17 fixed the third instance (`shadow-retention.ts`) and reported these two.
 *
 * ============================================================================
 * WHAT THESE CASES ASSERT, AND WHY THAT IS THE RIGHT ASSERTION
 * ============================================================================
 *
 * Register, change the pattern, count the schedules. EXACTLY ONE.
 *
 * That shape is chosen because it is the observable harm. "removeX returned 1"
 * is a claim about the function; "Redis holds one schedule on the new pattern"
 * is a claim about the system, and it is the difference between a sweep that
 * runs every five minutes and a sweep that runs twice on two schedules. The old
 * code would have passed a test that only asserted `ensureProactiveSchedule`
 * resolved.
 *
 * Every count below is read back out of Redis with the queue's own API after
 * the production function has run. Nothing is mocked.
 *
 * Requires a real Redis.
 */

import { Queue } from 'bullmq';

import {
  registerCronTrigger,
  unregisterCronTrigger,
  syncCronTriggers,
  getScheduledWorkflows,
  getSchedulerQueue,
} from '@/lib/queue/scheduler';
import {
  ensureProactiveSchedule,
  removeProactiveSchedule,
  getShadowProactiveQueue,
  PROACTIVE_TICK_JOB_NAME,
} from '@/lib/queue/shadow-proactive';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Two ids that share a prefix, so a substring match would cross-match them. */
const WORKFLOW_A = 'clworkflowaaaa0000000001';
const WORKFLOW_B = 'clworkflowaaaa0000000002';

async function emptyBothQueues(): Promise<void> {
  for (const queue of [getSchedulerQueue(), getShadowProactiveQueue()]) {
    for (const entry of await queue.getJobSchedulers()) {
      if (entry) await queue.removeJobScheduler(entry.key);
    }
    await queue.obliterate({ force: true }).catch(() => undefined);
  }
}

/** Every schedule the queue holds, whatever shape registered it. */
async function scheduleCount(queue: Queue): Promise<number> {
  return (await queue.getJobSchedulers()).filter((entry) => Boolean(entry)).length;
}

async function patternsOf(queue: Queue): Promise<string[]> {
  return (await queue.getJobSchedulers())
    .filter((entry) => Boolean(entry))
    .map((entry) => entry.pattern ?? '')
    .sort();
}

beforeEach(async () => {
  await emptyBothQueues();
});

afterAll(async () => {
  await emptyBothQueues();
  await getSchedulerQueue().close();
  await getShadowProactiveQueue().close();
});

// ===========================================================================
// 1. `workflow-cron` — the serious one
// ===========================================================================

describe('scheduler.ts: a workflow cron schedule is cancellable', () => {
  it('registers one schedule, and a changed pattern leaves exactly one', async () => {
    await registerCronTrigger(WORKFLOW_A, '*/5 * * * *');
    expect(await scheduleCount(getSchedulerQueue())).toBe(1);

    // THE CASE THAT FAILS AGAINST THE OLD CODE. `add({ repeat })` keys a
    // repeatable by pattern as well as by id, so without a removal that
    // actually matches, this second call leaves the '*/5' schedule firing
    // alongside the '30 4' one. `upsertJobScheduler` replaces it.
    await registerCronTrigger(WORKFLOW_A, '30 4 * * *');

    expect(await scheduleCount(getSchedulerQueue())).toBe(1);
    expect(await patternsOf(getSchedulerQueue())).toEqual(['30 4 * * *']);
  });

  it('is idempotent: N worker replicas registering produce one schedule', async () => {
    await registerCronTrigger(WORKFLOW_A, '*/5 * * * *');
    await registerCronTrigger(WORKFLOW_A, '*/5 * * * *');
    await registerCronTrigger(WORKFLOW_A, '*/5 * * * *');

    expect(await scheduleCount(getSchedulerQueue())).toBe(1);
  });

  it('unregisters the schedule it registered, leaving nothing behind', async () => {
    await registerCronTrigger(WORKFLOW_A, '*/5 * * * *');
    await unregisterCronTrigger(WORKFLOW_A);

    expect(await scheduleCount(getSchedulerQueue())).toBe(0);
    expect(await getScheduledWorkflows()).toEqual([]);
  });

  it('cancels one workflow without cancelling another on the same queue', async () => {
    // The reason `shadow-retention`'s `job.name` fix could not be copied here:
    // `workflow-cron` carries ONE job name for every workflow, so matching on
    // the name would have made this case remove both.
    await registerCronTrigger(WORKFLOW_A, '*/5 * * * *');
    await registerCronTrigger(WORKFLOW_B, '0 3 * * *');
    expect(await scheduleCount(getSchedulerQueue())).toBe(2);

    await unregisterCronTrigger(WORKFLOW_A);

    const left = await getScheduledWorkflows();
    expect(left).toHaveLength(1);
    expect(left[0].workflowId).toBe(WORKFLOW_B);
    expect(left[0].cron).toBe('0 3 * * *');
  });

  it('handles several cron triggers on one workflow, and removes all of them', async () => {
    await registerCronTrigger(WORKFLOW_A, '*/5 * * * *', 0);
    await registerCronTrigger(WORKFLOW_A, '0 3 * * *', 1);
    await registerCronTrigger(WORKFLOW_B, '0 9 * * *', 0);

    const before = await getScheduledWorkflows();
    expect(before.filter((s) => s.workflowId === WORKFLOW_A)).toHaveLength(2);

    await unregisterCronTrigger(WORKFLOW_A);

    const after = await getScheduledWorkflows();
    expect(after.map((s) => s.workflowId)).toEqual([WORKFLOW_B]);
  });

  it('getScheduledWorkflows reports what Redis holds, not an empty list', async () => {
    await registerCronTrigger(WORKFLOW_A, '*/5 * * * *');

    // The old version parsed `workflowIdOfJob(job.id)`, and `job.id` is not a
    // field `getRepeatableJobs()` returns, so it reported `[]` for every
    // schedule that existed. An empty list is exactly what a caller sees when
    // nothing is scheduled, so the lie was invisible.
    const scheduled = await getScheduledWorkflows();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].workflowId).toBe(WORKFLOW_A);
    expect(scheduled[0].cron).toBe('*/5 * * * *');
    expect(scheduled[0].nextRun instanceof Date).toBe(true);
  });

  it('cancels a LEGACY hash-keyed repeat left by a running deployment', async () => {
    // What `registerCronTrigger` used to write: `add(name, data, { repeat,
    // jobId })`, whose repeat key is `md5(...)`. A deployment upgrading to this
    // fix is holding these, and if they were not cancellable the fix would only
    // help schedules registered after the deploy -- which is not what "a
    // schedule that can never be cancelled is a resource leak" asks for.
    const queue = getSchedulerQueue();
    await queue.add(
      'cron-trigger',
      { workflowId: WORKFLOW_A },
      { repeat: { pattern: '*/5 * * * *' }, jobId: `cron-${WORKFLOW_A}-0` },
    );
    await queue.add(
      'cron-trigger',
      { workflowId: WORKFLOW_B },
      { repeat: { pattern: '0 3 * * *' }, jobId: `cron-${WORKFLOW_B}-0` },
    );

    // The keys really are hashes -- the premise of the whole bug.
    const keys = (await queue.getRepeatableJobs()).map((job) => job.key);
    expect(keys.every((key) => /^[0-9a-f]{32}$/.test(key))).toBe(true);
    expect((await queue.getRepeatableJobs()).every((job) => job.id === undefined)).toBe(true);

    await unregisterCronTrigger(WORKFLOW_A);

    // A's legacy repeat is gone; B's is untouched, attributed through its own
    // pending delayed job rather than through a key that cannot be parsed.
    const left = await getScheduledWorkflows();
    expect(left).toHaveLength(1);
    expect(left[0].workflowId).toBe(WORKFLOW_B);
  });

  it('syncCronTriggers moves a workflow from two schedules to one', async () => {
    const twoTriggers = [
      { type: 'TIME', config: { triggerType: 'TIME', cronExpression: '*/5 * * * *' } },
      { type: 'TIME', config: { triggerType: 'TIME', cronExpression: '0 3 * * *' } },
    ];
    const oneTrigger = [
      { type: 'TIME', config: { triggerType: 'TIME', cronExpression: '0 9 * * *' } },
    ];

    await syncCronTriggers(WORKFLOW_A, twoTriggers, 'ACTIVE');
    expect(await scheduleCount(getSchedulerQueue())).toBe(2);

    const result = await syncCronTriggers(WORKFLOW_A, oneTrigger, 'ACTIVE', twoTriggers);
    expect(result.registered).toEqual(['0 9 * * *']);

    expect(await scheduleCount(getSchedulerQueue())).toBe(1);
    expect(await patternsOf(getSchedulerQueue())).toEqual(['0 9 * * *']);
  });

  it('pausing a workflow removes its schedule entirely', async () => {
    const triggers = [
      { type: 'TIME', config: { triggerType: 'TIME', cronExpression: '*/5 * * * *' } },
    ];

    await syncCronTriggers(WORKFLOW_A, triggers, 'ACTIVE');
    expect(await scheduleCount(getSchedulerQueue())).toBe(1);

    // This is the sentence from the escalation: "Pausing or deleting an ACTIVE
    // workflow leaves its repeat firing forever."
    const paused = await syncCronTriggers(WORKFLOW_A, triggers, 'PAUSED', triggers);
    expect(paused.cleared).toBe(true);
    expect(await scheduleCount(getSchedulerQueue())).toBe(0);
  });
});

// ===========================================================================
// 2. `shadow-proactive` — the second site P-17 named
// ===========================================================================

describe('shadow-proactive.ts: the proactive sweep schedule is cancellable', () => {
  it('registers exactly one repeat, however many times it is called', async () => {
    const first = await ensureProactiveSchedule('*/5 * * * *');
    const second = await ensureProactiveSchedule('*/5 * * * *');

    expect(first.cron).toBe('*/5 * * * *');
    expect(second.replaced).toBe(false);

    const jobs = (await getShadowProactiveQueue().getRepeatableJobs()).filter(
      (job) => job.name === PROACTIVE_TICK_JOB_NAME,
    );
    expect(jobs).toHaveLength(1);
  });

  it('replaces the repeat when the pattern changes rather than running both', async () => {
    await ensureProactiveSchedule('*/5 * * * *');
    const changed = await ensureProactiveSchedule('*/15 * * * *');

    // `replaced` was FALSE against the old code, because the `job.id` filter
    // matched nothing to remove -- and the two schedules then both fired,
    // which is "I changed the interval and it got twice as chatty".
    expect(changed.replaced).toBe(true);

    const jobs = (await getShadowProactiveQueue().getRepeatableJobs()).filter(
      (job) => job.name === PROACTIVE_TICK_JOB_NAME,
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0].pattern).toBe('*/15 * * * *');
  });

  it('removeProactiveSchedule removes the repeat and reports how many', async () => {
    await ensureProactiveSchedule('*/5 * * * *');

    // Returned 0 and removed nothing before, while reporting success.
    expect(await removeProactiveSchedule()).toBe(1);

    const jobs = (await getShadowProactiveQueue().getRepeatableJobs()).filter(
      (job) => job.name === PROACTIVE_TICK_JOB_NAME,
    );
    expect(jobs).toHaveLength(0);

    // And it is honest about a second call, so an operator can tell the
    // difference between "turned it off" and "it was already off".
    expect(await removeProactiveSchedule()).toBe(0);
  });

  it('the entries it filters really do carry no id (the premise of the bug)', async () => {
    await ensureProactiveSchedule('*/5 * * * *');

    const jobs = await getShadowProactiveQueue().getRepeatableJobs();
    expect(jobs.length).toBeGreaterThan(0);
    // If a future bullmq starts returning `id`, this case fails and whoever
    // sees it can simplify the match back. Until then, `id` is absent and
    // matching on it is matching on undefined.
    expect(jobs.every((job) => job.id === undefined)).toBe(true);
    expect(jobs.every((job) => job.name === PROACTIVE_TICK_JOB_NAME)).toBe(true);
  });
});
