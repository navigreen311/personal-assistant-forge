import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { retentionService } from '@/modules/shadow/compliance/retention';

const UpdateRetentionSchema = z.object({
  entityId: z.string().min(1),
  recordingsDays: z.number().int().min(1).max(3650).optional(),
  transcriptsDays: z.number().int().min(1).max(3650).optional(),
  messagesDays: z.number().int().min(1).max(3650).optional(),
  consentReceiptsDays: z.number().int().min(1).max(7300).optional(),
});

/**
 * GET /api/shadow/retention?entityId=xxx
 * Get retention configuration for an entity.
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const entityId =
        req.nextUrl.searchParams.get('entityId') ?? session.activeEntityId;

      if (!entityId) {
        return error('VALIDATION_ERROR', 'entityId is required', 400);
      }

      const config = await retentionService.getRetentionConfig(entityId);
      return success(config);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get retention config';
      return error('RETENTION_CONFIG_FAILED', message, 500);
    }
  });
}

/**
 * PUT /api/shadow/retention
 * Update retention configuration for an entity.
 */
export async function PUT(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const body = await req.json();
      const parsed = UpdateRetentionSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const config = await retentionService.updateRetentionConfig(
        parsed.data.entityId,
        parsed.data,
      );
      return success(config);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update retention config';
      return error('RETENTION_UPDATE_FAILED', message, 500);
    }
  });
}
