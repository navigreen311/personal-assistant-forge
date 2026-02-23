import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { shadowAuthManager } from '@/modules/shadow/safety';

const AddDeviceSchema = z.object({
  deviceType: z.string().min(1, 'Device type is required'),
  phoneNumber: z.string().optional(),
  name: z.string().min(1, 'Device name is required'),
  deviceFingerprint: z.string().optional(),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (_req, session) => {
    try {
      const devices = await shadowAuthManager.listTrustedDevices(session.userId);
      return success(devices);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list trusted devices';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = AddDeviceSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const device = await shadowAuthManager.addTrustedDevice(session.userId, parsed.data);
      return success(device, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add trusted device';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
