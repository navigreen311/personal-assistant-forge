import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuditedRoleEntityScope } from '@/modules/security/audit-wiring';
import { getDLPRules, createDLPRule } from '@/modules/admin/services/dlp-service';

// P-10/T-001. `withRole(['admin'])` alone proved the caller holds a role. Roles
// in this system are GLOBAL (`AuthSession.role`), so an admin of tenant A passed
// that check and then read `?entityId=` straight off the query string — every
// admin route in this package authorised the ACTION and not the TENANT.
// `withAuditedRoleEntityScope` keeps the role gate and adds the ownership proof.

// entityId is optional: a client that omits it gets its session's active entity.
// Requiring the client to name its own tenant is the habit that produced the bug.
const createDLPRuleSchema = z.object({
  entityId: z.string().min(1).optional(),
  name: z.string().min(1),
  pattern: z.string().min(1),
  action: z.enum(['BLOCK', 'WARN', 'LOG', 'REDACT']),
  scope: z.enum(['OUTBOUND_MESSAGES', 'DOCUMENTS', 'ALL']),
  isActive: z.boolean().default(true),
});

const AUDIT = { resource: 'admin.dlp', sensitivityLevel: 'CONFIDENTIAL' as const };

export async function GET(request: NextRequest) {
  return withAuditedRoleEntityScope(request, ['admin'], AUDIT, async (req, session, entityId) => {
    try {
      const rules = await getDLPRules(entityId);
      return success(rules);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuditedRoleEntityScope(request, ['admin'], AUDIT, async (req, session, entityId) => {
    try {
      const body = await req.json();
      const parsed = createDLPRuleSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      // entityId LAST, deliberately: it overwrites whatever the caller sent.
      const { entityId: _requested, ...draft } = parsed.data;
      const rule = await createDLPRule({ ...draft, entityId });
      return success(rule, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
