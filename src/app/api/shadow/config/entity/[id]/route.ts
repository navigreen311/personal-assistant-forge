import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import { entityPersonaService } from '@/modules/shadow/proactive/entity-persona';

const updateEntityProfileSchema = z.object({
  voicePersona: z.string().optional(),
  tone: z.string().optional(),
  signature: z.string().nullable().optional(),
  greeting: z.string().nullable().optional(),
  disclaimers: z.array(z.string()).optional(),
  allowedDisclosures: z.array(z.string()).optional(),
  neverDisclose: z.array(z.string()).optional(),
  complianceProfiles: z.array(z.string()).optional(),
  vipContacts: z.array(z.string()).optional(),
  proactiveEnabled: z.boolean().optional(),
  financialPinThreshold: z.number().min(0).optional(),
  blastRadiusPinThreshold: z.enum(['self', 'entity', 'external', 'public']).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (_req, session) => {
    try {
      const { id } = await params;

      // Verify entity ownership
      const entity = await prisma.entity.findUnique({
        where: { id },
      });

      if (!entity) {
        return error('NOT_FOUND', 'Entity not found', 404);
      }

      if (entity.userId !== session.userId) {
        return error('FORBIDDEN', 'Access denied', 403);
      }

      const profile = await entityPersonaService.getEntityProfile(id);

      if (!profile) {
        return error('NOT_FOUND', 'Entity profile not found', 404);
      }

      return success(profile);
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to get entity profile',
        500
      );
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
      const parsed = updateEntityProfileSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      // Verify entity ownership
      const entity = await prisma.entity.findUnique({
        where: { id },
      });

      if (!entity) {
        return error('NOT_FOUND', 'Entity not found', 404);
      }

      if (entity.userId !== session.userId) {
        return error('FORBIDDEN', 'Access denied', 403);
      }

      // Upsert the entity profile
      const profile = await prisma.shadowEntityProfile.upsert({
        where: { entityId: id },
        create: {
          entityId: id,
          voicePersona: parsed.data.voicePersona ?? 'default',
          tone: parsed.data.tone ?? 'professional-friendly',
          signature: parsed.data.signature ?? null,
          greeting: parsed.data.greeting ?? null,
          disclaimers: parsed.data.disclaimers ?? [],
          allowedDisclosures: parsed.data.allowedDisclosures ?? [],
          neverDisclose: parsed.data.neverDisclose ?? [],
          complianceProfiles: parsed.data.complianceProfiles ?? [],
          vipContacts: parsed.data.vipContacts ?? [],
          proactiveEnabled: parsed.data.proactiveEnabled ?? true,
          financialPinThreshold: parsed.data.financialPinThreshold ?? 500,
          blastRadiusPinThreshold: parsed.data.blastRadiusPinThreshold ?? 'external',
        },
        update: parsed.data,
      });

      return success(profile);
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to update entity profile',
        500
      );
    }
  });
}
