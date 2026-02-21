import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { createPersona, listPersonas } from '@/modules/voiceforge/services/persona-service';
import { withAuth } from '@/shared/middleware/auth';

const PersonaSchema = z.object({
  entityId: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  voiceConfig: z.object({
    provider: z.string(),
    voiceId: z.string(),
    speed: z.number().min(0.5).max(2.0),
    pitch: z.number().min(0.5).max(2.0),
    language: z.string(),
    accent: z.string().optional(),
  }),
  personality: z.object({
    defaultTone: z.string(),
    formality: z.number().min(0).max(10),
    empathy: z.number().min(0).max(10),
    assertiveness: z.number().min(0).max(10),
    humor: z.number().min(0).max(10),
    vocabulary: z.enum(['SIMPLE', 'MODERATE', 'ADVANCED']),
  }),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).default('DRAFT'),
  consentChain: z
    .array(
      z.object({
        id: z.string(),
        grantedBy: z.string(),
        grantedAt: z.string().transform((s) => new Date(s)),
        scope: z.string(),
        status: z.enum(['GRANTED', 'REVOKED', 'EXPIRED', 'PENDING']),
        revokedAt: z.string().optional().transform((s) => (s ? new Date(s) : undefined)),
        watermarkId: z.string().optional(),
      })
    )
    .default([]),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, _session) => {
    try {
      const entityId = req.nextUrl.searchParams.get('entityId');
      if (!entityId) {
        return error('VALIDATION_ERROR', 'entityId query parameter required', 400);
      }

      const personas = await listPersonas(entityId);
      return success(personas);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, _session) => {
    try {
      const body = await req.json();
      const parsed = PersonaSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const persona = await createPersona(parsed.data);
      return success(persona, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
