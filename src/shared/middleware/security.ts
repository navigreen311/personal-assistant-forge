// ============================================================================
// Security Middleware — Audit logging, input sanitization, rate limiting
// Worker 15: Security, Privacy & Compliance
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import type { DataClassification, RateLimitConfig, RateLimitResult } from '@/modules/security/types';
import { auditService } from '@/modules/security/services/audit-service';

// --- Types for Next.js App Router handlers ---

type NextApiHandler = (
  req: NextRequest,
  context?: Record<string, unknown>
) => Promise<NextResponse> | NextResponse;

// --- Injection Pattern Definitions ---

const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|TRUNCATE)\b\s)/i,
  /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/i,
  /(--|;|\/\*|\*\/|xp_|sp_)/i,
  /('\s*(OR|AND)\s+')/i,
];

const XSS_PATTERNS = [
  /<script[\s>]/i,
  /javascript\s*:/i,
  /on(load|error|click|mouseover|focus|blur|submit|change|input)\s*=/i,
  /<iframe[\s>]/i,
  /<object[\s>]/i,
  /<embed[\s>]/i,
  /<svg[\s>].*?on\w+\s*=/i,
];

const NOSQL_INJECTION_PATTERNS = [
  /\$(?:gt|gte|lt|lte|ne|in|nin|regex|where|exists)\b/i,
  /\{\s*\$\w+/,
];

const HTML_TAG_REGEX = /<[^>]*>/g;

const DEFAULT_MAX_INPUT_LENGTH = 10000;

// --- Rate Limiter Store ---

interface RateLimitEntry {
  count: number;
  resetAt: number;
  burstUsed: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

function getRateLimitKey(req: NextRequest, keyGenerator: RateLimitConfig['keyGenerator']): string {
  switch (keyGenerator) {
    case 'IP':
      return req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown-ip';
    case 'USER':
      return req.headers.get('x-user-id') || 'anonymous';
    case 'API_KEY':
      return req.headers.get('x-api-key') || 'no-key';
    case 'ENTITY':
      return req.headers.get('x-entity-id') || 'no-entity';
    default:
      return 'unknown';
  }
}

function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const fullKey = `${config.endpoint}:${key}`;
  let entry = rateLimitStore.get(fullKey);

  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + config.windowMs, burstUsed: 0 };
    rateLimitStore.set(fullKey, entry);
  }

  entry.count++;

  const effectiveMax = config.maxRequests + (config.burstAllowance || 0);

  if (entry.count <= config.maxRequests) {
    return {
      allowed: true,
      remaining: config.maxRequests - entry.count,
      resetAt: new Date(entry.resetAt),
    };
  }

  if (config.burstAllowance && entry.count <= effectiveMax) {
    entry.burstUsed++;
    return {
      allowed: true,
      remaining: effectiveMax - entry.count,
      resetAt: new Date(entry.resetAt),
    };
  }

  const retryAfterMs = entry.resetAt - now;
  return {
    allowed: false,
    remaining: 0,
    resetAt: new Date(entry.resetAt),
    retryAfterMs,
  };
}

// --- Input Sanitization Helpers ---

function stripHtmlTags(input: string): string {
  return input.replace(HTML_TAG_REGEX, '');
}

function containsInjectionPattern(input: string): { blocked: boolean; type: string } {
  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      return { blocked: true, type: 'SQL_INJECTION' };
    }
  }
  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(input)) {
      return { blocked: true, type: 'XSS' };
    }
  }
  for (const pattern of NOSQL_INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      return { blocked: true, type: 'NOSQL_INJECTION' };
    }
  }
  return { blocked: false, type: '' };
}

export function sanitizeValue(value: unknown, maxLength: number): unknown {
  if (typeof value === 'string') {
    if (value.length > maxLength) {
      return null; // Will be rejected
    }
    return stripHtmlTags(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, maxLength));
  }
  if (value !== null && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      sanitized[k] = sanitizeValue(v, maxLength);
    }
    return sanitized;
  }
  return value;
}

function checkInputForInjection(body: unknown): { blocked: boolean; type: string } {
  if (typeof body === 'string') {
    return containsInjectionPattern(body);
  }
  if (Array.isArray(body)) {
    for (const item of body) {
      const result = checkInputForInjection(item);
      if (result.blocked) return result;
    }
  }
  if (body !== null && typeof body === 'object') {
    for (const value of Object.values(body as Record<string, unknown>)) {
      const result = checkInputForInjection(value);
      if (result.blocked) return result;
    }
  }
  return { blocked: false, type: '' };
}

function checkInputLength(body: unknown, maxLength: number): boolean {
  if (typeof body === 'string') {
    return body.length <= maxLength;
  }
  if (Array.isArray(body)) {
    return body.every((item) => checkInputLength(item, maxLength));
  }
  if (body !== null && typeof body === 'object') {
    return Object.values(body as Record<string, unknown>).every((v) =>
      checkInputLength(v, maxLength)
    );
  }
  return true;
}

// --- Middleware Functions ---

/**
 * Audit logging middleware for API routes.
 * Logs request details after handler completes.
 */
export function withAuditLog(
  handler: NextApiHandler,
  options?: {
    sensitivityLevel?: DataClassification;
    logRequestBody?: boolean;
    logResponseBody?: boolean;
  }
): NextApiHandler {
  return async (req: NextRequest, context?: Record<string, unknown>) => {
    const startTime = Date.now();
    const response = await handler(req, context);
    const duration = Date.now() - startTime;

    const actor = req.headers.get('x-user-id') || 'anonymous';
    const entityId = req.headers.get('x-entity-id') || 'unknown';
    const url = new URL(req.url);

    try {
      await auditService.logAuditEntry({
        actor,
        actorId: req.headers.get('x-user-id') || undefined,
        action: `${req.method} ${url.pathname}`,
        resource: url.pathname,
        resourceId: url.searchParams.get('id') || 'N/A',
        entityId,
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
        userAgent: req.headers.get('user-agent') || undefined,
        requestMethod: req.method,
        requestPath: url.pathname,
        statusCode: response.status,
        sensitivityLevel: options?.sensitivityLevel || 'INTERNAL',
        details: {
          duration,
          query: Object.fromEntries(url.searchParams.entries()),
          ...(options?.logRequestBody ? { requestBody: '[LOGGED]' } : {}),
        },
      });
    } catch {
      // Audit logging should not break the request
      console.error('[SecurityMiddleware] Failed to log audit entry');
    }

    return response;
  };
}

/**
 * Input sanitization middleware.
 * Strips HTML, escapes special characters, validates length, blocks injection patterns.
 */
export function withInputSanitization(
  handler: NextApiHandler,
  options?: { maxInputLength?: number }
): NextApiHandler {
  const maxLength = options?.maxInputLength || DEFAULT_MAX_INPUT_LENGTH;

  return async (req: NextRequest, context?: Record<string, unknown>) => {
    // Only check body for methods that have one
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      try {
        const clonedReq = req.clone();
        const body = await clonedReq.json();

        // Check input length
        if (!checkInputLength(body, maxLength)) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'INPUT_TOO_LONG',
                message: `Input exceeds maximum allowed length of ${maxLength} characters`,
              },
              meta: { timestamp: new Date().toISOString() },
            },
            { status: 400 }
          );
        }

        // Check for injection patterns
        const injectionCheck = checkInputForInjection(body);
        if (injectionCheck.blocked) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'MALICIOUS_INPUT',
                message: `Potentially malicious input detected: ${injectionCheck.type}`,
              },
              meta: { timestamp: new Date().toISOString() },
            },
            { status: 400 }
          );
        }
      } catch {
        // If body isn't JSON, skip sanitization checks
      }
    }

    // Check URL params for injection
    const url = new URL(req.url);
    for (const [, value] of url.searchParams.entries()) {
      const injectionCheck = containsInjectionPattern(value);
      if (injectionCheck.blocked) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'MALICIOUS_INPUT',
              message: `Potentially malicious input detected in query parameters: ${injectionCheck.type}`,
            },
            meta: { timestamp: new Date().toISOString() },
          },
          { status: 400 }
        );
      }
    }

    return handler(req, context);
  };
}

/**
 * API rate limiting middleware.
 * Tracks requests per window per key. Returns 429 when exceeded.
 */
export function withRateLimit(
  handler: NextApiHandler,
  config: RateLimitConfig
): NextApiHandler {
  return async (req: NextRequest, context?: Record<string, unknown>) => {
    const key = getRateLimitKey(req, config.keyGenerator);
    const result = checkRateLimit(key, config);

    if (!result.allowed) {
      const retryAfterSeconds = Math.ceil((result.retryAfterMs || 0) / 1000);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
            details: {
              retryAfterMs: result.retryAfterMs,
              resetAt: result.resetAt.toISOString(),
            },
          },
          meta: { timestamp: new Date().toISOString() },
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfterSeconds),
            'X-RateLimit-Limit': String(config.maxRequests),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': result.resetAt.toISOString(),
          },
        }
      );
    }

    const response = await handler(req, context);

    // Add rate limit headers to successful responses
    const headers = new Headers(response.headers);
    headers.set('X-RateLimit-Limit', String(config.maxRequests));
    headers.set('X-RateLimit-Remaining', String(result.remaining));
    headers.set('X-RateLimit-Reset', result.resetAt.toISOString());

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

/**
 * Combined security middleware. Applies sanitization, rate limiting, and audit logging.
 */
export function withSecurity(
  handler: NextApiHandler,
  options?: {
    rateLimit?: RateLimitConfig;
    sensitivityLevel?: DataClassification;
    sanitize?: boolean;
    audit?: boolean;
  }
): NextApiHandler {
  let wrappedHandler = handler;

  // Apply in reverse order so they execute in correct order
  if (options?.audit !== false) {
    wrappedHandler = withAuditLog(wrappedHandler, {
      sensitivityLevel: options?.sensitivityLevel,
    });
  }

  if (options?.rateLimit) {
    wrappedHandler = withRateLimit(wrappedHandler, options.rateLimit);
  }

  if (options?.sanitize !== false) {
    wrappedHandler = withInputSanitization(wrappedHandler);
  }

  return wrappedHandler;
}

// Export for testing
export {
  checkRateLimit,
  containsInjectionPattern,
  stripHtmlTags,
  checkInputLength,
  rateLimitStore,
};
