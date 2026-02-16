import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { routeRequest } from '@/engines/cost/model-router';

const RequestSchema = z.object({
  inputText: z.string().min(1),
  taskType: z.string().optional(),
});

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = RequestSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const decision = await routeRequest(parsed.data.inputText, parsed.data.taskType);
      return success(decision);
    } catch (err) {
      return error('INTERNAL_ERROR', 'Failed to route model request', 500);
    }
  });
}
