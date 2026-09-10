import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import * as maintenanceService from '@/modules/household/services/maintenance-service';

const createSchema = z.object({
  category: z.enum(['HVAC', 'PLUMBING', 'ELECTRICAL', 'LAWN', 'APPLIANCE', 'ROOF', 'PEST', 'GENERAL']),
  title: z.string().min(1),
  description: z.string().optional(),
  frequency: z.enum(['MONTHLY', 'QUARTERLY', 'BIANNUAL', 'ANNUAL', 'ONE_TIME']),
  season: z.enum(['SPRING', 'SUMMER', 'FALL', 'WINTER', 'ANY']).optional(),
  nextDueDate: z.string().transform(s => new Date(s)),
  assignedProviderId: z.string().optional(),
  estimatedCostUsd: z.number().optional(),
  // Optional and still verified; see the tenancy pattern, section 1.
  entityId: z.string().min(1).optional(),
});

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, session, entityId) => {
    try {
      const tasks = await maintenanceService.getUpcomingTasks(entityId, session.userId, 365);
      return success(tasks);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, session, entityId) => {
    try {
      const body = await req.json();
      const parsed = createSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      // `entityId` from the scope, not from the body: the destructure below
      // drops whatever tenant the caller named.
      const { entityId: _requested, ...draft } = parsed.data;
      const task = await maintenanceService.createTask(entityId, session.userId, {
        ...draft,
        userId: session.userId,
      });
      return success(task, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
