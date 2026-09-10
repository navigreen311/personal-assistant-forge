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
    logAuditEntry: jest.fn().mockResolvedValue(undefined),
  },
}));

import { NextRequest, NextResponse } from 'next/server';
import {
  withAuditLog,
  withInputSanitization,
  containsInjectionPattern,
  stripHtmlTags,
  checkInputLength,
} from '@/shared/middleware/security';
import { auditService } from '@/modules/security/services/audit-service';

const mockLogAuditEntry = auditService.logAuditEntry as jest.MockedFunction<
  typeof auditService.logAuditEntry
>;

function createMockRequest(
  url = 'http://localhost/api/test',
  options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
): NextRequest {
  const init: RequestInit = {
    method: options?.method || 'GET',
    headers: options?.headers || {},
  };
  if (options?.body) {
    init.body = options.body;
    if (!init.headers) init.headers = {};
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }
  return new NextRequest(url, init as any);
}

describe('security middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('stripHtmlTags', () => {
    it('should remove all HTML tags from input string', () => {
      expect(stripHtmlTags('<p>Hello</p>')).toBe('Hello');
      expect(stripHtmlTags('<script>alert(1)</script>')).toBe('alert(1)');
      expect(stripHtmlTags('<b>bold</b> and <i>italic</i>')).toBe('bold and italic');
      expect(stripHtmlTags('no tags here')).toBe('no tags here');
    });
  });

  describe('containsInjectionPattern', () => {
    it('should detect SQL injection patterns', () => {
      const result = containsInjectionPattern('SELECT * FROM users');
      expect(result.blocked).toBe(true);
      expect(result.type).toBe('SQL_INJECTION');
    });

    it('should detect XSS patterns', () => {
      const result = containsInjectionPattern('<script>alert(1)</script>');
      expect(result.blocked).toBe(true);
      expect(result.type).toBe('XSS');
    });

    it('should detect NoSQL injection patterns', () => {
      const result = containsInjectionPattern('{ $gt: "" }');
      expect(result.blocked).toBe(true);
      expect(result.type).toBe('NOSQL_INJECTION');
    });

    it('should return blocked: false for clean input', () => {
      const result = containsInjectionPattern('Hello, this is a normal message.');
      expect(result.blocked).toBe(false);
      expect(result.type).toBe('');
    });
  });

  describe('checkInputLength', () => {
    it('should return true when all strings are within max length', () => {
      expect(checkInputLength('short', 100)).toBe(true);
      expect(checkInputLength({ name: 'test', desc: 'ok' }, 100)).toBe(true);
    });

    it('should return false when any string in body exceeds max length', () => {
      expect(checkInputLength('x'.repeat(101), 100)).toBe(false);
      expect(checkInputLength({ name: 'x'.repeat(200) }, 100)).toBe(false);
    });

    it('should handle nested objects and arrays', () => {
      expect(checkInputLength({ items: ['short', 'x'.repeat(200)] }, 100)).toBe(false);
      expect(checkInputLength({ items: ['short', 'ok'] }, 100)).toBe(true);
    });
  });

  describe('withInputSanitization', () => {
    it('should return 400 with MALICIOUS_INPUT code when POST body contains SQL injection', async () => {
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ ok: true }));
      const middleware = withInputSanitization(handler);

      const req = createMockRequest('http://localhost/api/test', {
        method: 'POST',
        body: JSON.stringify({ query: 'SELECT * FROM users' }),
      });

      const response = await middleware(req);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('MALICIOUS_INPUT');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should return 400 when query params contain injection patterns', async () => {
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ ok: true }));
      const middleware = withInputSanitization(handler);

      const req = createMockRequest(
        'http://localhost/api/test?search=SELECT%20*%20FROM%20users'
      );

      const response = await middleware(req);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('MALICIOUS_INPUT');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should pass through clean requests to handler', async () => {
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ ok: true }));
      const middleware = withInputSanitization(handler);

      const req = createMockRequest('http://localhost/api/test', {
        method: 'POST',
        body: JSON.stringify({ name: 'John Doe', email: 'john@example.com' }),
      });

      const response = await middleware(req);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // P-18 / T-012: the `withRateLimit` block that stood here tested the in-memory
  // `Map` limiter this file used to export. That limiter was dead middleware --
  // P-00 established no route imported it -- and a `Map` in one process is not a
  // rate limit on a deployment with more than one instance, nor across a
  // restart. It is deleted, so its tests go with it. The one surviving limiter,
  // `src/shared/middleware/rate-limit.ts`, is proved against a real Redis in
  // `tests/db/rate-limit.test.ts`, where the (N+1)th request is actually refused.

  describe('withAuditLog', () => {
    it('should log request details via auditService after handler completes', async () => {
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ ok: true }));
      const middleware = withAuditLog(handler);

      const req = createMockRequest('http://localhost/api/test', {
        headers: { 'x-user-id': 'user-123', 'x-entity-id': 'entity-1' },
      });

      await middleware(req);

      expect(mockLogAuditEntry).toHaveBeenCalledTimes(1);
      const entry = mockLogAuditEntry.mock.calls[0][0];
      expect(entry.actor).toBe('user-123');
      expect(entry.entityId).toBe('entity-1');
      expect(entry.requestMethod).toBe('GET');
      expect(entry.requestPath).toBe('/api/test');
    });

    it('should still return the response even if audit logging fails', async () => {
      mockLogAuditEntry.mockRejectedValueOnce(new Error('Audit failure'));

      const handler = jest.fn().mockResolvedValue(NextResponse.json({ ok: true }));
      const middleware = withAuditLog(handler);

      const req = createMockRequest();
      const response = await middleware(req);

      expect(response.status).toBe(200);
    });
  });
});
