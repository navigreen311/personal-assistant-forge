import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope, withRole } from '@/shared/middleware/auth';
import { conductResearch } from '@/modules/decisions/services/research-agent';

const ResearchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  entityId: z.string().min(1).optional(),
  depth: z.enum(['QUICK', 'STANDARD', 'DEEP']),
  sourceTypes: z.array(z.enum(['WEB', 'DOCUMENT', 'KNOWLEDGE'])).min(1),
  maxSources: z.number().int().min(1).max(20),
});

export async function POST(request: NextRequest) {
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
