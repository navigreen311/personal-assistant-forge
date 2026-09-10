import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope, withRole } from '@/shared/middleware/auth';

import { batchCaptureService } from '@/modules/capture/services/batch-capture';
import { withRateLimit } from '@/shared/middleware/rate-limit';

// P-13 -- POST is SINGLE-ENTITY (a batch is filed against one entity, and the
// completion summary Document needs one). PUT and PATCH address an existing
// session by id, so their scope is the session's owner rather than the request.
//
// `userId` was a REQUIRED body field on POST: the caller named the owner of the
// session it was opening. PUT and PATCH took only a `sessionId`, so anyone who
// learned one could add items to another tenant's batch or complete it -- and
// completing a batch WRITES rows.

const StartBatchSchema = z.object({
  entityId: z.string().min(1).optional(),
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

async function handlePOST(request: NextRequest) {
  return withRole(request, ['owner', 'admin'], () =>
    withEntityScope(request, async (req, authSession, entityId) => {
      try {
        const body = await req.json();
        const parsed = StartBatchSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', parsed.error.message, 400);
        }

        const session = batchCaptureService.startBatchSession(authSession.userId, entityId);
        return success(session, 201);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start batch session';
        return error('START_BATCH_FAILED', message, 500);
      }
    })
  );
}

async function handlePUT(request: NextRequest) {
  return withRole(request, ['owner', 'admin'], async (req, session) => {
    try {
      const body = await req.json();
      const parsed = AddToBatchSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const item = batchCaptureService.addToBatch(
        parsed.data.sessionId,
        session.userId,
        parsed.data.rawContent,
        parsed.data.source,
      );
      return success(item);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add to batch';
      if (message.includes('not found')) return error('NOT_FOUND', message, 404);
      return error('ADD_TO_BATCH_FAILED', message, 500);
    }
  });
}

async function handlePATCH(request: NextRequest) {
  return withRole(request, ['owner', 'admin'], async (req, session) => {
    try {
      const body = await req.json();
      const parsed = CompleteBatchSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const items = await batchCaptureService.completeBatch(
        parsed.data.sessionId,
        session.userId
      );
      return success(items);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to complete batch';
      if (message.includes('not found')) return error('NOT_FOUND', message, 404);
      return error('COMPLETE_BATCH_FAILED', message, 500);
    }
  });
}

// ---------------------------------------------------------------------------
// P-18 / T-012 — rate limit: tier "bulk".
//
// The limiter sits OUTSIDE the auth wrappers so a flood is refused before it
// costs a JWT decrypt and a database round trip. The tier, its budget and the
// reason for that budget are in RATE_LIMIT_POLICY in
// src/shared/middleware/rate-limit.ts; nothing about the limit is decided here,
// so no route can quietly hold a different number from the published table.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  return withRateLimit(request, 'bulk', handlePOST);
}

export async function PUT(request: NextRequest): Promise<Response> {
  return withRateLimit(request, 'bulk', handlePUT);
}

export async function PATCH(request: NextRequest): Promise<Response> {
  return withRateLimit(request, 'bulk', handlePATCH);
}
