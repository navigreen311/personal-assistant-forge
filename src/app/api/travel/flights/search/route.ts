import { NextRequest } from 'next/server';
import { success } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

/**
 * THIS ENDPOINT DOES NOT SEARCH FOR FLIGHTS.
 *
 * There is no flight-search provider integrated -- no Amadeus, Sabre, Duffel,
 * Kiwi or anything else. This route ignores every search parameter it is given
 * and returns the same three invented LAS→JFK itineraries at the same three
 * invented prices to every caller, on every request, forever.
 *
 * It is left in place because it is the seam a provider would plug into, but
 * three things changed so that it can no longer be mistaken for a search:
 *
 *   1. The airline names are labelled. "Delta / DL1234 / $289" was
 *      indistinguishable from a real quote; it is now clearly an example.
 *   2. The response is an envelope with `isSimulated: true`, `provider: null`
 *      and a plain-English `notice`, rather than a bare array that renders like
 *      a result list.
 *   3. The parameters the caller passed are echoed back under `query` so it is
 *      obvious they had no effect on the result.
 *
 * There is deliberately no tenancy scope here: nothing tenant-owned is read or
 * written. `withAuth` is the right wrapper, not `withEntityScope`.
 */

const EXAMPLE_FLIGHTS = [
  {
    id: 'example-fl-1',
    airline: 'Example Airline A (simulated)',
    flightNumber: 'XX1234',
    origin: 'LAS',
    destination: 'JFK',
    departureTime: '6:00am',
    arrivalTime: '1:30pm',
    stops: 'Direct',
    duration: '4h 30m',
    price: 289,
    isSimulated: true as const,
  },
  {
    id: 'example-fl-2',
    airline: 'Example Airline B (simulated)',
    flightNumber: 'XX567',
    origin: 'LAS',
    destination: 'JFK',
    departureTime: '8:15am',
    arrivalTime: '4:00pm',
    stops: '1 stop (DEN)',
    duration: '5h 45m',
    price: 245,
    isSimulated: true as const,
  },
  {
    id: 'example-fl-3',
    airline: 'Example Airline C (simulated)',
    flightNumber: 'XX890',
    origin: 'LAS',
    destination: 'JFK',
    departureTime: '7:00am',
    arrivalTime: '2:30pm',
    stops: 'Direct',
    duration: '4h 30m',
    price: 198,
    isSimulated: true as const,
  },
];

export async function GET(request: NextRequest) {
  return withAuth(request, async (req) => {
    return success({
      isSimulated: true,
      provider: null,
      notice:
        'No flight search provider is integrated. These are fixed example ' +
        'results; they are not real flights, not bookable, and do not reflect ' +
        'the search parameters supplied.',
      query: Object.fromEntries(req.nextUrl.searchParams),
      results: EXAMPLE_FLIGHTS,
    });
  });
}
