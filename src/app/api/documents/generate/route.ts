import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { generateDocument } from '@/modules/documents/services/document-generation-service';

const generateSchema = z.object({
  templateId: z.string().min(1),
  variables: z.record(z.string(), z.string()),
  entityId: z.string().min(1),
  brandKit: z.object({
    primaryColor: z.string(),
    secondaryColor: z.string(),
    logoUrl: z.string().optional(),
    fontFamily: z.string().optional(),
    toneGuide: z.string().optional(),
  }).optional(),
  outputFormat: z.enum(['DOCX', 'PDF', 'MARKDOWN', 'HTML']).default('MARKDOWN'),
  citationsEnabled: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, _session) => {
    try {
      const body = await req.json();
      const parsed = generateSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      const doc = await generateDocument(parsed.data as Parameters<typeof generateDocument>[0]);
      return success(doc, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
