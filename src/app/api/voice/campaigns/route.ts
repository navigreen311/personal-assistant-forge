import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import {
  createCampaign,
  listCampaigns,
} from '@/modules/voiceforge/services/campaign-service';
import { withAuth } from '@/shared/middleware/auth';

const CampaignSchema = z.object({
  entityId: z.string().min(1),
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

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const entityId = req.nextUrl.searchParams.get('entityId');
      if (!entityId) {
        return error('VALIDATION_ERROR', 'entityId query parameter required', 400);
      }

      const campaigns = await listCampaigns(entityId);
      return success(campaigns);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = CampaignSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const campaign = await createCampaign(parsed.data);
      return success(campaign, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
