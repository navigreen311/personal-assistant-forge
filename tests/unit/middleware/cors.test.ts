import type { NextRequest } from 'next/server';
import { handlePreflight, withCors, applyCorsHeaders } from '@/shared/middleware/cors';
import type { CorsConfig } from '@/shared/middleware/cors';

function createMockRequest(method: string, origin: string): NextRequest {
  const headers = new Headers({ origin });
  return {
    method,
    headers,
    url: 'http://localhost:3000/api/test',
  } as unknown as NextRequest;
}

const baseConfig: CorsConfig = {
  allowedOrigins: ['https://app.example.com', 'http://localhost:3000'],
};

describe('handlePreflight', () => {
  it('should return 204 for valid preflight from allowed origin', () => {
    const req = createMockRequest('OPTIONS', 'https://app.example.com');
    const response = handlePreflight(req, baseConfig);

    expect(response.status).toBe(204);
  });

  it('should set correct CORS headers', () => {
    const req = createMockRequest('OPTIONS', 'https://app.example.com');
    const response = handlePreflight(req, baseConfig);

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    expect(response.headers.get('Access-Control-Max-Age')).toBe('86400');
  });

  it('should reject preflight from disallowed origin', () => {
    const req = createMockRequest('OPTIONS', 'https://evil.com');
    const response = handlePreflight(req, baseConfig);

    expect(response.status).toBe(403);
  });
});

describe('withCors', () => {
  const mockHandler = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockHandler.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('should add CORS headers to response for allowed origin', async () => {
    const middleware = withCors(baseConfig);
    const req = createMockRequest('GET', 'https://app.example.com');
    const response = await middleware(req, mockHandler);

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
  });

  it('should not add headers for disallowed origin', async () => {
    const middleware = withCors(baseConfig);
    const req = createMockRequest('GET', 'https://evil.com');
    const response = await middleware(req, mockHandler);

    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('should handle wildcard origin', async () => {
    const wildcardConfig: CorsConfig = { allowedOrigins: ['*'] };
    const middleware = withCors(wildcardConfig);
    const req = createMockRequest('GET', 'https://any-site.com');
    const response = await middleware(req, mockHandler);

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://any-site.com');
  });

  it('should handle OPTIONS request as preflight', async () => {
    const middleware = withCors(baseConfig);
    const req = createMockRequest('OPTIONS', 'https://app.example.com');
    const response = await middleware(req, mockHandler);

    expect(response.status).toBe(204);
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should pass through to handler for non-OPTIONS requests', async () => {
    const middleware = withCors(baseConfig);
    const req = createMockRequest('POST', 'https://app.example.com');
    await middleware(req, mockHandler);

    expect(mockHandler).toHaveBeenCalledWith(req);
  });

  it('should set Access-Control-Allow-Credentials when configured', async () => {
    const configWithCreds: CorsConfig = { ...baseConfig, credentials: true };
    const middleware = withCors(configWithCreds);
    const req = createMockRequest('GET', 'https://app.example.com');
    const response = await middleware(req, mockHandler);

    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });
});

describe('applyCorsHeaders', () => {
  it('should set all configured headers', () => {
    const config: CorsConfig = {
      allowedOrigins: ['https://app.example.com'],
      allowedMethods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'X-Custom'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 3600,
      credentials: true,
    };

    const response = new Response('ok', { status: 200 });
    const result = applyCorsHeaders(response, 'https://app.example.com', config);

    expect(result.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
    expect(result.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST');
    expect(result.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, X-Custom');
    expect(result.headers.get('Access-Control-Expose-Headers')).toBe('X-Request-Id');
    expect(result.headers.get('Access-Control-Max-Age')).toBe('3600');
    expect(result.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('should use default methods when not configured', () => {
    const config: CorsConfig = { allowedOrigins: ['https://app.example.com'] };
    const response = new Response('ok', { status: 200 });
    const result = applyCorsHeaders(response, 'https://app.example.com', config);

    const methods = result.headers.get('Access-Control-Allow-Methods')!;
    expect(methods).toContain('GET');
    expect(methods).toContain('POST');
    expect(methods).toContain('PUT');
    expect(methods).toContain('PATCH');
    expect(methods).toContain('DELETE');
    expect(methods).toContain('OPTIONS');
  });

  it('should use default headers when not configured', () => {
    const config: CorsConfig = { allowedOrigins: ['https://app.example.com'] };
    const response = new Response('ok', { status: 200 });
    const result = applyCorsHeaders(response, 'https://app.example.com', config);

    const headers = result.headers.get('Access-Control-Allow-Headers')!;
    expect(headers).toContain('Content-Type');
    expect(headers).toContain('Authorization');
  });
});
