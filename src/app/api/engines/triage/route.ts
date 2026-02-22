import { NextRequest } from 'next/server';
import { success } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    return success({
      stats: { processedToday: 47, accuracy: 92, avgSpeedMs: 180, costPerItem: 0.001 },
      config: {
        model: 'claude-haiku-4-5',
        confidenceThreshold: 70,
        priorityLevels: ['P0', 'P1', 'P2', 'P3', 'P4'],
      },
      rules: [
        { id: '1', condition: 'sender contains "hcqc.nv.gov"', action: 'P0 always' },
        { id: '2', condition: 'subject contains "invoice"', action: 'Route to Finance' },
        { id: '3', condition: 'from VIP list', action: 'P1 minimum' },
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
