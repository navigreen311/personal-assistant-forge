import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { searchMemories } from '@/engines/memory/memory-service';
import { withAuth } from '@/shared/middleware/auth';
import { withRateLimit } from '@/shared/middleware/rate-limit';

const SearchSchema = z.object({
  query: z.string().min(1),
  types: z.array(z.enum(['SHORT_TERM', 'WORKING', 'LONG_TERM', 'EPISODIC'])).optional(),
  minStrength: z.number().min(0).max(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

async function handlePOST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = SearchSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const results = await searchMemories({
        userId: session.userId,
        ...parsed.data,
      });
      return success(results);
    } catch (err) {
      return error('INTERNAL_ERROR', (err as Error).message, 500);
    }
  });
}

// ---------------------------------------------------------------------------
// P-18 / T-012 — rate limit: tier "search".
//
// The limiter sits OUTSIDE the auth wrappers so a flood is refused before it
// costs a JWT decrypt and a database round trip. The tier, its budget and the
// reason for that budget are in RATE_LIMIT_POLICY in
// src/shared/middleware/rate-limit.ts; nothing about the limit is decided here,
// so no route can quietly hold a different number from the published table.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  return withRateLimit(request, 'search', handlePOST);
}
