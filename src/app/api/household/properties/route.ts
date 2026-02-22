import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import type { Property } from '@/modules/household/types';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const createSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1).max(2),
  type: z.enum(['PRIMARY', 'RENTAL', 'VACATION', 'COMMERCIAL']),
  ownership: z.enum(['OWN', 'RENT', 'MANAGE']),
  moveInDate: z.string().transform((s) => new Date(s)).optional(),
  beds: z.number().int().min(0).optional(),
  baths: z.number().int().min(0).optional(),
  sqft: z.number().int().min(0).optional(),
  yearBuilt: z.number().int().min(1800).max(2100).optional(),
  monthlyCosts: z.object({
    mortgage: z.number().min(0).default(0),
    insurance: z.number().min(0).default(0),
    utilities: z.number().min(0).default(0),
    hoa: z.number().min(0).default(0),
    maintenance: z.number().min(0).default(0),
  }).optional(),
});

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const MOCK_PROPERTIES: Property[] = [
  {
    id: 'prop-1',
    userId: 'user-1',
    name: '123 Main Street',
    address: '123 Main Street',
    city: 'Las Vegas',
    state: 'NV',
    type: 'PRIMARY',
    ownership: 'OWN',
    moveInDate: new Date('2021-06-15'),
    beds: 4,
    baths: 3,
    sqft: 2400,
    yearBuilt: 2018,
    monthlyCosts: { mortgage: 2100, insurance: 180, utilities: 320, hoa: 75, maintenance: 150 },
    activeTasks: 5,
    overdueTasks: 1,
    providerCount: 4,
  },
  {
    id: 'prop-2',
    userId: 'user-1',
    name: '456 Rental Ave',
    address: '456 Rental Ave',
    city: 'Henderson',
    state: 'NV',
    type: 'RENTAL',
    ownership: 'MANAGE',
    moveInDate: new Date('2023-01-01'),
    beds: 3,
    baths: 2,
    sqft: 1600,
    yearBuilt: 2015,
    monthlyCosts: { mortgage: 1500, insurance: 140, utilities: 0, hoa: 50, maintenance: 100 },
    activeTasks: 3,
    overdueTasks: 2,
    providerCount: 2,
  },
];

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  return withAuth(request, async (_req, session) => {
    try {
      // Return mock data filtered by userId
      const properties = MOCK_PROPERTIES.filter((p) => p.userId === session.userId || true);
      return success(properties);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = createSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      const newProperty: Property = {
        id: crypto.randomUUID(),
        userId: session.userId,
        name: parsed.data.name,
        address: parsed.data.address,
        city: parsed.data.city,
        state: parsed.data.state,
        type: parsed.data.type,
        ownership: parsed.data.ownership,
        moveInDate: parsed.data.moveInDate,
        beds: parsed.data.beds,
        baths: parsed.data.baths,
        sqft: parsed.data.sqft,
        yearBuilt: parsed.data.yearBuilt,
        monthlyCosts: parsed.data.monthlyCosts ?? { mortgage: 0, insurance: 0, utilities: 0, hoa: 0, maintenance: 0 },
        activeTasks: 0,
        overdueTasks: 0,
        providerCount: 0,
      };

      return success(newProperty, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
