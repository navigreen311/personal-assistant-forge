import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withRole } from '@/shared/middleware/auth';
import { analyzeEmailHeaders } from '@/engines/trust-safety/reputation-service';

const RequestSchema = z.object({
  headers: z.record(z.string(), z.string()),
});

export async function POST(request: NextRequest) {
  return withRole(request, ['admin'], async (req, session) => {
    try {
      const body = await req.json();
      const parsed = RequestSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const analysis = analyzeEmailHeaders(parsed.data.headers);
      return success(analysis);
    } catch (err) {
      return error('INTERNAL_ERROR', 'Failed to analyze email headers', 500);
    }
  });
}
