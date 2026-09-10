import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { getInvoice, updateInvoiceStatus } from '@/modules/finance/services/invoice-service';
import { withAuth, withEntityScope, withRole } from '@/shared/middleware/auth';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import { prisma } from '@/lib/db';

const updateSchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'VIEWED', 'PAID', 'OVERDUE', 'CANCELLED']),
});

/**
 * The entity of an `/api/finance/invoices/<id>` request is a property of the
 * row, not of the request: there is no `?entityId=` and no body to read it
 * from, and falling through to the session's active entity would answer about
 * an invoice the caller never asked for.
 *
 * Authenticate FIRST so an anonymous caller never reaches the database, then
 * look up the owning entity id -- and only the id, no invoice data crosses this
 * line -- and hand it to `withEntityScope`, which proves ownership.
 *
 * Local to this file on purpose: a Next.js route file may only export HTTP
 * handlers. See docs/parallel-build/tenancy-pattern.md §4.
 */
async function withInvoiceScope(
  request: NextRequest,
  invoiceId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.financialRecord.findUnique({
      where: { id: invoiceId },
      select: { entityId: true },
    });
    if (!owner) {
      return error('NOT_FOUND', `Invoice ${invoiceId} not found`, 404);
    }
    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withInvoiceScope(request, id, async (_req, _session, entityId) => {
    try {
      const invoice = await getInvoice(id, entityId);
      if (!invoice) {
        return error('NOT_FOUND', `Invoice ${id} not found`, 404);
      }
      return success(invoice);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withInvoiceScope(request, id, async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = updateSchema.safeParse(body);
        if (!parsed.success) {
          return error('VALIDATION_ERROR', parsed.error.message, 400);
        }

        const invoice = await updateInvoiceStatus(id, entityId, parsed.data.status);
        if (!invoice) {
          return error('NOT_FOUND', `Invoice ${id} not found`, 404);
        }
        return success(invoice);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    })
  );
}
