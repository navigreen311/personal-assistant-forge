import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import type { AuthSession } from '@/lib/auth/types';

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

export async function GET(req: NextRequest): Promise<Response> {
  return withAuth(req, handleGet);
}
