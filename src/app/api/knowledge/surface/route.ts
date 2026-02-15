import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { surfaceRelevant } from '@/modules/knowledge/services/surfacing-service';

const surfaceSchema = z.object({
  entityId: z.string().min(1),
  currentActivity: z.string().min(1),
  activeContactIds: z.array(z.string()).optional(),
  activeProjectId: z.string().optional(),
  currentTags: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = surfaceSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    const surfaced = await surfaceRelevant(parsed.data);
    return success(surfaced);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to surface knowledge', 500);
  }
}
