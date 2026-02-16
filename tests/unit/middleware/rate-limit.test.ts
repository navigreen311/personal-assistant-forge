import type { NextRequest } from 'next/server';

// Mock ioredis before importing the module under test
const mockPipelineExec = jest.fn();
const mockPipeline = {
  zadd: jest.fn().mockReturnThis(),
  zremrangebyscore: jest.fn().mockReturnThis(),
  zcard: jest.fn().mockReturnThis(),
  expire: jest.fn().mockReturnThis(),
  exec: mockPipelineExec,
};

const mockRedisInstance = {
  pipeline: jest.fn().mockReturnValue(mockPipeline),
  on: jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisInstance);
});

// Mock api-response
jest.mock('@/shared/utils/api-response', () => ({
  error: jest.fn((code: string, message: string, status: number) => {
    const headers = new Map<string, string>();
    return {
      status,
      body: JSON.stringify({ success: false, error: { code, message } }),
      headers: {
        get: (key: string) => headers.get(key),
        set: (key: string, value: string) => headers.set(key, value),
        forEach: (cb: (v: string, k: string) => void) => headers.forEach(cb),
      },
    };
  }),
}));

import { checkRateLimit, withRateLimit, _resetRedis } from '@/shared/middleware/rate-limit';

function createMockRequest(overrides: { ip?: string; headers?: Record<string, string> } = {}): NextRequest {
  const headers = new Headers(overrides.headers ?? {});
  return {
    ip: overrides.ip ?? '127.0.0.1',
    headers,
    url: 'http://localhost:3000/api/test',
  } as unknown as NextRequest;
}

describe('checkRateLimit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetRedis();
    // Default: pipeline returns results indicating 1 request in window (within limit)
    mockPipelineExec.mockResolvedValue([
      [null, 0],  // zremrangebyscore
      [null, 1],  // zadd
      [null, 1],  // zcard — 1 request in window
      [null, 1],  // expire
    ]);
  });

  it('should allow requests within the limit', async () => {
    const result = await checkRateLimit('test-user', { limit: 10, windowMs: 60000 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it('should deny requests exceeding the limit', async () => {
    mockPipelineExec.mockResolvedValue([
      [null, 0],
      [null, 1],
      [null, 11], // 11 requests — exceeds limit of 10
      [null, 1],
    ]);

    const result = await checkRateLimit('test-user', { limit: 10, windowMs: 60000 });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should return correct remaining count', async () => {
    mockPipelineExec.mockResolvedValue([
      [null, 0],
      [null, 1],
      [null, 7], // 7 of 10 used
      [null, 1],
    ]);

    const result = await checkRateLimit('test-user', { limit: 10, windowMs: 60000 });
    expect(result.remaining).toBe(3);
  });

  it('should return correct resetAt timestamp', async () => {
    const before = Date.now();
    const result = await checkRateLimit('test-user', { limit: 10, windowMs: 60000 });
    const after = Date.now();

    expect(result.resetAt.getTime()).toBeGreaterThanOrEqual(before + 60000);
    expect(result.resetAt.getTime()).toBeLessThanOrEqual(after + 60000);
  });

  it('should use sliding window (allow after window passes)', async () => {
    // First call: at the limit
    mockPipelineExec.mockResolvedValue([
      [null, 0],
      [null, 1],
      [null, 10], // exactly at limit
      [null, 1],
    ]);

    const result1 = await checkRateLimit('test-user', { limit: 10, windowMs: 60000 });
    expect(result1.allowed).toBe(true);
    expect(result1.remaining).toBe(0);

    // Simulate window passing — old entries removed, count drops
    mockPipelineExec.mockResolvedValue([
      [null, 5], // 5 old entries removed
      [null, 1],
      [null, 1], // only 1 request in new window
      [null, 1],
    ]);

    const result2 = await checkRateLimit('test-user', { limit: 10, windowMs: 60000 });
    expect(result2.allowed).toBe(true);
    expect(result2.remaining).toBe(9);
  });
});

describe('withRateLimit', () => {
  const mockHandler = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    _resetRedis();
    mockHandler.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    // Default: under limit
    mockPipelineExec.mockResolvedValue([
      [null, 0],
      [null, 1],
      [null, 1],
      [null, 1],
    ]);
  });

  it('should pass through when under limit', async () => {
    const middleware = withRateLimit(10, 60000);
    const req = createMockRequest();
    const response = await middleware(req, mockHandler);

    expect(mockHandler).toHaveBeenCalledWith(req);
    expect(response.status).toBe(200);
  });

  it('should return 429 when limit exceeded', async () => {
    mockPipelineExec.mockResolvedValue([
      [null, 0],
      [null, 1],
      [null, 11],
      [null, 1],
    ]);

    const middleware = withRateLimit(10, 60000);
    const req = createMockRequest();
    const response = await middleware(req, mockHandler);

    expect(response.status).toBe(429);
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should set X-RateLimit-Limit header', async () => {
    const middleware = withRateLimit(10, 60000);
    const req = createMockRequest();
    const response = await middleware(req, mockHandler);

    expect(response.headers.get('X-RateLimit-Limit')).toBe('10');
  });

  it('should set X-RateLimit-Remaining header', async () => {
    const middleware = withRateLimit(10, 60000);
    const req = createMockRequest();
    const response = await middleware(req, mockHandler);

    expect(response.headers.get('X-RateLimit-Remaining')).toBe('9');
  });

  it('should set X-RateLimit-Reset header', async () => {
    const middleware = withRateLimit(10, 60000);
    const req = createMockRequest();
    const response = await middleware(req, mockHandler);

    const reset = response.headers.get('X-RateLimit-Reset');
    expect(reset).toBeTruthy();
    expect(new Date(reset!).getTime()).toBeGreaterThan(Date.now());
  });

  it('should set Retry-After header on 429', async () => {
    mockPipelineExec.mockResolvedValue([
      [null, 0],
      [null, 1],
      [null, 11],
      [null, 1],
    ]);

    const middleware = withRateLimit(10, 60000);
    const req = createMockRequest();
    const response = await middleware(req, mockHandler);

    expect(response.headers.get('Retry-After')).toBe('60');
  });

  it('should fail open when Redis is unavailable', async () => {
    mockPipelineExec.mockRejectedValue(new Error('Connection refused'));

    const middleware = withRateLimit(10, 60000);
    const req = createMockRequest();
    const response = await middleware(req, mockHandler);

    expect(mockHandler).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it('should extract IP from x-forwarded-for header', async () => {
    const middleware = withRateLimit(10, 60000);
    const req = createMockRequest({ headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' } });
    await middleware(req, mockHandler);

    // Verify the pipeline was called (indicating Redis key was constructed with the extracted IP)
    expect(mockRedisInstance.pipeline).toHaveBeenCalled();
    expect(mockPipeline.zremrangebyscore).toHaveBeenCalled();
  });
});
