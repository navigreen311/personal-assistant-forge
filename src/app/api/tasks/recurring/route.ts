import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import {
  createRecurringConfig,
  getRecurringConfigs,
  adjustCadence,
  deactivateRecurring,
} from '@/modules/tasks/services/recurring-tasks';

const CadenceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('DAILY') }),
  z.object({ type: z.literal('WEEKLY'), dayOfWeek: z.number().min(0).max(6) }),
  z.object({ type: z.literal('BIWEEKLY'), dayOfWeek: z.number().min(0).max(6) }),
  z.object({ type: z.literal('MONTHLY'), dayOfMonth: z.number().min(1).max(31) }),
  z.object({ type: z.literal('QUARTERLY'), month: z.number().min(1).max(12), dayOfMonth: z.number().min(1).max(31) }),
  z.object({ type: z.literal('CUSTOM'), cronExpression: z.string() }),
]);

const CreateRecurringSchema = z.object({
  taskTemplateId: z.string().min(1),
  cadence: CadenceSchema,
  nextDue: z.string().datetime(),
  slaHours: z.number().optional(),
  autoAdjust: z.boolean(),
  isActive: z.boolean(),
});

const UpdateRecurringSchema = z.object({
  configId: z.string().min(1),
});

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const entityId = params.get('entityId');

    if (!entityId) {
      return error('VALIDATION_ERROR', 'entityId is required', 400);
    }

    const configs = await getRecurringConfigs(entityId);
    return success(configs);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list recurring configs';
    return error('LIST_FAILED', message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = CreateRecurringSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    const config = createRecurringConfig({
      ...parsed.data,
      nextDue: new Date(parsed.data.nextDue),
    });

    return success(config, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create recurring config';
    return error('CREATE_FAILED', message, 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = UpdateRecurringSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    const config = await adjustCadence(parsed.data.configId);
    return success(config);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update recurring config';
    return error('UPDATE_FAILED', message, 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = UpdateRecurringSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    await deactivateRecurring(parsed.data.configId);
    return success({ deactivated: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to deactivate recurring config';
    return error('DEACTIVATE_FAILED', message, 500);
  }
}
