import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import type { AuthSession } from '@/lib/auth/types';

// ---------------------------------------------------------------------------
// Known persona IDs (must match the list in ../route.ts)
// ---------------------------------------------------------------------------

const VALID_PERSONA_IDS = new Set([
  'default',
  'professional-male',
  'professional-female',
  'warm-male',
  'warm-female',
  'authoritative',
  'calm',
]);

// ---------------------------------------------------------------------------
// POST /api/shadow/config/voice-personas/[id]/preview — Preview a voice persona
// ---------------------------------------------------------------------------

async function handlePost(
  _req: NextRequest,
  _session: AuthSession,
  personaId: string
): Promise<Response> {
  if (!VALID_PERSONA_IDS.has(personaId)) {
    return error('NOT_FOUND', `Voice persona '${personaId}' not found`, 404);
  }

  return success({
    personaId,
    previewUrl: `/audio/samples/${personaId}.mp3`,
    durationSeconds: 5,
  });
}

// ---------------------------------------------------------------------------
// Route exports
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  return withAuth(req, (_req, session) => handlePost(_req, session, id));
}
