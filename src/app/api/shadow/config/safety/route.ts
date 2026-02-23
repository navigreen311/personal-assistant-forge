import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';

const UpdateSafetyConfigSchema = z.object({
  requirePinForFinancial: z.boolean().optional(),
  requirePinForExternal: z.boolean().optional(),
  requirePinForCrisis: z.boolean().optional(),
  maxBlastRadiusWithoutPin: z.enum(['self', 'entity', 'external', 'public']).optional(),
  phoneConfirmationMode: z.enum(['voice_pin', 'sms_code', 'both']).optional(),
  alwaysAnnounceBlastRadius: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (_req, session) => {
    try {
      let config = await prisma.shadowSafetyConfig.findUnique({
        where: { userId: session.userId },
      });

      if (!config) {
        // Return defaults if no config exists yet
        config = {
          userId: session.userId,
          voicePin: null,
          requirePinForFinancial: true,
          requirePinForExternal: false,
          requirePinForCrisis: true,
          maxBlastRadiusWithoutPin: 'entity',
          phoneConfirmationMode: 'voice_pin',
          alwaysAnnounceBlastRadius: true,
        };
      }

      // Never expose the hashed PIN to the client
      const { voicePin: _, ...safeConfig } = config;

      return success({
        ...safeConfig,
        hasPinSet: config.voicePin !== null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get safety config';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}

export async function PUT(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = UpdateSafetyConfigSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const config = await prisma.shadowSafetyConfig.upsert({
        where: { userId: session.userId },
        create: {
          userId: session.userId,
          ...parsed.data,
        },
        update: parsed.data,
      });

      // Never expose the hashed PIN to the client
      const { voicePin: _, ...safeConfig } = config;

      return success({
        ...safeConfig,
        hasPinSet: config.voicePin !== null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update safety config';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
