import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error, paginated } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import {
  createDecisionBrief,
  listDecisionBriefs,
} from '@/modules/decisions/services/decision-framework';

const CreateDecisionSchema = z.object({
  entityId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  context: z.string().min(1),
  deadline: z.string().datetime().optional(),
  stakeholders: z.array(z.string()),
  constraints: z.array(z.string()),
  blastRadius: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, _session) => {
    try {
      const { searchParams } = req.nextUrl;
      const entityId = searchParams.get('entityId');
      const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
      const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') ?? '20')));

      if (!entityId) {
        return error('VALIDATION_ERROR', 'entityId query parameter is required', 400);
      }

      const result = await listDecisionBriefs(entityId, page, pageSize);
      return paginated(result.briefs, result.total, page, pageSize);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to list decision briefs', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, _session) => {
    try {
      const body = await req.json();
      const parsed = CreateDecisionSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const brief = await createDecisionBrief({
        ...parsed.data,
        deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : undefined,
      });

      return success(brief, 201);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to create decision brief', 500);
    }
  });
}
