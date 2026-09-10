// ============================================================================
// GET    /api/execution/queue/:id  - Get a single queued action by ID
// PATCH  /api/execution/queue/:id  - Approve, reject, execute, or schedule
// DELETE /api/execution/queue/:id  - Cancel a queued action
// ============================================================================
//
// P-09 (T-001). Two separate bugs lived here.
//
// 1. No tenant scope at all. `getActionById(id)` took an id straight off the
//    path, so anyone who knew an id could read, approve, EXECUTE or cancel
//    another tenant's queued action. Approving and executing are the two most
//    consequential verbs the platform has.
//
// 2. `approverId` came off the request body. The approval record -- the thing
//    a consent receipt points at to say a human agreed -- named whoever the
//    requester chose to name. It is the session's user id now.
//
// `withEntityScope` cannot resolve the entity for `/queue/<id>`: the entity is
// a property of the row, not of the request, and falling through to the
// session's active entity would answer about an action the caller never asked
// for. `withActionScope` below resolves it from the row and then hands over.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope, type VerifiedEntityId, withRole } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import {
  getActionById,
  approveAction,
  rejectAction,
  executeAction,
  scheduleAction,
  cancelAction,
} from '@/modules/execution/services/action-queue';

// --- Validation Schemas ---

const patchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('APPROVE'),
    // Accepted for backwards compatibility and deliberately ignored: the
    // approver is the authenticated caller.
    approverId: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal('REJECT'),
    reason: z.string().min(1),
  }),
  z.object({
    action: z.literal('EXECUTE'),
  }),
  z.object({
    action: z.literal('SCHEDULE'),
    scheduledFor: z.coerce.date(),
  }),
]);

// --- Local scope resolver ---

async function withActionScope(
  request: NextRequest,
  actionId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  // Authenticate FIRST, so an anonymous caller never reaches the database.
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.queuedAction.findUnique({
      where: { id: actionId },
      // The id ONLY. No action data crosses this line before ownership is
      // proved, so a 403 cannot leak what it is refusing.
      select: { entityId: true },
    });
    if (!owner) {
      return error('NOT_FOUND', `Action ${actionId} not found`, 404);
    }
    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

// --- Handlers ---

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withActionScope(request, id, async (_req, _session, entityId) => {
    try {
      const action = await getActionById(id, entityId);
      if (!action) {
        return error('NOT_FOUND', `Action ${id} not found`, 404);
      }

      return success(action);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withActionScope(request, id, async (req, session, entityId) => {
      try {
        const body: unknown = await req.json();

        const parsed = patchSchema.safeParse(body);
        if (!parsed.success) {
          return error(
            'VALIDATION_ERROR',
            'Invalid request body',
            400,
            { issues: parsed.error.flatten().fieldErrors }
          );
        }

        const payload = parsed.data;

        switch (payload.action) {
          case 'APPROVE': {
            const result = await approveAction(id, session.userId, entityId);
            return success(result);
          }
          case 'REJECT': {
            const result = await rejectAction(id, payload.reason, entityId);
            return success(result);
          }
          case 'EXECUTE': {
            const result = await executeAction(id, entityId);
            return success(result);
          }
          case 'SCHEDULE': {
            const result = await scheduleAction(id, payload.scheduledFor, entityId);
            return success(result);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';

        if (message.includes('not found')) {
          return error('NOT_FOUND', message, 404);
        }
        if (message.includes('Execution blocked')) {
          return error('GATE_BLOCKED', message, 403);
        }
        if (message.includes('Cannot')) {
          return error('INVALID_STATE', message, 409);
        }

        return error('INTERNAL_ERROR', message, 500);
      }
    })
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withRole(request, ['owner', 'admin'], () =>
    withActionScope(request, id, async (_req, session, entityId) => {
      if (session.role !== 'admin' && session.role !== 'owner') {
        return error('FORBIDDEN', 'Insufficient permissions', 403);
      }

      try {
        const result = await cancelAction(id, entityId);
        return success(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';

        if (message.includes('not found')) {
          return error('NOT_FOUND', message, 404);
        }
        if (message.includes('Cannot cancel')) {
          return error('INVALID_STATE', message, 409);
        }

        return error('INTERNAL_ERROR', message, 500);
      }
    })
  );
}
