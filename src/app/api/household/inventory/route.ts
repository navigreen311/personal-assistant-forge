import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import type { InventoryItem } from '@/modules/household/types';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const createSchema = z.object({
  itemName: z.string().min(1),
  propertyId: z.string().min(1),
  propertyName: z.string().min(1),
  category: z.enum(['APPLIANCE', 'HVAC', 'ELECTRONICS', 'FURNITURE', 'OUTDOOR', 'OTHER']),
  purchaseDate: z.string().transform((s) => new Date(s)),
  warrantyEndDate: z.string().transform((s) => new Date(s)).optional(),
  value: z.number().min(0).default(0),
  serialNumber: z.string().optional(),
  modelNumber: z.string().optional(),
  notes: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const MOCK_INVENTORY: InventoryItem[] = [
  {
    id: 'inv-1',
    userId: 'user-1',
    itemName: 'Samsung Refrigerator RF28T5001SR',
    propertyId: 'prop-1',
    propertyName: '123 Main Street',
    category: 'APPLIANCE',
    purchaseDate: new Date('2023-03-15'),
    warrantyEndDate: new Date('2027-03-15'),
    value: 1800,
    serialNumber: 'RF28T-20230315-001',
    modelNumber: 'RF28T5001SR',
    notes: 'French door, stainless steel',
  },
  {
    id: 'inv-2',
    userId: 'user-1',
    itemName: 'Carrier Central AC Unit',
    propertyId: 'prop-1',
    propertyName: '123 Main Street',
    category: 'HVAC',
    purchaseDate: new Date('2022-06-01'),
    warrantyEndDate: new Date('2026-06-01'),
    value: 8500,
    serialNumber: 'CAR-24XCB636-001',
    modelNumber: '24XCB636A003',
    notes: '3-ton, 16 SEER',
  },
  {
    id: 'inv-3',
    userId: 'user-1',
    itemName: 'Bosch 500 Series Washer',
    propertyId: 'prop-1',
    propertyName: '123 Main Street',
    category: 'APPLIANCE',
    purchaseDate: new Date('2023-08-20'),
    warrantyEndDate: new Date('2026-08-20'),
    value: 1200,
    serialNumber: 'BOSCH-WAT28400-002',
    modelNumber: 'WAT28400UC',
  },
  {
    id: 'inv-4',
    userId: 'user-1',
    itemName: 'LG ThinQ Dryer',
    propertyId: 'prop-2',
    propertyName: '456 Rental Ave',
    category: 'APPLIANCE',
    purchaseDate: new Date('2023-08-20'),
    warrantyEndDate: new Date('2025-08-20'),
    value: 1100,
    serialNumber: 'LG-DLEX8000-003',
    modelNumber: 'DLEX8000V',
  },
  {
    id: 'inv-5',
    userId: 'user-1',
    itemName: 'Ring Video Doorbell Pro 2',
    propertyId: 'prop-1',
    propertyName: '123 Main Street',
    category: 'ELECTRONICS',
    purchaseDate: new Date('2024-01-10'),
    warrantyEndDate: new Date('2026-01-10'),
    value: 250,
    serialNumber: 'RING-VDP2-004',
    modelNumber: 'B086Q5BKZS',
  },
];

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  return withAuth(request, async (_req, session) => {
    try {
      const { searchParams } = new URL(request.url);
      const propertyId = searchParams.get('propertyId');
      const category = searchParams.get('category');

      let items = MOCK_INVENTORY.filter((i) => i.userId === session.userId || true);

      if (propertyId) {
        items = items.filter((i) => i.propertyId === propertyId);
      }
      if (category) {
        items = items.filter((i) => i.category === category);
      }

      return success(items);
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

      const newItem: InventoryItem = {
        id: crypto.randomUUID(),
        userId: session.userId,
        ...parsed.data,
      };

      return success(newItem, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
