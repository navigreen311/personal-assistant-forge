import type { NextRequest } from 'next/server';
import Redis from 'ioredis';
import { error } from '@/shared/utils/api-response';

// --- Types ---

export interface RateLimitConfig {
  limit: number;
  windowMs: number;
  keyPrefix?: string;
  identifierFn?: (req: NextRequest) => string;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterMs?: number;
}

// --- Redis Singleton ---

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    redis.on('error', () => {
      // Silently handle connection errors — fail open in checkRateLimit
    });
  }
  return redis;
}

// Exported for testing
export function _resetRedis(): void {
  redis = null;
}

// --- Core Functions ---

export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const { limit, windowMs, keyPrefix = 'rl:' } = config;
  const key = `${keyPrefix}${identifier}`;
  const now = Date.now();
  const windowStart = now - windowMs;
  const resetAt = new Date(now + windowMs);

  try {
    const client = getRedis();
    const pipeline = client.pipeline();

    // Remove entries outside the current window
    pipeline.zremrangebyscore(key, 0, windowStart);
    // Add current request
    pipeline.zadd(key, now.toString(), `${now}:${Math.random()}`);
    // Count requests in window
    pipeline.zcard(key);
    // Set TTL so keys auto-expire
    pipeline.expire(key, Math.ceil(windowMs / 1000));

    const results = await pipeline.exec();
    if (!results) {
      // Pipeline returned null — fail open
      return { allowed: true, limit, remaining: limit - 1, resetAt };
    }

    const count = (results[2]?.[1] as number) ?? 0;
    const remaining = Math.max(0, limit - count);
    const allowed = count <= limit;

    if (!allowed) {
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetAt,
        retryAfterMs: windowMs,
      };
    }

    return { allowed: true, limit, remaining, resetAt };
  } catch {
    // Redis unavailable — fail open
    console.warn('[rate-limit] Redis unavailable, allowing request (fail open)');
    return { allowed: true, limit, remaining: limit - 1, resetAt };
  }
}

function extractIdentifier(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return (req as unknown as { ip?: string }).ip ?? '127.0.0.1';
}

export function withRateLimit(
  limit: number,
  windowMs: number,
  options?: Partial<RateLimitConfig>
): (req: NextRequest, handler: (req: NextRequest) => Promise<Response>) => Promise<Response> {
  const config: RateLimitConfig = { limit, windowMs, ...options };

  return async (req: NextRequest, handler: (req: NextRequest) => Promise<Response>) => {
    const identifierFn = config.identifierFn ?? extractIdentifier;
    const identifier = identifierFn(req);
    const result = await checkRateLimit(identifier, config);

    if (!result.allowed) {
      const retryAfterSeconds = Math.ceil((result.retryAfterMs ?? windowMs) / 1000);
      const response = error('RATE_LIMITED', 'Too many requests', 429);
      response.headers.set('Retry-After', retryAfterSeconds.toString());
      response.headers.set('X-RateLimit-Limit', result.limit.toString());
      response.headers.set('X-RateLimit-Remaining', '0');
      response.headers.set('X-RateLimit-Reset', result.resetAt.toISOString());
      return response;
    }

    const response = await handler(req);

    // Clone response to add headers
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers),
    });
    newResponse.headers.set('X-RateLimit-Limit', result.limit.toString());
    newResponse.headers.set('X-RateLimit-Remaining', result.remaining.toString());
    newResponse.headers.set('X-RateLimit-Reset', result.resetAt.toISOString());

    return newResponse;
  };
}
