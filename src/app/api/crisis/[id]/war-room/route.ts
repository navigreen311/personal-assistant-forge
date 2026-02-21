import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import * as warRoomService from '@/modules/crisis/services/war-room-service';

const warRoomSchema = z.object({
  action: z.enum(['activate', 'deactivate']),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, _session) => {
    try {
      const { id } = await params;
      const body = await req.json();
      const parsed = warRoomSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      if (parsed.data.action === 'activate') {
        const state = await warRoomService.activateWarRoom(id);
        return success(state);
      } else {
        await warRoomService.deactivateWarRoom(id);
        return success({ isActive: false });
      }
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
