import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuditedRoleEntityScope } from '@/modules/security/audit-wiring';
import { requestExport, listExports } from '@/modules/admin/services/ediscovery-service';

// P-10/T-001 — see the note in ../dlp/route.ts.
//
// `requestedBy` was also caller-supplied and required by the schema, so the
// person named on a legal-discovery export was chosen by whoever asked for it.
// It now comes from the verified session and the field is gone from the body.
const requestExportSchema = z.object({
  entityId: z.string().min(1).optional(),
  dateRange: z.object({
    start: z.coerce.date(),
    end: z.coerce.date(),
  }),
  dataTypes: z.array(z.string()),
});

const AUDIT = { resource: 'admin.ediscovery', sensitivityLevel: 'RESTRICTED' as const };

export async function GET(request: NextRequest) {
  return withAuditedRoleEntityScope(request, ['admin'], AUDIT, async (req, session, entityId) => {
    try {
      const exports = await listExports(entityId);
      return success(exports);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuditedRoleEntityScope(request, ['admin'], AUDIT, async (req, session, entityId) => {
    try {
      const body = await req.json();
      const parsed = requestExportSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      const { dateRange, dataTypes } = parsed.data;
      const exportRequest = await requestExport(entityId, session.userId, dateRange, dataTypes);
      return success(exportRequest, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
