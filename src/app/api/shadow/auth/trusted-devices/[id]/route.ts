import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { shadowAuthManager } from '@/modules/shadow/safety';
import { prisma } from '@/lib/db';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (_req, session) => {
    try {
      const { id } = await params;

      // Verify the device belongs to the authenticated user
      const device = await prisma.shadowTrustedDevice.findUnique({
        where: { id },
      });

      if (!device) {
        return error('NOT_FOUND', 'Trusted device not found', 404);
      }

      if (device.userId !== session.userId) {
        return error('FORBIDDEN', 'You do not have access to this device', 403);
      }

      await shadowAuthManager.removeTrustedDevice(id);
      return success({ deleted: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove trusted device';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
