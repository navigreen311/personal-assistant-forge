// ============================================================================
// POST /api/execution/simulate - Dry-run an action and report its effects
// ============================================================================
//
// P-09 (T-001): the handler discarded the session and required `entityId` in
// the body, which the simulator then used to describe the records that would be
// touched. Nothing is written by a simulation, which is precisely why it is
// easy to overlook -- it is a read of another tenant's shape, and it answered.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import { simulateAction } from '@/modules/execution/services/simulation-engine';

const SimulateRequestSchema = z.object({
  actionType: z.string().min(1, 'actionType is required'),
  target: z.string().min(1, 'target is required'),
  parameters: z.record(z.string(), z.unknown()),
  entityId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
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

      const { entityId: _requested, ...draft } = parsed.data;
      const result = await simulateAction(draft, entityId);

      return success(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Simulation failed';
      return error('SIMULATION_ERROR', message, 500);
    }
  });
}
