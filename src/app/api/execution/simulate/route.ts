import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { simulateAction } from '@/modules/execution/services/simulation-engine';

const SimulateRequestSchema = z.object({
  actionType: z.string().min(1, 'actionType is required'),
  target: z.string().min(1, 'target is required'),
  parameters: z.record(z.string(), z.unknown()),
  entityId: z.string().min(1, 'entityId is required'),
});

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, _session) => {
    try {
      const body: unknown = await req.json();
      const parsed = SimulateRequestSchema.safeParse(body);

      if (!parsed.success) {
        return error(
          'VALIDATION_ERROR',
          'Invalid request body',
          400,
          { issues: parsed.error.flatten().fieldErrors }
        );
      }

      const result = await simulateAction(parsed.data);

      return success(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Simulation failed';
      return error('SIMULATION_ERROR', message, 500);
    }
  });
}
