// ============================================================================
// GET /api/execution/runbooks   - List runbooks by entity with optional filters
// POST /api/execution/runbooks  - Create a new runbook
// ============================================================================
//
// P-09 (T-001): both handlers discarded the session and required the caller to
// name `entityId`, which was then used unverified. `entityId` is now optional
// on both schemas -- a client that omits it gets its session's active entity,
// and a client that sends one still has it verified before the handler runs.
//
// `createdBy` is the authenticated caller: a runbook is an automation someone
// takes responsibility for, and the old schema let the body name anyone.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import {
  listRunbooks,
  createRunbook,
} from '@/modules/execution/services/runbook-service';

// --- Validation Schemas ---

const listFiltersSchema = z.object({
  entityId: z.string().optional(),
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
  entityId: z.string().optional(),
  steps: z.array(runbookStepSchema).min(1),
  tags: z.array(z.string()),
  isActive: z.boolean(),
  createdBy: z.string().min(1).optional(),
  schedule: z.string().optional(),
});

// --- Handlers ---

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const { searchParams } = new URL(req.url);

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

      const { isActive, tag } = parsed.data;

      const runbooks = await listRunbooks(entityId, { isActive, tag });
      return success(runbooks);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, session, entityId) => {
    try {
      const body: unknown = await req.json();

      const parsed = createRunbookSchema.safeParse(body);
      if (!parsed.success) {
        return error(
          'VALIDATION_ERROR',
          'Invalid request body',
          400,
          { issues: parsed.error.flatten().fieldErrors }
        );
      }

      const { entityId: _requested, createdBy: _claimed, ...draft } = parsed.data;

      const runbook = await createRunbook(
        { ...draft, createdBy: session.userId },
        entityId
      );
      return success(runbook, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
