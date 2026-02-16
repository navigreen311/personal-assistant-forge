import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { ingestDocument } from '@/modules/knowledge/services/ingestion-service';

const ingestSchema = z.object({
  entityId: z.string().min(1),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  content: z.string().min(1),
  source: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ingestSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    const result = await ingestDocument(parsed.data);
    return success(result, 201);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to ingest document', 500);
  }
}
