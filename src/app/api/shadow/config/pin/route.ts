import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import type { AuthSession } from '@/lib/auth/types';

// ---------------------------------------------------------------------------
// Helpers: read/write ShadowPreference rows
// ---------------------------------------------------------------------------

async function writePreference(
  userId: string,
  key: string,
  value: string
): Promise<void> {
  await prisma.shadowPreference.upsert({
    where: { userId_preferenceKey: { userId, preferenceKey: key } },
    create: {
      userId,
      preferenceKey: key,
      preferenceValue: value,
      learnedFrom: 'explicit',
      confidence: 1.0,
    },
    update: {
      preferenceValue: value,
    },
  });
}

async function deletePreference(
  userId: string,
  key: string
): Promise<void> {
  await prisma.shadowPreference.deleteMany({
    where: { userId, preferenceKey: key },
  });
}

// ---------------------------------------------------------------------------
// PIN validation
// ---------------------------------------------------------------------------

const PIN_REGEX = /^\d{4,6}$/;

// ---------------------------------------------------------------------------
// POST /api/shadow/config/pin — Set or Change PIN
// ---------------------------------------------------------------------------

async function handlePost(req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const body = await req.json();
    const { newPin, confirmPin } = body;

    // Validate required fields
    if (!newPin || !confirmPin) {
      return error('VALIDATION_ERROR', 'Both newPin and confirmPin are required', 400);
    }

    // Validate PIN format: 4-6 numeric digits
    if (!PIN_REGEX.test(newPin)) {
      return error('VALIDATION_ERROR', 'PIN must be 4-6 numeric digits', 400);
    }

    if (!PIN_REGEX.test(confirmPin)) {
      return error('VALIDATION_ERROR', 'Confirmation PIN must be 4-6 numeric digits', 400);
    }

    // Validate PINs match
    if (newPin !== confirmPin) {
      return error('VALIDATION_ERROR', 'PINs do not match', 400);
    }

    const userId = session.userId;
    const setDate = new Date().toISOString();

    // Upsert ShadowSafetyConfig with the new PIN
    await prisma.shadowSafetyConfig.upsert({
      where: { userId },
      create: {
        userId,
        voicePin: newPin, // Plain text for now; would be hashed in production
        phoneConfirmationMode: 'voice_pin',
      },
      update: {
        voicePin: newPin,
      },
    });

    // Store pinSetDate as a preference
    await writePreference(userId, 'safety.pinSetDate', setDate);

    return success({ pinSet: true, setDate });
  } catch (err) {
    console.error('[shadow/config/pin] POST error:', err);
    return error('INTERNAL_ERROR', 'Failed to set PIN', 500);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/shadow/config/pin — Remove PIN
// ---------------------------------------------------------------------------

async function handleDelete(_req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const userId = session.userId;

    // Check if there is an existing config with a PIN set
    const config = await prisma.shadowSafetyConfig.findUnique({
      where: { userId },
    });

    if (!config || !config.voicePin) {
      return error('NOT_FOUND', 'No PIN is currently set', 404);
    }

    // Clear the voicePin
    await prisma.shadowSafetyConfig.update({
      where: { userId },
      data: { voicePin: null },
    });

    // Clear the pinSetDate preference
    await deletePreference(userId, 'safety.pinSetDate');

    return success({ pinRemoved: true });
  } catch (err) {
    console.error('[shadow/config/pin] DELETE error:', err);
    return error('INTERNAL_ERROR', 'Failed to remove PIN', 500);
  }
}

// ---------------------------------------------------------------------------
// Route exports
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<Response> {
  return withAuth(req, handlePost);
}

export async function DELETE(req: NextRequest): Promise<Response> {
  return withAuth(req, handleDelete);
}
