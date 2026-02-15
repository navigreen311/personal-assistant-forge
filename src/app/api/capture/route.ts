import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error, paginated } from '@/shared/utils/api-response';
import { captureService } from '@/modules/capture/services/capture-service';
import type { CaptureSource, CaptureContentType } from '@/modules/capture/types';

const CreateCaptureSchema = z.object({
  userId: z.string().min(1),
  source: z.enum([
    'VOICE', 'SCREENSHOT', 'CLIPBOARD', 'SHARE_SHEET', 'BROWSER_EXTENSION',
    'EMAIL_FORWARD', 'SMS_BRIDGE', 'DESKTOP_TRAY', 'CAMERA_SCAN', 'MANUAL',
  ] as const),
  contentType: z.enum([
    'TEXT', 'IMAGE', 'AUDIO', 'URL', 'DOCUMENT',
    'BUSINESS_CARD', 'RECEIPT', 'WHITEBOARD', 'SCREENSHOT',
  ] as const),
  rawContent: z.string().min(1),
  entityId: z.string().optional(),
  metadata: z.object({
    sourceApp: z.string().optional(),
    sourceUrl: z.string().optional(),
    deviceInfo: z.string().optional(),
    geolocation: z.object({
      lat: z.number(),
      lng: z.number(),
    }).optional(),
  }).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = CreateCaptureSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    const capture = await captureService.createCapture({
      userId: parsed.data.userId,
      source: parsed.data.source as CaptureSource,
      contentType: parsed.data.contentType as CaptureContentType,
      rawContent: parsed.data.rawContent,
      entityId: parsed.data.entityId,
      metadata: parsed.data.metadata,
    });

    return success(capture, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create capture';
    return error('CREATE_FAILED', message, 500);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return error('VALIDATION_ERROR', 'userId query parameter is required', 400);
    }

    const source = searchParams.get('source') as CaptureSource | null;
    const status = searchParams.get('status');
    const entityId = searchParams.get('entityId');
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10);

    const result = await captureService.listCaptures(
      userId,
      {
        source: source ?? undefined,
        status: status ?? undefined,
        entityId: entityId ?? undefined,
      },
      page,
      pageSize,
    );

    return paginated(result.data, result.total, page, pageSize);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list captures';
    return error('LIST_FAILED', message, 500);
  }
}
