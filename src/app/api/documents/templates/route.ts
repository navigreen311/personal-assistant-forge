import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { getTemplates, createTemplate } from '@/modules/documents/services/template-service';
import type { DocumentType } from '@/shared/types';

const createTemplateSchema = z.object({
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
  return withAuth(request, async (req, session) => {
    try {
      const { searchParams } = req.nextUrl;
      const type = searchParams.get('type') as DocumentType | undefined;
      const category = searchParams.get('category') || undefined;

      const templates = await getTemplates(type || undefined, category);
      return success(templates);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = createTemplateSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      const template = await createTemplate(parsed.data as Parameters<typeof createTemplate>[0]);
      return success(template, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
