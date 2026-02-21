import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRole } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { requestExport, listExports } from '@/modules/admin/services/ediscovery-service';

const requestExportSchema = z.object({
  entityId: z.string().min(1),
  requestedBy: z.string().min(1),
  dateRange: z.object({
    start: z.coerce.date(),
    end: z.coerce.date(),
  }),
  dataTypes: z.array(z.string()),
});

export async function GET(request: NextRequest) {
  return withRole(request, ['admin'], async (req, _session) => {
    try {
      const entityId = req.nextUrl.searchParams.get('entityId');
      if (!entityId) return error('VALIDATION_ERROR', 'entityId is required', 400);

      const exports = await listExports(entityId);
      return success(exports);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withRole(request, ['admin'], async (req, session) => {
    try {
      const body = await req.json();
      const parsed = requestExportSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      const { entityId, dateRange, dataTypes } = parsed.data;
      const exportRequest = await requestExport(entityId, session.userId, dateRange, dataTypes);
      return success(exportRequest, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
