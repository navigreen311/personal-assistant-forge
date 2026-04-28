// ============================================================================
// DELETE /api/shadow/voiceprint/delete
// ----------------------------------------------------------------------------
// GDPR delete. Removes voiceprint data from VAF and deactivates the
// corresponding ShadowTrustedDevice rows for this user.
// ============================================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import { VAFSpeakerID } from '@/lib/vaf/speaker-id-client';
import type { AuthSession } from '@/lib/auth/types';

async function handleDelete(_req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const speakerID = new VAFSpeakerID();

    // Best-effort delete on VAF first. If VAF is unavailable, surface a 502
    // so the client can retry — we do NOT mark the local rows inactive
    // until VAF confirms, otherwise the user would think their biometric
    // data was deleted when it wasn't.
    try {
      await speakerID.deleteVoiceprint(session.userId);
    } catch (err) {
      console.error('[shadow/voiceprint/delete] VAF delete failed:', err);
      return error('VAF_UNAVAILABLE', 'Voiceprint service unavailable; try again later', 502);
    }

    const updated = await prisma.shadowTrustedDevice.updateMany({
      where: { userId: session.userId, deviceType: 'voiceprint', isActive: true },
      data: { isActive: false },
    });

    return success({ deleted: true, deactivatedCount: updated.count });
  } catch (err) {
    console.error('[shadow/voiceprint/delete] DELETE error:', err);
    return error('INTERNAL_ERROR', 'Failed to delete voiceprint', 500);
  }
}

export async function DELETE(req: NextRequest): Promise<Response> {
  return withAuth(req, handleDelete);
}
