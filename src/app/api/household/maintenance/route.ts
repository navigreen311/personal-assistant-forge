import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
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
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const tasks = await maintenanceService.getUpcomingTasks(session.userId, 365);
      return success(tasks);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = createSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      const task = await maintenanceService.createTask(session.userId, {
        ...parsed.data,
        userId: session.userId,
      });
      return success(task, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
