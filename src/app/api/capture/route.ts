import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error, paginated } from '@/shared/utils/api-response';
import { withAuth, withEntityScope, verifyEntityForUser } from '@/shared/middleware/auth';
import { captureService } from '@/modules/capture/services/capture-service';
import type { CaptureSource, CaptureContentType } from '@/modules/capture/types';

// P-13 / tenancy-pattern.md 0 and 5b.
//
// POST -- SINGLE-ENTITY. A capture is filed against one entity, so
// `withEntityScope` is right and narrows nothing. `userId` used to be a REQUIRED
// field of the request body, so the caller named the owner of the row they were
// creating; it now comes from the session and the body field is gone.
//
// GET -- CROSS-ENTITY. The capture inbox is "everything I captured", across
// entities, so it keeps `withAuth` and scopes by `session.userId`.
// `?userId=` used to be a REQUIRED query parameter -- both halves of "whose
// captures are these" were caller-supplied, and `GET /api/capture?userId=<B>`
// returned tenant B's inbox with a 200. `entityId` survives as an optional
// FILTER and is proved with `verifyEntityForUser` before it narrows anything.

const CreateCaptureSchema = z.object({
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
  return withEntityScope(request, async (req, session, entityId) => {
    try {
      const body = await req.json();
      const parsed = CreateCaptureSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      // `userId` and `entityId` last, deliberately: they overwrite anything the
      // caller sent.
      const capture = await captureService.createCapture({
        source: parsed.data.source as CaptureSource,
        contentType: parsed.data.contentType as CaptureContentType,
        rawContent: parsed.data.rawContent,
        metadata: parsed.data.metadata,
        userId: session.userId,
        entityId,
      });

      return success(capture, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create capture';
      return error('CREATE_FAILED', message, 500);
    }
  });
}

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const { searchParams } = new URL(req.url);

      const source = searchParams.get('source') as CaptureSource | null;
      const status = searchParams.get('status');
      const requestedEntityId = searchParams.get('entityId');
      const page = parseInt(searchParams.get('page') ?? '1', 10);
      const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10);

      let entityId;
      if (requestedEntityId) {
        const verified = await verifyEntityForUser(requestedEntityId, session.userId);
        if (!verified) {
          return error('FORBIDDEN', 'You do not have access to this entity', 403);
        }
        entityId = verified;
      }

      const result = await captureService.listCaptures(
        session.userId,
        {
          source: source ?? undefined,
          status: status ?? undefined,
          entityId,
        },
        page,
        pageSize,
      );

      return paginated(result.data, result.total, page, pageSize);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list captures';
      return error('LIST_FAILED', message, 500);
    }
  });
}
