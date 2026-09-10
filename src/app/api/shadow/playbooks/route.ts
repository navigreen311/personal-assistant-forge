import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import type { UserRole } from '@/lib/auth/types';
import { callPlaybookService } from '@/modules/shadow/compliance/call-playbook';

const CREATE_ROLES: UserRole[] = ['owner', 'admin', 'member'];

const CreatePlaybookSchema = z.object({
  // Still accepted, still validated, and no longer load-bearing: P-34 takes the
  // entity from `withEntityScope`, which has proved it against the session.
  entityId: z.string().min(1).optional(),
  name: z.string().min(1).max(255),
  description: z.string().optional().default(''),
  type: z.string().optional().default('general'),
  steps: z.array(z.object({
    order: z.number(),
    type: z.enum(['greeting', 'question', 'script', 'objection_handler', 'escalation', 'closing']),
    content: z.string(),
    expectedResponses: z.array(z.string()).optional(),
    nextStepOnSuccess: z.number().optional(),
    nextStepOnFailure: z.number().optional(),
    requiredCompliance: z.array(z.string()).optional(),
  })).optional().default([]),
  isActive: z.boolean().optional().default(true),
  tags: z.array(z.string()).optional().default([]),
});

/**
 * GET /api/shadow/playbooks?entityId=xxx
 * List all playbooks for an entity.
 */
export async function GET(request: NextRequest) {
  // P-34. Was `withAuth` + `?entityId=` -> `listPlaybooks(entityId)`: one of the
  // five route/method pairs P-20's fuzz recorded as answering tenant A with
  // tenant B's rows. `withEntityScope` resolves the same candidate in the same
  // order and then applies Decision 1 to it.
  return withEntityScope(request, async (_req, _session, entityId) => {
    try {
      const playbooks = await callPlaybookService.listPlaybooks(entityId);
      return success(playbooks);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list playbooks';
      return error('PLAYBOOK_LIST_FAILED', message, 500);
    }
  });
}

/**
 * POST /api/shadow/playbooks
 * Create a new playbook.
 */
export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, session, entityId) => {
    if (!CREATE_ROLES.includes(session.role)) {
      return error('FORBIDDEN', 'Insufficient permissions', 403);
    }

    try {
      const body = await req.json();
      const parsed = CreatePlaybookSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const playbook = await callPlaybookService.createPlaybook(parsed.data, entityId);
      return success(playbook, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create playbook';
      return error('PLAYBOOK_CREATE_FAILED', message, 500);
    }
  });
}
