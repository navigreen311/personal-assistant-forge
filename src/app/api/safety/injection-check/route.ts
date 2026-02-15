import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { scanForInjection } from '@/engines/trust-safety/injection-firewall';

const RequestSchema = z.object({
  input: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid request body', 400, {
        issues: parsed.error.issues,
      });
    }

    const result = scanForInjection(parsed.data.input);
    return success(result);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to check for injection', 500);
  }
}
