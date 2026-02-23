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
// DELETE /api/shadow/config/vip-keywords/[id]
// ---------------------------------------------------------------------------

async function handleDelete(
  _req: NextRequest,
  session: AuthSession,
  keywordId: string
): Promise<Response> {
  try {
    const keywords = await loadKeywords(session.userId);
    const index = keywords.findIndex((k) => k.id === keywordId);

    if (index === -1) {
      return error('NOT_FOUND', 'VIP keyword not found', 404);
    }

    keywords.splice(index, 1);
    await saveKeywords(session.userId, keywords);

    return success({ deleted: true });
  } catch (err) {
    console.error('[shadow/config/vip-keywords/[id]] DELETE error:', err);
    return error('INTERNAL_ERROR', 'Failed to delete VIP keyword', 500);
  }
}

// ---------------------------------------------------------------------------
// Route exports
// ---------------------------------------------------------------------------

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  return withAuth(req, (innerReq, session) => handleDelete(innerReq, session, id));
}
