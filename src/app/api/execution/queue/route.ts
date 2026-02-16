// ============================================================================
// GET /api/execution/queue   - List queued actions with filters + pagination
// POST /api/execution/queue  - Enqueue a new action
// ============================================================================

import { z } from 'zod';
import { success, error, paginated } from '@/shared/utils/api-response';
import {
  getQueuedActions,
  enqueueAction,
} from '@/modules/execution/services/action-queue';
import type { ActionQueueFilters } from '@/modules/execution/types';
import type { ActionActor, BlastRadius } from '@/shared/types';

// --- Validation Schemas ---

const queueFiltersSchema = z.object({
  status: z
    .enum(['QUEUED', 'APPROVED', 'EXECUTING', 'EXECUTED', 'REJECTED', 'ROLLED_BACK', 'FAILED'])
    .optional(),
  actor: z.enum(['AI', 'HUMAN', 'SYSTEM']).optional(),
  blastRadius: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  entityId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const enqueueSchema = z.object({
  actionType: z.string().min(1),
  target: z.string().min(1),
  description: z.string().min(1),
  reason: z.string().min(1),
  impact: z.string().min(1),
  rollbackPlan: z.string().min(1),
  blastRadius: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  reversible: z.boolean(),
  entityId: z.string().min(1),
  actor: z.enum(['AI', 'HUMAN', 'SYSTEM']),
  actorId: z.string().optional(),
  estimatedCost: z.number().optional(),
  projectId: z.string().optional(),
  scheduledFor: z.coerce.date().optional(),
});

// --- Handlers ---

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const parsed = queueFiltersSchema.safeParse({
      status: searchParams.get('status') ?? undefined,
      actor: searchParams.get('actor') ?? undefined,
      blastRadius: searchParams.get('blastRadius') ?? undefined,
      entityId: searchParams.get('entityId') ?? undefined,
      page: searchParams.get('page') ?? undefined,
      pageSize: searchParams.get('pageSize') ?? undefined,
    });

    if (!parsed.success) {
      return error(
        'VALIDATION_ERROR',
        'Invalid query parameters',
        400,
        { issues: parsed.error.flatten().fieldErrors }
      );
    }

    const { page, pageSize, ...filterParams } = parsed.data;

    const filters: ActionQueueFilters = {
      status: filterParams.status,
      actor: filterParams.actor as ActionActor | undefined,
      blastRadius: filterParams.blastRadius as BlastRadius | undefined,
      entityId: filterParams.entityId,
    };

    const result = await getQueuedActions(filters, page, pageSize);
    return paginated(result.data, result.total, page, pageSize);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return error('INTERNAL_ERROR', message, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

    const parsed = enqueueSchema.safeParse(body);
    if (!parsed.success) {
      return error(
        'VALIDATION_ERROR',
        'Invalid request body',
        400,
        { issues: parsed.error.flatten().fieldErrors }
      );
    }

    const action = await enqueueAction(parsed.data);
    return success(action, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return error('INTERNAL_ERROR', message, 500);
  }
}
