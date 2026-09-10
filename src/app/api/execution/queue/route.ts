// ============================================================================
// GET /api/execution/queue   - List queued actions with filters + pagination
// POST /api/execution/queue  - Enqueue a new action
// ============================================================================
//
// P-09 (T-001): both handlers discarded the session and took `entityId` off
// the request, so `POST /api/execution/queue` with someone else's entity id
// queued an action against their data, and `GET ?entityId=` read their queue.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error, paginated } from '@/shared/utils/api-response';
import { withEntityScope, withRole } from '@/shared/middleware/auth';
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
  // Optional now: a client that omits it gets its session's active entity.
  // Making the client name its own tenant is the habit that caused the bug.
  entityId: z.string().optional(),
  actor: z.enum(['AI', 'HUMAN', 'SYSTEM']),
  actorId: z.string().optional(),
  estimatedCost: z.number().optional(),
  projectId: z.string().optional(),
  scheduledFor: z.coerce.date().optional(),
});

// --- Handlers ---

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const { searchParams } = new URL(req.url);

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

      // The scope is NOT a field on the filter bag: the bag is parsed wholesale
      // off the query string, so leaving entityId on it hands the scope back to
      // the caller.
      const filters: Omit<ActionQueueFilters, 'entityId'> = {
        status: filterParams.status,
        actor: filterParams.actor as ActionActor | undefined,
        blastRadius: filterParams.blastRadius as BlastRadius | undefined,
      };

      const result = await getQueuedActions(entityId, filters, page, pageSize);
      return paginated(result.data, result.total, page, pageSize);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEntityScope(request, async (req, session, entityId) => {
      try {
        const body: unknown = await req.json();

        const parsed = enqueueSchema.safeParse(body);
        if (!parsed.success) {
          return error(
            'VALIDATION_ERROR',
            'Invalid request body',
            400,
            { issues: parsed.error.flatten().fieldErrors }
          );
        }

        const { entityId: _requested, ...draft } = parsed.data;

        const action = await enqueueAction(
          {
            ...draft,
            actionLogId: '',
            // A HUMAN action is by the authenticated caller, not by whoever the
            // body named. Stop writing an actor the audit trail cannot verify.
            actorId: draft.actor === 'HUMAN' ? session.userId : draft.actorId,
            requiresApproval: true,
          },
          entityId
        );
        return success(action, 201);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        return error('INTERNAL_ERROR', message, 500);
      }
    })
  );
}
