import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { EntityService, getCurrentUserId } from '@/modules/entities/entity.service';
import { updateEntitySchema } from '@/modules/entities/entity.validation';

const entityService = new EntityService();

type RouteContext = { params: Promise<{ entityId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { entityId } = await context.params;
    const userId = getCurrentUserId(request.headers);

    const entity = await entityService.getEntity(entityId, userId);
    if (!entity) {
      return error('NOT_FOUND', 'Entity not found', 404);
    }

    return success(entity);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to get entity', 500);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { entityId } = await context.params;
    const userId = getCurrentUserId(request.headers);
    const body = await request.json();

    const parsed = updateEntitySchema.safeParse(body);
    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid update data', 400, {
        issues: parsed.error.issues,
      });
    }

    const entity = await entityService.updateEntity(entityId, userId, parsed.data);
    return success(entity);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update entity';
    if (message.includes('not found') || message.includes('access denied')) {
      return error('NOT_FOUND', message, 404);
    }
    return error('INTERNAL_ERROR', message, 500);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { entityId } = await context.params;
    const userId = getCurrentUserId(request.headers);

    await entityService.deleteEntity(entityId, userId);
    return success({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete entity';
    if (message.includes('not found') || message.includes('access denied')) {
      return error('NOT_FOUND', message, 404);
    }
    return error('INTERNAL_ERROR', message, 500);
  }
}
