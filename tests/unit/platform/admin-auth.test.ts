import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// P-10/T-001. The admin routes now compose the role gate with `withEntityScope`
// (see src/modules/security/audit-wiring.ts), so this mock needed two changes:
//
//   1. `withAuth` hard-coded `role: 'member'`, with the role logic living only
//      in the `withRole` mock. Once the route stopped calling `withRole`, every
//      admin request was a member and the "admin gets through" case returned
//      403. The role now comes off `x-test-role` in one place.
//   2. `withEntityScope` was not mocked at all. It is here, and it performs the
//      same ownership check as the real one against the mocked Prisma client,
//      so a route that dropped the check would fail these tests rather than
//      quietly pass them. The real cross-tenant proof is in tests/db/.
// ---------------------------------------------------------------------------
jest.mock('@/shared/middleware/auth', () => {
  async function sessionFor(req: NextRequest) {
    const token = req.headers.get('authorization');
    if (!token) return null;
    const role = req.headers.get('x-test-role') || 'member';
    return {
      userId: 'user-1',
      email: role === 'admin' ? 'admin@test.com' : 'user@test.com',
      name: 'Test User',
      role,
      activeEntityId: 'entity-1',
    };
  }

  return {
    withAuth: jest.fn(async (req: NextRequest, handler: Function) => {
      const session = await sessionFor(req);
      if (!session) {
        const { error } = await import('@/shared/utils/api-response');
        return error('UNAUTHORIZED', 'Authentication required', 401);
      }
      return handler(req, session);
    }),
    withRole: jest.fn(async (req: NextRequest, roles: string[], handler: Function) => {
      const session = await sessionFor(req);
      const { error } = await import('@/shared/utils/api-response');
      if (!session) return error('UNAUTHORIZED', 'Authentication required', 401);
      if (!roles.includes(session.role)) {
        return error('FORBIDDEN', 'Insufficient permissions', 403);
      }
      return handler(req, session);
    }),
    withEntityScope: jest.fn(async (
      req: NextRequest,
      handler: Function,
      explicitEntityId?: string,
    ) => {
      const session = await sessionFor(req);
      const { error } = await import('@/shared/utils/api-response');
      if (!session) return error('UNAUTHORIZED', 'Authentication required', 401);

      let candidate = explicitEntityId ?? req.nextUrl.searchParams.get('entityId') ?? undefined;
      if (!candidate && req.method !== 'GET' && req.method !== 'DELETE') {
        try {
          const body = await req.clone().json();
          if (typeof body?.entityId === 'string') candidate = body.entityId;
        } catch { /* no JSON body */ }
      }
      candidate = candidate ?? session.activeEntityId;
      if (!candidate) return error('ENTITY_REQUIRED', 'No entity in scope', 400);

      const { prisma } = await import('@/lib/db');
      const entity = await prisma.entity.findUnique({ where: { id: candidate } });
      if (!entity) return error('NOT_FOUND', 'Entity not found', 404);
      if (entity.userId !== session.userId) {
        return error('FORBIDDEN', 'You do not have access to this entity', 403);
      }

      return handler(req, session, entity.id);
    }),
    withEntityAccess: jest.fn(),
    resolveActor: jest.fn(async (req: NextRequest) => {
      const session = await sessionFor(req);
      return session ? { actor: session.email, actorId: session.userId } : null;
    }),
    resolveVerifiedEntityId: jest.fn(async () => null),
  };
});

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
    findFirst: jest.fn().mockResolvedValue({ id: 'e1', userId: 'user-1' }),
    // Owned by the session user, so `withEntityScope` lets these through and the
    // 401/403 assertions below are about auth, not about a missing fixture.
    findUnique: jest.fn().mockResolvedValue({ id: 'e1', userId: 'user-1', complianceProfile: [] }),
    update: jest.fn().mockResolvedValue({}),
  },
  auditLogEntry: {
    create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  calendarEvent: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
  },
};

jest.mock('@/lib/db', () => ({
  prisma: {
    ...mockPrisma,
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ auditLogEntry: mockPrisma.auditLogEntry, $executeRaw: jest.fn(async () => 1) })),
  },
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
