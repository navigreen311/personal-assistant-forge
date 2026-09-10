/**
 * P-33 (T-0xx) — the stores this package moved survive a restart.
 *
 * ============================================================================
 * WHY THIS FILE IS THE ONLY PROOF THAT COUNTS
 * ============================================================================
 *
 * Every unit test P-33 touched keeps a fake table inside its `jest.mock`
 * factory, because the round trips those tests already performed had to keep
 * testing the service rather than a stub's return value. A Map inside a mock
 * factory proves the LOGIC — an expired code is rejected, an inactive device
 * does not authenticate, two records for one metric sum. It cannot prove
 * PERSISTENCE, because a Map inside a mock factory is precisely the thing that
 * was wrong.
 *
 * `jest.resetModules()` is a restart expressed exactly: every module-level
 * object the process held — every Map, every Set, every `let` initialised at
 * import — is gone, and the next `import` rebuilds it empty. Anything that was
 * only in memory does not come back. Anything in Postgres does. That is the
 * whole discriminator, and it is the idiom P-01, P-09 and P-20 established in
 * `restart-survivability.test.ts`.
 *
 * A second `PrismaClient` is used for the far-side reads: a client the
 * pre-restart code never touched is a different process's view of the same
 * row, so a value that only ever lived in the first client's cache or in a
 * module-level Map cannot be read through it.
 *
 * ============================================================================
 * WHAT IS UNDER TEST
 * ============================================================================
 *
 *   smsCodeStore   -> ShadowSmsCode        an in-flight second factor
 *   trustedDevices -> ShadowTrustedDevice  (three Maps, one table)
 *   dndStore       -> DNDConfig            do-not-disturb, quiet hours, VIPs
 *   usageStore     -> UsageRecord          plan meters you bill against
 *
 * ============================================================================
 * MUTATION NUMBERS
 * ============================================================================
 *
 * `git stash push -- src/` (the fix removed, this file kept), then this suite:
 *
 *     9 failed, 1 passed, 10 total     without the fix
 *    10 passed,           10 total     with it
 *
 * The one that passes either way is "refuses a device revoked before the
 * restart", and it is left in deliberately: with the Map empty NOTHING
 * authenticates, so a revoked device is refused for the wrong reason. On its
 * own it would be a test that proves nothing — which is why it sits directly
 * beside the positive case, and why that positive case is the one that moved.
 *
 * The stashed run also never exited. That is bug #6 in
 * docs/store-classification.md: the old `auth-manager.ts` armed an un-unref'd
 * `setInterval(cleanExpiredCodes, 60_000)` at module load, and this file
 * re-imports that module across each `jest.resetModules()`. Removing the
 * sweeper — the `ShadowSmsCode` `@@index([expiresAt])` replaces it — is why the
 * fixed run exits on its own in under four seconds.
 *
 * Requires a real Postgres. No skip.
 */

import { PrismaClient } from '@prisma/client';

import { db, setupTestDatabase } from '../helpers/db';
import { createTenant, createUser, type Tenant } from '../helpers/factories';

setupTestDatabase();

jest.setTimeout(120_000);

/** Re-import a module after the restart — never a pre-restart reference. */
async function afterRestart<T>(specifier: string): Promise<T> {
  return (await import(specifier)) as T;
}

/** A second client — a different process's view of the same rows. */
async function withSecondClient<T>(fn: (client: PrismaClient) => Promise<T>): Promise<T> {
  const client = new PrismaClient();
  try {
    return await fn(client);
  } finally {
    await client.$disconnect();
  }
}

describe('P-33 — stores moved out of process memory survive a restart', () => {
  let tenant: Tenant;

  beforeEach(async () => {
    tenant = await createTenant();
  });

  // -------------------------------------------------------------------------
  // COMPLIANCE / SECURITY — the second factor
  // -------------------------------------------------------------------------

  it('carries an in-flight SMS second factor across a restart, and its attempt counter with it', async () => {
    const { ShadowAuthManager } = await import('@/modules/shadow/safety/auth-manager');

    // NEAR SIDE — send a code through the product.
    const sent = await new ShadowAuthManager().sendSmsCode(tenant.user.id);
    expect(sent.sent).toBe(true);

    const issued = await db.shadowSmsCode.findUnique({ where: { cacheKey: tenant.user.id } });
    expect(issued).not.toBeNull();
    const code = issued!.code;
    expect(code).toHaveLength(6);

    // Burn one of the three attempts with a wrong code, so the far side has a
    // counter to carry and not just a row.
    expect(await new ShadowAuthManager().verifySmsCode(tenant.user.id, '000000')).toBe(false);
    expect(
      (await db.shadowSmsCode.findUnique({ where: { cacheKey: tenant.user.id } }))!.attempts
    ).toBe(1);

    // THE RESTART.
    jest.resetModules();

    // FAR SIDE — a code minted before the restart still verifies. Under the Map
    // this returned false, indistinguishable from a wrong code: the user was
    // stranded mid-verification with no error anyone could see.
    const fresh = await afterRestart<typeof import('@/modules/shadow/safety/auth-manager')>(
      '@/modules/shadow/safety/auth-manager'
    );
    expect(await new fresh.ShadowAuthManager().verifySmsCode(tenant.user.id, code)).toBe(true);

    // One-time use is honoured across the restart too: the row is gone.
    expect(
      await withSecondClient((c) => c.shadowSmsCode.findUnique({ where: { cacheKey: tenant.user.id } }))
    ).toBeNull();

    // And the auth trail is attributable, which it was not before.
    const events = await withSecondClient((c) =>
      c.shadowAuthEvent.findMany({ where: { userId: tenant.user.id }, orderBy: { createdAt: 'asc' } })
    );
    expect(events.map((e) => `${e.method}:${e.result}`)).toEqual([
      'sms_code_sent:sent',
      'sms_code_verify:failure',
      'sms_code_verify:success',
    ]);
  });

  it('carries the brute-force lockout across a restart rather than handing back a fresh three attempts', async () => {
    const { ShadowAuthManager } = await import('@/modules/shadow/safety/auth-manager');
    await new ShadowAuthManager().sendSmsCode(tenant.user.id);
    const code = (await db.shadowSmsCode.findUnique({ where: { cacheKey: tenant.user.id } }))!.code;

    // Exhaust the three attempts.
    for (let i = 0; i < 3; i++) {
      expect(await new ShadowAuthManager().verifySmsCode(tenant.user.id, '000000')).toBe(false);
    }

    // THE RESTART — the attacker's whole strategy under the old code.
    jest.resetModules();

    const fresh = await afterRestart<typeof import('@/modules/shadow/safety/auth-manager')>(
      '@/modules/shadow/safety/auth-manager'
    );

    // Even the CORRECT code is refused: the lockout survived. Under the Map the
    // restart cleared `attempts` to zero and the budget was renewed for free —
    // and on a multi-instance deploy no restart was even needed, because each
    // instance had its own Map and its own counter.
    expect(await new fresh.ShadowAuthManager().verifySmsCode(tenant.user.id, code)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // COMPLIANCE / AUTHORIZATION — trusted devices
  // -------------------------------------------------------------------------

  it('authenticates an inbound caller from a device registered before the restart', async () => {
    // Registered the way the supported UI registers one: through
    // ShadowAuthManager, which writes ShadowTrustedDevice. Before P-33 the
    // phone handler could not see this row at all — it read a Map that only a
    // test helper ever wrote to, so EVERY inbound call failed authentication.
    const { ShadowAuthManager } = await import('@/modules/shadow/safety/auth-manager');
    await new ShadowAuthManager().addTrustedDevice(tenant.user.id, {
      deviceType: 'phone',
      phoneNumber: '+15559876543',
      name: 'Marcus',
    });

    // THE RESTART.
    jest.resetModules();

    const fresh = await afterRestart<typeof import('@/modules/shadow/interfaces/phone-inbound')>(
      '@/modules/shadow/interfaces/phone-inbound'
    );
    const handler = new fresh.PhoneInboundHandler({
      accountSid: 'AC_test',
      authToken: 'test',
      phoneNumber: '+15551234567',
      baseUrl: 'https://test.example.com',
    });

    const result = await handler.authenticateCaller('+15559876543');
    expect(result.authenticated).toBe(true);
    expect(result.userId).toBe(tenant.user.id);
    expect(result.userName).toBe('Marcus');
    expect(result.requiresStepUp).toBe(false);

    // Symmetry: an unknown number is still refused after the restart, so the
    // assertion above is not passing because the check disappeared.
    expect((await handler.authenticateCaller('+15550000000')).requiresStepUp).toBe(true);
  });

  it('refuses a device revoked before the restart, and does not resurrect it', async () => {
    const { ShadowAuthManager } = await import('@/modules/shadow/safety/auth-manager');
    const manager = new ShadowAuthManager();
    const device = await manager.addTrustedDevice(tenant.user.id, {
      deviceType: 'phone',
      phoneNumber: '+15559876543',
      name: 'Old phone',
    });
    await manager.removeTrustedDevice(device.id);

    jest.resetModules();

    const fresh = await afterRestart<typeof import('@/modules/shadow/interfaces/phone-inbound')>(
      '@/modules/shadow/interfaces/phone-inbound'
    );
    const handler = new fresh.PhoneInboundHandler({
      accountSid: 'AC_test',
      authToken: 'test',
      phoneNumber: '+15551234567',
      baseUrl: 'https://test.example.com',
    });

    // A revocation that a restart undoes is not a revocation.
    expect((await handler.authenticateCaller('+15559876543')).authenticated).toBe(false);
  });

  it('reaches the same device from the outbound and SMS handlers — one table, not three Maps', async () => {
    const { ShadowAuthManager } = await import('@/modules/shadow/safety/auth-manager');
    await new ShadowAuthManager().addTrustedDevice(tenant.user.id, {
      deviceType: 'phone',
      phoneNumber: '+15559876543',
      name: 'Marcus',
    });

    jest.resetModules();

    // SMS: `handleInboundSMS` identifies the sender through `findUserByPhone`.
    // It used to answer "I don't recognize this number" to EVERYONE, because
    // its own Map was never written to outside a test helper. (The inbound path
    // rather than `sendSMS` deliberately: `sendSMS` reaches Twilio, and this
    // assertion is about the lookup, not about the network.)
    const smsModule = await afterRestart<typeof import('@/modules/shadow/interfaces/sms')>(
      '@/modules/shadow/interfaces/sms'
    );
    const sms = new smsModule.ShadowSMS({
      accountSid: 'AC_test',
      authToken: 'test',
      phoneNumber: '+15551234567',
      baseUrl: 'https://test.example.com',
    });
    const recognised = await sms.handleInboundSMS({ from: '+15559876543', body: 'help' });
    expect(recognised.response).not.toMatch(/don't recognize this number/);
    expect(recognised.response.length).toBeGreaterThan(0);

    // Symmetry: an unregistered number is still not recognised, so the
    // assertion above is not passing because the check disappeared.
    const unknown = await sms.handleInboundSMS({ from: '+15550000000', body: 'help' });
    expect(unknown.response).toMatch(/don't recognize this number/);

    // Outbound: the private lookup is exercised through the public failure it
    // used to produce. A user WITHOUT a device still throws — the guard is
    // intact, it is simply reading the right store now.
    const outboundModule = await afterRestart<
      typeof import('@/modules/shadow/interfaces/phone-outbound')
    >('@/modules/shadow/interfaces/phone-outbound');
    const outbound = new outboundModule.PhoneOutboundHandler({
      config: {
        accountSid: 'AC_test',
        authToken: 'test',
        phoneNumber: '+15551234567',
        baseUrl: 'https://test.example.com',
      },
    });
    const strangerId = (await createUser()).id;
    await expect(
      outbound.callUser({
        userId: strangerId,
        reason: 'test',
        priority: 'urgent',
        content: 'test',
      })
    ).rejects.toThrow(/No trusted phone number found/);
  });

  // -------------------------------------------------------------------------
  // DATA LOSS — do not disturb
  // -------------------------------------------------------------------------

  it('carries do-not-disturb, quiet hours and the VIP allow-list across a restart', async () => {
    const dnd = await import('@/modules/attention/services/dnd-service');

    await dnd.enableDND(tenant.user.id, { exceptions: ['contact-vip'] });
    await dnd.setQuietHours(tenant.user.id, 22, 23);
    expect(await dnd.checkVIPBreakthrough(tenant.user.id, 'contact-vip')).toBe(true);
    // `setQuietHours` switches the mode, so `isDNDActive` now depends on the
    // wall clock. Whether the window is open right now is not what this test is
    // about -- the second test below covers the behaviour with a
    // clock-independent MANUAL config.

    // THE RESTART.
    jest.resetModules();

    const fresh = await afterRestart<typeof import('@/modules/attention/services/dnd-service')>(
      '@/modules/attention/services/dnd-service'
    );
    const config = await fresh.getDNDConfig(tenant.user.id);

    // Under the Map this came back as `getDefaultDND` — `isActive: false`, mode
    // MANUAL, no quiet hours, no VIPs — with a 200 and no error to notice, and
    // every suppressed notification started coming through again.
    expect(config.isActive).toBe(true);
    expect(config.mode).toBe('FOCUS_HOURS');
    expect(config.startTime).toBe('22:00');
    expect(config.endTime).toBe('23:00');
    expect(config.vipContactIds).toContain('contact-vip');
    expect(await fresh.checkVIPBreakthrough(tenant.user.id, 'contact-vip')).toBe(true);

    // A client that never saw this process's memory agrees.
    const row = await withSecondClient((c) =>
      c.dNDConfig.findUnique({ where: { userId: tenant.user.id } })
    );
    expect(row).not.toBeNull();
    expect(row!.isActive).toBe(true);
    expect(row!.startTime).toBe('22:00');

  });

  it('still suppresses notifications after a restart, and still lets the documented exceptions through', async () => {
    const dnd = await import('@/modules/attention/services/dnd-service');

    // MANUAL mode: active or not, independent of the wall clock.
    await dnd.enableDND(tenant.user.id, { exceptions: ['contact-vip'] });
    expect(await dnd.shouldSuppress(tenant.user.id, { priority: 'P2' })).toBe(true);

    // THE RESTART.
    jest.resetModules();

    const fresh = await afterRestart<typeof import('@/modules/attention/services/dnd-service')>(
      '@/modules/attention/services/dnd-service'
    );

    // Under the Map this was `false` after the restart and every suppressed
    // notification started coming through, with a 200 and no error to notice.
    expect(await fresh.shouldSuppress(tenant.user.id, { priority: 'P2' })).toBe(true);

    // …while the two documented break-throughs still work, so the assertion
    // above is not passing because suppression became unconditional.
    expect(await fresh.shouldSuppress(tenant.user.id, { priority: 'P0' })).toBe(false);
    expect(
      await fresh.shouldSuppress(tenant.user.id, { priority: 'P2', contactId: 'contact-vip' })
    ).toBe(false);

    // And disabling it after the restart sticks, through another restart.
    await fresh.disableDND(tenant.user.id);
    jest.resetModules();
    const fresher = await afterRestart<typeof import('@/modules/attention/services/dnd-service')>(
      '@/modules/attention/services/dnd-service'
    );
    expect(await fresher.shouldSuppress(tenant.user.id, { priority: 'P2' })).toBe(false);
  });

  // -------------------------------------------------------------------------
  // MONEY — plan usage meters
  // -------------------------------------------------------------------------

  it('carries plan usage meters across a restart instead of granting the allowance again', async () => {
    const subs = await import('@/lib/integrations/payments/subscriptions');

    await subs.createSubscription({
      userId: tenant.user.id,
      entityId: tenant.entity.id,
      planId: 'plan_starter',
    });

    // 'starter' allows 10000 apiCallsPerMonth; spend 9999 of them.
    await subs.recordUsage({ entityId: tenant.entity.id, metric: 'apiCallsPerMonth', count: 9999 });
    expect(await subs.isWithinLimits(tenant.entity.id, 'apiCallsPerMonth')).toBe(true);

    // THE RESTART.
    jest.resetModules();

    const fresh = await afterRestart<typeof import('@/lib/integrations/payments/subscriptions')>(
      '@/lib/integrations/payments/subscriptions'
    );

    // The meter is still 9999 — not 0. Under the Map every deploy handed every
    // entity its full plan allowance back, which is the direction that costs
    // money rather than merely losing state.
    const summary = await fresh.getUsageSummary(tenant.entity.id);
    const meter = summary.find((m) => m.metric === 'apiCallsPerMonth');
    expect(meter).toBeDefined();
    expect(meter!.count).toBe(9999);
    expect(meter!.limit).toBe(10000);

    // One more call crosses the limit, from the restarted module.
    await fresh.recordUsage({ entityId: tenant.entity.id, metric: 'apiCallsPerMonth', count: 1 });
    expect(await fresh.isWithinLimits(tenant.entity.id, 'apiCallsPerMonth')).toBe(false);

    // The rows are real, namespaced, and readable by a client that never saw
    // this process.
    const rows = await withSecondClient((c) =>
      c.usageRecord.findMany({ where: { entityId: tenant.entity.id, module: 'plan-meter' } })
    );
    expect(rows).toHaveLength(2);
    expect(rows.reduce((sum, r) => sum + r.inputTokens, 0)).toBe(10000);
  });

  it('keeps one entity usage out of another entity meter across a restart', async () => {
    const subs = await import('@/lib/integrations/payments/subscriptions');
    const other = await createTenant();

    for (const t of [tenant, other]) {
      await subs.createSubscription({
        userId: t.user.id,
        entityId: t.entity.id,
        planId: 'plan_starter',
      });
    }
    await subs.recordUsage({ entityId: tenant.entity.id, metric: 'apiCallsPerMonth', count: 7 });
    await subs.recordUsage({ entityId: other.entity.id, metric: 'apiCallsPerMonth', count: 3 });

    jest.resetModules();

    const fresh = await afterRestart<typeof import('@/lib/integrations/payments/subscriptions')>(
      '@/lib/integrations/payments/subscriptions'
    );
    expect((await fresh.getUsageSummary(tenant.entity.id))[0].count).toBe(7);
    expect((await fresh.getUsageSummary(other.entity.id))[0].count).toBe(3);
  });

  // -------------------------------------------------------------------------
  // The generalisation.
  // -------------------------------------------------------------------------

  it('holds nothing that a restart erases: every table this package touched is in Postgres', async () => {
    const { ShadowAuthManager } = await import('@/modules/shadow/safety/auth-manager');
    const dnd = await import('@/modules/attention/services/dnd-service');
    const subs = await import('@/lib/integrations/payments/subscriptions');

    const manager = new ShadowAuthManager();
    await manager.sendSmsCode(tenant.user.id);
    await manager.addTrustedDevice(tenant.user.id, {
      deviceType: 'phone',
      phoneNumber: '+15559876543',
      name: 'Marcus',
    });
    await dnd.enableDND(tenant.user.id);
    await subs.createSubscription({
      userId: tenant.user.id,
      entityId: tenant.entity.id,
      planId: 'plan_starter',
    });
    await subs.recordUsage({ entityId: tenant.entity.id, metric: 'apiCallsPerMonth', count: 2 });

    jest.resetModules();

    const counts = await withSecondClient(async (client) => ({
      smsCodes: await client.shadowSmsCode.count({ where: { cacheKey: tenant.user.id } }),
      trustedDevices: await client.shadowTrustedDevice.count({ where: { userId: tenant.user.id } }),
      dnd: await client.dNDConfig.count({ where: { userId: tenant.user.id } }),
      planMeters: await client.usageRecord.count({
        where: { entityId: tenant.entity.id, module: 'plan-meter' },
      }),
    }));

    expect(counts).toEqual({
      smsCodes: 1,
      trustedDevices: 1,
      dnd: 1,
      planMeters: 1,
    });
  });
});
