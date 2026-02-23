import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import type { AuthSession } from '@/lib/auth/types';

// ---------------------------------------------------------------------------
// Types & defaults
// ---------------------------------------------------------------------------

interface EscalationSettings {
  attempts: number;
  waitMinutes: number;
  finalFallback: string;
  phoneTreeContacts: string[];
}

const PREF_KEY = 'proactive.escalation';

const DEFAULT_ESCALATION: EscalationSettings = {
  attempts: 3,
  waitMinutes: 15,
  finalFallback: 'sms',
  phoneTreeContacts: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadEscalation(userId: string): Promise<EscalationSettings> {
  const pref = await prisma.shadowPreference.findUnique({
    where: { userId_preferenceKey: { userId, preferenceKey: PREF_KEY } },
  });

  if (!pref) return { ...DEFAULT_ESCALATION };

  try {
    const stored = JSON.parse(pref.preferenceValue) as Partial<EscalationSettings>;
    return { ...DEFAULT_ESCALATION, ...stored };
  } catch {
    return { ...DEFAULT_ESCALATION };
  }
}

async function saveEscalation(userId: string, settings: EscalationSettings): Promise<void> {
  await prisma.shadowPreference.upsert({
    where: { userId_preferenceKey: { userId, preferenceKey: PREF_KEY } },
    create: {
      userId,
      preferenceKey: PREF_KEY,
      preferenceValue: JSON.stringify(settings),
      learnedFrom: 'explicit',
      confidence: 1.0,
    },
    update: {
      preferenceValue: JSON.stringify(settings),
    },
  });
}

// ---------------------------------------------------------------------------
// GET /api/shadow/config/escalation
// ---------------------------------------------------------------------------

async function handleGet(_req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const settings = await loadEscalation(session.userId);
    return success(settings);
  } catch (err) {
    console.error('[shadow/config/escalation] GET error:', err);
    return error('INTERNAL_ERROR', 'Failed to load escalation settings', 500);
  }
}

// ---------------------------------------------------------------------------
// PUT /api/shadow/config/escalation
// ---------------------------------------------------------------------------

async function handlePut(req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const body = await req.json();

    // Validate fields
    if (body.attempts !== undefined && (typeof body.attempts !== 'number' || body.attempts < 1)) {
      return error('VALIDATION_ERROR', 'attempts must be a positive number', 400);
    }
    if (body.waitMinutes !== undefined && (typeof body.waitMinutes !== 'number' || body.waitMinutes < 1)) {
      return error('VALIDATION_ERROR', 'waitMinutes must be a positive number', 400);
    }
    if (body.finalFallback !== undefined && typeof body.finalFallback !== 'string') {
      return error('VALIDATION_ERROR', 'finalFallback must be a string', 400);
    }
    if (body.phoneTreeContacts !== undefined && !Array.isArray(body.phoneTreeContacts)) {
      return error('VALIDATION_ERROR', 'phoneTreeContacts must be an array', 400);
    }

    // Merge with current settings (partial update support)
    const current = await loadEscalation(session.userId);
    const updated: EscalationSettings = {
      attempts: body.attempts ?? current.attempts,
      waitMinutes: body.waitMinutes ?? current.waitMinutes,
      finalFallback: body.finalFallback ?? current.finalFallback,
      phoneTreeContacts: body.phoneTreeContacts ?? current.phoneTreeContacts,
    };

    await saveEscalation(session.userId, updated);

    return success(updated);
  } catch (err) {
    console.error('[shadow/config/escalation] PUT error:', err);
    return error('INTERNAL_ERROR', 'Failed to update escalation settings', 500);
  }
}

// ---------------------------------------------------------------------------
// Route exports
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<Response> {
  return withAuth(req, handleGet);
}

export async function PUT(req: NextRequest): Promise<Response> {
  return withAuth(req, handlePut);
}
