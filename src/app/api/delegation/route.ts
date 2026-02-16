import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { delegateTask, getDelegatedTasks } from '@/modules/delegation/services/delegation-service';
import { buildContextPack } from '@/modules/delegation/services/delegation-service';

const createDelegationSchema = z.object({
  taskId: z.string().min(1),
  delegatedTo: z.string().min(1),
  contextPack: z.object({
    summary: z.string(),
    relevantDocuments: z.array(z.string()),
    relevantMessages: z.array(z.string()),
    relevantContacts: z.array(z.string()),
    deadlines: z.array(z.object({ description: z.string(), date: z.coerce.date() })),
    notes: z.string(),
    permissions: z.array(z.string()),
  }).optional(),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const { searchParams } = req.nextUrl;
      const direction = searchParams.get('direction') as 'delegated_by' | 'delegated_to';

      if (!direction || !['delegated_by', 'delegated_to'].includes(direction)) {
        return error('VALIDATION_ERROR', 'direction must be delegated_by or delegated_to', 400);
      }

      const tasks = await getDelegatedTasks(session.userId, direction);
      return success(tasks);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = createDelegationSchema.safeParse(body);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { taskId, delegatedTo, contextPack } = parsed.data;
      const pack = contextPack || await buildContextPack(taskId);
      const delegation = await delegateTask(taskId, session.userId, delegatedTo, pack);
      return success(delegation, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
