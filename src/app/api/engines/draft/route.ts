import { NextRequest } from 'next/server';
import { success } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    return success({
      stats: { draftsToday: 23, approvalRate: 86, avgTimeS: 2.3, costPerDraft: 0.008 },
      config: {
        model: 'claude-sonnet-4-5',
        defaultTone: 'Formal',
        templateCount: 14,
        autoSendThreshold: 90,
      },
      alwaysReview: ['P0 priority emails', 'Legal communications', 'Financial documents'],
      recentDrafts: [],
    });
  });
}

export async function PUT(request: NextRequest) {
  return withAuth(request, async () => {
    const body = await request.json();
    return success({ ...body, updated: true });
  });
}
