import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import type { UserRole } from '@/lib/auth/types';

import { callPlaybookService } from '@/modules/shadow/compliance/call-playbook';

// P-34. `withEntityScope` performs the authentication `withRole` used to, so
// the role gate is kept explicitly inside the handler and still runs before any
// playbook is read.
const WRITE_ROLES: UserRole[] = ['owner', 'admin', 'member'];
const DELETE_ROLES: UserRole[] = ['owner', 'admin'];

const UpdatePlaybookSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  type: z.string().optional(),
  steps: z.array(z.object({
    order: z.number(),
    type: z.enum(['greeting', 'question', 'script', 'objection_handler', 'escalation', 'closing']),
    content: z.string(),
    expectedResponses: z.array(z.string()).optional(),
    nextStepOnSuccess: z.number().optional(),
    nextStepOnFailure: z.number().optional(),
    requiredCompliance: z.array(z.string()).optional(),
  })).optional(),
  isActive: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * PUT /api/shadow/playbooks/[id]
 * Update a playbook.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // P-34. `updatePlaybook(id, data)` was unscoped: one of the five route/method
  // pairs P-20's fuzz recorded as reaching another tenant's rows, and a WRITE.
  // A playbook's `neverDisclose` list is what Shadow may not say out loud on a
  // call, so editing another tenant's is editing their disclosure policy.
  return withEntityScope(request, async (req, session, entityId) => {
    if (!WRITE_ROLES.includes(session.role)) {
      return error('FORBIDDEN', 'Insufficient permissions', 403);
    }

    try {
      const { id } = await params;
      const body = await req.json();
      const parsed = UpdatePlaybookSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const playbook = await callPlaybookService.updatePlaybook(id, parsed.data, entityId);
      return success(playbook);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update playbook';
      if (message.includes('not found')) {
        return error('NOT_FOUND', message, 404);
      }
      return error('PLAYBOOK_UPDATE_FAILED', message, 500);
    }
  });
}

/**
 * DELETE /api/shadow/playbooks/[id]
 * Delete a playbook.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withEntityScope(request, async (_req, session, entityId) => {
    if (!DELETE_ROLES.includes(session.role)) {
      return error('FORBIDDEN', 'Insufficient permissions', 403);
    }

    try {
      const { id } = await params;
      await callPlaybookService.deletePlaybook(id, entityId);
      return success({ deleted: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete playbook';
      if (message.includes('not found')) {
        return error('NOT_FOUND', message, 404);
      }
      return error('PLAYBOOK_DELETE_FAILED', message, 500);
    }
  });
}
