import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, withEntityScope } from '@/shared/middleware/auth';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import { success, error } from '@/shared/utils/api-response';
import { getVersions } from '@/modules/documents/services/versioning-service';

/**
 * tenancy-pattern.md sec.4 + sec.3. Version records carry no entityId (there is no
 * version table at all -- see versioning-service.ts), so the scope is proven on
 * the PARENT document and this handler returns early if it is not the
 * caller's. Before this, any authenticated caller who knew a document id could
 * read every historical revision of another tenant's document.
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

  return withDocumentScope(request, id, async () => {
    try {
      const versions = await getVersions(id);
      return success(versions);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
