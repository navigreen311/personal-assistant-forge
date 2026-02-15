import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { EntityService, getCurrentUserId } from '@/modules/entities/entity.service';

const entityService = new EntityService();

type RouteContext = { params: Promise<{ entityId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { entityId } = await context.params;
    const userId = getCurrentUserId(request.headers);

    // Verify ownership
    const entity = await entityService.getEntity(entityId, userId);
    if (!entity) {
      return error('NOT_FOUND', 'Entity not found', 404);
    }

    const health = await entityService.getEntityHealth(entityId);
    return success(health);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to get entity health', 500);
  }
}
