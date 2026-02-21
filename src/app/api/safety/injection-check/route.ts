import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withRole } from '@/shared/middleware/auth';
import { scanForInjection } from '@/engines/trust-safety/injection-firewall';

const RequestSchema = z.object({
  input: z.string().min(1),
});

export async function POST(request: NextRequest) {
  return withRole(request, ['admin'], async (req, _session) => {
    try {
      const body = await req.json();
      const parsed = RequestSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const result = await scanForInjection(parsed.data.input);
      return success(result);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to check for injection', 500);
    }
  });
}
