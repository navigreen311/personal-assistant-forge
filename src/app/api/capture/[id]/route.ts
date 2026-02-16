import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { captureService } from '@/modules/capture/services/capture-service';

const UpdateCaptureSchema = z.object({
  entityId: z.string().optional(),
  status: z.enum(['PENDING', 'PROCESSING', 'ROUTED', 'FAILED', 'ARCHIVED']).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const capture = await captureService.getCaptureById(id);

    if (!capture) {
      return error('NOT_FOUND', `Capture "${id}" not found`, 404);
    }

    return success(capture);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get capture';
    return error('GET_FAILED', message, 500);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = UpdateCaptureSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    const capture = await captureService.getCaptureById(id);
    if (!capture) {
      return error('NOT_FOUND', `Capture "${id}" not found`, 404);
    }

    // Apply updates directly (in production, use a proper update method)
    if (parsed.data.entityId !== undefined) {
      capture.entityId = parsed.data.entityId;
    }
    if (parsed.data.status !== undefined) {
      capture.status = parsed.data.status;
    }
    capture.updatedAt = new Date();

    return success(capture);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update capture';
    return error('UPDATE_FAILED', message, 500);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    await captureService.archiveCapture(id);
    return success({ archived: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to archive capture';
    return error('ARCHIVE_FAILED', message, 500);
  }
}
