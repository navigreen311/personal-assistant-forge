import { NextRequest } from 'next/server';
import { withAuth, withRole, withEntityAccess } from '@/shared/middleware/auth';

// Mock next-auth/jwt
jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}));

// Mock prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    entity: {
      findUnique: jest.fn(),
    },
  },
}));

import { getToken } from 'next-auth/jwt';
import { prisma } from '@/lib/db';

const mockedGetToken = getToken as jest.MockedFunction<typeof getToken>;
const mockedEntityFindUnique = prisma.entity.findUnique as jest.MockedFunction<
  typeof prisma.entity.findUnique
>;

function createMockRequest(url = 'http://localhost/api/test'): NextRequest {
  return new NextRequest(url);
}

describe('withAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call handler with session when valid token exists', async () => {
    mockedGetToken.mockResolvedValue({
      userId: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'owner',
      activeEntityId: 'entity-1',
    } as never);

    const handler = jest.fn().mockResolvedValue(new Response('ok'));
    const req = createMockRequest();

    await withAuth(req, handler);

    expect(handler).toHaveBeenCalledWith(req, {
      userId: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'owner',
      activeEntityId: 'entity-1',
    });
  });

  it('should return 401 when no token', async () => {
    mockedGetToken.mockResolvedValue(null);

    const handler = jest.fn();
    const req = createMockRequest();

    const res = await withAuth(req, handler);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should return 401 when token has no userId', async () => {
    mockedGetToken.mockResolvedValue({ email: 'test@example.com' } as never);

    const handler = jest.fn();
    const req = createMockRequest();

    const res = await withAuth(req, handler);

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('withRole', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should allow access for permitted roles', async () => {
    mockedGetToken.mockResolvedValue({
      userId: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'owner',
      activeEntityId: 'entity-1',
    } as never);

    const handler = jest.fn().mockResolvedValue(new Response('ok'));
    const req = createMockRequest();

    await withRole(req, ['owner', 'admin'], handler);

    expect(handler).toHaveBeenCalled();
  });

  it('should return 403 for unpermitted roles', async () => {
    mockedGetToken.mockResolvedValue({
      userId: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'viewer',
      activeEntityId: 'entity-1',
    } as never);

    const handler = jest.fn();
    const req = createMockRequest();

    const res = await withRole(req, ['owner', 'admin'], handler);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('withEntityAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should allow access when user owns entity', async () => {
    mockedGetToken.mockResolvedValue({
      userId: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'owner',
      activeEntityId: 'entity-1',
    } as never);

    mockedEntityFindUnique.mockResolvedValue({
      id: 'entity-1',
      userId: 'user-1',
      name: 'Personal',
      type: 'Personal',
      complianceProfile: [],
      brandKit: null,
      voicePersonaId: null,
      phoneNumbers: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const handler = jest.fn().mockResolvedValue(new Response('ok'));
    const req = createMockRequest();

    await withEntityAccess(req, 'entity-1', handler);

    expect(handler).toHaveBeenCalled();
  });

  it('should return 403 when user does not own entity', async () => {
    mockedGetToken.mockResolvedValue({
      userId: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'owner',
      activeEntityId: 'entity-1',
    } as never);

    mockedEntityFindUnique.mockResolvedValue({
      id: 'entity-2',
      userId: 'other-user',
      name: 'Other',
      type: 'Personal',
      complianceProfile: [],
      brandKit: null,
      voicePersonaId: null,
      phoneNumbers: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const handler = jest.fn();
    const req = createMockRequest();

    const res = await withEntityAccess(req, 'entity-2', handler);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should return 404 when entity does not exist', async () => {
    mockedGetToken.mockResolvedValue({
      userId: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'owner',
      activeEntityId: 'entity-1',
    } as never);

    mockedEntityFindUnique.mockResolvedValue(null);

    const handler = jest.fn();
    const req = createMockRequest();

    const res = await withEntityAccess(req, 'nonexistent', handler);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(handler).not.toHaveBeenCalled();
  });
});
