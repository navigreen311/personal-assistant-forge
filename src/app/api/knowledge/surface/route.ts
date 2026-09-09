import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { surfaceRelevant } from '@/modules/knowledge/services/surfacing-service';
import { withEntityScope } from '@/shared/middleware/auth';

const surfaceSchema = z.object({
  entityId: z.string().min(1).optional(),
  currentActivity: z.string().min(1),
  activeContactIds: z.array(z.string()).optional(),
  activeProjectId: z.string().optional(),
  currentTags: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const body = await req.json();
      const parsed = surfaceSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { entityId: _requested, ...context } = parsed.data;
      const surfaced = await surfaceRelevant(context, entityId);
      return success(surfaced);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to surface knowledge', 500);
    }
  });
}
