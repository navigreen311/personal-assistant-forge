/**
 * P-18 / T-012 — `src/shared/middleware/rate-limit.ts`, the parts a unit test
 * can honestly prove.
 *
 * ============================================================================
 * WHAT THIS FILE USED TO BE, AND WHY IT PROVED NOTHING
 * ============================================================================
 *
 * The previous version of this file mocked `ioredis` so that `pipeline.exec()`
 * returned a hand-written `[[null, 11]]` for the ZCARD, then asserted that
 * `checkRateLimit` reported `allowed: false`. Every "limit" case worked the
 * same way: the test told the mock how many requests were in the window, and
 * then checked that the code did the subtraction. Nine of its assertions were
 * on header VALUES — and headers were the lie this package exists to remove.
 *
 * At no point did a request get refused because an earlier request had been
 * made. Nothing was counted, so nothing was limited, so the suite could not
 * have failed if the limiter had been a no-op that returned the numbers it was
 * handed. It passed for the whole time the platform advertised
 * `X-RateLimit-Remaining: 99` with nothing counting anything.
 *
 * THE REAL PROOF IS `tests/db/rate-limit.test.ts`: a real Redis, N requests
 * allowed, the (N+1)th refused, the refusal visible in the response and not
 * merely in a mock's return value. It runs in the `db-test` CI job, which has
 * Redis. This file deliberately does NOT reimplement Redis in a `Map`, because
 * a fake that behaves exactly as the author expects is how the old file came to
 * be worthless.
 *
 * ============================================================================
 * WHAT IS LEFT HERE, THEN
 * ============================================================================
 *
 * The unit job has NO Redis, deliberately (P-22/P-11 — see the ci.yml comment
 * on the `redis` service). So this file tests exactly the behaviour that must
 * hold when Redis is ABSENT, which is the condition the unit job is in:
 *
 *   1. the policy table is well formed, so a tier cannot ship a nonsense budget;
 *   2. identity resolution — a user-keyed tier buckets on the VERIFIED JWT, not
 *      on a header the caller controls;
 *   3. degradation — with no Redis the request is allowed through AND NO
 *      `X-RateLimit-*` HEADER IS EMITTED. That is the whole thesis of the
 *      package: a number is published only when a real count produced it.
 */

import { NextRequest } from 'next/server';

// Redis is absent, exactly as it is in the `lint-typecheck-test` CI job. Every
// command rejects; nothing here tells the limiter what the count "should" be.
const redisUnavailable = new Error('connect ECONNREFUSED 127.0.0.1:6379');
const mockExec = jest.fn(() => Promise.reject(redisUnavailable));
const mockPipeline = {
  zremrangebyscore: jest.fn().mockReturnThis(),
  zadd: jest.fn().mockReturnThis(),
  zcard: jest.fn().mockReturnThis(),
  zrange: jest.fn().mockReturnThis(),
  zrem: jest.fn().mockReturnThis(),
  pexpire: jest.fn().mockReturnThis(),
  exec: mockExec,
};

jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    pipeline: jest.fn(() => mockPipeline),
    on: jest.fn(),
  }))
);

jest.mock('next-auth/jwt', () => ({ getToken: jest.fn() }));

import { getToken } from 'next-auth/jwt';
import {
  RATE_LIMIT_POLICY,
  checkRateLimit,
  resolveRateLimitIdentity,
  withRateLimit,
  _resetRedis,
  _resetWarnings,
  type RateLimitTier,
} from '@/shared/middleware/rate-limit';

const mockedGetToken = getToken as jest.MockedFunction<typeof getToken>;

const ORIGIN = 'http://localhost:3000';

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`${ORIGIN}/api/test`, { headers });
}

const TIERS = Object.keys(RATE_LIMIT_POLICY) as RateLimitTier[];

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  _resetRedis();
  _resetWarnings();
  mockedGetToken.mockResolvedValue(null);
  mockExec.mockImplementation(() => Promise.reject(redisUnavailable));
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// 1. The policy table
// ---------------------------------------------------------------------------

describe('RATE_LIMIT_POLICY', () => {
  it('gives every tier a positive budget over a positive window', () => {
    for (const tier of TIERS) {
      const policy = RATE_LIMIT_POLICY[tier];
      expect(policy.limit).toBeGreaterThan(0);
      expect(policy.windowMs).toBeGreaterThan(0);
      expect(['ip', 'user']).toContain(policy.keyBy);
    }
  });

  it('states a reason for every tier, so a number cannot arrive unexplained', () => {
    for (const tier of TIERS) {
      expect(RATE_LIMIT_POLICY[tier].reason.length).toBeGreaterThan(10);
    }
  });

  it('keys the unauthenticated tier on address and the rest on the session', () => {
    // There is no session on /api/auth/register, so `user` would be
    // unresolvable there; everywhere else a header-derived bucket would let a
    // caller mint a fresh budget per request.
    expect(RATE_LIMIT_POLICY.auth.keyBy).toBe('ip');
    for (const tier of TIERS.filter((t) => t !== 'auth')) {
      expect(RATE_LIMIT_POLICY[tier].keyBy).toBe('user');
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Identity — the bucket must not be chosen by the caller
// ---------------------------------------------------------------------------

describe('resolveRateLimitIdentity', () => {
  it('buckets an authenticated caller on the verified userId, not on a header', async () => {
    mockedGetToken.mockResolvedValue({ userId: 'user-abc' } as never);

    const identity = await resolveRateLimitIdentity(
      req({ 'x-forwarded-for': '203.0.113.9' }),
      'user'
    );

    expect(identity).toBe('user:user-abc');
  });

  it('gives the same caller the same bucket from a different address', async () => {
    mockedGetToken.mockResolvedValue({ userId: 'user-abc' } as never);

    const first = await resolveRateLimitIdentity(req({ 'x-forwarded-for': '1.1.1.1' }), 'user');
    const second = await resolveRateLimitIdentity(req({ 'x-forwarded-for': '2.2.2.2' }), 'user');

    expect(first).toBe(second);
  });

  it('ignores the session on an ip-keyed tier', async () => {
    mockedGetToken.mockResolvedValue({ userId: 'user-abc' } as never);

    const identity = await resolveRateLimitIdentity(
      req({ 'x-forwarded-for': '203.0.113.9' }),
      'ip'
    );

    expect(identity).toBe('ip:203.0.113.9');
  });

  it('takes the client, not the proxy, from a forwarded chain', async () => {
    const identity = await resolveRateLimitIdentity(
      req({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1, 10.0.0.2' }),
      'ip'
    );

    expect(identity).toBe('ip:203.0.113.9');
  });

  it('falls back to x-real-ip', async () => {
    const identity = await resolveRateLimitIdentity(req({ 'x-real-ip': '198.51.100.4' }), 'ip');

    expect(identity).toBe('ip:198.51.100.4');
  });

  it('falls back to the address when a user-keyed tier has no session', async () => {
    const identity = await resolveRateLimitIdentity(
      req({ 'x-forwarded-for': '198.51.100.4' }),
      'user'
    );

    expect(identity).toBe('ip:198.51.100.4');
  });

  it('returns null rather than putting every unidentifiable caller in one bucket', async () => {
    // The old code returned the literal '127.0.0.1' here, so every request
    // without a forwarding header shared a single counter -- one abuser could
    // then 429 every other anonymous user. A limiter that does that is a
    // denial-of-service amplifier, so this branch refuses to count instead.
    expect(await resolveRateLimitIdentity(req(), 'ip')).toBeNull();
    expect(await resolveRateLimitIdentity(req(), 'user')).toBeNull();
    expect(await resolveRateLimitIdentity(req({ 'x-forwarded-for': '   ' }), 'ip')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Degradation — the part that must hold with Redis absent
// ---------------------------------------------------------------------------

describe('with Redis unavailable', () => {
  const handler = jest.fn(async () => new Response('{}', { status: 200 }));

  beforeEach(() => {
    handler.mockClear();
    mockedGetToken.mockResolvedValue({ userId: 'user-abc' } as never);
  });

  it('reports that it did not count, rather than reporting a count', async () => {
    const result = await checkRateLimit('user:user-abc', { limit: 10, windowMs: 60_000 });

    expect(result.counted).toBe(false);
    expect(result.allowed).toBe(true);
  });

  it('says so in the log instead of leaving the operator to infer it', async () => {
    await checkRateLimit('user:user-abc', { limit: 10, windowMs: 60_000 });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('NOT being counted'));
  });

  it('lets the request through (fail open)', async () => {
    const res = await withRateLimit(req({ 'x-forwarded-for': '203.0.113.9' }), 'search', handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });

  it('emits NO rate-limit headers, because there is no number to publish', async () => {
    // This is the whole package in one assertion. The middleware this replaces
    // set `X-RateLimit-Remaining: 99` on every response while nothing counted
    // anything; a client that paced itself on that header was pacing itself on
    // a constant. Absence is the honest report.
    const res = await withRateLimit(req({ 'x-forwarded-for': '203.0.113.9' }), 'search', handler);

    expect(res.headers.get('X-RateLimit-Limit')).toBeNull();
    expect(res.headers.get('X-RateLimit-Remaining')).toBeNull();
    expect(res.headers.get('X-RateLimit-Reset')).toBeNull();
  });

  it('preserves the handler response body and status', async () => {
    handler.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 201 }));

    const res = await withRateLimit(req({ 'x-forwarded-for': '203.0.113.9' }), 'bulk', handler);

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});

describe('with no identifiable caller', () => {
  const handler = jest.fn(async () => new Response('{}', { status: 200 }));

  beforeEach(() => {
    handler.mockClear();
    mockedGetToken.mockResolvedValue(null);
  });

  it('runs the handler, publishes nothing, and warns once', async () => {
    const res = await withRateLimit(req(), 'auth', handler);
    await withRateLimit(req(), 'auth', handler);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(res.headers.get('X-RateLimit-Limit')).toBeNull();

    const unidentified = warnSpy.mock.calls.filter((call) =>
      String(call[0]).includes('no verified session and no client address')
    );
    expect(unidentified).toHaveLength(1);
  });

  it('never reaches Redis at all', async () => {
    await withRateLimit(req(), 'auth', handler);

    expect(mockExec).not.toHaveBeenCalled();
  });
});
