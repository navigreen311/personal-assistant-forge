import { NextRequest } from 'next/server';
import { success } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    return success([
      {
        id: 't1',
        category: 'GENERAL',
        title: 'Clean gutters and downspouts',
        description: 'Remove debris from all gutters, check downspout drainage',
        frequency: 'BIANNUAL',
        season: 'FALL',
        lastCompletedDate: new Date('2025-10-15'),
        nextDueDate: new Date('2026-02-10'),
        assignedProviderId: 'p1',
        estimatedCostUsd: 150,
        status: 'OVERDUE',
        notes: 'Check for loose brackets too',
      },
      {
        id: 't2',
        category: 'PLUMBING',
        title: 'Water heater flush',
        description: 'Drain and flush sediment from water heater tank',
        frequency: 'ANNUAL',
        season: 'WINTER',
        lastCompletedDate: new Date('2025-01-20'),
        nextDueDate: new Date('2026-01-20'),
        assignedProviderId: 'p4',
        estimatedCostUsd: 120,
        status: 'OVERDUE',
      },
      {
        id: 't3',
        category: 'HVAC',
        title: 'Replace HVAC air filter',
        description: 'Replace 20x25x1 filter in main unit',
        frequency: 'MONTHLY',
        season: 'ANY',
        lastCompletedDate: new Date('2026-02-01'),
        nextDueDate: new Date('2026-03-01'),
        estimatedCostUsd: 25,
        status: 'UPCOMING',
      },
      {
        id: 't4',
        category: 'LAWN',
        title: 'Weekly lawn mowing',
        description: 'Mow front and back yard, edge walkways',
        frequency: 'MONTHLY',
        season: 'SPRING',
        lastCompletedDate: new Date('2026-02-20'),
        nextDueDate: new Date('2026-02-27'),
        assignedProviderId: 'p2',
        estimatedCostUsd: 75,
        status: 'UPCOMING',
      },
      {
        id: 't5',
        category: 'PEST',
        title: 'Quarterly pest treatment',
        description: 'Interior and exterior spray treatment',
        frequency: 'QUARTERLY',
        season: 'ANY',
        lastCompletedDate: new Date('2026-01-10'),
        nextDueDate: new Date('2026-04-10'),
        estimatedCostUsd: 95,
        status: 'UPCOMING',
      },
      {
        id: 't6',
        category: 'ELECTRICAL',
        title: 'Test smoke detectors and replace batteries',
        frequency: 'BIANNUAL',
        season: 'SPRING',
        lastCompletedDate: new Date('2025-09-15'),
        nextDueDate: new Date('2026-03-15'),
        estimatedCostUsd: 30,
        status: 'UPCOMING',
      },
      {
        id: 't7',
        category: 'APPLIANCE',
        title: 'Deep clean dishwasher',
        description: 'Run cleaning cycle, clean filter and spray arms',
        frequency: 'QUARTERLY',
        season: 'ANY',
        lastCompletedDate: new Date('2026-02-01'),
        nextDueDate: new Date('2026-02-01'),
        estimatedCostUsd: 0,
        status: 'COMPLETED',
      },
      {
        id: 't8',
        category: 'ROOF',
        title: 'Annual roof inspection',
        description: 'Check shingles, flashing, and gutters for damage',
        frequency: 'ANNUAL',
        season: 'FALL',
        lastCompletedDate: new Date('2025-10-20'),
        nextDueDate: new Date('2025-10-20'),
        estimatedCostUsd: 200,
        status: 'COMPLETED',
      },
    ]);
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async () => {
    const body = await request.json();
    return success(
      {
        id: `t-${Date.now()}`,
        ...body,
        status: 'UPCOMING',
      },
      201
    );
  });
}
