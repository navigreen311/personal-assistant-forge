import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { EntityService } from '@/modules/entities/entity.service';
import { withEntityScope } from '@/shared/middleware/auth';

const entityService = new EntityService();

type RouteContext = { params: Promise<{ entityId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { entityId } = await context.params;

  // Ownership is proven by withEntityScope against the verified session, not by
  // an `x-user-id` header the caller sets for itself. getEntityHealth takes only
  // an entityId and cannot check ownership, so the route must.
  return withEntityScope(
    request,
    async (_req, _session, verifiedEntityId) => {
      try {
        const health = await entityService.getEntityHealth(verifiedEntityId);
        return success(health);
      } catch (_err) {
        return error('INTERNAL_ERROR', 'Failed to get entity health', 500);
      }
    },
    entityId
  );
}
