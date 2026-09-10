import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import {
  getBudgetWithActuals,
  updateBudget,
  deleteBudget,
} from '@/modules/finance/services/budget-service';
import { withAuth, withEntityScope, withRole } from '@/shared/middleware/auth';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import { prisma } from '@/lib/db';

/**
 * The entity of an `/api/finance/budget/<id>` request is a property of the row.
 * Authenticate first so an anonymous caller never reaches the database, read
 * the owning entity id -- and only the id -- then let `withEntityScope` prove
 * ownership. See docs/parallel-build/tenancy-pattern.md §4.
 *
 * `lookup` is a parameter because this route spans two representations of a
 * budget that predate this package: GET reads the budget-as-Document (a
 * `Document` of type REPORT), while PUT and DELETE write the `Budget` model.
 * Both are keyed by `id` and both carry `entityId`, so the scope is resolved
 * the same way against whichever table the verb actually touches.
 */
async function withBudgetScope(
  request: NextRequest,
  lookup: () => Promise<{ entityId: string } | null>,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  return withAuth(request, async (authedReq) => {
    const owner = await lookup();
    if (!owner) {
      return error('NOT_FOUND', 'Budget not found', 404);
    }
    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withBudgetScope(
    request,
    () => prisma.document.findUnique({ where: { id }, select: { entityId: true } }),
    async (_req, _session, entityId) => {
      try {
        const budget = await getBudgetWithActuals(id, entityId);
        if (!budget) {
          return error('NOT_FOUND', 'Budget not found', 404);
        }
        return success(budget);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    }
  );
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withBudgetScope(
      request,
      () => prisma.budget.findUnique({ where: { id }, select: { entityId: true } }),
      async (req, _session, entityId) => {
        try {
          const body = await req.json();
          const budget = await updateBudget(id, entityId, body);
          if (!budget) {
            return error('NOT_FOUND', 'Budget not found', 404);
          }
          return success(budget);
        } catch (err) {
          return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
        }
      }
    )
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withRole(request, ['owner', 'admin'], () =>
    withBudgetScope(
      request,
      () => prisma.budget.findUnique({ where: { id }, select: { entityId: true } }),
      async (_req, _session, entityId) => {
        try {
          const budget = await deleteBudget(id, entityId);
          if (!budget) {
            return error('NOT_FOUND', 'Budget not found', 404);
          }
          return success({ deleted: true });
        } catch (err) {
          return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
        }
      }
    )
  );
}
