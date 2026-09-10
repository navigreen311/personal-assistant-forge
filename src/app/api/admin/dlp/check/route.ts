import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuditedRoleEntityScope } from '@/modules/security/audit-wiring';
import { checkContent } from '@/modules/admin/services/dlp-service';

// P-10/T-001 — see ../route.ts. Scanning content against ANOTHER tenant's DLP
// rules is a two-way leak: the caller learns which patterns that tenant guards,
// and their own content is judged by rules they never agreed to.
const checkContentSchema = z.object({
  entityId: z.string().min(1).optional(),
  content: z.string().min(1),
  scope: z.string().min(1),
});

export async function POST(request: NextRequest) {
  return withAuditedRoleEntityScope(
    request,
    ['owner', 'admin'],
    { resource: 'admin.dlp.check', sensitivityLevel: 'CONFIDENTIAL' },
    async (req, session, entityId) => {
      try {
        const body = await req.json();
        const parsed = checkContentSchema.safeParse(body);
        if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

        const { content, scope } = parsed.data;
        const result = await checkContent(entityId, content, scope);
        return success(result);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    },
  );
}
