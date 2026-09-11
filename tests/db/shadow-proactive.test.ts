/**
 * P-16 (Sprint 5) — THE PROACTIVE TICK, DRIVEN THROUGH ITS REAL ENTRY POINTS.
 *
 * ============================================================================
 * WHAT THIS FILE IS FOR
 * ============================================================================
 *
 * Every service exercised below already existed, was already correct, already
 * had unit tests, and HAD NO CALLER. `tests/unit/shadow/proactive.test.ts` has
 * 68 passing tests over the same five classes and could not have detected that
 * nothing in the platform ever invoked any of them — it constructs the class
 * itself. That is the codebase's second failure mode, the one
 * `docs/parallel-build/decision-02-throttle.md` says nothing catches:
 *
 *     a module that is imported and whose functions nobody calls
 *
 * So every test here goes through an entry point a user or a cron actually
 * reaches — a route handler called with a real session cookie, or the exact
 * BullMQ job function `createShadowProactiveWorker` runs — and asserts a row in
 * Postgres afterwards. A test that calls `notificationEscalator.escalate()`
 * directly would pass equally well against the unreachable version, which is
 * precisely what it must not do.
 *
 * ============================================================================
 * THE ONE PLACE A SERVICE IS CALLED DIRECTLY, AND WHY IT IS NOT A CHEAT
 * ============================================================================
 *
 * `runProactiveTick` is called through `processProactiveTickJob` — the function
 * the worker's job handler calls, with a real `Job`-shaped argument — rather
 * than by starting a Worker and waiting for a repeat to fire. Waiting on a
 * five-minute cron pattern is not a test. `queue-worker.test.ts` already proves
 * the complementary half for this queue's siblings: that `createAllWorkers()`
 * starts a consumer for every queue the platform enqueues into. The assertion
 * that `shadow-proactive` is in that list is below.
 *
 * Requires a real Postgres and a real Redis.
 */

import { db, setupTestDatabase } from '../helpers/db';
import { createTenant, createTwoTenants, type Tenant } from '../helpers/factories';
import { readJson, requestAs } from '../helpers/session';

import { GET as outreachGET } from '@/app/api/shadow/outreach/route';
import { POST as ackPOST } from '@/app/api/shadow/outreach/[id]/ack/route';
import { POST as proactiveRunPOST } from '@/app/api/shadow/proactive/run/route';
import { GET as summaryGET } from '@/app/api/shadow/summary/route';
import { POST as summaryDeliverPOST } from '@/app/api/shadow/summary/deliver/route';
import { GET as channelEffectivenessGET } from '@/app/api/shadow/analytics/channel-effectiveness/route';
import { POST as triggersPOST } from '@/app/api/shadow/triggers/route';

import {
  processProactiveTickJob,
  getShadowProactiveQueue,
  SHADOW_PROACTIVE_QUEUE_NAME,
  PROACTIVE_TICK_JOB_NAME,
} from '@/lib/queue/shadow-proactive';
import { createAllWorkers } from '../../scripts/worker';
import { notificationEscalator } from '@/modules/shadow/proactive/notification-escalator';

setupTestDatabase();

afterAll(async () => {
  // Nothing in this file enqueues, but importing the module is enough for a
  // later change to open the queue's connection; closing it is cheap and keeps
  // the "did not exit" warning from reappearing on someone else's shift.
  await getShadowProactiveQueue().close();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Envelope<T> = { success: boolean; data: T };

/** The exact argument the worker's handler receives, minus BullMQ's methods. */
function tickJob(userIds?: string[]) {
  return { name: PROACTIVE_TICK_JOB_NAME, data: userIds ? { userIds } : {} } as Parameters<
    typeof processProactiveTickJob
  >[0];
}

/** A proactive config whose briefing is due at the given local time. */
async function configureBriefing(
  tenant: Tenant,
  overrides: Partial<{
    briefingEnabled: boolean;
    briefingTime: string;
    briefingChannel: string;
    quietHoursStart: string;
    quietHoursEnd: string;
    callWindowStart: string;
    callWindowEnd: string;
    cooldownMinutes: number;
    maxCallsPerDay: number;
    maxCallsPerHour: number;
    digestEnabled: boolean;
    digestTime: string | null;
  }> = {}
) {
  return db.shadowProactiveConfig.upsert({
    where: { userId: tenant.user.id },
    create: { userId: tenant.user.id, ...overrides },
    update: overrides,
  });
}

/**
 * Pin the user's clock so "is it briefing time" is a property of the fixture
 * and not of when the suite happens to run.
 *
 * `Etc/GMT` is an IANA zone with a fixed zero offset and no DST, so `08:00 UTC`
 * is 08:00 for this user in March and in November alike. A test whose meaning
 * changes twice a year is a test that will be quarantined twice a year.
 */
async function pinTimezone(tenant: Tenant, timezone = 'Etc/GMT'): Promise<void> {
  await db.user.update({ where: { id: tenant.user.id }, data: { timezone } });
}

/**
 * The current time as `HH:MM` in `Etc/GMT`.
 *
 * `processProactiveTickJob` takes no clock -- it is the worker's entry point and
 * the worker reads the wall clock -- so a test that wants a delivery to be DUE
 * configures the schedule for now rather than freezing time. That keeps the
 * grace window in the assertion path instead of stubbing it out, which is the
 * point: the tests below that expect NO delivery set a time outside it.
 */
function nowHHMM(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Etc/GMT',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

/** Today at the given UTC hour/minute — used as the injected sweep clock. */
function todayAtUtc(hour: number, minute = 0): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute, 0, 0)
  );
}

// ===========================================================================
// DELIVERABLE 1 + 2 + 3 — the cron exists, is consumed, and delivers
// ===========================================================================

describe('the shadow-proactive cron is a real consumer, not a repeat into nothing', () => {
  it('is in the set of workers the container starts', async () => {
    // P-11's finding, generalised: `registerCronTrigger` had been adding
    // repeatable jobs to a queue nothing read. A repeat with no consumer fires
    // on time, forever, into nothing. `createAllWorkers()` is what
    // `scripts/worker.ts` starts and what the Dockerfile's worker stage runs,
    // so membership in it is the whole difference.
    const workers = createAllWorkers();
    const names = workers.map((w) => w.name);

    try {
      expect(names).toContain(SHADOW_PROACTIVE_QUEUE_NAME);
    } finally {
      // Close them, or Jest holds a Redis connection per worker open for the
      // rest of the file and reports "did not exit one second after the run".
      await Promise.all(workers.map((w) => w.worker.close()));
    }
  });

  it('delivers the morning briefing at the configured time, through the job the worker runs', async () => {
    const tenant = await createTenant();
    await pinTimezone(tenant);
    await configureBriefing(tenant, { briefingEnabled: true, briefingTime: nowHHMM() });

    // Before: nothing. This is the state the platform was permanently in —
    // `deliverBriefing` existed and only a human pressing a button reached it.
    expect(await db.notification.count({ where: { userId: tenant.user.id } })).toBe(0);

    const result = await processProactiveTickJob(tickJob([tenant.user.id]));

    expect(result.briefingsDelivered).toBe(1);
    expect(result.errors).toEqual([]);

    const notifications = await db.notification.findMany({
      where: { userId: tenant.user.id },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toBe('Morning Briefing');

    const outreach = await db.shadowOutreach.findMany({
      where: { userId: tenant.user.id, triggerType: 'morning_briefing' },
    });
    expect(outreach).toHaveLength(1);
    expect(outreach[0].status).toBe('delivered');
  });

  it('delivers exactly once a day however many times the tick runs', async () => {
    // Idempotence is a query over the durable rows, not a flag. Three ticks —
    // which is also what two worker replicas plus a restart looks like.
    const tenant = await createTenant();
    await pinTimezone(tenant);
    await configureBriefing(tenant, { briefingEnabled: true, briefingTime: nowHHMM() });

    await processProactiveTickJob(tickJob([tenant.user.id]));
    await processProactiveTickJob(tickJob([tenant.user.id]));
    await processProactiveTickJob(tickJob([tenant.user.id]));

    expect(
      await db.shadowOutreach.count({
        where: { userId: tenant.user.id, triggerType: 'morning_briefing' },
      })
    ).toBe(1);
    expect(await db.notification.count({ where: { userId: tenant.user.id } })).toBe(1);
  });

  it('does not deliver a briefing to a user who has switched it off', async () => {
    const tenant = await createTenant();
    await pinTimezone(tenant);
    await configureBriefing(tenant, { briefingEnabled: false, briefingTime: nowHHMM() });

    const result = await processProactiveTickJob(tickJob([tenant.user.id]));

    expect(result.briefingsDelivered).toBe(0);
    expect(await db.notification.count({ where: { userId: tenant.user.id } })).toBe(0);
  });

  it('delivers the end-of-day summary at the configured time and only when enabled', async () => {
    const tenant = await createTenant();
    await pinTimezone(tenant);
    await configureBriefing(tenant, { briefingEnabled: false });

    // The settings page stores the end-of-day block in this ShadowPreference
    // row. Before P-16 all four keys were write-only.
    await db.shadowPreference.create({
      data: {
        userId: tenant.user.id,
        preferenceKey: 'proactive',
        preferenceValue: JSON.stringify({
          endOfDayEnabled: true,
          endOfDayTime: nowHHMM(),
          endOfDayChannel: 'in_app',
        }),
      },
    });

    const result = await processProactiveTickJob(tickJob([tenant.user.id]));

    expect(result.endOfDaySummariesDelivered).toBe(1);

    const outreach = await db.shadowOutreach.findMany({
      where: { userId: tenant.user.id, triggerType: 'eod_summary' },
    });
    expect(outreach).toHaveLength(1);

    const notification = await db.notification.findFirst({
      where: { userId: tenant.user.id, title: 'End-of-Day Summary' },
    });
    expect(notification).not.toBeNull();
  });

  it('leaves the end-of-day summary alone when the preference says disabled', async () => {
    const tenant = await createTenant();
    await pinTimezone(tenant);
    await db.shadowPreference.create({
      data: {
        userId: tenant.user.id,
        preferenceKey: 'proactive',
        preferenceValue: JSON.stringify({ endOfDayEnabled: false, endOfDayTime: nowHHMM() }),
      },
    });

    const result = await processProactiveTickJob(tickJob([tenant.user.id]));

    expect(result.endOfDaySummariesDelivered).toBe(0);
    expect(
      await db.shadowOutreach.count({
        where: { userId: tenant.user.id, triggerType: 'eod_summary' },
      })
    ).toBe(0);
  });
});

// ===========================================================================
// DELIVERABLE 3 — the end-of-day summary through its HTTP entry points
// ===========================================================================

describe('POST /api/shadow/summary/deliver', () => {
  it('generates a summary from real rows and lands both durable rows', async () => {
    const tenant = await createTenant();

    await db.task.createMany({
      data: [
        { title: 'shipped it', entityId: tenant.entity.id, status: 'DONE' },
        { title: 'still open', entityId: tenant.entity.id, status: 'TODO' },
      ],
    });

    const preview = await summaryGET(requestAs(tenant, '/api/shadow/summary'));
    expect(preview.status).toBe(200);
    const previewBody = await readJson<Envelope<{ tasks: { closedToday: number } }>>(preview);
    expect(previewBody.data.tasks.closedToday).toBe(1);

    // A preview is a read. It must not have delivered anything.
    expect(await db.notification.count({ where: { userId: tenant.user.id } })).toBe(0);

    const res = await summaryDeliverPOST(
      requestAs(tenant, '/api/shadow/summary/deliver', { method: 'POST', body: {} })
    );
    expect(res.status).toBe(201);

    const outreach = await db.shadowOutreach.findMany({
      where: { userId: tenant.user.id, triggerType: 'eod_summary' },
    });
    expect(outreach).toHaveLength(1);
    expect(outreach[0].content).toContain('closed 1 task today');
  });

  it('counts only the calling tenant rows', async () => {
    const { tenantA, tenantB } = await createTwoTenants();

    await db.task.createMany({
      data: [
        { title: 'A closed this', entityId: tenantA.entity.id, status: 'DONE' },
        { title: 'B closed this', entityId: tenantB.entity.id, status: 'DONE' },
        { title: 'B closed this too', entityId: tenantB.entity.id, status: 'DONE' },
      ],
    });

    const res = await summaryGET(requestAs(tenantA, '/api/shadow/summary'));
    const body = await readJson<Envelope<{ tasks: { closedToday: number } }>>(res);

    expect(body.data.tasks.closedToday).toBe(1);
  });
});

// ===========================================================================
// DELIVERABLE 1 + 4 — trigger engine into the escalation ladder
// ===========================================================================

describe('the trigger engine evaluates stored triggers and starts an escalation', () => {
  it('turns a ShadowTrigger row created through the API into an escalation', async () => {
    const tenant = await createTenant();
    await pinTimezone(tenant);
    await configureBriefing(tenant, {
      briefingEnabled: false,
      quietHoursStart: '23:59',
      quietHoursEnd: '00:00',
      callWindowStart: '00:00',
      callWindowEnd: '23:59',
      cooldownMinutes: 0,
    });

    // The trigger is created the way a user creates one. Before P-16 this row
    // was read by nothing: `POST /api/shadow/triggers` stored it and
    // `evaluateTriggers` — its only reader — had no caller.
    const created = await triggersPOST(
      requestAs(tenant, '/api/shadow/triggers', {
        method: 'POST',
        body: {
          triggerName: 'Overdue work',
          triggerType: 'overdue_task',
          conditions: { minOverdue: 1 },
          action: {},
          cooldownMinutes: 0,
        },
      })
    );
    expect(created.status).toBe(201);

    // A condition the trigger will actually find.
    await db.task.create({
      data: {
        title: 'late',
        entityId: tenant.entity.id,
        status: 'TODO',
        dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
    });

    const result = await processProactiveTickJob(tickJob([tenant.user.id]));

    expect(result.triggersFired).toBe(1);
    expect(result.escalationsStarted).toBe(1);

    const outreach = await db.shadowOutreach.findMany({
      where: { userId: tenant.user.id, triggerType: 'overdue_task' },
    });
    expect(outreach).toHaveLength(1);
    expect(outreach[0].status).toBe('pending');
    // Rung one of the v2 Part 9.3 ladder: in-app notification + push.
    expect(outreach[0].channel).toBe('in_app_push');
    expect(outreach[0].triggerEvent).toMatch(/^trigger:/);

    // Rung one is in-app, so it is also a notification the user can see.
    const alert = await db.notification.findFirst({
      where: { userId: tenant.user.id, type: 'alert' },
    });
    expect(alert).not.toBeNull();
    expect(alert?.title).toBe('Overdue work');
  });

  it('does not fire a trigger whose condition is not met', async () => {
    const tenant = await createTenant();
    await pinTimezone(tenant);

    await triggersPOST(
      requestAs(tenant, '/api/shadow/triggers', {
        method: 'POST',
        body: {
          triggerName: 'Overdue work',
          triggerType: 'overdue_task',
          conditions: { minOverdue: 1 },
          action: {},
        },
      })
    );

    // No overdue task exists.
    const result = await processProactiveTickJob(tickJob([tenant.user.id]));

    expect(result.triggersFired).toBe(0);
    expect(await db.shadowOutreach.count({ where: { userId: tenant.user.id } })).toBe(0);
  });

  it('respects the trigger cooldown across ticks', async () => {
    const tenant = await createTenant();
    await pinTimezone(tenant);
    await configureBriefing(tenant, { briefingEnabled: false, cooldownMinutes: 0 });

    await triggersPOST(
      requestAs(tenant, '/api/shadow/triggers', {
        method: 'POST',
        body: {
          triggerName: 'Overdue work',
          triggerType: 'overdue_task',
          conditions: { minOverdue: 1 },
          action: {},
          cooldownMinutes: 600,
        },
      })
    );

    await db.task.create({
      data: {
        title: 'late',
        entityId: tenant.entity.id,
        status: 'TODO',
        dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
    });

    const first = await processProactiveTickJob(tickJob([tenant.user.id]));
    const second = await processProactiveTickJob(tickJob([tenant.user.id]));

    expect(first.triggersFired).toBe(1);
    expect(second.triggersFired).toBe(0);
  });
});

// ===========================================================================
// DELIVERABLE 4 — the anti-spam controls the settings page has always offered
// ===========================================================================

describe('ShadowProactiveConfig actually governs outreach', () => {
  /** A user with one trigger that will fire, and a controllable config. */
  async function tenantWithFiringTrigger(
    config: Parameters<typeof configureBriefing>[1]
  ): Promise<Tenant> {
    const tenant = await createTenant();
    await pinTimezone(tenant);
    await configureBriefing(tenant, { briefingEnabled: false, ...config });

    await db.shadowTrigger.create({
      data: {
        userId: tenant.user.id,
        triggerName: 'Overdue work',
        triggerType: 'overdue_task',
        conditions: { minOverdue: 1 },
        action: { channel: 'phone' },
        enabled: true,
        cooldownMinutes: 0,
      },
    });

    await db.task.create({
      data: {
        title: 'late',
        entityId: tenant.entity.id,
        status: 'TODO',
        dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
    });

    return tenant;
  }

  it('blocks a phone rung during quiet hours, and records WHY', async () => {
    // The claim Decision 2's amendment says was untrue until now: "every
    // anti-spam control the Shadow settings page offers is a stored preference
    // nothing reads."
    const tenant = await tenantWithFiringTrigger({
      quietHoursStart: '00:00',
      quietHoursEnd: '23:59',
      cooldownMinutes: 0,
    });

    // Rung one is in-app, which quiet hours do not gate. Put the ladder on rung
    // two — the phone rung — by recording rung one as already taken.
    const key = 'trigger:manual:quiet-hours';
    await db.shadowOutreach.create({
      data: {
        userId: tenant.user.id,
        triggerType: 'overdue_task',
        triggerEvent: key,
        channel: 'in_app_push',
        status: 'pending',
        content: '[P2] Overdue work: rung one',
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });

    await processProactiveTickJob(tickJob([tenant.user.id]));

    const rungTwo = await db.shadowOutreach.findFirst({
      where: { userId: tenant.user.id, triggerEvent: key, status: 'blocked' },
    });
    expect(rungTwo).not.toBeNull();
    expect(rungTwo?.content).toContain('Quiet hours');
  });

  it('blocks a phone rung once maxCallsPerDay is reached', async () => {
    const tenant = await tenantWithFiringTrigger({
      quietHoursStart: '23:58',
      quietHoursEnd: '23:59',
      callWindowStart: '00:00',
      callWindowEnd: '23:57',
      cooldownMinutes: 0,
      maxCallsPerDay: 1,
      maxCallsPerHour: 5,
    });

    const key = 'trigger:manual:daily-cap';
    await db.shadowOutreach.createMany({
      data: [
        // One phone call already made today: the cap.
        {
          userId: tenant.user.id,
          triggerType: 'other',
          channel: 'phone_sms',
          status: 'pending',
          content: 'earlier call',
        },
        {
          userId: tenant.user.id,
          triggerType: 'overdue_task',
          triggerEvent: key,
          channel: 'in_app_push',
          status: 'pending',
          content: '[P2] Overdue work: rung one',
          createdAt: new Date(Date.now() - 60 * 60 * 1000),
        },
      ],
    });

    await processProactiveTickJob(tickJob([tenant.user.id]));

    const blocked = await db.shadowOutreach.findFirst({
      where: { userId: tenant.user.id, triggerEvent: key, status: 'blocked' },
    });
    expect(blocked?.content).toContain('Max calls per day reached');
  });

  it('counts a refused rung as spent, and drops the thread once the ladder runs out', async () => {
    // `escalate()` counts blocked rows toward the attempt number: a rung that
    // anti-spam refused has been spent. `listActiveEscalations` has to agree or
    // a notification whose phone rungs were all refused during quiet hours sits
    // in the "still climbing" list forever.
    const tenant = await tenantWithFiringTrigger({
      quietHoursStart: '00:00',
      quietHoursEnd: '23:59',
      cooldownMinutes: 0,
    });

    const key = 'trigger:manual:spent';
    const old = new Date(Date.now() - 60 * 60 * 1000);
    await db.shadowOutreach.createMany({
      data: [
        {
          userId: tenant.user.id,
          triggerType: 'overdue_task',
          triggerEvent: key,
          channel: 'in_app_push',
          status: 'pending',
          content: '[P2] Overdue work: rung one',
          createdAt: old,
        },
        ...['phone_sms', 'sms_action_links', 'phone_call_2'].map((channel) => ({
          userId: tenant.user.id,
          triggerType: 'overdue_task',
          triggerEvent: key,
          channel,
          status: 'blocked',
          content: '[ANTI-SPAM] Quiet hours active: Overdue work',
          createdAt: old,
        })),
      ],
    });

    const active = await notificationEscalator.listActiveEscalations(tenant.user.id);
    const thread = active.find((e) => e.notificationId === key);
    expect(thread?.attempts).toBe(4);

    // Rung five is the phone tree and this is a P2, so the ladder is out of
    // rungs. The tick must not write anything more for this notification.
    const before = await db.shadowOutreach.count({
      where: { userId: tenant.user.id, triggerEvent: key },
    });
    await processProactiveTickJob(tickJob([tenant.user.id]));
    expect(
      await db.shadowOutreach.count({ where: { userId: tenant.user.id, triggerEvent: key } })
    ).toBe(before);
  });

  it('does not advance a rung before its wait has elapsed', async () => {
    // The ladder's `waitMinutes` were declared and never read. Without
    // `dueForNextStep`, a five-rung ladder becomes five notifications on five
    // consecutive ticks — twenty-five minutes, not fifty.
    const tenant = await tenantWithFiringTrigger({ cooldownMinutes: 0 });

    const key = 'trigger:manual:too-soon';
    await db.shadowOutreach.create({
      data: {
        userId: tenant.user.id,
        triggerType: 'overdue_task',
        triggerEvent: key,
        channel: 'in_app_push',
        status: 'pending',
        content: '[P2] Overdue work: rung one',
        // Rung one waits five minutes. This one is one minute old.
        createdAt: new Date(Date.now() - 60 * 1000),
      },
    });

    await processProactiveTickJob(tickJob([tenant.user.id]));

    expect(
      await db.shadowOutreach.count({
        where: { userId: tenant.user.id, triggerEvent: key },
      })
    ).toBe(1);
  });
});

// ===========================================================================
// DELIVERABLE 4 + 5 — acknowledgement stops the ladder AND teaches the channel
// ===========================================================================

describe('acknowledging outreach', () => {
  async function seedRungOne(tenant: Tenant, key = 'trigger:ack:1') {
    return db.shadowOutreach.create({
      data: {
        userId: tenant.user.id,
        triggerType: 'overdue_task',
        triggerEvent: key,
        channel: 'in_app_push',
        status: 'pending',
        content: '[P2] Overdue work: rung one',
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });
  }

  it('marks the row acknowledged and stops the ladder advancing', async () => {
    // `escalate()` has always refused to advance past an `acknowledged` row and
    // NOTHING COULD WRITE ONE. The stop condition was unreachable.
    const tenant = await createTenant();
    await pinTimezone(tenant);
    await configureBriefing(tenant, { briefingEnabled: false, cooldownMinutes: 0 });
    const row = await seedRungOne(tenant);

    const res = await ackPOST(
      requestAs(tenant, `/api/shadow/outreach/${row.id}/ack`, { method: 'POST', body: {} }),
      { params: Promise.resolve({ id: row.id }) }
    );
    expect(res.status).toBe(200);

    const after = await db.shadowOutreach.findUnique({ where: { id: row.id } });
    expect(after?.status).toBe('acknowledged');

    // And the sweep leaves it alone from here.
    await processProactiveTickJob(tickJob([tenant.user.id]));
    expect(
      await db.shadowOutreach.count({
        where: { userId: tenant.user.id, triggerEvent: 'trigger:ack:1' },
      })
    ).toBe(1);
  });

  it('records the response against the channel, which nothing wrote before', async () => {
    // `ShadowChannelEffectiveness` had a reader and a deleter and no writer at
    // all, so `GET /api/shadow/analytics/channel-effectiveness` could only ever
    // return its hard-coded DEFAULT_RATES placeholder.
    const tenant = await createTenant();
    const row = await seedRungOne(tenant, 'trigger:ack:2');

    const before = await channelEffectivenessGET(
      requestAs(tenant, '/api/shadow/analytics/channel-effectiveness')
    );
    const beforeBody = await readJson<Envelope<{ rates: Record<string, unknown> }>>(before);
    // The placeholder: four channels nobody has ever been contacted on.
    expect(Object.keys(beforeBody.data.rates).sort()).toEqual([
      'call',
      'in_app',
      'push',
      'sms',
    ]);
    expect(await db.shadowChannelEffectiveness.count()).toBe(0);

    await ackPOST(
      requestAs(tenant, `/api/shadow/outreach/${row.id}/ack`, { method: 'POST', body: {} }),
      { params: Promise.resolve({ id: row.id }) }
    );

    const stat = await db.shadowChannelEffectiveness.findFirst({
      where: { userId: tenant.user.id },
    });
    expect(stat).not.toBeNull();
    // The ladder rung is `in_app_push`; effectiveness is per MEDIUM.
    expect(stat?.channel).toBe('push');
    expect(stat?.triggerType).toBe('overdue_task');
    expect(stat?.responses).toBe(1);

    const after = await channelEffectivenessGET(
      requestAs(tenant, '/api/shadow/analytics/channel-effectiveness')
    );
    const afterBody = await readJson<Envelope<{ rates: Record<string, unknown> }>>(after);
    expect(Object.keys(afterBody.data.rates)).toEqual(['push']);
  });

  it('refuses another tenant outreach row indistinguishably from a missing one', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const row = await seedRungOne(tenantA, 'trigger:ack:3');

    const attack = await ackPOST(
      requestAs(tenantB, `/api/shadow/outreach/${row.id}/ack`, { method: 'POST', body: {} }),
      { params: Promise.resolve({ id: row.id }) }
    );
    const missing = await ackPOST(
      requestAs(tenantB, '/api/shadow/outreach/does-not-exist/ack', {
        method: 'POST',
        body: {},
      }),
      { params: Promise.resolve({ id: 'does-not-exist' }) }
    );

    expect(attack.status).toBe(404);
    expect(missing.status).toBe(404);
    // The error body only: the envelope carries a `meta.timestamp` that differs
    // by a millisecond between two sequential requests, and comparing it would
    // make the isolation assertion flaky for a reason unrelated to isolation.
    const attackBody = await readJson<{ error: unknown }>(attack);
    const missingBody = await readJson<{ error: unknown }>(missing);
    expect(attackBody.error).toEqual(missingBody.error);

    // And A's row is untouched.
    const after = await db.shadowOutreach.findUnique({ where: { id: row.id } });
    expect(after?.status).toBe('pending');
  });
});

// ===========================================================================
// DELIVERABLE 5 — the adaptive downgrade actually changes a channel
// ===========================================================================

describe('adaptive channel selection changes which rung is used', () => {
  it('downgrades the phone rung to SMS after three ignored calls', async () => {
    // v3 Addition 7.1: "IF user ignores 3+ calls in a row for non-P0 items ->
    // Downgrade that trigger type to push/SMS". The whole of adaptive-channel.ts
    // had zero callers, so no stored effectiveness could change any behaviour.
    const tenant = await createTenant();
    await pinTimezone(tenant);
    await configureBriefing(tenant, {
      briefingEnabled: false,
      quietHoursStart: '23:58',
      quietHoursEnd: '23:59',
      callWindowStart: '00:00',
      callWindowEnd: '23:57',
      cooldownMinutes: 0,
      maxCallsPerDay: 50,
      maxCallsPerHour: 50,
    });

    await db.shadowChannelEffectiveness.createMany({
      data: [
        {
          userId: tenant.user.id,
          channel: 'phone',
          triggerType: 'overdue_task',
          attempts: 4,
          responses: 0,
          responseRate: 0,
        },
        {
          userId: tenant.user.id,
          channel: 'sms',
          triggerType: 'overdue_task',
          attempts: 4,
          responses: 3,
          responseRate: 0.75,
        },
      ],
    });

    const key = 'trigger:adaptive:1';
    await db.shadowOutreach.create({
      data: {
        userId: tenant.user.id,
        triggerType: 'overdue_task',
        triggerEvent: key,
        channel: 'in_app_push',
        status: 'pending',
        content: '[P2] Overdue work: rung one',
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });

    await processProactiveTickJob(tickJob([tenant.user.id]));

    const rungTwo = await db.shadowOutreach.findFirst({
      where: { userId: tenant.user.id, triggerEvent: key, status: 'pending', channel: { not: 'in_app_push' } },
    });

    // The ladder's rung two is `phone_sms`. The downgrade replaces it.
    expect(rungTwo?.channel).toBe('sms');
  });

  it('does NOT downgrade a P0 rung, however many calls have been ignored', async () => {
    // "NEVER DOWNGRADE: Crisis declarations always call." The same effectiveness
    // rows as above, a crisis trigger, and the phone rung stands.
    const tenant = await createTenant();
    await pinTimezone(tenant);
    await configureBriefing(tenant, {
      briefingEnabled: false,
      quietHoursStart: '23:58',
      quietHoursEnd: '23:59',
      callWindowStart: '00:00',
      callWindowEnd: '23:57',
      cooldownMinutes: 0,
      maxCallsPerDay: 50,
      maxCallsPerHour: 50,
    });

    await db.shadowChannelEffectiveness.createMany({
      data: [
        {
          userId: tenant.user.id,
          channel: 'phone',
          triggerType: 'crisis',
          attempts: 9,
          responses: 0,
          responseRate: 0,
        },
        {
          userId: tenant.user.id,
          channel: 'sms',
          triggerType: 'crisis',
          attempts: 9,
          responses: 9,
          responseRate: 1,
        },
      ],
    });

    const key = 'trigger:adaptive:p0';
    await db.shadowOutreach.create({
      data: {
        userId: tenant.user.id,
        triggerType: 'crisis',
        triggerEvent: key,
        channel: 'in_app_push',
        status: 'pending',
        content: '[P0] Crisis: rung one',
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });

    await processProactiveTickJob(tickJob([tenant.user.id]));

    const rungTwo = await db.shadowOutreach.findFirst({
      where: {
        userId: tenant.user.id,
        triggerEvent: key,
        channel: { not: 'in_app_push' },
      },
    });
    expect(rungTwo?.channel).toBe('phone_sms');
  });

  it('records an attempt on every rung it takes, which is the other half of the rate', async () => {
    const tenant = await createTenant();
    await pinTimezone(tenant);
    await configureBriefing(tenant, { briefingEnabled: false, cooldownMinutes: 0 });

    await db.shadowTrigger.create({
      data: {
        userId: tenant.user.id,
        triggerName: 'Overdue work',
        triggerType: 'overdue_task',
        conditions: { minOverdue: 1 },
        action: {},
        enabled: true,
        cooldownMinutes: 0,
      },
    });
    await db.task.create({
      data: {
        title: 'late',
        entityId: tenant.entity.id,
        status: 'TODO',
        dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
    });

    await processProactiveTickJob(tickJob([tenant.user.id]));

    const stat = await db.shadowChannelEffectiveness.findFirst({
      where: { userId: tenant.user.id, triggerType: 'overdue_task' },
    });
    expect(stat?.channel).toBe('push');
    expect(stat?.attempts).toBe(1);
    expect(stat?.responses).toBe(0);
  });
});

// ===========================================================================
// ADDITION 7.2 — the digest optimizer, which had nothing to optimize
// ===========================================================================

describe('digest mode batches what does not need a call, and delivers it once', () => {
  it('batches a non-urgent trigger instead of escalating it', async () => {
    // `digestOptimizer.addToDigest` had no caller anywhere, so the digest was
    // permanently empty and `generateDigest` permanently returned "No items in
    // your digest. Everything looks clear." — which is a true statement about
    // an empty table and says nothing about the user's day.
    const tenant = await createTenant();
    await pinTimezone(tenant);
    await configureBriefing(tenant, {
      briefingEnabled: false,
      digestEnabled: true,
      digestTime: '23:59',
      cooldownMinutes: 0,
    });

    await db.shadowTrigger.create({
      data: {
        userId: tenant.user.id,
        triggerName: 'Overdue work',
        triggerType: 'overdue_task',
        conditions: { minOverdue: 1 },
        action: {},
        enabled: true,
        cooldownMinutes: 0,
      },
    });
    await db.task.create({
      data: {
        title: 'late',
        entityId: tenant.entity.id,
        status: 'TODO',
        dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
    });

    const result = await processProactiveTickJob(tickJob([tenant.user.id]));

    expect(result.triggersFired).toBe(1);
    expect(result.digestItemsBatched).toBe(1);
    // Batched, therefore NOT escalated: no ladder, no notification.
    expect(result.escalationsStarted).toBe(0);
    expect(await db.notification.count({ where: { userId: tenant.user.id } })).toBe(0);

    const batched = await db.shadowOutreach.findMany({
      where: { userId: tenant.user.id, channel: 'digest', status: 'pending_digest' },
    });
    expect(batched).toHaveLength(1);
  });

  it('escalates a P0 immediately even with digest mode on', async () => {
    // "if item.priority === 'P0' -> call immediately".
    const tenant = await createTenant();
    await pinTimezone(tenant);
    await configureBriefing(tenant, {
      briefingEnabled: false,
      digestEnabled: true,
      digestTime: '23:59',
      cooldownMinutes: 0,
    });

    await db.shadowTrigger.create({
      data: {
        userId: tenant.user.id,
        triggerName: 'Crisis',
        triggerType: 'crisis',
        conditions: {},
        action: {},
        enabled: true,
        cooldownMinutes: 0,
      },
    });
    await db.notification.create({
      data: {
        userId: tenant.user.id,
        type: 'alert',
        title: 'the thing',
        body: 'is on fire',
        priority: 'urgent',
        read: false,
      },
    });

    const result = await processProactiveTickJob(tickJob([tenant.user.id]));

    expect(result.triggersFired).toBe(1);
    expect(result.digestItemsBatched).toBe(0);
    expect(result.escalationsStarted).toBe(1);
  });

  it('delivers the batch once at the digest time and empties it', async () => {
    const tenant = await createTenant();
    await pinTimezone(tenant);
    await configureBriefing(tenant, {
      briefingEnabled: false,
      digestEnabled: true,
      digestTime: nowHHMM(),
    });

    await db.shadowOutreach.createMany({
      data: [1, 2, 3].map((n) => ({
        userId: tenant.user.id,
        triggerType: 'digest_overdue_task',
        channel: 'digest',
        status: 'pending_digest',
        content: JSON.stringify({
          type: 'task',
          title: `batched item ${n}`,
          priority: 'P2',
          content: 'needs attention today',
          addedAt: new Date().toISOString(),
        }),
      })),
    });

    const result = await processProactiveTickJob(tickJob([tenant.user.id]));
    expect(result.digestsDelivered).toBe(1);

    const notification = await db.notification.findFirst({
      where: { userId: tenant.user.id, title: 'Shadow digest' },
    });
    expect(notification).not.toBeNull();
    expect(notification?.body).toContain('3 items');

    // The batch is consumed, so a second tick has nothing to deliver.
    expect(
      await db.shadowOutreach.count({
        where: { userId: tenant.user.id, status: 'pending_digest' },
      })
    ).toBe(0);

    const second = await processProactiveTickJob(tickJob([tenant.user.id]));
    expect(second.digestsDelivered).toBe(0);
  });
});

// ===========================================================================
// The HTTP entry point onto the same sweep
// ===========================================================================

describe('POST /api/shadow/proactive/run', () => {
  it('runs the sweep for the caller and nobody else', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    await pinTimezone(tenantA);
    await pinTimezone(tenantB);
    await configureBriefing(tenantA, { briefingEnabled: true, briefingTime: nowHHMM() });
    await configureBriefing(tenantB, { briefingEnabled: true, briefingTime: nowHHMM() });

    const res = await proactiveRunPOST(
      requestAs(tenantA, '/api/shadow/proactive/run', { method: 'POST', body: {} })
    );
    expect(res.status).toBe(200);

    const body = await readJson<Envelope<{ usersSwept: number; briefingsDelivered: number }>>(res);
    expect(body.data.usersSwept).toBe(1);
    expect(body.data.briefingsDelivered).toBe(1);

    expect(await db.notification.count({ where: { userId: tenantA.user.id } })).toBe(1);
    // B is equally due and was not swept. There is no `userIds` parameter on
    // the route, so one tenant cannot deliver into another's notifications.
    expect(await db.notification.count({ where: { userId: tenantB.user.id } })).toBe(0);
  });
});

describe('GET /api/shadow/outreach', () => {
  it('returns the caller escalation state and no one else rows', async () => {
    const { tenantA, tenantB } = await createTwoTenants();

    await db.shadowOutreach.create({
      data: {
        userId: tenantA.user.id,
        triggerType: 'overdue_task',
        triggerEvent: 'trigger:list:a',
        channel: 'in_app_push',
        status: 'pending',
        content: '[P2] A private thing: rung one',
      },
    });
    await db.shadowOutreach.create({
      data: {
        userId: tenantB.user.id,
        triggerType: 'overdue_task',
        triggerEvent: 'trigger:list:b',
        channel: 'in_app_push',
        status: 'pending',
        content: '[P2] B private thing: rung one',
      },
    });

    const res = await outreachGET(requestAs(tenantA, '/api/shadow/outreach'));
    const body = await readJson<
      Envelope<{
        outreach: Array<{ content: string }>;
        activeEscalations: Array<{ notificationId: string; attempts: number; title: string }>;
      }>
    >(res);

    expect(body.data.outreach).toHaveLength(1);
    expect(body.data.outreach[0].content).toContain('A private thing');
    expect(body.data.activeEscalations).toHaveLength(1);
    expect(body.data.activeEscalations[0].notificationId).toBe('trigger:list:a');
    expect(body.data.activeEscalations[0].attempts).toBe(1);
    expect(body.data.activeEscalations[0].title).toBe('A private thing');
  });
});

// ===========================================================================
// The clock, stated rather than implied
// ===========================================================================

describe('the schedule window', () => {
  it('fires inside the grace window and not outside it', async () => {
    const { isWithinScheduleWindow } = await import(
      '@/modules/shadow/proactive/proactive-runner'
    );

    expect(isWithinScheduleWindow(todayAtUtc(8, 0), 'Etc/GMT', '08:00')).toBe(true);
    expect(isWithinScheduleWindow(todayAtUtc(9, 59), 'Etc/GMT', '08:00')).toBe(true);
    // Past the two-hour grace: a missed window is a missed window, not an 11pm
    // "good morning".
    expect(isWithinScheduleWindow(todayAtUtc(10, 1), 'Etc/GMT', '08:00')).toBe(false);
    expect(isWithinScheduleWindow(todayAtUtc(7, 59), 'Etc/GMT', '08:00')).toBe(false);
  });

  it('reads the window in the user own timezone, not the server one', async () => {
    const { isWithinScheduleWindow } = await import(
      '@/modules/shadow/proactive/proactive-runner'
    );

    // 13:00 UTC is 08:00 in Etc/GMT+5 and 14:00 in Etc/GMT-1.
    const instant = todayAtUtc(13, 0);
    expect(isWithinScheduleWindow(instant, 'Etc/GMT+5', '08:00')).toBe(true);
    expect(isWithinScheduleWindow(instant, 'Etc/GMT-1', '08:00')).toBe(false);
  });
});
