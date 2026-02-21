import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { captureService } from '@/modules/capture/services/capture-service';

const ProcessCaptureSchema = z.object({
  captureId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, _session) => {
    try {
      const body = await req.json();
      const parsed = ProcessCaptureSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const capture = await captureService.processCapture(parsed.data.captureId);
      return success(capture);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process capture';
      return error('PROCESS_FAILED', message, 500);
    }
  });
}
