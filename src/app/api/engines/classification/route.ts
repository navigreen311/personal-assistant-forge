import { NextRequest } from 'next/server';
import { success } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    return success({
      stats: { classifiedToday: 156, accuracy: 94, avgSpeedMs: 120, costPerItem: 0.0005 },
      config: {
        model: 'claude-haiku-4-5',
        entityThreshold: 80,
        intentSensitivity: 75,
        topicDepth: 2,
      },
      taxonomy: [
        { id: '1', category: 'Inquiry', subcategories: ['General', 'Pricing', 'Technical', 'Support'], count: 52 },
        { id: '2', category: 'Action Required', subcategories: ['Approval', 'Review', 'Signature', 'Payment'], count: 38 },
        { id: '3', category: 'Informational', subcategories: ['Update', 'Report', 'Newsletter', 'Announcement'], count: 31 },
        { id: '4', category: 'Urgent', subcategories: ['Escalation', 'Outage', 'Compliance', 'Legal'], count: 18 },
        { id: '5', category: 'Personal', subcategories: ['Social', 'Scheduling', 'Thank You'], count: 17 },
      ],
      recentClassifications: [],
    });
  });
}

export async function PUT(request: NextRequest) {
  return withAuth(request, async () => {
    const body = await request.json();
    return success({ ...body, updated: true });
  });
}
