import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { EntityService } from '@/modules/entities/entity.service';
import { updateEntitySchema } from '@/modules/entities/entity.validation';
import { withEntityAccess } from '@/shared/middleware/auth';


const entityService = new EntityService();

type RouteContext = { params: Promise<{ entityId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { entityId } = await context.params;
  return withEntityAccess(request, entityId, async (req, session) => {
    try {
      const entity = await entityService.getEntity(entityId, session.userId);
      if (!entity) {
        return error('NOT_FOUND', 'Entity not found', 404);
      }

      return success(entity);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to get entity', 500);
    }
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { entityId } = await context.params;
  return withEntityAccess(request, entityId, async (req, session) => {
    try {
      const body = await req.json();

      const parsed = updateEntitySchema.safeParse(body);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid update data', 400, {
          issues: parsed.error.issues,
        });
      }

      const entity = await entityService.updateEntity(entityId, session.userId, parsed.data);
      return success(entity);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update entity';
      if (message.includes('not found') || message.includes('access denied')) {
        return error('NOT_FOUND', message, 404);
      }
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { entityId } = await context.params;
  return withEntityAccess(request, entityId, async (req, session) => {
    try {
      await entityService.deleteEntity(entityId, session.userId);
      return success({ deleted: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete entity';
      if (message.includes('not found') || message.includes('access denied')) {
        return error('NOT_FOUND', message, 404);
      }
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
