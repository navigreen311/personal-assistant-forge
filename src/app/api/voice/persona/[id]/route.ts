import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { getPersona, updatePersona } from '@/modules/voiceforge/services/persona-service';
import { withAuth } from '@/shared/middleware/auth';

const UpdatePersonaSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  voiceConfig: z
    .object({
      provider: z.string(),
      voiceId: z.string(),
      speed: z.number().min(0.5).max(2.0),
      pitch: z.number().min(0.5).max(2.0),
      language: z.string(),
      accent: z.string().optional(),
    })
    .optional(),
  personality: z
    .object({
      defaultTone: z.string(),
      formality: z.number().min(0).max(10),
      empathy: z.number().min(0).max(10),
      assertiveness: z.number().min(0).max(10),
      humor: z.number().min(0).max(10),
      vocabulary: z.enum(['SIMPLE', 'MODERATE', 'ADVANCED']),
    })
    .optional(),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await params;
      const persona = await getPersona(id);

      if (!persona) {
        return error('NOT_FOUND', `Persona ${id} not found`, 404);
      }

      return success(persona);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await params;
      const body = await req.json();
      const parsed = UpdatePersonaSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const persona = await updatePersona(id, parsed.data);
      return success(persona);
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        return error('NOT_FOUND', err.message, 404);
      }
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
