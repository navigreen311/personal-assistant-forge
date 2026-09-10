// ============================================================================
// P-18 / T-012 — THE ONE RATE LIMITER
// ============================================================================
//
// WHAT WAS HERE BEFORE
//
// Three rate limiters, none of which limited anything:
//
//   1. this file — a genuine Redis sliding window, imported by ZERO routes and
//      exercised only by a unit test that mocked `ioredis` and then asserted
//      the header values that mock had been told to produce;
//   2. `src/middleware.ts:97-99` — `X-RateLimit-Limit: 100` and
//      `X-RateLimit-Remaining: 99` written as string constants onto every API
//      response, with a comment conceding that "actual rate limiting should be
//      done at the infrastructure level";
//   3. `src/shared/middleware/security.ts` — a second, in-memory `Map` limiter
//      that P-00 had already identified as dead middleware.
//
// (2) and (3) are gone. This file is the only rate limiter in the repository,
// and it is now wired to routes.
//
// WHY A HEADER IS THE WORST OF THE THREE
//
// An absent limiter is a gap an operator can find. A limiter that ADVERTISES a
// budget nobody is counting is worse, because it is load-bearing in someone
// else's code: a well-behaved client reads `X-RateLimit-Remaining` and paces
// itself, so the honest callers throttle themselves while the abusive ones —
// who ignore the header — are unaffected. The header inverts the control. It
// also silences the people best placed to notice: a reviewer who greps for
// "rate limit" finds headers, concludes it is handled, and moves on.
//
// The rule this file follows, therefore:
//
//   *** AN X-RateLimit-* HEADER IS EMITTED IF AND ONLY IF A REAL COUNT IN
//       REDIS PRODUCED THE NUMBER IN IT. ***
//
// When Redis is unreachable, or when the caller cannot be identified, the
// request is allowed through and NO rate-limit headers are set at all. The
// absence is the signal. Silence is honest; `Remaining: 99` is not.
//
// ============================================================================
// FAIL OPEN — the decision, and why it is kept
// ============================================================================
//
// The pre-existing code failed open on a Redis error. That is kept, and I agree
// with it, for three reasons:
//
//   * Nothing behind this limiter is protected ONLY by the limiter. Every
//     limited route still runs `withAuth` / `withRole` / `withEntityScope`.
//     This is cost and abuse control, not authorization, so failing closed
//     would trade a bounded overspend for a total outage.
//   * Failing closed converts a Redis blip into a 100% error rate on the
//     product's most expensive and most useful endpoints. That is a strictly
//     worse incident than a window of unmetered requests.
//   * The client is `lazyConnect` with `maxRetriesPerRequest: 1`, so an absent
//     Redis rejects quickly rather than hanging the request.
//
// The one place I would argue the other way is the `auth` tier: on
// `POST /api/auth/register` the limit IS the only control against automated
// account creation, and a fail-open limiter evaporates exactly when it is
// needed most. I have NOT flipped it, because failing closed there turns a
// Redis outage into a signup outage, and that is a product availability
// decision rather than a middleware one. The switch is a per-tier field
// (`failOpen`) so flipping it is one reviewed line rather than a rewrite, and
// `tests/db/rate-limit.test.ts` covers both settings.
//
// ============================================================================
// IDENTITY — who gets a bucket
// ============================================================================
//
// The old `extractIdentifier` read `x-forwarded-for` for every request. That is
// the same class of defect P-00 fixed in `security.ts`, where the rate-limit
// bucket came from a client-settable header: an authenticated caller could take
// a fresh budget on every request by varying one header.
//
// So:
//   * a `user`-keyed tier buckets on the userId from the VERIFIED NextAuth JWT
//     (`resolveActor`) — unspoofable, and stable across a caller's addresses;
//   * an anonymous caller, or an `ip`-keyed tier, buckets on the client IP;
//   * if NEITHER can be determined, the request is NOT counted and no headers
//     are emitted.
//
// That last branch is deliberate, and it is a fix rather than a hole. The old
// code fell back to the literal `'127.0.0.1'` for any request without a
// forwarding header, which puts every unidentifiable caller into ONE shared
// bucket — so a single abuser consumes the global budget and every other
// anonymous user gets 429. A rate limiter that behaves that way is a
// denial-of-service amplifier. Refusing to count is the honest answer, and it
// is announced in the log rather than inferred from silence.
//
// DEPLOYMENT REQUIREMENT, stated because it is now load-bearing: the App Router
// removed `NextRequest.ip`, so the ONLY source of a client address is a
// forwarding header. IP-keyed limiting therefore requires a proxy or load
// balancer that OVERWRITES `x-forwarded-for` rather than appending to a
// client-supplied one. Without that proxy the `auth` tier does not limit — and
// it says so once per process instead of pretending.
// ============================================================================

import type { NextRequest } from 'next/server';
import Redis from 'ioredis';
import { error } from '@/shared/utils/api-response';
import { resolveActor } from '@/shared/middleware/auth';

// --- Policy -----------------------------------------------------------------

/**
 * The tiers. Deliberately few: a per-route number is a number nobody
 * maintains, and 337 routes cannot each be reasoned about individually. Every
 * limited route names one of these, so the whole policy is one screen.
 */
export type RateLimitTier = 'auth' | 'ai' | 'bulk' | 'send' | 'search';

/** Which property of the caller gets its own budget. */
export type RateLimitKeyBy = 'ip' | 'user';

export interface RateLimitPolicy {
  /** Requests permitted per window. The (limit + 1)th is refused. */
  readonly limit: number;
  readonly windowMs: number;
  readonly keyBy: RateLimitKeyBy;
  /** Allow the request through when Redis cannot answer. See the note above. */
  readonly failOpen: boolean;
  /** Why this number and not another. */
  readonly reason: string;
}

const MINUTE = 60_000;

export const RATE_LIMIT_POLICY: Record<RateLimitTier, RateLimitPolicy> = {
  // Unauthenticated and credential-adjacent. There is no session yet, so the
  // bucket is the source address. Low, because no human registers twice.
  auth: {
    limit: 10,
    windowMs: 15 * MINUTE,
    keyBy: 'ip',
    failOpen: true,
    reason: 'unauthenticated account creation; the limit is the only control',
  },
  // Anything that calls a model or a paid vendor on the caller's behalf. The
  // cost of an unbounded loop here is money, not merely CPU.
  ai: {
    limit: 20,
    windowMs: 5 * MINUTE,
    keyBy: 'user',
    failOpen: true,
    reason: 'each call spends money with an external model provider',
  },
  // One request, unbounded work: a bulk PATCH over ten thousand ids is one line
  // in an access log and a long transaction in Postgres.
  bulk: {
    limit: 30,
    windowMs: MINUTE,
    keyBy: 'user',
    failOpen: true,
    reason: 'one request does unbounded database work',
  },
  // Irreversible and visible to third parties: mail, SMS, outbound calls.
  send: {
    limit: 30,
    windowMs: MINUTE,
    keyBy: 'user',
    failOpen: true,
    reason: 'irreversible, speaks in the entity name, and can get a domain blocked',
  },
  // Read-shaped but expensive: full-text fan-out across five models per call.
  search: {
    limit: 60,
    windowMs: MINUTE,
    keyBy: 'user',
    failOpen: true,
    reason: 'full-text fan-out across five tables per request',
  },
};

// --- Types ------------------------------------------------------------------

export interface RateLimitConfig {
  limit: number;
  windowMs: number;
  keyPrefix?: string;
}

export interface RateLimitResult {
  /**
   * True only when Redis actually counted this request. When false, every other
   * field is a default and MUST NOT be published in a header — which is the
   * entire point of this package.
   */
  counted: boolean;
  allowed: boolean;
  limit: number;
  /** Requests left in the window. Meaningful only when `counted`. */
  remaining: number;
  /** When `remaining` next increases. Meaningful only when `counted`. */
  resetAt: Date;
  /** Set only on a refusal: the earliest moment a retry can succeed. */
  retryAfterMs?: number;
}

// --- Redis singleton --------------------------------------------------------

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 2000,
      // The grace ioredis gives a socket to close itself on disconnect before
      // destroying it. The 2s default outlives a Jest teardown and is reported
      // as an open handle; nothing here needs two seconds to hang up.
      disconnectTimeout: 500,
    });
    const client = redis;
    client.on('error', () => {
      // Handled per request in checkRateLimit. An unhandled 'error' event on an
      // ioredis client is a process-level unhandled exception.
    });
    // The limiter's connection is a long-lived singleton with no close point --
    // a Next.js route handler never "finishes" the way a script does -- so
    // nothing ever disconnects it, by design. `unref` says the one thing that
    // is therefore true of it: this socket must not, on its own, keep the
    // process alive. Under a server that changes nothing, because the HTTP
    // listener holds the loop open. Under a test runner or a CLI it is the
    // difference between exiting and hanging: `tests/db/search.test.ts` calls a
    // limited route, which creates this client, and that suite has no way to
    // close a singleton it does not own -- so without this the whole
    // `test:db` job passed 826 tests and then hung until CI cancelled it.
    // Re-armed on every 'connect' because a reconnect brings a new socket.
    client.on('connect', () => {
      client.stream.unref();
    });
  }
  return redis;
}

/** Test seam: drop the cached client so the next call reconnects. */
export function _resetRedis(): void {
  redis = null;
}

/**
 * Test seam: drop the connection and leave no timer behind.
 *
 * `quit()` is deliberately not used. On a client that is mid-reconnect — which
 * is exactly the state `tests/db/rate-limit.test.ts` puts it in when it points
 * REDIS_URL at a dead port — ioredis routes `quit` through
 * `AbstractConnector.disconnect`, which arms a `disconnectTimeout` timer that
 * only clears on the socket's `close` event. Against a socket that already died
 * that event does not come again, so the timer outlives the suite and Jest
 * reports an open handle. `disconnect()` on a client that never connected takes
 * the `status === 'wait'` branch instead and arms nothing.
 */
export async function _closeRedis(): Promise<void> {
  const client = redis;
  redis = null;
  if (!client) return;
  if (client.status === 'ready') {
    try {
      await client.quit();
      return;
    } catch {
      // fall through to the hard disconnect
    }
  }
  client.disconnect();
}

// --- The count --------------------------------------------------------------

function scoreOf(entry: unknown): number | null {
  if (!Array.isArray(entry) || entry.length < 2) return null;
  const score = Number(entry[1]);
  return Number.isFinite(score) ? score : null;
}

/**
 * Sliding-window count against Redis.
 *
 * A REFUSED REQUEST DOES NOT CONSUME BUDGET. The member is added first, so the
 * count is taken atomically in one pipeline, and removed again if the request
 * turned out to be over the limit. Without that, a client that keeps hammering
 * keeps pushing its own window forward and can never recover at the moment
 * `Retry-After` promised — which would make `Retry-After` the next piece of
 * confident fiction. The advertised contract is "N per window"; a rejected
 * request is not one of the N.
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const { limit, windowMs, keyPrefix = 'rl:' } = config;
  const key = `${keyPrefix}${identifier}`;
  const now = Date.now();
  const windowStart = now - windowMs;
  const member = `${now}:${Math.random().toString(36).slice(2)}`;
  const uncounted: RateLimitResult = {
    counted: false,
    allowed: true,
    limit,
    remaining: limit,
    resetAt: new Date(now + windowMs),
  };

  try {
    const client = getRedis();
    const results = await client
      .pipeline()
      .zremrangebyscore(key, 0, windowStart) // [0] drop entries older than the window
      .zadd(key, now.toString(), member) //     [1] provisionally record this one
      .zcard(key) //                            [2] how many are in the window now
      .zrange(key, 0, 0, 'WITHSCORES') //       [3] the oldest, for an honest reset
      .pexpire(key, windowMs) //                [4] the key cannot outlive its window
      .exec();

    if (!results) return uncounted;

    const failed = results.find((entry) => entry[0] !== null);
    if (failed) throw failed[0];

    const count = Number(results[2]?.[1] ?? 0);
    if (!Number.isFinite(count) || count < 1) return uncounted;

    const oldest = scoreOf(results[3]?.[1]) ?? now;

    if (count <= limit) {
      return {
        counted: true,
        allowed: true,
        limit,
        remaining: limit - count,
        resetAt: new Date(oldest + windowMs),
      };
    }

    // Over the limit. Hand the budget back, then work out when a retry can
    // actually win: the caller needs entries 0..(count - limit - 1) of the
    // pre-existing members to age out, so the earliest success is one window
    // after member (count - limit - 1).
    const index = count - limit - 1;
    const refusal = await client
      .pipeline()
      .zrem(key, member)
      .zrange(key, index, index, 'WITHSCORES')
      .exec();

    const blocking = scoreOf(refusal?.[1]?.[1]) ?? oldest;
    const retryAfterMs = Math.max(0, blocking + windowMs - now);

    return {
      counted: true,
      allowed: false,
      limit,
      remaining: 0,
      resetAt: new Date(now + retryAfterMs),
      retryAfterMs,
    };
  } catch {
    warnOnce(
      'redis-unavailable',
      '[rate-limit] Redis unavailable: requests are NOT being counted and no ' +
        'X-RateLimit-* headers will be sent. Nothing is limiting these routes.'
    );
    return uncounted;
  }
}

// --- Identity ---------------------------------------------------------------

/**
 * The client address, or null when there is no trustworthy source for one.
 *
 * `x-forwarded-for` is only meaningful behind a proxy that overwrites it; a
 * direct client can set it to anything and mint itself a fresh bucket on every
 * request. That residual is accepted here because every authenticated tier
 * buckets on the verified JWT instead, and because the alternative — one shared
 * bucket for everybody — is worse. See the deployment note at the top.
 */
function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip')?.trim();
  return real ? real : null;
}

/**
 * The bucket this request belongs to, or null when the caller cannot be
 * identified at all — in which case nothing is counted and nothing is claimed.
 */
export async function resolveRateLimitIdentity(
  req: NextRequest,
  keyBy: RateLimitKeyBy
): Promise<string | null> {
  if (keyBy === 'user') {
    const who = await resolveActor(req);
    if (who) return `user:${who.actorId}`;
    // An anonymous caller on a user-keyed tier still gets counted, by address,
    // rather than waved through.
  }
  const ip = clientIp(req);
  return ip === null ? null : `ip:${ip}`;
}

// --- The wrapper routes use -------------------------------------------------

const warned = new Set<string>();

function warnOnce(tag: string, message: string): void {
  if (warned.has(tag)) return;
  warned.add(tag);
  console.warn(message);
}

/** Test seam: forget which warnings have already been printed. */
export function _resetWarnings(): void {
  warned.clear();
}

const BODYLESS_STATUSES = new Set([101, 103, 204, 205, 304]);

function publishHeaders(response: Response, result: RateLimitResult): Response {
  const headers = new Headers(response.headers);
  headers.set('X-RateLimit-Limit', String(result.limit));
  headers.set('X-RateLimit-Remaining', String(result.remaining));
  headers.set('X-RateLimit-Reset', result.resetAt.toISOString());

  return new Response(BODYLESS_STATUSES.has(response.status) ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Apply a tier to a route handler.
 *
 *     export async function POST(request: NextRequest) {
 *       return withRateLimit(request, 'bulk', (req) => withRole(req, ...));
 *     }
 *
 * Placed OUTSIDE the auth wrappers on purpose: a refused request never reaches
 * the handler, the entity-ownership query, or the work itself. On a user-keyed
 * tier the limiter DOES decrypt the session token -- that is what makes the
 * bucket unspoofable -- so the saving is the database round trip and the work,
 * not the crypto. Two consequences worth naming: a 429 can be returned to a
 * caller who was never authenticated, so a 429 does not imply a valid session;
 * and an anonymous flood against a user-keyed route is bucketed by address.
 */
export async function withRateLimit(
  request: NextRequest,
  tier: RateLimitTier,
  handler: (req: NextRequest) => Promise<Response>
): Promise<Response> {
  return applyRateLimit(request, RATE_LIMIT_POLICY[tier], `rl:${tier}:`, handler);
}

/**
 * `withRateLimit` with the policy passed in rather than looked up by tier.
 *
 * Exported so `tests/db/rate-limit.test.ts` can drive a policy the table does
 * not contain — in particular `failOpen: false`, which no shipped tier sets.
 * A `failOpen` field that nothing ever exercises is a switch nobody has checked
 * still works, and this run has found six pieces of code confidently reporting
 * something nothing had measured. Routes should name a tier, not call this.
 */
export async function applyRateLimit(
  request: NextRequest,
  policy: RateLimitPolicy,
  keyPrefix: string,
  handler: (req: NextRequest) => Promise<Response>
): Promise<Response> {
  const identity = await resolveRateLimitIdentity(request, policy.keyBy);

  if (identity === null) {
    warnOnce(
      `unidentified:${keyPrefix}`,
      `[rate-limit] "${keyPrefix}": no verified session and no client address ` +
        '(x-forwarded-for / x-real-ip). This request is NOT counted and no ' +
        'X-RateLimit-* headers will be sent. IP-keyed limiting needs a proxy ' +
        'that sets a forwarding header.'
    );
    return handler(request);
  }

  const result = await checkRateLimit(identity, {
    limit: policy.limit,
    windowMs: policy.windowMs,
    keyPrefix,
  });

  // Redis did not answer. Fail per the tier, and — the important half — publish
  // no numbers, because there are none.
  if (!result.counted) {
    if (policy.failOpen) return handler(request);
    return error(
      'RATE_LIMIT_UNAVAILABLE',
      'Rate limiting is temporarily unavailable; this request was refused rather than left uncounted.',
      503
    );
  }

  if (!result.allowed) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((result.retryAfterMs ?? policy.windowMs) / 1000)
    );
    const response = error('RATE_LIMITED', 'Too many requests', 429);
    response.headers.set('Retry-After', String(retryAfterSeconds));
    return publishHeaders(response, result);
  }

  return publishHeaders(await handler(request), result);
}
