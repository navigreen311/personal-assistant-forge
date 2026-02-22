import { NextRequest } from 'next/server';
import { success } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    return success({
      stats: { callsToday: 8, avgDurationMin: 4.2, qualityScore: 4.7, latencyMs: 230 },
      config: {
        persona: 'professional',
        voiceQuality: 'high',
        language: 'en-US',
        routingRules: [
          'Business hours: AI handles all',
          'After hours: Voicemail + AI summary',
          'VIP callers: Immediate human transfer',
        ],
      },
      scripts: [
        { id: '1', name: 'Appointment Confirmation', status: 'Active', usageCount: 34 },
        { id: '2', name: 'Follow-up Call', status: 'Active', usageCount: 21 },
        { id: '3', name: 'Survey Collection', status: 'Draft', usageCount: 0 },
        { id: '4', name: 'Emergency Escalation', status: 'Active', usageCount: 8 },
      ],
      recentCalls: [],
    });
  });
}

export async function PUT(request: NextRequest) {
  return withAuth(request, async () => {
    const body = await request.json();
    return success({ ...body, updated: true });
  });
}
