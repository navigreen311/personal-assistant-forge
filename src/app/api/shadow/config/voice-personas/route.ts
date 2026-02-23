import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success } from '@/shared/utils/api-response';
import type { AuthSession } from '@/lib/auth/types';

// ---------------------------------------------------------------------------
// Available VoiceForge personas
// ---------------------------------------------------------------------------

const VOICE_PERSONAS = [
  { id: 'default', name: 'Default', description: 'Current default voice', gender: null, sampleUrl: null },
  { id: 'professional-male', name: 'Professional Male', description: 'Clear, confident male voice suited for business', gender: 'male', sampleUrl: '/audio/samples/professional-male.mp3' },
  { id: 'professional-female', name: 'Professional Female', description: 'Clear, confident female voice suited for business', gender: 'female', sampleUrl: '/audio/samples/professional-female.mp3' },
  { id: 'warm-male', name: 'Warm Male', description: 'Friendly, approachable male voice', gender: 'male', sampleUrl: '/audio/samples/warm-male.mp3' },
  { id: 'warm-female', name: 'Warm Female', description: 'Friendly, approachable female voice', gender: 'female', sampleUrl: '/audio/samples/warm-female.mp3' },
  { id: 'authoritative', name: 'Authoritative', description: 'Strong, commanding voice for urgent situations', gender: null, sampleUrl: '/audio/samples/authoritative.mp3' },
  { id: 'calm', name: 'Calm & Reassuring', description: 'Soothing voice for stressful moments', gender: null, sampleUrl: '/audio/samples/calm.mp3' },
];

// ---------------------------------------------------------------------------
// GET /api/shadow/config/voice-personas — List available voice personas
// ---------------------------------------------------------------------------

async function handleGet(_req: NextRequest, _session: AuthSession): Promise<Response> {
  return success({ personas: VOICE_PERSONAS });
}

// ---------------------------------------------------------------------------
// Route exports
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<Response> {
  return withAuth(req, handleGet);
}
