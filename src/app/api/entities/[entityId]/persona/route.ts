import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { PersonaService } from '@/modules/entities/persona.service';
import { withEntityScope } from '@/shared/middleware/auth';

const personaService = new PersonaService();

type RouteContext = { params: Promise<{ entityId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { entityId } = await context.params;

  // Ownership is proven by withEntityScope against the verified session, not by
  // an `x-user-id` header the caller sets for itself. getPersonaContext takes
  // only an entityId and cannot check ownership, so the route must.
  return withEntityScope(
    request,
    async (_req, _session, verifiedEntityId) => {
      try {
        const persona = await personaService.getPersonaContext(verifiedEntityId);
        return success(persona);
      } catch (_err) {
        return error('INTERNAL_ERROR', 'Failed to get persona context', 500);
      }
    },
    entityId
  );
}
