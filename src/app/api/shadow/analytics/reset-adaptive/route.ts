import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import type { AuthSession } from '@/lib/auth/types';

// ---------------------------------------------------------------------------
// POST /api/shadow/analytics/reset-adaptive
// Resets adaptive channel learning for the authenticated user
// ---------------------------------------------------------------------------

async function handlePost(_req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const userId = session.userId;

    await prisma.shadowChannelEffectiveness.deleteMany({
      where: { userId },
    });

    return success({
      reset: true,
      message: 'Adaptive channel learning has been reset. Shadow will re-learn your preferences.',
    });
  } catch (err) {
    console.error('[shadow/analytics/reset-adaptive] POST error:', err);
    return error('INTERNAL_ERROR', 'Failed to reset adaptive channel learning', 500);
  }
}

// ---------------------------------------------------------------------------
// Route exports
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<Response> {
  return withAuth(req, handlePost);
}
