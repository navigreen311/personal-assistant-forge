import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { checkContent } from '@/modules/admin/services/dlp-service';

const checkContentSchema = z.object({
  entityId: z.string().min(1),
  content: z.string().min(1),
  scope: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = checkContentSchema.safeParse(body);
    if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

    const { entityId, content, scope } = parsed.data;
    const result = await checkContent(entityId, content, scope);
    return success(result);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
