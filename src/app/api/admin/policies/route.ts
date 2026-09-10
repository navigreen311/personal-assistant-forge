import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuditedRoleEntityScope } from '@/modules/security/audit-wiring';
import { getPolicies, createPolicy } from '@/modules/admin/services/org-policy-service';

// P-10/T-001 — see the note in ../dlp/route.ts.
const createPolicySchema = z.object({
  entityId: z.string().min(1).optional(),
  name: z.string().min(1),
  type: z.enum(['RETENTION', 'SHARING', 'COMPLIANCE', 'ACCESS', 'DLP']),
  config: z.record(z.string(), z.unknown()),
  isActive: z.boolean().default(true),
});

const AUDIT = { resource: 'admin.policies', sensitivityLevel: 'CONFIDENTIAL' as const };

export async function GET(request: NextRequest) {
  return withAuditedRoleEntityScope(request, ['owner', 'admin'], AUDIT, async (req, session, entityId) => {
    try {
      const type = req.nextUrl.searchParams.get('type') || undefined;
      const policies = await getPolicies(entityId, type);
      return success(policies);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuditedRoleEntityScope(request, ['owner', 'admin'], AUDIT, async (req, session, entityId) => {
    try {
      const body = await req.json();
      const parsed = createPolicySchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      const { entityId: _requested, ...draft } = parsed.data;
      const policy = await createPolicy({ ...draft, entityId });
      return success(policy, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
