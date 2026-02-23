import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import type { AuthSession } from '@/lib/auth/types';

// ---------------------------------------------------------------------------
// Phone number validation
// ---------------------------------------------------------------------------

const PHONE_REGEX = /^\+?[\d\s\-().]{7,20}$/;

function isValidPhoneNumber(phone: string): boolean {
  return PHONE_REGEX.test(phone);
}

function normalizePhoneNumber(phone: string): string {
  return phone.replace(/[\s\-().]/g, '');
}

// ---------------------------------------------------------------------------
// Helpers: isPrimary stored in ShadowPreference table
// ---------------------------------------------------------------------------

async function getPrimaryDeviceId(userId: string): Promise<string | null> {
  const pref = await prisma.shadowPreference.findUnique({
    where: { userId_preferenceKey: { userId, preferenceKey: 'trustedDevices.primaryId' } },
  });
  return pref ? pref.preferenceValue : null;
}

async function setPrimaryDeviceId(userId: string, deviceId: string): Promise<void> {
  await prisma.shadowPreference.upsert({
    where: { userId_preferenceKey: { userId, preferenceKey: 'trustedDevices.primaryId' } },
    create: {
      userId,
      preferenceKey: 'trustedDevices.primaryId',
      preferenceValue: deviceId,
      learnedFrom: 'explicit',
      confidence: 1.0,
    },
    update: {
      preferenceValue: deviceId,
    },
  });
}

// ---------------------------------------------------------------------------
// GET /api/shadow/config/trusted-devices
// Lists all trusted devices/numbers for the authenticated user.
// ---------------------------------------------------------------------------

async function handleGet(_req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const userId = session.userId;

    const [devices, primaryDeviceId] = await Promise.all([
      prisma.shadowTrustedDevice.findMany({
        where: { userId },
        orderBy: { verifiedAt: 'asc' },
      }),
      getPrimaryDeviceId(userId),
    ]);

    const mapped = devices.map((d) => ({
      id: d.id,
      deviceName: d.phoneNumber ?? d.name,
      deviceType: d.deviceType,
      isVerified: d.isActive,
      isPrimary: d.id === primaryDeviceId,
      createdAt: d.verifiedAt.toISOString(),
      lastUsedAt: d.lastUsedAt?.toISOString() ?? null,
    }));

    return success({ devices: mapped });
  } catch (err) {
    console.error('[shadow/config/trusted-devices] GET error:', err);
    return error('INTERNAL_ERROR', 'Failed to load trusted devices', 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/shadow/config/trusted-devices
// Creates a new trusted device. Accepts: { phoneNumber, label, isPrimary }
// ---------------------------------------------------------------------------

async function handlePost(req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const userId = session.userId;
    const body = await req.json();

    const { phoneNumber, label, isPrimary } = body as {
      phoneNumber?: string;
      label?: string;
      isPrimary?: boolean;
    };

    // Validate required fields
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return error('VALIDATION_ERROR', 'phoneNumber is required', 400);
    }

    if (!isValidPhoneNumber(phoneNumber)) {
      return error(
        'VALIDATION_ERROR',
        'Invalid phone number format. Use E.164 or standard formats (e.g., +1-555-123-4567)',
        400
      );
    }

    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    // Check for duplicate phone number for this user
    const existing = await prisma.shadowTrustedDevice.findFirst({
      where: { userId, phoneNumber: normalizedPhone },
    });

    if (existing) {
      return error('CONFLICT', 'This phone number is already registered as a trusted device', 409);
    }

    // Validate label
    const validLabels = ['mobile', 'office', 'home', 'work', 'other'];
    const deviceLabel = label && validLabels.includes(label) ? label : 'mobile';

    // Generate a unique fingerprint
    const fingerprint = `phone_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    // Create the device
    const device = await prisma.shadowTrustedDevice.create({
      data: {
        userId,
        name: phoneNumber, // Store original formatted number as name
        deviceType: deviceLabel,
        deviceFingerprint: fingerprint,
        phoneNumber: normalizedPhone,
        isActive: false, // Not yet verified via SMS
      },
    });

    // If isPrimary is requested OR this is the first device, set as primary
    const deviceCount = await prisma.shadowTrustedDevice.count({ where: { userId } });
    if (isPrimary || deviceCount === 1) {
      await setPrimaryDeviceId(userId, device.id);
    }

    const primaryDeviceId = await getPrimaryDeviceId(userId);

    return success(
      {
        device: {
          id: device.id,
          deviceName: phoneNumber,
          deviceType: deviceLabel,
          isVerified: false,
          isPrimary: device.id === primaryDeviceId,
          createdAt: device.verifiedAt.toISOString(),
          lastUsedAt: null,
        },
        verificationSent: true,
      },
      201
    );
  } catch (err) {
    console.error('[shadow/config/trusted-devices] POST error:', err);
    return error('INTERNAL_ERROR', 'Failed to create trusted device', 500);
  }
}

// ---------------------------------------------------------------------------
// Route exports
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<Response> {
  return withAuth(req, handleGet);
}

export async function POST(req: NextRequest): Promise<Response> {
  return withAuth(req, handlePost);
}
