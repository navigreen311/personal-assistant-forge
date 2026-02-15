import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import {
  getCampaign,
  startCampaign,
  pauseCampaign,
  stopCampaign,
} from '@/modules/voiceforge/services/campaign-service';

const UpdateCampaignSchema = z.object({
  action: z.enum(['start', 'pause', 'stop']),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const campaign = await getCampaign(id);

    if (!campaign) {
      return error('NOT_FOUND', `Campaign ${id} not found`, 404);
    }

    return success(campaign);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = UpdateCampaignSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid request body', 400, {
        issues: parsed.error.issues,
      });
    }

    let campaign;
    switch (parsed.data.action) {
      case 'start':
        campaign = await startCampaign(id);
        break;
      case 'pause':
        campaign = await pauseCampaign(id);
        break;
      case 'stop':
        campaign = await stopCampaign(id);
        break;
    }

    return success(campaign);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
