import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { callPlaybookService } from '@/modules/shadow/compliance/call-playbook';

const CreatePlaybookSchema = z.object({
  entityId: z.string().min(1),
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
  return withAuth(request, async (req, session) => {
    try {
      const entityId =
        req.nextUrl.searchParams.get('entityId') ?? session.activeEntityId;

      if (!entityId) {
        return error('VALIDATION_ERROR', 'entityId is required', 400);
      }

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
  return withAuth(request, async (req) => {
    try {
      const body = await req.json();
      const parsed = CreatePlaybookSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const playbook = await callPlaybookService.createPlaybook(parsed.data);
      return success(playbook, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create playbook';
      return error('PLAYBOOK_CREATE_FAILED', message, 500);
    }
  });
}
