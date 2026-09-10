import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withRole } from '@/shared/middleware/auth';

import { captureService } from '@/modules/capture/services/capture-service';

// P-13 -- SINGLE-RECORD, addressed by a body field rather than a path param.
// `processCapture` runs the routing rules and WRITES a Task / KnowledgeEntry /
// Document, so an unscoped captureId here was a write triggered against another
// tenant's row. The owner is now part of the lookup.

const ProcessCaptureSchema = z.object({
  captureId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  return withRole(request, ['owner', 'admin', 'member'], async (req, session) => {
    try {
      const body = await req.json();
      const parsed = ProcessCaptureSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const capture = await captureService.processCapture(
        parsed.data.captureId,
        session.userId
      );
      return success(capture);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process capture';
      if (message.includes('not found')) {
        return error('NOT_FOUND', message, 404);
      }
      return error('PROCESS_FAILED', message, 500);
    }
  });
}
