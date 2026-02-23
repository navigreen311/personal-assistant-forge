import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import type { AuthSession } from '@/lib/auth/types';

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

async function clearPrimaryDeviceId(userId: string): Promise<void> {
  await prisma.shadowPreference.deleteMany({
    where: { userId, preferenceKey: 'trustedDevices.primaryId' },
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/shadow/config/trusted-devices/[id]
// Deletes a trusted device by ID. Only allow deletion if userId matches.
// ---------------------------------------------------------------------------

async function handleDelete(
  _req: NextRequest,
  session: AuthSession,
  deviceId: string
): Promise<Response> {
  try {
    const userId = session.userId;

    // Find the device and verify ownership
    const device = await prisma.shadowTrustedDevice.findUnique({
      where: { id: deviceId },
    });

    if (!device || device.userId !== userId) {
      return error('NOT_FOUND', 'Trusted device not found', 404);
    }

    // Delete the device
    await prisma.shadowTrustedDevice.delete({
      where: { id: deviceId },
    });

    // If this was the primary device, clear the primary setting
    const primaryDeviceId = await getPrimaryDeviceId(userId);
    if (primaryDeviceId === deviceId) {
      // Try to set the next oldest device as primary, or clear if none left
      const remaining = await prisma.shadowTrustedDevice.findFirst({
        where: { userId },
        orderBy: { verifiedAt: 'asc' },
      });

      if (remaining) {
        await setPrimaryDeviceId(userId, remaining.id);
      } else {
        await clearPrimaryDeviceId(userId);
      }
    }

    return success({ deleted: true });
  } catch (err) {
    console.error('[shadow/config/trusted-devices/[id]] DELETE error:', err);
    return error('INTERNAL_ERROR', 'Failed to delete trusted device', 500);
  }
}

// ---------------------------------------------------------------------------
// PUT /api/shadow/config/trusted-devices/[id]
// Updates a trusted device (edit label, set as primary, etc.)
// ---------------------------------------------------------------------------

async function handlePut(
  req: NextRequest,
  session: AuthSession,
  deviceId: string
): Promise<Response> {
  try {
    const userId = session.userId;

    // Find the device and verify ownership
    const device = await prisma.shadowTrustedDevice.findUnique({
      where: { id: deviceId },
    });

    if (!device || device.userId !== userId) {
      return error('NOT_FOUND', 'Trusted device not found', 404);
    }

    const body = await req.json();
    const { label, isPrimary } = body as {
      label?: string;
      isPrimary?: boolean;
    };

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (label !== undefined) {
      const validLabels = ['mobile', 'office', 'home', 'work', 'other'];
      if (!validLabels.includes(label)) {
        return error(
          'VALIDATION_ERROR',
          `Invalid label. Must be one of: ${validLabels.join(', ')}`,
          400
        );
      }
      updateData.deviceType = label;
    }

    // Update the device record if there are field changes
    const updated = Object.keys(updateData).length > 0
      ? await prisma.shadowTrustedDevice.update({
          where: { id: deviceId },
          data: updateData,
        })
      : device;

    // Handle isPrimary change
    if (isPrimary === true) {
      await setPrimaryDeviceId(userId, deviceId);
    } else if (isPrimary === false) {
      // If unsetting primary on this device, clear if it was the primary
      const currentPrimary = await getPrimaryDeviceId(userId);
      if (currentPrimary === deviceId) {
        await clearPrimaryDeviceId(userId);
      }
    }

    const primaryDeviceId = await getPrimaryDeviceId(userId);

    return success({
      device: {
        id: updated.id,
        deviceName: updated.phoneNumber ?? updated.name,
        deviceType: updated.deviceType,
        isVerified: updated.isActive,
        isPrimary: updated.id === primaryDeviceId,
        createdAt: updated.verifiedAt.toISOString(),
        lastUsedAt: updated.lastUsedAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    console.error('[shadow/config/trusted-devices/[id]] PUT error:', err);
    return error('INTERNAL_ERROR', 'Failed to update trusted device', 500);
  }
}

// ---------------------------------------------------------------------------
// Route exports
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  return withAuth(req, (innerReq, session) => handleDelete(innerReq, session, id));
}

export async function PUT(req: NextRequest, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  return withAuth(req, (innerReq, session) => handlePut(innerReq, session, id));
}
