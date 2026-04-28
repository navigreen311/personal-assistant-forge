// ============================================================================
// POST /api/shadow/voiceprint/verify
// ----------------------------------------------------------------------------
// Verifies a single audio sample against the user's enrolled voiceprint.
// Multipart body: `audio` (the live sample) and optional `riskLevel` field
// ('low' | 'medium' | 'high', default 'medium').
//
// Anti-spoof rejection happens inside `verifyVoiceprint()` and is surfaced
// here as `verified=false, method='voiceprint_spoof_detected'`.
// ============================================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { verifyVoiceprint, type ActionRiskLevel } from '@/lib/shadow/safety/voiceprint-auth';
import type { AuthSession } from '@/lib/auth/types';

function parseRiskLevel(raw: FormDataEntryValue | null): ActionRiskLevel {
  if (raw === 'low' || raw === 'medium' || raw === 'high') {
    return raw;
  }
  return 'medium';
}

async function handlePost(req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const formData = await req.formData();
    const audioEntry = formData.get('audio');

    if (!audioEntry || !(audioEntry instanceof File)) {
      return error('VALIDATION_ERROR', 'Missing audio sample', 400);
    }

    const riskLevel = parseRiskLevel(formData.get('riskLevel'));
    const audioBuffer = Buffer.from(await audioEntry.arrayBuffer());

    const result = await verifyVoiceprint(session.userId, audioBuffer, riskLevel);

    return success(result);
  } catch (err) {
    console.error('[shadow/voiceprint/verify] POST error:', err);
    return error('INTERNAL_ERROR', 'Failed to verify voiceprint', 500);
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  return withAuth(req, handlePost);
}
