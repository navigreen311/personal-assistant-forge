import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { simulateWorkflow } from '@/modules/workflows/services/simulation-service';

const simulateSchema = z.object({
  variables: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await params;
      const body = await req.json();
      const parsed = simulateSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const result = await simulateWorkflow(id, parsed.data.variables);

      return success(result);
    } catch (err) {
      return error(
        'SIMULATION_FAILED',
        err instanceof Error ? err.message : 'Failed to simulate workflow',
        500
      );
    }
  });
}
