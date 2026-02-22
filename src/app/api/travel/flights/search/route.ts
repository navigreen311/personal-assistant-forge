import { NextRequest } from 'next/server';
import { success } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

const MOCK_FLIGHTS = [
  {
    id: 'fl-1',
    airline: 'Delta',
    flightNumber: 'DL1234',
    origin: 'LAS',
    destination: 'JFK',
    departureTime: '6:00am',
    arrivalTime: '1:30pm',
    stops: 'Direct',
    duration: '4h 30m',
    price: 289,
  },
  {
    id: 'fl-2',
    airline: 'United',
    flightNumber: 'UA567',
    origin: 'LAS',
    destination: 'JFK',
    departureTime: '8:15am',
    arrivalTime: '4:00pm',
    stops: '1 stop (DEN)',
    duration: '5h 45m',
    price: 245,
  },
  {
    id: 'fl-3',
    airline: 'Southwest',
    flightNumber: 'WN890',
    origin: 'LAS',
    destination: 'JFK',
    departureTime: '7:00am',
    arrivalTime: '2:30pm',
    stops: 'Direct',
    duration: '4h 30m',
    price: 198,
  },
];

export async function GET(request: NextRequest) {
  return withAuth(request, async (_req, _session) => {
    // Return mock flight search results
    // In production, this would call a real flight search API
    return success(MOCK_FLIGHTS);
  });
}
