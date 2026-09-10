import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withEntityScope, withRole } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { generateDocument } from '@/modules/documents/services/document-generation-service';

const generateSchema = z.object({
  templateId: z.string().min(1),
  variables: z.record(z.string(), z.string()),
  entityId: z.string().min(1).optional(),
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
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEntityScope(request, async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = generateSchema.safeParse(body);
        if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

        // entityId LAST: it overwrites whatever the caller asked for.
        const { entityId: _requested, ...draft } = parsed.data;
        const doc = await generateDocument({ ...draft, entityId });
        return success(doc, 201);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    })
  );
}
