// ============================================================================
// Security Middleware — Unit Tests
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  withInputSanitization,
  withRateLimit,
  withAuditLog,
  rateLimitStore,
} from '@/shared/middleware/security';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@/modules/security/services/audit-service', () => ({
  auditService: {
    logAuditEntry: jest.fn().mockResolvedValue({ id: 'test', hash: 'abc' }),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { auditService } = require('@/modules/security/services/audit-service');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRequest(options: {
  method?: string;
  url?: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}): NextRequest {
  const url = options.url || 'http://localhost/api/test';
  const init: RequestInit = {
    method: options.method || 'GET',
    headers: new Headers(options.headers || {}),
  };
  if (options.body) {
    init.body = JSON.stringify(options.body);
    (init.headers as Headers).set('content-type', 'application/json');
  }
  return new NextRequest(url, init);
}

/** Simple 200 JSON handler */
const okHandler = jest.fn().mockImplementation(() =>
  NextResponse.json({ success: true }, { status: 200 }),
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Security Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rateLimitStore.clear();
  });

  // -----------------------------------------------------------------------
  // withInputSanitization
  // -----------------------------------------------------------------------
  describe('withInputSanitization', () => {
    it('should strip HTML tags and still call the handler', async () => {
      const handler = jest.fn().mockImplementation(() =>
        NextResponse.json({ ok: true }, { status: 200 }),
      );
      const wrapped = withInputSanitization(handler);

      const req = createMockRequest({
        method: 'POST',
        body: { name: '<b>test</b>' },
      });

      const response = await wrapped(req);

      // HTML tags like <b> are not injection — they get stripped but request goes through
      expect(handler).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    it('should block SQL injection with 400 status', async () => {
      const handler = jest.fn();
      const wrapped = withInputSanitization(handler);

      const req = createMockRequest({
        method: 'POST',
        body: { query: 'SELECT * FROM users' },
      });

      const response = await wrapped(req);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('MALICIOUS_INPUT');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should block XSS script injection with 400 status', async () => {
      const handler = jest.fn();
      const wrapped = withInputSanitization(handler);

      const req = createMockRequest({
        method: 'POST',
        body: { content: '<script>alert(1)</script>' },
      });

      const response = await wrapped(req);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('MALICIOUS_INPUT');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should reject inputs exceeding max length with 400 status', async () => {
      const handler = jest.fn();
      const wrapped = withInputSanitization(handler, { maxInputLength: 100 });

      const longString = 'a'.repeat(200);
      const req = createMockRequest({
        method: 'POST',
        body: { content: longString },
      });

      const response = await wrapped(req);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('INPUT_TOO_LONG');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should pass clean inputs through to the handler', async () => {
      const handler = jest.fn().mockImplementation(() =>
        NextResponse.json({ result: 'ok' }, { status: 200 }),
      );
      const wrapped = withInputSanitization(handler);

      const req = createMockRequest({
        method: 'POST',
        body: { name: 'John Doe', email: 'john@example.com' },
      });

      const response = await wrapped(req);

      expect(handler).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });
  });

  // -----------------------------------------------------------------------
  // withRateLimit
  // -----------------------------------------------------------------------
  describe('withRateLimit', () => {
    const baseLimitConfig = {
      endpoint: '/api/test',
      windowMs: 60_000,
      maxRequests: 3,
      keyGenerator: 'IP' as const,
    };

    it('should allow requests within the limit', async () => {
      const handler = jest.fn().mockImplementation(() =>
        NextResponse.json({ ok: true }, { status: 200 }),
      );
      const wrapped = withRateLimit(handler, { ...baseLimitConfig, maxRequests: 3 });

      const req = createMockRequest({
        headers: { 'x-forwarded-for': '127.0.0.1' },
      });

      const res1 = await wrapped(req);
      const res2 = await wrapped(req);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should return 429 when rate limit is exceeded', async () => {
      const handler = jest.fn().mockImplementation(() =>
        NextResponse.json({ ok: true }, { status: 200 }),
      );
      const wrapped = withRateLimit(handler, { ...baseLimitConfig, maxRequests: 3 });

      const req = createMockRequest({
        headers: { 'x-forwarded-for': '10.0.0.1' },
      });

      await wrapped(req); // 1
      await wrapped(req); // 2
      await wrapped(req); // 3
      const res4 = await wrapped(req); // 4 — should be blocked

      expect(res4.status).toBe(429);
      const body = await res4.json();
      expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should include Retry-After header on 429 response', async () => {
      const handler = jest.fn().mockImplementation(() =>
        NextResponse.json({ ok: true }, { status: 200 }),
      );
      const wrapped = withRateLimit(handler, { ...baseLimitConfig, maxRequests: 1 });

      const req = createMockRequest({
        headers: { 'x-forwarded-for': '10.0.0.2' },
      });

      await wrapped(req); // 1 — allowed
      const res2 = await wrapped(req); // 2 — blocked

      expect(res2.status).toBe(429);
      expect(res2.headers.get('Retry-After')).toBeDefined();
      const retryAfter = Number(res2.headers.get('Retry-After'));
      expect(retryAfter).toBeGreaterThan(0);
    });

    it('should reset after the window expires', async () => {
      jest.useFakeTimers();

      const handler = jest.fn().mockImplementation(() =>
        NextResponse.json({ ok: true }, { status: 200 }),
      );
      const wrapped = withRateLimit(handler, {
        ...baseLimitConfig,
        maxRequests: 1,
        windowMs: 10_000,
      });

      const req = createMockRequest({
        headers: { 'x-forwarded-for': '10.0.0.3' },
      });

      const res1 = await wrapped(req); // 1 — allowed
      expect(res1.status).toBe(200);

      const res2 = await wrapped(req); // 2 — blocked
      expect(res2.status).toBe(429);

      // Advance time past the window
      jest.advanceTimersByTime(11_000);

      const res3 = await wrapped(req); // Should be allowed after window reset
      expect(res3.status).toBe(200);

      jest.useRealTimers();
    });

    it('should support burst allowance', async () => {
      const handler = jest.fn().mockImplementation(() =>
        NextResponse.json({ ok: true }, { status: 200 }),
      );
      const wrapped = withRateLimit(handler, {
        ...baseLimitConfig,
        maxRequests: 2,
        burstAllowance: 1,
      });

      const req = createMockRequest({
        headers: { 'x-forwarded-for': '10.0.0.4' },
      });

      const res1 = await wrapped(req); // 1 — normal
      const res2 = await wrapped(req); // 2 — normal
      const res3 = await wrapped(req); // 3 — burst
      const res4 = await wrapped(req); // 4 — over burst, should be blocked

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res3.status).toBe(200);
      expect(res4.status).toBe(429);
    });
  });

  // -----------------------------------------------------------------------
  // withAuditLog
  // -----------------------------------------------------------------------
  describe('withAuditLog', () => {
    it('should log request details after handler completes', async () => {
      const handler = jest.fn().mockImplementation(() =>
        NextResponse.json({ ok: true }, { status: 200 }),
      );
      const wrapped = withAuditLog(handler);

      const req = createMockRequest({
        method: 'GET',
        url: 'http://localhost/api/contacts?id=c1',
        headers: {
          'x-user-id': 'user-42',
          'x-entity-id': 'entity-7',
        },
      });

      await wrapped(req);

      expect(auditService.logAuditEntry).toHaveBeenCalledTimes(1);
      const loggedEntry = auditService.logAuditEntry.mock.calls[0][0];
      expect(loggedEntry.actor).toBe('user-42');
      expect(loggedEntry.entityId).toBe('entity-7');
      expect(loggedEntry.requestMethod).toBe('GET');
      expect(loggedEntry.requestPath).toBe('/api/contacts');
    });

    it('should include actor and resource info in the audit entry', async () => {
      const handler = jest.fn().mockImplementation(() =>
        NextResponse.json({ data: 'test' }, { status: 201 }),
      );
      const wrapped = withAuditLog(handler);

      const req = createMockRequest({
        method: 'POST',
        url: 'http://localhost/api/messages',
        headers: {
          'x-user-id': 'admin-1',
          'x-entity-id': 'org-5',
        },
      });

      await wrapped(req);

      const loggedEntry = auditService.logAuditEntry.mock.calls[0][0];
      expect(loggedEntry.actor).toBe('admin-1');
      expect(loggedEntry.resource).toBe('/api/messages');
      expect(loggedEntry.statusCode).toBe(201);
      expect(loggedEntry.action).toBe('POST /api/messages');
    });

    it('should respect the sensitivityLevel option', async () => {
      const handler = jest.fn().mockImplementation(() =>
        NextResponse.json({ ok: true }, { status: 200 }),
      );
      const wrapped = withAuditLog(handler, {
        sensitivityLevel: 'RESTRICTED',
      });

      const req = createMockRequest({
        url: 'http://localhost/api/secure',
        headers: {
          'x-user-id': 'user-1',
          'x-entity-id': 'entity-1',
        },
      });

      await wrapped(req);

      const loggedEntry = auditService.logAuditEntry.mock.calls[0][0];
      expect(loggedEntry.sensitivityLevel).toBe('RESTRICTED');
    });
  });
});
