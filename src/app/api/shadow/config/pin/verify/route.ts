import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import type { AuthSession } from '@/lib/auth/types';

// ---------------------------------------------------------------------------
// POST /api/shadow/config/pin/verify — Verify PIN
// ---------------------------------------------------------------------------

async function handlePost(req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const body = await req.json();
    const { pin } = body;

    if (!pin) {
      return error('VALIDATION_ERROR', 'PIN is required', 400);
    }

    const userId = session.userId;

    // Look up stored voicePin
    const config = await prisma.shadowSafetyConfig.findUnique({
      where: { userId },
    });

    if (!config || !config.voicePin) {
      return error('NOT_FOUND', 'No PIN is configured', 404);
    }

    // Plain text comparison for now; would use bcrypt.compare in production
    const verified = config.voicePin === pin;

    // Track verification attempt as a ShadowAuthEvent
    try {
      await prisma.shadowAuthEvent.create({
        data: {
          method: 'voice_pin',
          result: verified ? 'success' : 'failure',
          riskLevel: verified ? 'low' : 'medium',
          actionAttempted: 'pin_verification',
        },
      });
    } catch {
      // If ShadowAuthEvent creation fails (e.g., model doesn't exist),
      // fall back to storing as a preference
      await prisma.shadowPreference.upsert({
        where: {
          userId_preferenceKey: {
            userId,
            preferenceKey: 'safety.lastPinVerification',
          },
        },
        create: {
          userId,
          preferenceKey: 'safety.lastPinVerification',
          preferenceValue: JSON.stringify({
            result: verified ? 'success' : 'failure',
            timestamp: new Date().toISOString(),
          }),
          learnedFrom: 'system',
          confidence: 1.0,
        },
        update: {
          preferenceValue: JSON.stringify({
            result: verified ? 'success' : 'failure',
            timestamp: new Date().toISOString(),
          }),
        },
      });
    }

    return success({ verified });
  } catch (err) {
    console.error('[shadow/config/pin/verify] POST error:', err);
    return error('INTERNAL_ERROR', 'Failed to verify PIN', 500);
  }
}

// ---------------------------------------------------------------------------
// Route exports
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<Response> {
  return withAuth(req, handlePost);
}
