jest.mock('@/modules/security/services/audit-service', () => ({
  auditService: {
    logAuditEntry: jest.fn().mockResolvedValue(undefined),
  },
}));

import { NextRequest, NextResponse } from 'next/server';
import {
  withAuditLog,
  withInputSanitization,
  withRateLimit,
  checkRateLimit,
  containsInjectionPattern,
  stripHtmlTags,
  checkInputLength,
  rateLimitStore,
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
  return new NextRequest(url, init);
}

describe('security middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rateLimitStore.clear();
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

  describe('withRateLimit', () => {
    const rateLimitConfig = {
      endpoint: '/api/test',
      windowMs: 60000,
      maxRequests: 3,
      keyGenerator: 'IP' as const,
    };

    it('should allow requests within the limit', async () => {
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ ok: true }));
      const middleware = withRateLimit(handler, rateLimitConfig);

      const req = createMockRequest('http://localhost/api/test', {
        headers: { 'x-forwarded-for': '1.2.3.4' },
      });

      // First 3 requests should succeed
      for (let i = 0; i < 3; i++) {
        const response = await middleware(req);
        expect(response.status).toBe(200);
      }

      expect(handler).toHaveBeenCalledTimes(3);
    });

    it('should return 429 when rate limit is exceeded', async () => {
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ ok: true }));
      const middleware = withRateLimit(handler, rateLimitConfig);

      const req = createMockRequest('http://localhost/api/test', {
        headers: { 'x-forwarded-for': '5.6.7.8' },
      });

      // Exhaust the limit
      for (let i = 0; i < 3; i++) {
        await middleware(req);
      }

      // 4th request should be rate limited
      const response = await middleware(req);

      expect(response.status).toBe(429);
      const body = await response.json();
      expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.headers.get('Retry-After')).toBeTruthy();
    });

    it('should add rate limit headers to successful responses', async () => {
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ ok: true }));
      const middleware = withRateLimit(handler, rateLimitConfig);

      const req = createMockRequest('http://localhost/api/test', {
        headers: { 'x-forwarded-for': '10.0.0.1' },
      });

      const response = await middleware(req);

      expect(response.headers.get('X-RateLimit-Limit')).toBe('3');
      expect(response.headers.get('X-RateLimit-Remaining')).toBeTruthy();
      expect(response.headers.get('X-RateLimit-Reset')).toBeTruthy();
    });
  });

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
