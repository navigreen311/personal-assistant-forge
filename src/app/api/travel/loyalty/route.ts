import { NextRequest } from 'next/server';
import { success } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    return success([
      {
        id: 'l1',
        programName: 'Delta SkyMiles',
        accountNumber: '****7890',
        tier: 'Gold',
        balance: 45230,
        unit: 'miles',
        expiringAmount: 5000,
        expiringDate: new Date('2026-12-31'),
        estimatedValue: 542,
      },
      {
        id: 'l2',
        programName: 'Marriott Bonvoy',
        accountNumber: '****3210',
        tier: 'Platinum',
        balance: 82400,
        unit: 'points',
        estimatedValue: 658,
      },
      {
        id: 'l3',
        programName: 'Amex Membership Rewards',
        accountNumber: '****4242',
        tier: '',
        balance: 125000,
        unit: 'points',
        estimatedValue: 1640,
      },
    ]);
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async () => {
    const body = await request.json();
    return success({ id: `l-${Date.now()}`, ...body }, 201);
  });
}
