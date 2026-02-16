import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { ingestDocument } from '@/modules/knowledge/services/ingestion-service';
import { withAuth } from '@/shared/middleware/auth';

const ingestSchema = z.object({
  entityId: z.string().min(1),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  content: z.string().min(1),
  source: z.string().min(1),
});

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = ingestSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const result = await ingestDocument(parsed.data);
      return success(result, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', 'Failed to ingest document', 500);
    }
  });
}
