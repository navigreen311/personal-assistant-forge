import { NextRequest } from 'next/server';
import { success } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

const MOCK_HOTELS = [
  {
    id: 'ht-1',
    name: 'Marriott Midtown',
    rating: 4.3,
    pricePerNight: 189,
    nights: 3,
    totalPrice: 567,
  },
  {
    id: 'ht-2',
    name: 'Hilton Garden Inn',
    rating: 4.1,
    pricePerNight: 159,
    nights: 3,
    totalPrice: 477,
  },
  {
    id: 'ht-3',
    name: 'Hampton Inn',
    rating: 3.9,
    pricePerNight: 129,
    nights: 3,
    totalPrice: 387,
  },
];

export async function GET(request: NextRequest) {
  return withAuth(request, async (_req, _session) => {
    // Return mock hotel search results
    // In production, this would call a real hotel search API
    return success(MOCK_HOTELS);
  });
}
