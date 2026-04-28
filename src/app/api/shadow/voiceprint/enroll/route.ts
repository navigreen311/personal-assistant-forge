// ============================================================================
// POST /api/shadow/voiceprint/enroll
// ----------------------------------------------------------------------------
// Accepts three audio samples (multipart/form-data: sample_0, sample_1,
// sample_2), forwards them to VAF for voiceprint enrollment, and persists a
// ShadowTrustedDevice row tagged with deviceType='voiceprint'.
// ============================================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import { VAFSpeakerID } from '@/lib/vaf/speaker-id-client';
import type { AuthSession } from '@/lib/auth/types';

const REQUIRED_SAMPLES = 3;

async function fileToBuffer(file: File): Promise<Buffer> {
  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function handlePost(req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const formData = await req.formData();

    const samples: Buffer[] = [];
    for (let i = 0; i < REQUIRED_SAMPLES; i++) {
      const entry = formData.get(`sample_${i}`);
      if (!entry || !(entry instanceof File)) {
        return error(
          'VALIDATION_ERROR',
          `Missing audio sample sample_${i} (need ${REQUIRED_SAMPLES} samples)`,
          400,
        );
      }
      samples.push(await fileToBuffer(entry));
    }

    const speakerID = new VAFSpeakerID();
    const enrollment = await speakerID.enroll(session.userId, samples);

    if (!enrollment.enrolled) {
      return error('VAF_ENROLLMENT_FAILED', 'Voiceprint enrollment was not accepted', 422, {
        qualityScores: enrollment.qualityScores,
      });
    }

    // Mark any prior voiceprint enrollments inactive so we keep one active
    // record per user (treated as a logical replacement, not a duplicate).
    await prisma.shadowTrustedDevice.updateMany({
      where: { userId: session.userId, deviceType: 'voiceprint', isActive: true },
      data: { isActive: false },
    });

    const device = await prisma.shadowTrustedDevice.create({
      data: {
        userId: session.userId,
        deviceType: 'voiceprint',
        name: 'Voiceprint',
        verifiedAt: new Date(),
        isActive: true,
      },
    });

    return success({
      enrolled: true,
      deviceId: device.id,
      enrolledAt: enrollment.enrolledAt,
      qualityScores: enrollment.qualityScores,
    });
  } catch (err) {
    console.error('[shadow/voiceprint/enroll] POST error:', err);
    return error('INTERNAL_ERROR', 'Failed to enroll voiceprint', 500);
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  return withAuth(req, handlePost);
}
