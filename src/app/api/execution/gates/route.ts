// ============================================================================
// GET /api/execution/gates    - List execution gates with optional filters
// POST /api/execution/gates   - Create a new execution gate
// PUT /api/execution/gates    - Update an existing execution gate
// DELETE /api/execution/gates - Delete an execution gate
// ============================================================================

import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import {
  listGates,
  createGate,
  updateGate,
  deleteGate,
} from '@/modules/execution/services/execution-gate';

// --- Validation Schemas ---

const listFiltersSchema = z.object({
  scope: z.enum(['GLOBAL', 'ENTITY', 'RUNBOOK']).optional(),
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
});

// --- Handlers ---

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

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

    const { scope, entityId } = parsed.data;

    const gates = listGates(scope, entityId);
    return success(gates);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return error('INTERNAL_ERROR', message, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

    const parsed = createGateSchema.safeParse(body);
    if (!parsed.success) {
      return error(
        'VALIDATION_ERROR',
        'Invalid request body',
        400,
        { issues: parsed.error.flatten().fieldErrors }
      );
    }

    const gate = createGate(parsed.data);
    return success(gate, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return error('INTERNAL_ERROR', message, 500);
  }
}

export async function PUT(request: Request) {
  try {
    const body: unknown = await request.json();

    const parsed = updateGateSchema.safeParse(body);
    if (!parsed.success) {
      return error(
        'VALIDATION_ERROR',
        'Invalid request body',
        400,
        { issues: parsed.error.flatten().fieldErrors }
      );
    }

    const { id, ...updates } = parsed.data;
    const gate = updateGate(id, updates);
    return success(gate);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    if (message.includes('not found')) {
      return error('NOT_FOUND', message, 404);
    }
    return error('INTERNAL_ERROR', message, 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const body: unknown = await request.json();

    const parsed = deleteGateSchema.safeParse(body);
    if (!parsed.success) {
      return error(
        'VALIDATION_ERROR',
        'Invalid request body',
        400,
        { issues: parsed.error.flatten().fieldErrors }
      );
    }

    deleteGate(parsed.data.id);
    return success({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    if (message.includes('not found')) {
      return error('NOT_FOUND', message, 404);
    }
    return error('INTERNAL_ERROR', message, 500);
  }
}
