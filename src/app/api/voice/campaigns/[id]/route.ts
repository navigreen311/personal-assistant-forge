import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import {
  getCampaign,
  startCampaign,
  pauseCampaign,
  stopCampaign,
} from '@/modules/voiceforge/services/campaign-service';
import {
  withAuth,
  withEntityScope,
  type VerifiedEntityId,
} from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';

const UpdateCampaignSchema = z.object({
  action: z.enum(['start', 'pause', 'stop']),
});

/** Section 4 -- the entity is a property of the row. Duplicated per file, section 3d. */
async function withCampaignScope(
  request: NextRequest,
  campaignId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.document.findFirst({
      where: { id: campaignId, type: 'VOICE_CAMPAIGN' },
      select: { entityId: true },
    });
    if (!owner) {
      return error('NOT_FOUND', `Campaign ${campaignId} not found`, 404);
    }
    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withCampaignScope(request, id, async (_req, _session, entityId) => {
    try {
      const campaign = await getCampaign(id, entityId);

      if (!campaign) {
        return error('NOT_FOUND', `Campaign ${id} not found`, 404);
      }

      return success(campaign);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withCampaignScope(request, id, async (req, _session, entityId) => {
    try {
      const body = await req.json();
      const parsed = UpdateCampaignSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      let campaign;
      switch (parsed.data.action) {
        case 'start':
          campaign = await startCampaign(id, entityId);
          break;
        case 'pause':
          campaign = await pauseCampaign(id, entityId);
          break;
        case 'stop':
          campaign = await stopCampaign(id, entityId);
          break;
      }

      return success(campaign);
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        return error('NOT_FOUND', err.message, 404);
      }
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
