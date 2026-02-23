import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import type { AuthSession } from '@/lib/auth/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VipKeyword {
  id: string;
  keyword: string;
}

const PREF_KEY = 'proactive.vipKeywords';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadKeywords(userId: string): Promise<VipKeyword[]> {
  const pref = await prisma.shadowPreference.findUnique({
    where: { userId_preferenceKey: { userId, preferenceKey: PREF_KEY } },
  });

  if (!pref) return [];

  try {
    return JSON.parse(pref.preferenceValue) as VipKeyword[];
  } catch {
    return [];
  }
}

async function saveKeywords(userId: string, keywords: VipKeyword[]): Promise<void> {
  await prisma.shadowPreference.upsert({
    where: { userId_preferenceKey: { userId, preferenceKey: PREF_KEY } },
    create: {
      userId,
      preferenceKey: PREF_KEY,
      preferenceValue: JSON.stringify(keywords),
      learnedFrom: 'explicit',
      confidence: 1.0,
    },
    update: {
      preferenceValue: JSON.stringify(keywords),
    },
  });
}

// ---------------------------------------------------------------------------
// GET /api/shadow/config/vip-keywords
// ---------------------------------------------------------------------------

async function handleGet(_req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const keywords = await loadKeywords(session.userId);
    return success({ keywords });
  } catch (err) {
    console.error('[shadow/config/vip-keywords] GET error:', err);
    return error('INTERNAL_ERROR', 'Failed to load VIP keywords', 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/shadow/config/vip-keywords
// ---------------------------------------------------------------------------

async function handlePost(req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const body = await req.json();

    if (!body.keyword || typeof body.keyword !== 'string') {
      return error('VALIDATION_ERROR', 'keyword is required and must be a string', 400);
    }

    const keyword = body.keyword.trim();
    if (!keyword) {
      return error('VALIDATION_ERROR', 'keyword must not be empty', 400);
    }

    const keywords = await loadKeywords(session.userId);

    // Check for duplicate keywords (case-insensitive)
    const duplicate = keywords.find(
      (k) => k.keyword.toLowerCase() === keyword.toLowerCase()
    );
    if (duplicate) {
      return error('DUPLICATE', 'This keyword already exists', 409);
    }

    const newKeyword: VipKeyword = {
      id: `kw_${Date.now()}`,
      keyword,
    };

    keywords.push(newKeyword);
    await saveKeywords(session.userId, keywords);

    return success({ keyword: newKeyword }, 201);
  } catch (err) {
    console.error('[shadow/config/vip-keywords] POST error:', err);
    return error('INTERNAL_ERROR', 'Failed to add VIP keyword', 500);
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
