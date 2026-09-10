import { NextRequest } from 'next/server';
import { success } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

/**
 * THIS ENDPOINT DOES NOT SEARCH FOR HOTELS.
 *
 * No hotel-search provider is integrated. The route ignores its parameters and
 * returns the same three invented properties at the same three invented nightly
 * rates to every caller. It previously named real chains -- "Marriott Midtown",
 * "Hilton Garden Inn", "Hampton Inn" -- with star ratings and prices, which is
 * indistinguishable from a genuine quote and attributes fabricated pricing to
 * named businesses.
 *
 * Kept as the seam a provider would plug into; see the flights search route for
 * the same reasoning and the same envelope.
 *
 * No tenancy scope: nothing tenant-owned is read or written.
 */

const EXAMPLE_HOTELS = [
  {
    id: 'example-ht-1',
    name: 'Example Downtown Hotel (simulated)',
    rating: 4.3,
    pricePerNight: 189,
    nights: 3,
    totalPrice: 567,
    isSimulated: true as const,
  },
  {
    id: 'example-ht-2',
    name: 'Example Garden Hotel (simulated)',
    rating: 4.1,
    pricePerNight: 159,
    nights: 3,
    totalPrice: 477,
    isSimulated: true as const,
  },
  {
    id: 'example-ht-3',
    name: 'Example Airport Inn (simulated)',
    rating: 3.9,
    pricePerNight: 129,
    nights: 3,
    totalPrice: 387,
    isSimulated: true as const,
  },
];

export async function GET(request: NextRequest) {
  return withAuth(request, async (req) => {
    return success({
      isSimulated: true,
      provider: null,
      notice:
        'No hotel search provider is integrated. These are fixed example ' +
        'results; they are not real properties, not bookable, and do not ' +
        'reflect the search parameters supplied.',
      query: Object.fromEntries(req.nextUrl.searchParams),
      results: EXAMPLE_HOTELS,
    });
  });
}
