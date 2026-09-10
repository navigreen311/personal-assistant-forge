// ============================================================================
// Security Middleware — Unit Tests
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { withInputSanitization, withAuditLog } from '@/shared/middleware/security';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// P-00/T-003: identity no longer comes from request headers in production.
// These middlewares now ask the auth layer, which reads the verified JWT and
// checks entity ownership against the database.
//
// In THESE TESTS ONLY, the mock below resolves identity from the x-user-id /
// x-entity-id headers, so each case can inject "a verified session for this
// user and entity" in one line and every existing assertion keeps its meaning.
// The header is the test's injection point; it is not a trusted input in the
// code under test. See resolveActor / resolveVerifiedEntityId in
// src/shared/middleware/auth.ts.
jest.mock('@/shared/middleware/auth', () => ({
  resolveActor: jest.fn(async (req: { headers: { get: (k: string) => string | null } }) => {
    const id = req.headers.get('x-user-id');
    return id ? { actor: id, actorId: id } : null;
  }),
  resolveVerifiedEntityId: jest.fn(
    async (req: { headers: { get: (k: string) => string | null } }) =>
      req.headers.get('x-entity-id')
  ),
}));

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
  const headers = new Headers(options.headers || {});
  if (options.body) {
    headers.set('content-type', 'application/json');
  }
  return new NextRequest(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  } as any);
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
  // withRateLimit -- REMOVED, P-18 / T-012
  //
  // These cases exercised the in-memory `Map` limiter this file used to
  // export. It was dead middleware (no route imported it), and a `Map` in one
  // process is not a rate limit across instances or across a restart, so it
  // could never have been the real one. It is deleted; the surviving limiter
  // is `src/shared/middleware/rate-limit.ts`, proved against a real Redis in
  // `tests/db/rate-limit.test.ts` where the (N+1)th request is actually
  // refused.
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
