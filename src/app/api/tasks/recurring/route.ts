import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope, withRole } from '@/shared/middleware/auth';
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
  return withEntityScope(request, async (_req, _session, entityId) => {
    try {
      const configs = await getRecurringConfigs(entityId);
      return success(configs);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list recurring configs';
      return error('LIST_FAILED', message, 500);
    }
  });
}

/**
 * `createRecurringConfig` is async now: the template task has to be proven to
 * live in the caller's entity before a config can be pointed at it. Awaiting a
 * call that used to be synchronous is easy to miss -- it fails as an unhandled
 * rejection at runtime rather than at the type level, so check for it when you
 * copy this pattern into a module of your own.
 */
export async function POST(request: NextRequest) {
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEntityScope(request, async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = CreateRecurringSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', parsed.error.message, 400);
        }

        const config = await createRecurringConfig(
          {
            ...parsed.data,
            nextDue: new Date(parsed.data.nextDue),
          },
          entityId
        );

        return success(config, 201);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create recurring config';
        return error('CREATE_FAILED', message, 500);
      }
    })
  );
}

export async function PUT(request: NextRequest) {
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEntityScope(request, async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = UpdateRecurringSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', parsed.error.message, 400);
        }

        const config = await adjustCadence(parsed.data.configId, entityId);
        return success(config);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update recurring config';
        return error('UPDATE_FAILED', message, 500);
      }
    })
  );
}

export async function DELETE(request: NextRequest) {
  return withRole(request, ['owner', 'admin'], () =>
    withEntityScope(request, async (req, _session, entityId) => {
      try {
        // DELETE with a JSON body: withEntityScope does not read the body for
        // GET or DELETE, so the scope for this method comes from `?entityId=` or
        // the session's active entity. `configId` still travels in the body,
        // which is how this endpoint was already shaped.
        const body = await req.json();
        const parsed = UpdateRecurringSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', parsed.error.message, 400);
        }

        await deactivateRecurring(parsed.data.configId, entityId);
        return success({ deactivated: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to deactivate recurring config';
        return error('DEACTIVATE_FAILED', message, 500);
      }
    })
  );
}
