import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope, withRole } from '@/shared/middleware/auth';
import * as inventoryService from '@/modules/household/services/inventory-service';

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
  // Optional and still verified; see the tenancy pattern, section 1.
  entityId: z.string().min(1).optional(),
});

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, session, entityId) => {
    try {
      const { searchParams } = req.nextUrl;
      const items = await inventoryService.getInventory(entityId, session.userId, {
        propertyId: searchParams.get('propertyId') ?? undefined,
        category: searchParams.get('category') ?? undefined,
      });
      return success(items);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEntityScope(request, async (req, session, entityId) => {
      try {
        const body = await req.json();
        const parsed = createSchema.safeParse(body);
        if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

        const { entityId: _requested, ...draft } = parsed.data;
        const item = await inventoryService.addInventoryItem(entityId, session.userId, draft);
        return success(item, 201);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    })
  );
}
