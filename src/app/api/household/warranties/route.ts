import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import * as warrantyService from '@/modules/household/services/warranty-service';

const createSchema = z.object({
  itemName: z.string().min(1),
  purchaseDate: z.string().transform(s => new Date(s)),
  warrantyEndDate: z.string().transform(s => new Date(s)),
  provider: z.string().min(1),
  receiptUrl: z.string().optional(),
  claimPhone: z.string().optional(),
  notes: z.string().optional(),
  // Optional and still verified; see the tenancy pattern, section 1.
  entityId: z.string().min(1).optional(),
});

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (_req, session, entityId) => {
    try {
      const warranties = await warrantyService.getWarranties(entityId, session.userId);
      return success(warranties);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, session, entityId) => {
    try {
      const body = await req.json();
      const parsed = createSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      const { entityId: _requested, ...draft } = parsed.data;
      const warranty = await warrantyService.addWarranty(entityId, session.userId, {
        ...draft,
        userId: session.userId,
      });
      return success(warranty, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
