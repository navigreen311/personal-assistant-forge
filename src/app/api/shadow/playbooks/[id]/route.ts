import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { callPlaybookService } from '@/modules/shadow/compliance/call-playbook';

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
  return withAuth(request, async (req) => {
    try {
      const { id } = await params;
      const body = await req.json();
      const parsed = UpdatePlaybookSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const playbook = await callPlaybookService.updatePlaybook(id, parsed.data);
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
  return withAuth(request, async () => {
    try {
      const { id } = await params;
      await callPlaybookService.deletePlaybook(id);
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
