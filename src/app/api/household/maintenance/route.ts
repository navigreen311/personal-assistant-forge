import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import * as maintenanceService from '@/modules/household/services/maintenance-service';

const createSchema = z.object({
  userId: z.string().min(1),
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
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) return error('MISSING_PARAM', 'userId is required', 400);

    const tasks = await maintenanceService.getUpcomingTasks(userId, 365);
    return success(tasks);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

    const task = await maintenanceService.createTask(parsed.data.userId, parsed.data);
    return success(task, 201);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
