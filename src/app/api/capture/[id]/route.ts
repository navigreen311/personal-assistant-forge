import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, verifyEntityForUser, withRole } from '@/shared/middleware/auth';
import { captureService } from '@/modules/capture/services/capture-service';

// P-13 / tenancy-pattern.md 4 -- SINGLE-RECORD.
//
// A capture belongs to a user (and optionally to one of that user's entities).
// All three handlers used to pass the path id to a service that looked the row
// up by id alone, so any authenticated caller who knew a capture id could read
// its raw content, re-file it into an entity of their choosing, or archive it.
//
// PATCH's `entityId` is the interesting one: it moves the capture to a different
// entity, and it was taken straight off the body. It is now proved against the
// caller before it is applied.

const UpdateCaptureSchema = z.object({
  entityId: z.string().min(1).optional(),
  status: z.enum(['PENDING', 'PROCESSING', 'ROUTED', 'FAILED', 'ARCHIVED']).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  return withAuth(_request, async (_req, session) => {
    try {
      const { id } = await params;
      const capture = await captureService.getCaptureById(id, session.userId);

      if (!capture) {
        return error('NOT_FOUND', `Capture "${id}" not found`, 404);
      }

      return success(capture);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get capture';
      return error('GET_FAILED', message, 500);
    }
  });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  return withRole(request, ['owner', 'admin', 'member'], async (req, session) => {
    try {
      const { id } = await params;
      const body = await req.json();
      const parsed = UpdateCaptureSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const capture = await captureService.getCaptureById(id, session.userId);
      if (!capture) {
        return error('NOT_FOUND', `Capture "${id}" not found`, 404);
      }

      if (parsed.data.entityId !== undefined) {
        const verified = await verifyEntityForUser(parsed.data.entityId, session.userId);
        if (!verified) {
          return error('FORBIDDEN', 'You do not have access to this entity', 403);
        }
        capture.entityId = verified;
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
  });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  return withRole(_request, ['owner', 'admin'], async (_req, session) => {
    try {
      const { id } = await params;
      const capture = await captureService.getCaptureById(id, session.userId);
      if (!capture) {
        return error('NOT_FOUND', `Capture "${id}" not found`, 404);
      }
      await captureService.archiveCapture(id, session.userId);
      return success({ archived: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to archive capture';
      return error('ARCHIVE_FAILED', message, 500);
    }
  });
}
