import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { batchCaptureService } from '@/modules/capture/services/batch-capture';

const StartBatchSchema = z.object({
  userId: z.string().min(1),
});

const AddToBatchSchema = z.object({
  sessionId: z.string().min(1),
  rawContent: z.string().min(1),
  source: z.enum([
    'VOICE', 'SCREENSHOT', 'CLIPBOARD', 'SHARE_SHEET', 'BROWSER_EXTENSION',
    'EMAIL_FORWARD', 'SMS_BRIDGE', 'DESKTOP_TRAY', 'CAMERA_SCAN', 'MANUAL',
  ] as const).optional(),
});

const CompleteBatchSchema = z.object({
  sessionId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = StartBatchSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    const session = batchCaptureService.startBatchSession(parsed.data.userId);
    return success(session, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start batch session';
    return error('START_BATCH_FAILED', message, 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = AddToBatchSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    const item = batchCaptureService.addToBatch(
      parsed.data.sessionId,
      parsed.data.rawContent,
      parsed.data.source,
    );
    return success(item);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add to batch';
    return error('ADD_TO_BATCH_FAILED', message, 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = CompleteBatchSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    const items = await batchCaptureService.completeBatch(parsed.data.sessionId);
    return success(items);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to complete batch';
    return error('COMPLETE_BATCH_FAILED', message, 500);
  }
}
