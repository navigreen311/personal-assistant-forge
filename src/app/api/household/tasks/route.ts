import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope, withRole } from '@/shared/middleware/auth';
import * as maintenanceService from '@/modules/household/services/maintenance-service';

/**
 * This route used to return eight hardcoded maintenance chores -- gutters, water
 * heater, HVAC filter -- with invented completion dates, and its POST echoed the
 * body back with a `t-${Date.now()}` id and wrote nothing. It now reads and
 * writes the same entity-scoped `Task` rows as /api/household/maintenance.
 *
 * `?season=` returns that season's schedule; otherwise the caller gets the open
 * tasks for the next year, overdue ones included.
 */

const createSchema = z.object({
  category: z.enum(['HVAC', 'PLUMBING', 'ELECTRICAL', 'LAWN', 'APPLIANCE', 'ROOF', 'PEST', 'GENERAL']),
  title: z.string().min(1),
  description: z.string().optional(),
  frequency: z.enum(['MONTHLY', 'QUARTERLY', 'BIANNUAL', 'ANNUAL', 'ONE_TIME']),
  season: z.enum(['SPRING', 'SUMMER', 'FALL', 'WINTER', 'ANY']).optional(),
  nextDueDate: z.string().transform((s) => new Date(s)),
  assignedProviderId: z.string().optional(),
  estimatedCostUsd: z.number().optional(),
  notes: z.string().optional(),
  // Optional and still verified; see the tenancy pattern, section 1.
  entityId: z.string().min(1).optional(),
});

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, session, entityId) => {
    try {
      const season = req.nextUrl.searchParams.get('season');
      if (season) {
        const seasonal = await maintenanceService.getSeasonalSchedule(
          entityId,
          session.userId,
          season
        );
        return success(seasonal);
      }

      const [upcoming, overdue] = await Promise.all([
        maintenanceService.getUpcomingTasks(entityId, session.userId, 365),
        maintenanceService.getOverdueTasks(entityId, session.userId),
      ]);
      return success([...overdue, ...upcoming]);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEntityScope(request, async (req, session, entityId) => {
      try {
        const body = await req.json();
        const parsed = createSchema.safeParse(body);
        if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

        const { entityId: _requested, ...draft } = parsed.data;
        const task = await maintenanceService.createTask(entityId, session.userId, {
          ...draft,
          userId: session.userId,
        });
        return success(task, 201);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    })
  );
}
