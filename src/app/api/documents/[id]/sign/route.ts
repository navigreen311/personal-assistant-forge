import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withAuth, withEntityScope, withRole } from '@/shared/middleware/auth';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import { success, error } from '@/shared/utils/api-response';
import {
  createSignRequest,
  listSignRequests,
} from '@/modules/documents/services/esign-service';

const signSchema = z.object({
  signers: z.array(z.object({
    name: z.string().min(1),
    email: z.string().email(),
    order: z.number().int().positive(),
  })),
  provider: z.string().optional(),
});

/**
 * tenancy-pattern.md sec.4 + sec.3. ESignRequest has no entityId column in the frozen
 * schema, so scope is proven on the parent Document and passed down; the
 * service re-checks it in its own WHERE clause as defence in depth.
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

  return withDocumentScope(request, id, async (_req, _session, entityId) => {
    try {
      const requests = await listSignRequests(id, entityId);
      return success(requests);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return withRole(request, ['owner', 'admin'], () =>
    withDocumentScope(request, id, async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = signSchema.safeParse(body);
        if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

        const signRequest = await createSignRequest(
          id,
          parsed.data.signers,
          entityId,
          parsed.data.provider
        );
        return success(signRequest, 201);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    })
  );
}
