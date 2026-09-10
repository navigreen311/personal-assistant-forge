import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { ingestDocument } from '@/modules/knowledge/services/ingestion-service';
import { withEntityScope, withRole } from '@/shared/middleware/auth';

const ingestSchema = z.object({
  entityId: z.string().min(1).optional(),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  content: z.string().min(1),
  source: z.string().min(1),
});

export async function POST(request: NextRequest) {
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEntityScope(request, async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = ingestSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', parsed.error.message, 400);
        }

        const { entityId: _requested, ...draft } = parsed.data;
        const result = await ingestDocument(draft, entityId);
        return success(result, 201);
      } catch (_err) {
        return error('INTERNAL_ERROR', 'Failed to ingest document', 500);
      }
    })
  );
}
