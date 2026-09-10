import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withEntityScope } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { getTemplates, createTemplate } from '@/modules/documents/services/template-service';
import type { DocumentType } from '@/shared/types';

const createTemplateSchema = z.object({
  entityId: z.string().min(1).optional(),
  name: z.string().min(1),
  type: z.string().min(1),
  category: z.string().min(1),
  content: z.string().min(1),
  variables: z.array(z.object({
    name: z.string(),
    label: z.string(),
    type: z.enum(['TEXT', 'DATE', 'NUMBER', 'SELECT', 'ENTITY_REF', 'CONTACT_REF']),
    required: z.boolean(),
    defaultValue: z.string().optional(),
    options: z.array(z.string()).optional(),
  })),
  brandKitRequired: z.boolean().default(false),
  outputFormats: z.array(z.enum(['DOCX', 'PDF', 'MARKDOWN', 'HTML'])),
});

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const { searchParams } = req.nextUrl;
      const type = searchParams.get('type') as DocumentType | undefined;
      const category = searchParams.get('category') || undefined;

      // Returns the shared built-ins plus this entity's own templates only.
      const templates = await getTemplates(entityId, type || undefined, category);
      return success(templates);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const body = await req.json();
      const parsed = createTemplateSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      const { entityId: _requested, ...draft } = parsed.data;
      const template = await createTemplate(
        draft as Parameters<typeof createTemplate>[0],
        entityId
      );
      return success(template, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
