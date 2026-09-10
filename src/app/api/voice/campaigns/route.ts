import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import {
  createCampaign,
  listCampaigns,
} from '@/modules/voiceforge/services/campaign-service';
import { withEntityScope, withRole } from '@/shared/middleware/auth';

const CampaignSchema = z.object({
  entityId: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string(),
  personaId: z.string().min(1),
  scriptId: z.string().min(1),
  targetContactIds: z.array(z.string()),
  schedule: z.object({
    startDate: z.string().transform((s) => new Date(s)),
    endDate: z.string().optional().transform((s) => (s ? new Date(s) : undefined)),
    callWindowStart: z.string(),
    callWindowEnd: z.string(),
    timezone: z.string(),
    maxCallsPerDay: z.number().int().positive(),
    retryAttempts: z.number().int().nonnegative(),
    retryDelayHours: z.number().positive(),
  }),
  stopConditions: z.array(
    z.object({
      type: z.enum(['MAX_CALLS', 'MAX_CONNECTS', 'DATE', 'CONVERSION_TARGET', 'NEGATIVE_SENTIMENT']),
      threshold: z.union([z.number(), z.string()]),
    })
  ),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'STOPPED']).default('DRAFT'),
});

/**
 * Single-entity list (section 5b). Campaigns belong to one entity and the UI
 * has always shown one entity's campaigns at a time, so withEntityScope is the
 * right wrapper: omitting entityId now resolves to the session's active entity
 * instead of 400ing, which is strictly more useful and never wider.
 */
export async function GET(request: NextRequest) {
  return withEntityScope(request, async (_req, _session, entityId) => {
    try {
      const campaigns = await listCampaigns(entityId);
      return success(campaigns);
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
        const parsed = CampaignSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', 'Invalid request body', 400, {
            issues: parsed.error.issues,
          });
        }

        // entityId LAST, deliberately: it overwrites the caller's own value.
        const { entityId: _requested, ...draft } = parsed.data;
        const campaign = await createCampaign({ ...draft, entityId });
        return success(campaign, 201);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    })
  );
}
