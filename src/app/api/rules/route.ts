import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error, paginated } from '@/shared/utils/api-response';
import { createRule, listRules } from '@/engines/policy/rule-crud';
import { withAuth } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';

const CreateRuleSchema = z.object({
  name: z.string().min(1),
  scope: z.enum(['GLOBAL', 'ENTITY', 'PROJECT', 'CONTACT', 'CHANNEL']),
  entityId: z.string().optional(),
  condition: z.record(z.string(), z.unknown()),
  action: z.record(z.string(), z.unknown()),
  precedence: z.number().int().min(0).default(0),
  createdBy: z.enum(['AI', 'HUMAN', 'SYSTEM']).default('HUMAN'),
  isActive: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const { searchParams } = req.nextUrl;
      const scope = searchParams.get('scope') as 'GLOBAL' | 'ENTITY' | 'PROJECT' | 'CONTACT' | 'CHANNEL' | null;
      const entityId = searchParams.get('entityId') ?? undefined;
      const isActive = searchParams.has('isActive')
        ? searchParams.get('isActive') === 'true'
        : undefined;
      const page = parseInt(searchParams.get('page') ?? '1', 10);
      const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10);

      const result = await listRules(
        {
          scope: scope ?? undefined,
          entityId,
          isActive,
        },
        page,
        pageSize
      );

      return paginated(result.data, result.total, page, pageSize);
    } catch (err) {
      return error('INTERNAL_ERROR', (err as Error).message, 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = CreateRuleSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const rule = await createRule(parsed.data);
      return success(rule, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', (err as Error).message, 500);
    }
  });
}
