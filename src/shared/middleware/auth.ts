import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@/lib/db';
import { error } from '@/shared/utils/api-response';
import type { AuthSession, UserRole } from '@/lib/auth/types';

export async function withAuth(
  req: NextRequest,
  handler: (req: NextRequest, session: AuthSession) => Promise<Response>
): Promise<Response> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token?.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  const session: AuthSession = {
    userId: token.userId,
    email: token.email ?? '',
    name: token.name ?? '',
    role: token.role ?? 'viewer',
    activeEntityId: token.activeEntityId,
  };

  return handler(req, session);
}

export async function withRole(
  req: NextRequest,
  roles: UserRole[],
  handler: (req: NextRequest, session: AuthSession) => Promise<Response>
): Promise<Response> {
  return withAuth(req, async (innerReq, session) => {
    if (!roles.includes(session.role)) {
      return error('FORBIDDEN', 'Insufficient permissions', 403);
    }

    return handler(innerReq, session);
  });
}

export async function withEntityAccess(
  req: NextRequest,
  entityId: string,
  handler: (req: NextRequest, session: AuthSession) => Promise<Response>
): Promise<Response> {
  return withAuth(req, async (innerReq, session) => {
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
    });

    if (!entity) {
      return error('NOT_FOUND', 'Entity not found', 404);
    }

    if (entity.userId !== session.userId) {
      return error('FORBIDDEN', 'You do not have access to this entity', 403);
    }

    return handler(innerReq, session);
  });
}
