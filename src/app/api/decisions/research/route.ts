import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { conductResearch } from '@/modules/decisions/services/research-agent';

const ResearchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  entityId: z.string().min(1),
  depth: z.enum(['QUICK', 'STANDARD', 'DEEP']),
  sourceTypes: z.array(z.enum(['WEB', 'DOCUMENT', 'KNOWLEDGE'])).min(1),
  maxSources: z.number().int().min(1).max(20),
});

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, _session) => {
    try {
      const body = await req.json();
      const parsed = ResearchRequestSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const report = await conductResearch(parsed.data);
      return success(report, 201);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to conduct research', 500);
    }
  });
}
