import { NextRequest } from 'next/server';
import { success } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    return success([
      {
        id: 'p1',
        name: 'ABC Services',
        category: 'General Handyman',
        phone: '702-555-0100',
        email: 'info@abcservices.com',
        rating: 4.8,
        lastUsed: new Date('2026-02-15'),
        notes: 'Reliable, fast turnaround',
        costHistory: [
          { date: new Date('2026-02-15'), amount: 185, service: 'Faucet repair' },
          { date: new Date('2026-01-10'), amount: 120, service: 'Doorknob replacement' },
          { date: new Date('2025-11-05'), amount: 250, service: 'Drywall patching' },
        ],
      },
      {
        id: 'p2',
        name: 'Green Lawn Co',
        category: 'Lawn Care',
        phone: '702-555-0200',
        email: '',
        rating: 4.5,
        lastUsed: new Date('2026-02-20'),
        notes: 'Active contract: Weekly mowing',
        costHistory: [
          { date: new Date('2026-02-20'), amount: 75, service: 'Weekly mowing' },
          { date: new Date('2026-02-13'), amount: 75, service: 'Weekly mowing' },
        ],
      },
      {
        id: 'p3',
        name: 'Cool Air HVAC',
        category: 'HVAC',
        phone: '702-555-0300',
        email: 'service@coolair.com',
        rating: 4.7,
        lastUsed: new Date('2025-12-01'),
        notes: 'Licensed & insured, same-day emergency service',
        costHistory: [
          { date: new Date('2025-12-01'), amount: 250, service: 'AC tune-up' },
        ],
      },
      {
        id: 'p4',
        name: "Mike's Plumbing",
        category: 'Plumbing',
        phone: '702-555-0400',
        email: 'mike@mikesplumbing.com',
        rating: 4.2,
        lastUsed: new Date('2026-02-18'),
        notes: 'Emergency service available 24/7',
        costHistory: [
          { date: new Date('2026-02-18'), amount: 185, service: 'Kitchen faucet repair' },
          { date: new Date('2025-08-10'), amount: 340, service: 'Water heater flush' },
        ],
      },
    ]);
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async () => {
    const body = await request.json();
    return success(
      {
        id: `p-${Date.now()}`,
        ...body,
        costHistory: [],
      },
      201
    );
  });
}
