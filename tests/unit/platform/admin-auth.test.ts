import { NextRequest } from 'next/server';

// Mock auth middleware
jest.mock('@/shared/middleware/auth', () => ({
  withAuth: jest.fn(async (req: NextRequest, handler: Function) => {
    const token = req.headers.get('authorization');
    if (!token) {
      const { error } = await import('@/shared/utils/api-response');
      return error('UNAUTHORIZED', 'Authentication required', 401);
    }
    const session = {
      userId: 'user-1',
      email: 'user@test.com',
      name: 'Test User',
      role: 'member' as const,
      activeEntityId: 'entity-1',
    };
    return handler(req, session);
  }),
  withRole: jest.fn(async (req: NextRequest, roles: string[], handler: Function) => {
    const token = req.headers.get('authorization');
    if (!token) {
      const { error } = await import('@/shared/utils/api-response');
      return error('UNAUTHORIZED', 'Authentication required', 401);
    }
    const role = req.headers.get('x-test-role') || 'member';
    if (!roles.includes(role)) {
      const { error } = await import('@/shared/utils/api-response');
      return error('FORBIDDEN', 'Insufficient permissions', 403);
    }
    const session = {
      userId: 'user-1',
      email: 'admin@test.com',
      name: 'Admin User',
      role: role,
      activeEntityId: 'entity-1',
    };
    return handler(req, session);
  }),
  withEntityAccess: jest.fn(),
}));

const mockPrisma = {
  rule: {
    create: jest.fn().mockResolvedValue({ id: 'r1', name: 'test', scope: 'ORG_POLICY', entityId: 'e1', condition: {}, action: {}, isActive: true, createdAt: new Date(), updatedAt: new Date() }),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({}),
  },
  actionLog: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
  },
  document: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
  },
  entity: {
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({}),
  },
  calendarEvent: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
  },
};

jest.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

function createRequest(url: string, options: { method?: string; headers?: Record<string, string>; body?: unknown } = {}): NextRequest {
  const fullUrl = `http://localhost:3000${url}`;
  const init: RequestInit = {
    method: options.method || 'GET',
    headers: options.headers || {},
  };
  if (options.body) {
    init.body = JSON.stringify(options.body);
    (init.headers as Record<string, string>)['content-type'] = 'application/json';
  }
  return new NextRequest(fullUrl, init as any);
}

describe('Admin route auth', () => {
  it('should return 401 for unauthenticated requests', async () => {
    const { GET } = await import('@/app/api/admin/policies/route');
    const req = createRequest('/api/admin/policies?entityId=e1');
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('should return 403 for non-admin users', async () => {
    const { GET } = await import('@/app/api/admin/policies/route');
    const req = createRequest('/api/admin/policies?entityId=e1', {
      headers: { authorization: 'Bearer test-token', 'x-test-role': 'member' },
    });
    const res = await GET(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('should allow admin users through', async () => {
    const { GET } = await import('@/app/api/admin/policies/route');
    const req = createRequest('/api/admin/policies?entityId=e1', {
      headers: { authorization: 'Bearer test-token', 'x-test-role': 'admin' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('should return 401 for unauthenticated DLP requests', async () => {
    const { GET } = await import('@/app/api/admin/dlp/route');
    const req = createRequest('/api/admin/dlp?entityId=e1');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('should return 403 for non-admin DLP requests', async () => {
    const { GET } = await import('@/app/api/admin/dlp/route');
    const req = createRequest('/api/admin/dlp?entityId=e1', {
      headers: { authorization: 'Bearer test-token', 'x-test-role': 'viewer' },
    });
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it('should return 401 for unauthenticated SSO requests', async () => {
    const { GET } = await import('@/app/api/admin/sso/route');
    const req = createRequest('/api/admin/sso?entityId=e1');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('should return 401 for unauthenticated eDiscovery requests', async () => {
    const { GET } = await import('@/app/api/admin/ediscovery/route');
    const req = createRequest('/api/admin/ediscovery?entityId=e1');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('should return 401 for unauthenticated DLP check requests', async () => {
    const { POST } = await import('@/app/api/admin/dlp/check/route');
    const req = createRequest('/api/admin/dlp/check', {
      method: 'POST',
      body: { entityId: 'e1', content: 'test', scope: 'ALL' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
