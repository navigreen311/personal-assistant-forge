import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { parseTaskFromText } from '@/modules/tasks/services/nlp-parser';

const ParseSchema = z.object({
  text: z.string().min(1),
  entityId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, _session) => {
    try {
      const body = await req.json();
      const parsed = ParseSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const result = await parseTaskFromText(parsed.data.text);
      return success(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse task';
      return error('PARSE_FAILED', message, 500);
    }
  });
}
