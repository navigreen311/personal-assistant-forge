// ============================================================================
// GET /api/execution/runbooks/:id    - Get a runbook by ID
// PUT /api/execution/runbooks/:id    - Update a runbook
// DELETE /api/execution/runbooks/:id - Delete a runbook
// ============================================================================
//
// P-09 (T-001): all three handlers took the path id with no tenant scope, so a
// runbook -- a stored recipe for multi-step automation against real records --
// could be read, rewritten or deleted by any authenticated user who knew its
// id. Rewriting is the worst of the three: it changes what the automation will
// do next time it runs.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope, type VerifiedEntityId, withRole } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import {
  getRunbook,
  updateRunbook,
  deleteRunbook,
} from '@/modules/execution/services/runbook-service';

// --- Validation Schemas ---

const runbookStepSchema = z.object({
  order: z.number().int().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  actionType: z.string().min(1),
  parameters: z.record(z.string(), z.unknown()),
  requiresApproval: z.boolean(),
  maxBlastRadius: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  continueOnFailure: z.boolean(),
  timeout: z.number().int().positive().optional(),
});

const updateRunbookSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  steps: z.array(runbookStepSchema).min(1).optional(),
  tags: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  schedule: z.string().optional(),
});

// --- Local scope resolver ---

async function withRunbookScope(
  request: NextRequest,
  runbookId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.runbook.findUnique({
      where: { id: runbookId },
      select: { entityId: true },
    });
    if (!owner) {
      return error('NOT_FOUND', `Runbook ${runbookId} not found`, 404);
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
  return withRunbookScope(request, id, async (_req, _session, entityId) => {
    try {
      const runbook = await getRunbook(id, entityId);
      if (!runbook) {
        return error('NOT_FOUND', `Runbook ${id} not found`, 404);
      }

      return success(runbook);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withRunbookScope(request, id, async (req, _session, entityId) => {
      try {
        const body: unknown = await req.json();

        const parsed = updateRunbookSchema.safeParse(body);
        if (!parsed.success) {
          return error(
            'VALIDATION_ERROR',
            'Invalid request body',
            400,
            { issues: parsed.error.flatten().fieldErrors }
          );
        }

        const runbook = await updateRunbook(id, parsed.data, entityId);
        return success(runbook);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        if (message.includes('not found')) {
          return error('NOT_FOUND', message, 404);
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
    withRunbookScope(request, id, async (_req, session, entityId) => {
      if (session.role !== 'admin' && session.role !== 'owner') {
        return error('FORBIDDEN', 'Insufficient permissions', 403);
      }

      try {
        await deleteRunbook(id, entityId);
        return success({ deleted: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        if (message.includes('not found')) {
          return error('NOT_FOUND', message, 404);
        }
        return error('INTERNAL_ERROR', message, 500);
      }
    })
  );
}
