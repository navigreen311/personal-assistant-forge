import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope, withRole } from '@/shared/middleware/auth';
import { conductResearch } from '@/modules/decisions/services/research-agent';
import { withRateLimit } from '@/shared/middleware/rate-limit';

const ResearchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  entityId: z.string().min(1).optional(),
  depth: z.enum(['QUICK', 'STANDARD', 'DEEP']),
  sourceTypes: z.array(z.enum(['WEB', 'DOCUMENT', 'KNOWLEDGE'])).min(1),
  maxSources: z.number().int().min(1).max(20),
});

async function handlePOST(request: NextRequest) {
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEntityScope(request, async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = ResearchRequestSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', 'Invalid request body', 400, {
            issues: parsed.error.issues,
          });
        }

        // entityId LAST: research reads the entity's knowledge base, so the
        // caller's own value is discarded in favour of the verified scope.
        const { entityId: _requested, ...draft } = parsed.data;
        const report = await conductResearch({ ...draft, entityId });
        return success(report, 201);
      } catch (_err) {
        return error('INTERNAL_ERROR', 'Failed to conduct research', 500);
      }
    })
  );
}

// ---------------------------------------------------------------------------
// P-18 / T-012 — rate limit: tier "ai".
//
// The limiter sits OUTSIDE the auth wrappers so a flood is refused before it
// costs a JWT decrypt and a database round trip. The tier, its budget and the
// reason for that budget are in RATE_LIMIT_POLICY in
// src/shared/middleware/rate-limit.ts; nothing about the limit is decided here,
// so no route can quietly hold a different number from the published table.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  return withRateLimit(request, 'ai', handlePOST);
}
