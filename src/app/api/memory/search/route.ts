import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { searchMemories } from '@/engines/memory/memory-service';

const SearchSchema = z.object({
  userId: z.string().min(1),
  query: z.string().min(1),
  types: z.array(z.enum(['SHORT_TERM', 'WORKING', 'LONG_TERM', 'EPISODIC'])).optional(),
  minStrength: z.number().min(0).max(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = SearchSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid request body', 400, {
        issues: parsed.error.issues,
      });
    }

    const results = await searchMemories(parsed.data);
    return success(results);
  } catch (err) {
    return error('INTERNAL_ERROR', (err as Error).message, 500);
  }
}
