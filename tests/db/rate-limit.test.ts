/**
 * P-18 / T-012 — the rate limiter, against a real Redis and a real Postgres.
 *
 * ============================================================================
 * WHY THIS FILE HAD TO EXIST
 * ============================================================================
 *
 * The repository contained three rate limiters and none of them limited
 * anything. The Redis one had no route. The `src/middleware.ts` one wrote
 * `X-RateLimit-Limit: 100` and `X-RateLimit-Remaining: 99` as string constants
 * onto every API response and counted nothing. The `security.ts` one was dead
 * middleware in an in-memory `Map`.
 *
 * All three had passing tests. That is the point of this file. `tests/unit/
 * middleware/rate-limit.test.ts` used to mock `ioredis`, tell the mock that
 * eleven requests were in the window, and then assert that the code reported
 * `allowed: false` — an arithmetic test wearing a limiter's clothes. Nothing in
 * it could fail if `checkRateLimit` never counted anything, because nothing in
 * it ever made two requests and expected the second to be affected by the
 * first. `tests/unit/auth/root-middleware.test.ts` asserted
 * `X-RateLimit-Limit === '100'`, which is a test that the constant is still the
 * constant.
 *
 *   ***  A LIMIT IS A CLAIM ABOUT WHAT HAPPENS TO REQUEST N+1 BECAUSE OF
 *        REQUESTS 1..N. THE ONLY INSTRUMENT THAT CAN MEASURE IT IS N+1 REAL
 *        REQUESTS AGAINST REAL SHARED STATE. ***
 *
 * So every case below makes the requests. The (limit+1)th must be refused, and
 * refused for the reason claimed: not written, not merely labelled.
 *
 * ============================================================================
 * WHY tests/db/ AND NOT tests/unit/
 * ============================================================================
 *
 * The unit job has no Redis, deliberately — see the `redis` service comment in
 * `.github/workflows/ci.yml`, where P-11 explains that handing that job a Redis
 * would mask P-22's degradation tests. The `db-test` job has one. A real test
 * of a Redis-backed limiter therefore belongs here, and the behaviour that must
 * hold with Redis ABSENT stays in the unit file.
 *
 * ============================================================================
 * ISOLATION
 * ============================================================================
 *
 * Postgres is truncated between tests by the harness; Redis is not, and P-25 is
 * fixing a shared-Redis isolation bug in the queue tests right now, so this file
 * takes care not to add to it:
 *
 *   * every case uses a per-case key namespace or a per-case source address, so
 *     two cases cannot share a bucket and no other suite can collide with one;
 *   * no `FLUSHDB` anywhere — it would destroy whatever the queue tests are
 *     holding;
 *   * `afterAll` deletes only the keys this file created, by prefix.
 *
 * The route cases go through `POST /api/auth/register`, which is IP-keyed, so
 * they pass an explicit `x-forwarded-for` unique to the case. Other `tests/db/`
 * suites call these handlers with no forwarding header at all, which resolves
 * to no identity and is not counted — so nothing here can make them flaky, and
 * nothing they do can exhaust a bucket used here.
 *
 * ============================================================================
 * MUTATION
 * ============================================================================
 *
 *   git stash push        # the fix goes; this untracked file stays
 *   DATABASE_URL=... REDIS_URL=... npm run test:db -- rate-limit
 *   git stash pop
 *
 * Against pre-fix code no route calls a limiter at all, so every "the next one
 * is refused" case fails with 201 where 429 was expected. Both numbers are in
 * the PR.
 *
 * Run: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/paf_p18 \
 *        REDIS_URL=redis://localhost:6379 npm run test:db -- rate-limit
 */

import Redis from 'ioredis';
import { NextRequest } from 'next/server';

import { POST as registerPOST } from '@/app/api/auth/register/route';
import {
  RATE_LIMIT_POLICY,
  applyRateLimit,
  checkRateLimit,
  _closeRedis,
  type RateLimitPolicy,
} from '@/shared/middleware/rate-limit';

import { db, setupTestDatabase } from '../helpers/db';
import { readJson, sessionTokenFor } from '../helpers/session';

setupTestDatabase();

type ErrBody = { success: false; error: { code: string; message: string } };
type OkBody<T> = { success: true; data: T };

const ORIGIN = 'http://localhost:3000';

/** Everything this file writes to Redis lives under here, and only here. */
const TEST_PREFIX = 'p18test:';

/** A separate client, used only to observe and to clean up. */
let observer: Redis;

/** Per-case uniqueness, so no two cases can share a bucket. */
let caseId = 0;
function nextCaseId(): string {
  caseId += 1;
  return `${process.pid}-${caseId}`;
}

beforeAll(async () => {
  observer = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
  // Fail here, loudly, rather than let every case below silently pass through
  // the fail-open branch and report a green board over an unmeasured limiter.
  // That is the exact failure this package exists to remove.
  await observer.connect();
  await observer.ping();
});

afterAll(async () => {
  const keys = await observer.keys(`${TEST_PREFIX}*`);
  if (keys.length > 0) await observer.del(...keys);
  const routeKeys = await observer.keys('rl:auth:ip:p18-*');
  if (routeKeys.length > 0) await observer.del(...routeKeys);
  await observer.quit();
  await _closeRedis();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let emailSeq = 0;

/** A registration body that is always valid and always unique. */
function registration(): { name: string; email: string; password: string } {
  emailSeq += 1;
  return {
    name: 'Rate Limit Probe',
    email: `p18-rate-limit-${process.pid}-${emailSeq}@example.test`,
    password: 'Corr3ct-Horse-Battery!',
  };
}

/** A register request that presents `ip` the way a proxy would. */
function registerFrom(ip: string): NextRequest {
  return new NextRequest(`${ORIGIN}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(registration()),
  });
}

async function ok(): Promise<Response> {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function policy(over: Partial<RateLimitPolicy> = {}): RateLimitPolicy {
  return {
    limit: 3,
    windowMs: 60_000,
    keyBy: 'ip',
    failOpen: true,
    reason: 'test',
    ...over,
  };
}

function requestFrom(ip: string): NextRequest {
  return new NextRequest(`${ORIGIN}/api/test`, { headers: { 'x-forwarded-for': ip } });
}

// ---------------------------------------------------------------------------
// 1. THE CENTRAL CLAIM: the (N+1)th request is refused, on a real route
// ---------------------------------------------------------------------------

describe('POST /api/auth/register — the advertised limit is real', () => {
  const { limit } = RATE_LIMIT_POLICY.auth;

  it(`allows exactly ${limit} registrations from one address and refuses the next`, async () => {
    const ip = `p18-${nextCaseId()}`;

    for (let i = 1; i <= limit; i += 1) {
      const res = await registerPOST(registerFrom(ip));
      expect({ request: i, status: res.status }).toEqual({ request: i, status: 201 });
    }

    const refused = await registerPOST(registerFrom(ip));

    expect(refused.status).toBe(429);
    const body = await readJson<ErrBody>(refused);
    expect(body.error.code).toBe('RATE_LIMITED');
  });

  it('a refusal writes nothing — a 429 that still creates the account is not a limit', async () => {
    const ip = `p18-${nextCaseId()}`;

    for (let i = 0; i < limit; i += 1) await registerPOST(registerFrom(ip));

    const before = await db.user.count();
    const refused = await registerPOST(registerFrom(ip));
    const after = await db.user.count();

    expect(refused.status).toBe(429);
    expect(after).toBe(before);
  });

  it('the budget is per caller, not global — another address is unaffected', async () => {
    // A "fix" that simply refuses everybody passes every other assertion in
    // this file. This is the one it fails.
    const exhausted = `p18-${nextCaseId()}`;
    const innocent = `p18-${nextCaseId()}`;

    for (let i = 0; i < limit; i += 1) await registerPOST(registerFrom(exhausted));
    expect((await registerPOST(registerFrom(exhausted))).status).toBe(429);

    const res = await registerPOST(registerFrom(innocent));

    expect(res.status).toBe(201);
  });

  it('answers the refusal with a Retry-After a client can act on', async () => {
    const ip = `p18-${nextCaseId()}`;

    for (let i = 0; i < limit; i += 1) await registerPOST(registerFrom(ip));
    const refused = await registerPOST(registerFrom(ip));

    const retryAfter = Number(refused.headers.get('Retry-After'));
    expect(Number.isFinite(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    // The window is 15 minutes and the oldest request was moments ago, so the
    // wait must be close to a full window -- not a rounded-up guess.
    expect(retryAfter).toBeLessThanOrEqual(RATE_LIMIT_POLICY.auth.windowMs / 1000);
    expect(retryAfter).toBeGreaterThan(RATE_LIMIT_POLICY.auth.windowMs / 1000 - 60);
  });

  it('publishes a Remaining that counts down against the real count', async () => {
    const ip = `p18-${nextCaseId()}`;

    const first = await registerPOST(registerFrom(ip));
    const second = await registerPOST(registerFrom(ip));

    // Not "is a number" -- the constant header was a number too. These must
    // differ by exactly one, which only a real count produces.
    expect(first.headers.get('X-RateLimit-Limit')).toBe(String(limit));
    expect(Number(first.headers.get('X-RateLimit-Remaining'))).toBe(limit - 1);
    expect(Number(second.headers.get('X-RateLimit-Remaining'))).toBe(limit - 2);
  });

  it('does not count, and claims nothing, when the caller cannot be identified', async () => {
    // No proxy header: App Router has no NextRequest.ip, so there is no
    // trustworthy address. The old code bucketed all of these together under
    // the literal '127.0.0.1', which lets one abuser 429 every anonymous user.
    const anonymous = () =>
      new NextRequest(`${ORIGIN}/api/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(registration()),
      });

    for (let i = 0; i < limit + 3; i += 1) {
      const res = await registerPOST(anonymous());
      expect(res.status).toBe(201);
      expect(res.headers.get('X-RateLimit-Remaining')).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The counter itself, against real Redis
// ---------------------------------------------------------------------------

describe('checkRateLimit', () => {
  it('counts across calls — request N+1 is refused because of requests 1..N', async () => {
    const key = `${TEST_PREFIX}${nextCaseId()}:`;
    const config = { limit: 5, windowMs: 60_000, keyPrefix: key };

    const allowed: boolean[] = [];
    for (let i = 0; i < 6; i += 1) {
      allowed.push((await checkRateLimit('subject', config)).allowed);
    }

    expect(allowed).toEqual([true, true, true, true, true, false]);
  });

  it('reports counted:true, so the caller knows the numbers are real', async () => {
    const key = `${TEST_PREFIX}${nextCaseId()}:`;
    const result = await checkRateLimit('subject', { limit: 5, windowMs: 60_000, keyPrefix: key });

    expect(result.counted).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('does not spend budget on a request it refused', async () => {
    // The advertised contract is "N per window". If a rejected request still
    // consumed a slot, a client obeying Retry-After would be refused again on
    // arrival, and Retry-After would become the next piece of fiction.
    const key = `${TEST_PREFIX}${nextCaseId()}:`;
    const config = { limit: 2, windowMs: 60_000, keyPrefix: key };

    await checkRateLimit('subject', config);
    await checkRateLimit('subject', config);
    for (let i = 0; i < 5; i += 1) await checkRateLimit('subject', config);

    const members = await observer.zcard(`${key}subject`);
    expect(members).toBe(2);
  });

  it('recovers as the window slides, rather than staying blocked', async () => {
    const key = `${TEST_PREFIX}${nextCaseId()}:`;
    const config = { limit: 2, windowMs: 300, keyPrefix: key };

    expect((await checkRateLimit('subject', config)).allowed).toBe(true);
    expect((await checkRateLimit('subject', config)).allowed).toBe(true);
    expect((await checkRateLimit('subject', config)).allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 350));

    expect((await checkRateLimit('subject', config)).allowed).toBe(true);
  });

  it('reports a reset the window actually honours', async () => {
    // resetAt is when `remaining` next increases, i.e. one window after the
    // OLDEST surviving entry -- not a flat now+window, which is what the code
    // used to return regardless of the contents of the window.
    const key = `${TEST_PREFIX}${nextCaseId()}:`;
    const config = { limit: 5, windowMs: 2_000, keyPrefix: key };

    const first = await checkRateLimit('subject', config);
    await new Promise((resolve) => setTimeout(resolve, 600));
    const second = await checkRateLimit('subject', config);

    // Both look back to the same oldest entry, so the reset does not slide
    // forward just because a second request arrived.
    expect(Math.abs(second.resetAt.getTime() - first.resetAt.getTime())).toBeLessThan(50);
  });

  it('gives separate subjects separate budgets', async () => {
    const key = `${TEST_PREFIX}${nextCaseId()}:`;
    const config = { limit: 1, windowMs: 60_000, keyPrefix: key };

    expect((await checkRateLimit('a', config)).allowed).toBe(true);
    expect((await checkRateLimit('a', config)).allowed).toBe(false);
    expect((await checkRateLimit('b', config)).allowed).toBe(true);
  });

  it('lets the key expire rather than leaking a member per request forever', async () => {
    const key = `${TEST_PREFIX}${nextCaseId()}:`;
    await checkRateLimit('subject', { limit: 5, windowMs: 5_000, keyPrefix: key });

    const ttl = await observer.pttl(`${key}subject`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(5_000);
  });
});

// ---------------------------------------------------------------------------
// 3. The bucket cannot be chosen by the caller
// ---------------------------------------------------------------------------

describe('the caller does not get to pick its own bucket', () => {
  it('an authenticated caller cannot buy a fresh budget by changing an address', async () => {
    // THIS IS THE MUTATION CASE FOR THE IDENTITY FIX. The pre-P-18
    // `extractIdentifier` read `x-forwarded-for` for EVERY request, so a
    // logged-in caller took a whole new budget by varying one header they
    // control. Same defect P-00 fixed in security.ts, where the bucket came
    // from `x-user-id`. Restore the old identifier and this case reports 200
    // for the fourth request.
    const prefix = `${TEST_PREFIX}${nextCaseId()}:`;
    const userPolicy = policy({ limit: 3, keyBy: 'user' });
    const userId = `p18-user-${nextCaseId()}`;
    const token = await sessionTokenFor({ userId, email: 'probe@example.test' });

    const asUser = (ip: string) =>
      new NextRequest(`${ORIGIN}/api/test`, {
        headers: {
          cookie: `next-auth.session-token=${token}; __Secure-next-auth.session-token=${token}`,
          'x-forwarded-for': ip,
        },
      });

    // Three different source addresses, one session. One budget.
    const statuses: number[] = [];
    for (const ip of ['198.51.100.1', '198.51.100.2', '198.51.100.3', '198.51.100.4']) {
      statuses.push((await applyRateLimit(asUser(ip), userPolicy, prefix, ok)).status);
    }

    expect(statuses).toEqual([200, 200, 200, 429]);
    expect(await observer.zcard(`${prefix}user:${userId}`)).toBe(3);
    expect(await observer.exists(`${prefix}ip:198.51.100.1`)).toBe(0);
  });

  it('an anonymous caller on a user-keyed tier is still counted, by address', async () => {
    const prefix = `${TEST_PREFIX}${nextCaseId()}:`;
    const userPolicy = policy({ limit: 1, keyBy: 'user' });

    const first = await applyRateLimit(requestFrom('198.51.100.9'), userPolicy, prefix, ok);
    const second = await applyRateLimit(requestFrom('198.51.100.9'), userPolicy, prefix, ok);

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  it('takes the client from the left of a forwarded chain, not the proxy', async () => {
    const prefix = `${TEST_PREFIX}${nextCaseId()}:`;
    const req = new NextRequest(`${ORIGIN}/api/test`, {
      headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2' },
    });

    await applyRateLimit(req, policy(), prefix, ok);

    expect(await observer.exists(`${prefix}ip:203.0.113.7`)).toBe(1);
    expect(await observer.exists(`${prefix}ip:10.0.0.1`)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. The headers, and the promise about them
// ---------------------------------------------------------------------------

describe('X-RateLimit-* is published only when a real count produced it', () => {
  it('sets all three on an allowed, counted request', async () => {
    const prefix = `${TEST_PREFIX}${nextCaseId()}:`;

    const res = await applyRateLimit(requestFrom('203.0.113.20'), policy(), prefix, ok);

    expect(res.headers.get('X-RateLimit-Limit')).toBe('3');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('2');
    expect(Date.parse(res.headers.get('X-RateLimit-Reset') ?? '')).toBeGreaterThan(Date.now());
  });

  it('sets Remaining: 0 on the refusal, and it is true', async () => {
    const prefix = `${TEST_PREFIX}${nextCaseId()}:`;
    const ip = '203.0.113.21';

    for (let i = 0; i < 3; i += 1) await applyRateLimit(requestFrom(ip), policy(), prefix, ok);
    const refused = await applyRateLimit(requestFrom(ip), policy(), prefix, ok);

    expect(refused.status).toBe(429);
    expect(refused.headers.get('X-RateLimit-Remaining')).toBe('0');
  });

  it('does not call the handler at all once the budget is spent', async () => {
    const prefix = `${TEST_PREFIX}${nextCaseId()}:`;
    const ip = '203.0.113.22';
    const handler = jest.fn(ok);

    for (let i = 0; i < 3; i += 1) await applyRateLimit(requestFrom(ip), policy(), prefix, handler);
    await applyRateLimit(requestFrom(ip), policy(), prefix, handler);

    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('leaves the handler response body and status untouched', async () => {
    const prefix = `${TEST_PREFIX}${nextCaseId()}:`;

    const res = await applyRateLimit(requestFrom('203.0.113.23'), policy(), prefix, async () =>
      new Response(JSON.stringify({ data: 'intact' }), {
        status: 201,
        headers: { 'content-type': 'application/json', 'x-custom': 'kept' },
      })
    );

    expect(res.status).toBe(201);
    expect(res.headers.get('x-custom')).toBe('kept');
    await expect(res.json()).resolves.toEqual({ data: 'intact' });
  });

  it('does not choke on a bodyless response status', async () => {
    const prefix = `${TEST_PREFIX}${nextCaseId()}:`;

    const res = await applyRateLimit(requestFrom('203.0.113.24'), policy(), prefix, async () =>
      new Response(null, { status: 204 })
    );

    expect(res.status).toBe(204);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('3');
  });
});

// ---------------------------------------------------------------------------
// 5. The fail-open switch — exercised in both positions
// ---------------------------------------------------------------------------

describe('when Redis cannot answer', () => {
  const unreachable = 'redis://127.0.0.1:6399';
  let realUrl: string | undefined;

  beforeEach(async () => {
    realUrl = process.env.REDIS_URL;
    process.env.REDIS_URL = unreachable;
    await _closeRedis();
  });

  afterEach(async () => {
    await _closeRedis();
    if (realUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = realUrl;
  });

  it('fails open, and publishes NO headers — the absence is the signal', async () => {
    // Every shipped tier sets failOpen: true. The half that matters is the
    // second assertion: the middleware this replaced published
    // `Remaining: 99` unconditionally, so a client could not tell a live
    // budget from a dead one. It can now: there is no header.
    const prefix = `${TEST_PREFIX}${nextCaseId()}:`;
    const handler = jest.fn(ok);

    const res = await applyRateLimit(requestFrom('203.0.113.30'), policy(), prefix, handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Limit')).toBeNull();
    expect(res.headers.get('X-RateLimit-Remaining')).toBeNull();
    expect(res.headers.get('X-RateLimit-Reset')).toBeNull();
  });

  it('fails closed with 503 when a policy asks for it', async () => {
    // No shipped tier sets this today. It is covered so that the switch is
    // known to work if the auth tier is ever flipped -- an untested switch is
    // a claim nobody has measured, which is the habit this run keeps finding.
    const prefix = `${TEST_PREFIX}${nextCaseId()}:`;
    const handler = jest.fn(ok);

    const res = await applyRateLimit(
      requestFrom('203.0.113.31'),
      policy({ failOpen: false }),
      prefix,
      handler
    );

    expect(res.status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
    const body = await readJson<ErrBody>(res);
    expect(body.error.code).toBe('RATE_LIMIT_UNAVAILABLE');
  });

  it('a real route keeps working — a Redis outage is not an outage', async () => {
    const res = await registerPOST(registerFrom(`p18-${nextCaseId()}`));

    expect(res.status).toBe(201);
    const body = await readJson<OkBody<{ userId: string }>>(res);
    expect(body.data.userId).toBeTruthy();
    expect(res.headers.get('X-RateLimit-Remaining')).toBeNull();
  });
});
