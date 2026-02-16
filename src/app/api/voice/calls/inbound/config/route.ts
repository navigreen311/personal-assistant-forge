import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { getInboundConfig, saveInboundConfig } from '@/modules/voiceforge/services/inbound-agent';
import { withAuth } from '@/shared/middleware/auth';

const InboundConfigSchema = z.object({
  entityId: z.string().min(1),
  phoneNumber: z.string().min(1),
  greeting: z.string().min(1),
  personaId: z.string().min(1),
  routingRules: z.array(
    z.object({
      id: z.string().min(1),
      condition: z.string().min(1),
      destination: z.string().min(1),
      priority: z.number().int(),
    })
  ),
  afterHoursConfig: z.object({
    enabled: z.boolean(),
    message: z.string(),
    businessHours: z.array(
      z.object({
        day: z.number().int().min(0).max(6),
        start: z.string(),
        end: z.string(),
      })
    ),
    voicemailEnabled: z.boolean(),
    urgentEscalationNumber: z.string().optional(),
  }),
  spamFilterEnabled: z.boolean(),
  vipContactIds: z.array(z.string()),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const phoneNumber = req.nextUrl.searchParams.get('phoneNumber');
      if (!phoneNumber) {
        return error('VALIDATION_ERROR', 'phoneNumber query parameter required', 400);
      }

      const config = await getInboundConfig(phoneNumber);
      if (!config) {
        return error('NOT_FOUND', `No config found for ${phoneNumber}`, 404);
      }

      return success(config);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = InboundConfigSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const config = await saveInboundConfig(parsed.data);
      return success(config, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
