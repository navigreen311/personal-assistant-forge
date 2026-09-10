// ============================================================================
// GET /api/execution/gates    - List execution gates with optional filters
// POST /api/execution/gates   - Create a new execution gate
// PUT /api/execution/gates    - Update an existing execution gate
// DELETE /api/execution/gates - Delete an execution gate
// ============================================================================
//
// P-09 (T-001): all four handlers discarded the session as `_session` and took
// `entityId` off the request. A gate is what STOPS an action, so both
// directions mattered: a caller could list another tenant's gates, and could
// delete them. They now run under `withEntityScope`, and the service puts the
// verified entity in the WHERE clause of every statement.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope, withRole } from '@/shared/middleware/auth';
import {
  listGates,
  createGate,
  updateGate,
  deleteGate,
} from '@/modules/execution/services/execution-gate';

// --- Validation Schemas ---

const listFiltersSchema = z.object({
  scope: z.enum(['GLOBAL', 'ENTITY', 'RUNBOOK']).optional(),
  // Still accepted, still verified by withEntityScope, never trusted here.
  entityId: z.string().optional(),
});

const createGateSchema = z.object({
  name: z.string().min(1),
  expression: z.string().min(1),
  description: z.string().min(1),
  scope: z.enum(['GLOBAL', 'ENTITY', 'RUNBOOK']),
  entityId: z.string().optional(),
  isActive: z.boolean(),
});

const updateGateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  expression: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  scope: z.enum(['GLOBAL', 'ENTITY', 'RUNBOOK']).optional(),
  entityId: z.string().optional(),
  isActive: z.boolean().optional(),
});

const deleteGateSchema = z.object({
  id: z.string().min(1),
  entityId: z.string().optional(),
});

// --- Handlers ---

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const { searchParams } = new URL(req.url);

      const parsed = listFiltersSchema.safeParse({
        scope: searchParams.get('scope') ?? undefined,
        entityId: searchParams.get('entityId') ?? undefined,
      });

      if (!parsed.success) {
        return error(
          'VALIDATION_ERROR',
          'Invalid query parameters',
          400,
          { issues: parsed.error.flatten().fieldErrors }
        );
      }

      const gates = await listGates(entityId, parsed.data.scope);
      return success(gates);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withRole(request, ['owner', 'admin'], () =>
    withEntityScope(request, async (req, _session, entityId) => {
      try {
        const body: unknown = await req.json();

        const parsed = createGateSchema.safeParse(body);
        if (!parsed.success) {
          return error(
            'VALIDATION_ERROR',
            'Invalid request body',
            400,
            { issues: parsed.error.flatten().fieldErrors }
          );
        }

        // Drop the caller's own entityId; the verified one is the owner.
        const { entityId: _requested, ...draft } = parsed.data;
        const gate = await createGate(draft, entityId);
        return success(gate, 201);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        return error('INTERNAL_ERROR', message, 500);
      }
    })
  );
}

export async function PUT(request: NextRequest) {
  return withRole(request, ['owner', 'admin'], () =>
    withEntityScope(request, async (req, _session, entityId) => {
      try {
        const body: unknown = await req.json();

        const parsed = updateGateSchema.safeParse(body);
        if (!parsed.success) {
          return error(
            'VALIDATION_ERROR',
            'Invalid request body',
            400,
            { issues: parsed.error.flatten().fieldErrors }
          );
        }

        const { id, entityId: _requested, ...updates } = parsed.data;
        const gate = await updateGate(id, updates, entityId);
        return success(gate);
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

export async function DELETE(request: NextRequest) {
  return withRole(request, ['owner', 'admin'], () =>
    withEntityScope(request, async (req, _session, entityId) => {
      try {
        const body: unknown = await req.json();

        const parsed = deleteGateSchema.safeParse(body);
        if (!parsed.success) {
          return error(
            'VALIDATION_ERROR',
            'Invalid request body',
            400,
            { issues: parsed.error.flatten().fieldErrors }
          );
        }

        await deleteGate(parsed.data.id, entityId);
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
