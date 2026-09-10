// ============================================================================
// Security Middleware — Audit logging and input sanitization
// Worker 15: Security, Privacy & Compliance
// ============================================================================
//
// P-18 / T-012 — THE SECOND RATE LIMITER USED TO LIVE HERE AND IS NOW GONE.
//
// This file held an in-memory `Map`-based sliding-window limiter
// (`rateLimitStore`, `getRateLimitKey`, `checkRateLimit`, `withRateLimit`, and
// the `rateLimit` option on `withSecurity`). P-00 established it was dead
// middleware: no route imported it, so nothing it did was ever observed
// outside its own unit tests.
//
// It is deleted rather than wired up, because it could not be the real one:
//   * a `Map` in one process is not a rate limit on a deployment with more than
//     one instance, and it resets to empty on every restart and redeploy — so
//     it would have been a third thing that reports a budget it cannot keep;
//   * it duplicated the responsibility of `src/shared/middleware/rate-limit.ts`,
//     which is Redis-backed and therefore survives both. Three limiters is
//     worse than one, because the next reader cannot tell which is
//     authoritative.
//
// `src/shared/middleware/rate-limit.ts` is now the only rate limiter in the
// repository. `withSecurity` no longer takes a `rateLimit` option; compose the
// route with `withRateLimit(req, tier, handler)` from that module instead.

import { NextRequest, NextResponse } from 'next/server';
import type { DataClassification } from '@/modules/security/types';
import { auditService } from '@/modules/security/services/audit-service';
import { resolveActor, resolveVerifiedEntityId } from '@/shared/middleware/auth';

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

    // P-00/T-003: the audit actor is read from the verified session, never
    // from a client-settable header.
    const who = await resolveActor(req);
    const actor = who?.actor ?? 'anonymous';
    const entityId = (await resolveVerifiedEntityId(req)) ?? 'unknown';
    const url = new URL(req.url);

    try {
      await auditService.logAuditEntry({
        actor,
        actorId: who?.actorId,
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
 * Combined security middleware. Applies sanitization and audit logging.
 *
 * P-18: the `rateLimit` option is gone with the limiter it drove. Rate limiting
 * is a separate wrapper now — `withRateLimit(req, tier, handler)` from
 * `@/shared/middleware/rate-limit` — because it is Redis-backed and async in a
 * way this handler-in/handler-out shape cannot express honestly.
 */
export function withSecurity(
  handler: NextApiHandler,
  options?: {
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

  if (options?.sanitize !== false) {
    wrappedHandler = withInputSanitization(wrappedHandler);
  }

  return wrappedHandler;
}

// Export for testing
export { containsInjectionPattern, stripHtmlTags, checkInputLength };
