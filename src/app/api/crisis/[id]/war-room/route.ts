import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuditedRole } from '@/modules/security/audit-wiring';

import { getCrisisForUser } from '@/modules/crisis/services/detection-service';
import * as warRoomService from '@/modules/crisis/services/war-room-service';

// P-10/T-001. The most consequential of the crisis routes to leave unscoped:
// activating a war room clears the owner's calendar, surfaces their documents,
// drafts communications and calls their phone tree. Any authenticated caller
// who knew a crisis id could do all of that to any user.
const warRoomSchema = z.object({
  action: z.enum(['activate', 'deactivate']),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuditedRole(request, ['owner', 'admin', 'member'],
    { resource: 'crisis.war-room', sensitivityLevel: 'RESTRICTED' },
    async (req, session) => {
      try {
        const { id } = await params;
        if (!getCrisisForUser(id, session.userId)) {
          return error('NOT_FOUND', 'Crisis not found', 404);
        }

        const body = await req.json();
        const parsed = warRoomSchema.safeParse(body);
        if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

        if (parsed.data.action === 'activate') {
          const state = await warRoomService.activateWarRoom(id);
          return success(state);
        }
        await warRoomService.deactivateWarRoom(id);
        return success({ isActive: false });
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    },
  );
}
