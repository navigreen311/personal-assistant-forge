import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { suggestLinks, applyLink } from '@/modules/knowledge/services/auto-linker';
import { withAuth, withEntityScope, withRole } from '@/shared/middleware/auth';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';

const applyLinkSchema = z.object({
  targetId: z.string().min(1),
});

/**
 * tenancy-pattern.md sec.4. Duplicated per route file on purpose (sec.8 trap 3d).
 */
async function withEntryScope(
  request: NextRequest,
  entryId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.knowledgeEntry.findUnique({
      where: { id: entryId },
      select: { entityId: true },
    });

    if (!owner) {
      return error('NOT_FOUND', 'Knowledge entry not found', 404);
    }

    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return withEntryScope(request, id, async (_req, _session, entityId) => {
    try {
      const suggestions = await suggestLinks(id, entityId);
      return success(suggestions);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to get link suggestions', 500);
    }
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEntryScope(request, id, async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = applyLinkSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', parsed.error.message, 400);
        }

        // applyLink is bidirectional and writes to BOTH rows, so the target is
        // scoped too. Before this, naming another tenant's entry as targetId
        // edited that tenant's row.
        await applyLink(id, parsed.data.targetId, entityId);
        return success({ linked: true }, 201);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to apply link';
        if (message.includes('not found')) {
          return error('NOT_FOUND', message, 404);
        }
        return error('INTERNAL_ERROR', 'Failed to apply link', 500);
      }
    })
  );
}
