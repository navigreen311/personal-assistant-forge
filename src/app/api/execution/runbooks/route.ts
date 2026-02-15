// ============================================================================
// GET /api/execution/runbooks   - List runbooks by entity with optional filters
// POST /api/execution/runbooks  - Create a new runbook
// ============================================================================

import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import {
  listRunbooks,
  createRunbook,
} from '@/modules/execution/services/runbook-service';

// --- Validation Schemas ---

const listFiltersSchema = z.object({
  entityId: z.string().min(1, 'entityId is required'),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  tag: z.string().optional(),
});

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

const createRunbookSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  entityId: z.string().min(1),
  steps: z.array(runbookStepSchema).min(1),
  tags: z.array(z.string()),
  isActive: z.boolean(),
  createdBy: z.string().min(1),
  schedule: z.string().optional(),
});

// --- Handlers ---

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const parsed = listFiltersSchema.safeParse({
      entityId: searchParams.get('entityId') ?? undefined,
      isActive: searchParams.get('isActive') ?? undefined,
      tag: searchParams.get('tag') ?? undefined,
    });

    if (!parsed.success) {
      return error(
        'VALIDATION_ERROR',
        'Invalid query parameters',
        400,
        { issues: parsed.error.flatten().fieldErrors }
      );
    }

    const { entityId, isActive, tag } = parsed.data;

    const runbooks = await listRunbooks(entityId, { isActive, tag });
    return success(runbooks);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return error('INTERNAL_ERROR', message, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

    const parsed = createRunbookSchema.safeParse(body);
    if (!parsed.success) {
      return error(
        'VALIDATION_ERROR',
        'Invalid request body',
        400,
        { issues: parsed.error.flatten().fieldErrors }
      );
    }

    const runbook = await createRunbook(parsed.data);
    return success(runbook, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return error('INTERNAL_ERROR', message, 500);
  }
}
