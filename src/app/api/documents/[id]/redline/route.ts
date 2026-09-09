import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, withEntityScope } from '@/shared/middleware/auth';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import { success, error } from '@/shared/utils/api-response';
import { generateRedline } from '@/modules/documents/services/versioning-service';

/**
 * tenancy-pattern.md sec.4 + sec.3 -- scope proven on the parent document before any
 * revision content is read. A redline returns the full text of two revisions,
 * so this was the widest read in the module.
 *
 * Duplicated per route file on purpose (sec.8 trap 3d).
 */
async function withDocumentScope(
  request: NextRequest,
  documentId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.document.findUnique({
      where: { id: documentId },
      select: { entityId: true, deletedAt: true },
    });

    if (!owner || owner.deletedAt) {
      return error('NOT_FOUND', `Document not found: ${documentId}`, 404);
    }

    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return withDocumentScope(request, id, async (req) => {
    try {
      const v1 = req.nextUrl.searchParams.get('v1');
      const v2 = req.nextUrl.searchParams.get('v2');

      if (!v1 || !v2) return error('VALIDATION_ERROR', 'v1 and v2 query params are required', 400);

      const redline = await generateRedline(id, parseInt(v1, 10), parseInt(v2, 10));
      return success(redline);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
