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
import type { JWT } from 'next-auth/jwt';
import type { Entity } from '@prisma/client';
import { prisma } from '@/lib/db';
import { withAuth, withRole, withEntityAccess } from '@/shared/middleware/auth';

const mockGetToken = getToken as jest.MockedFunction<typeof getToken>;
const mockFindUnique = prisma.entity.findUnique as jest.MockedFunction<
  typeof prisma.entity.findUnique
>;

// ---------------------------------------------------------------------------
// P-35 — the ten `as any` casts this file used to carry, replaced by two
// checked builders.
//
// Every mocked return here was `{...} as any`, which is the shape the P-19 and
// P-28 write-ups identify as the reason ten phantom-delegate bugs survived
// 5,000 green tests: a mock is a claim about an interface, and `any` is what
// stops anyone checking the claim. This file mocks the two interfaces the
// tenancy boundary is built on -- the decoded JWT and `prisma.entity.findUnique`
// -- so it is the worst place in the repository for an unchecked claim.
//
// Neither builder loosens anything. `token()` takes `Partial<JWT>`, so the ten
// call sites are now checked field-by-field against the augmented `JWT` in
// src/lib/auth/types.ts: a renamed claim, a typo'd `activeEntityID`, or a
// `role` outside `UserRole` is a compile error where it used to be silent.
// ---------------------------------------------------------------------------

/**
 * A decoded JWT, as `getToken` resolves it.
 *
 * The single widening is deliberate and is the point of the tests below:
 * `JWT` declares `userId: string` as REQUIRED, but `withAuth` still checks
 * `if (!token?.userId)` because the value is decoded from a token minted
 * elsewhere and the declaration is an assumption, not a guarantee. The suite
 * has to be able to build the off-type token that check exists for -- see
 * "should return 401 when token has no userId field" -- so the widening lives
 * here, once, named, instead of ten times as `any`.
 */
function token(claims: Partial<JWT>): JWT {
  return claims as JWT;
}

/**
 * An `Entity` row, as `prisma.entity.findUnique` returns it.
 *
 * `withEntityAccess` selects no columns, so the delegate really does return the
 * whole row; the tests only care about `userId`. The remaining columns are
 * schema defaults and nothing under test reads them -- their only job is to
 * make the mock's claim about the delegate's return type true.
 */
function entityRow(overrides: Partial<Entity> & Pick<Entity, 'id' | 'userId'>): Entity {
  return {
    name: 'Test Entity',
    type: 'Personal',
    complianceProfile: [],
    brandKit: null,
    voicePersonaId: null,
    phoneNumbers: [],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

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
      mockGetToken.mockResolvedValue(token({ email: 'test@example.com' }));
      const handler = jest.fn();
      const req = createMockRequest();

      const response = await withAuth(req, handler);

      expect(response.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should call handler with session containing userId, email, name, role when token is valid', async () => {
      mockGetToken.mockResolvedValue(token({
        userId: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin',
        activeEntityId: 'entity-1',
      }));

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
      mockGetToken.mockResolvedValue(token({
        userId: 'user-456',
      }));

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
      mockGetToken.mockResolvedValue(token({
        userId: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'viewer',
      }));

      const handler = jest.fn();
      const req = createMockRequest();

      const response = await withRole(req, ['admin', 'owner'], handler);

      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should call handler when session role matches one of the allowed roles', async () => {
      mockGetToken.mockResolvedValue(token({
        userId: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin',
      }));

      const handler = jest.fn().mockResolvedValue(createJsonResponse({ ok: true }));
      const req = createMockRequest();

      const response = await withRole(req, ['admin', 'owner'], handler);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(200);
    });
  });

  describe('withEntityAccess', () => {
    it('should return 404 when entity is not found in database', async () => {
      mockGetToken.mockResolvedValue(token({
        userId: 'user-123',
        role: 'admin',
      }));
      mockFindUnique.mockResolvedValue(null);

      const handler = jest.fn();
      const req = createMockRequest();

      const response = await withEntityAccess(req, 'entity-999', handler);

      expect(response.status).toBe(404);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should return 403 when entity.userId does not match session.userId', async () => {
      mockGetToken.mockResolvedValue(token({
        userId: 'user-123',
        role: 'admin',
      }));
      mockFindUnique.mockResolvedValue(entityRow({
        id: 'entity-1',
        userId: 'user-other',
      }));

      const handler = jest.fn();
      const req = createMockRequest();

      const response = await withEntityAccess(req, 'entity-1', handler);

      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should call handler when entity exists and belongs to the authenticated user', async () => {
      mockGetToken.mockResolvedValue(token({
        userId: 'user-123',
        role: 'admin',
      }));
      mockFindUnique.mockResolvedValue(entityRow({
        id: 'entity-1',
        userId: 'user-123',
      }));

      const handler = jest.fn().mockResolvedValue(createJsonResponse({ ok: true }));
      const req = createMockRequest();

      const response = await withEntityAccess(req, 'entity-1', handler);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(200);
      expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: 'entity-1' } });
    });
  });
});
