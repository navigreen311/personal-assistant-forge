jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    entity: {
      findUnique: jest.fn(),
    },
  },
}));

import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@/lib/db';
import { withAuth, withRole, withEntityAccess } from '@/shared/middleware/auth';

const mockGetToken = getToken as jest.MockedFunction<typeof getToken>;
const mockFindUnique = prisma.entity.findUnique as jest.MockedFunction<
  typeof prisma.entity.findUnique
>;

function createMockRequest(url = 'http://localhost/api/test'): NextRequest {
  return new NextRequest(url);
}

function createJsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('auth middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('withAuth', () => {
    it('should return 401 when getToken returns null (no token)', async () => {
      mockGetToken.mockResolvedValue(null);
      const handler = jest.fn();
      const req = createMockRequest();

      const response = await withAuth(req, handler);

      expect(response.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should return 401 when token has no userId field', async () => {
      mockGetToken.mockResolvedValue({ email: 'test@example.com' } as any);
      const handler = jest.fn();
      const req = createMockRequest();

      const response = await withAuth(req, handler);

      expect(response.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should call handler with session containing userId, email, name, role when token is valid', async () => {
      mockGetToken.mockResolvedValue({
        userId: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin',
        activeEntityId: 'entity-1',
      } as any);

      const handler = jest.fn().mockResolvedValue(createJsonResponse({ ok: true }));
      const req = createMockRequest();

      const response = await withAuth(req, handler);

      expect(handler).toHaveBeenCalledTimes(1);
      const session = handler.mock.calls[0][1];
      expect(session.userId).toBe('user-123');
      expect(session.email).toBe('test@example.com');
      expect(session.name).toBe('Test User');
      expect(session.role).toBe('admin');
      expect(session.activeEntityId).toBe('entity-1');
      expect(response.status).toBe(200);
    });

    it('should default role to viewer and email/name to empty strings when not in token', async () => {
      mockGetToken.mockResolvedValue({
        userId: 'user-456',
      } as any);

      const handler = jest.fn().mockResolvedValue(createJsonResponse({ ok: true }));
      const req = createMockRequest();

      await withAuth(req, handler);

      const session = handler.mock.calls[0][1];
      expect(session.role).toBe('viewer');
      expect(session.email).toBe('');
      expect(session.name).toBe('');
    });
  });

  describe('withRole', () => {
    it('should return 403 when session role is not in allowed roles list', async () => {
      mockGetToken.mockResolvedValue({
        userId: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'viewer',
      } as any);

      const handler = jest.fn();
      const req = createMockRequest();

      const response = await withRole(req, ['admin', 'owner'], handler);

      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should call handler when session role matches one of the allowed roles', async () => {
      mockGetToken.mockResolvedValue({
        userId: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin',
      } as any);

      const handler = jest.fn().mockResolvedValue(createJsonResponse({ ok: true }));
      const req = createMockRequest();

      const response = await withRole(req, ['admin', 'owner'], handler);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(200);
    });
  });

  describe('withEntityAccess', () => {
    it('should return 404 when entity is not found in database', async () => {
      mockGetToken.mockResolvedValue({
        userId: 'user-123',
        role: 'admin',
      } as any);
      mockFindUnique.mockResolvedValue(null);

      const handler = jest.fn();
      const req = createMockRequest();

      const response = await withEntityAccess(req, 'entity-999', handler);

      expect(response.status).toBe(404);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should return 403 when entity.userId does not match session.userId', async () => {
      mockGetToken.mockResolvedValue({
        userId: 'user-123',
        role: 'admin',
      } as any);
      mockFindUnique.mockResolvedValue({
        id: 'entity-1',
        userId: 'user-other',
      } as any);

      const handler = jest.fn();
      const req = createMockRequest();

      const response = await withEntityAccess(req, 'entity-1', handler);

      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should call handler when entity exists and belongs to the authenticated user', async () => {
      mockGetToken.mockResolvedValue({
        userId: 'user-123',
        role: 'admin',
      } as any);
      mockFindUnique.mockResolvedValue({
        id: 'entity-1',
        userId: 'user-123',
      } as any);

      const handler = jest.fn().mockResolvedValue(createJsonResponse({ ok: true }));
      const req = createMockRequest();

      const response = await withEntityAccess(req, 'entity-1', handler);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(200);
      expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: 'entity-1' } });
    });
  });
});
