import { NextRequest } from 'next/server';
import { success } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    return success({
      stats: { eventsOptimized: 12, conflictsResolved: 3, bufferTimeMin: 45, satisfaction: 91 },
      config: {
        strategy: 'balance',
        minDuration: 15,
        maxBackToBack: 3,
        bufferMinutes: 10,
      },
      energyOverlay: {
        morning: { label: 'Morning (8am - 12pm)', energy: 'high', focus: 'Deep work & creative tasks' },
        afternoon: { label: 'Afternoon (12pm - 5pm)', energy: 'medium', focus: 'Meetings & collaboration' },
        evening: { label: 'Evening (5pm - 8pm)', energy: 'low', focus: 'Light admin & planning' },
      },
      focusRules: [
        'Block 10am-12pm daily for deep work',
        'No meetings before 9am',
        'Friday afternoon reserved for planning',
        'Auto-decline meetings during focus blocks',
      ],
      recentOptimizations: [],
    });
  });
}

export async function PUT(request: NextRequest) {
  return withAuth(request, async () => {
    const body = await request.json();
    return success({ ...body, updated: true });
  });
}
