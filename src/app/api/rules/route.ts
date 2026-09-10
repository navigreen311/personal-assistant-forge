// ============================================================================
// GET  /api/rules - List policy rules visible to the entity in scope
// POST /api/rules - Create a policy rule
// ============================================================================
//
// P-09 (T-001): both handlers discarded the session and passed `entityId`
// straight through, so `GET /api/rules` with no parameters listed every
// tenant's policy rules, and a POST could plant a rule inside another tenant.
// A policy rule decides what the platform is allowed to do; planting one is
// the mirror image of removing a gate.
//
// `src/engines/policy/**` belongs to another package and is not touched here.
// The scope is applied at this boundary: the verified entity replaces whatever
// the request asked for, on the way in.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error, paginated } from '@/shared/utils/api-response';
import { createRule, listRules } from '@/engines/policy/rule-crud';
import { withEntityScope, withRole } from '@/shared/middleware/auth';

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
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const { searchParams } = req.nextUrl;
      const scope = searchParams.get('scope') as 'GLOBAL' | 'ENTITY' | 'PROJECT' | 'CONTACT' | 'CHANNEL' | null;
      const isActive = searchParams.has('isActive')
        ? searchParams.get('isActive') === 'true'
        : undefined;
      const page = parseInt(searchParams.get('page') ?? '1', 10);
      const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10);

      const result = await listRules(
        {
          scope: scope ?? undefined,
          isActive,
          // Applied last and unconditionally: the caller's own entityId, if it
          // sent one, was already verified and is not read here.
          entityId,
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
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEntityScope(request, async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = CreateRuleSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', 'Invalid request body', 400, {
            issues: parsed.error.issues,
          });
        }

        const { entityId: _requested, ...draft } = parsed.data;
        // entityId LAST, deliberately: it overwrites the caller's own value. A
        // platform-wide rule (entityId null) is not something an API caller can
        // create -- one tenant must not be able to write policy for another.
        const rule = await createRule({ ...draft, entityId });
        return success(rule, 201);
      } catch (err) {
        return error('INTERNAL_ERROR', (err as Error).message, 500);
      }
    })
  );
}
