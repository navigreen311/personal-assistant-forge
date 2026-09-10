import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import type { AuthSession } from '@/lib/auth/types';
import { withRateLimit } from '@/shared/middleware/rate-limit';

// ---------------------------------------------------------------------------
// GET /api/contacts/search?q=
// Search contacts by name or email for the authenticated user
// ---------------------------------------------------------------------------

async function handleGet(req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim() ?? '';

    // Empty or too-short query returns empty array
    if (q.length < 2) {
      return success({ contacts: [] });
    }

    const entityId = session.activeEntityId;

    // Build the entity filter: prefer activeEntityId, fall back to all entities owned by user
    const entityFilter = entityId
      ? { entityId }
      : {
          entity: {
            userId: session.userId,
          },
        };

    const contacts = await prisma.contact.findMany({
      where: {
        ...entityFilter,
        deletedAt: null,
        OR: [
          { name: { contains: q, mode: 'insensitive' as const } },
          { email: { contains: q, mode: 'insensitive' as const } },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      take: 10,
      orderBy: { name: 'asc' },
    });

    return success({ contacts });
  } catch (err) {
    console.error('[contacts/search] GET error:', err);
    return error('INTERNAL_ERROR', 'Failed to search contacts', 500);
  }
}

// ---------------------------------------------------------------------------
// Route exports
// ---------------------------------------------------------------------------

async function handleGET(req: NextRequest): Promise<Response> {
  return withAuth(req, handleGet);
}

// ---------------------------------------------------------------------------
// P-18 / T-012 — rate limit: tier "search".
//
// The limiter sits OUTSIDE the auth wrappers, so a refused request never reaches
// the handler, the entity-ownership query, or the work itself. (On a user-keyed
// tier the limiter does decrypt the session token -- that is what makes the
// bucket unspoofable -- but nothing beyond that runs.) The tier, its budget and
// the reason for that budget live in RATE_LIMIT_POLICY in
// src/shared/middleware/rate-limit.ts; nothing about the limit is decided here,
// so no route can quietly hold a different number from the published table.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<Response> {
  return withRateLimit(request, 'search', handleGET);
}
