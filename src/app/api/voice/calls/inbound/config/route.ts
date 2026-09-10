import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { getInboundConfig, saveInboundConfig } from '@/modules/voiceforge/services/inbound-agent';
import { withEntityScope, withRole } from '@/shared/middleware/auth';

const InboundConfigSchema = z.object({
  // Optional on purpose: a client that omits it gets its session's active
  // entity, and a client that sends one is still verified before we get here.
  // Making the client name its own tenant is the habit that produced the bug.
  entityId: z.string().min(1).optional(),
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
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const phoneNumber = req.nextUrl.searchParams.get('phoneNumber');
      if (!phoneNumber) {
        return error('VALIDATION_ERROR', 'phoneNumber query parameter required', 400);
      }

      const config = await getInboundConfig(phoneNumber, entityId);
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
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEntityScope(request, async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = InboundConfigSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', 'Invalid request body', 400, {
            issues: parsed.error.issues,
          });
        }

        // entityId LAST, deliberately: it overwrites the caller's own value.
        const { entityId: _requested, ...draft } = parsed.data;
        const config = await saveInboundConfig({ ...draft, entityId });
        return success(config, 201);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    })
  );
}
