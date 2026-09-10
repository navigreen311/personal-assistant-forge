import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope, withRole } from '@/shared/middleware/auth';
import * as shoppingService from '@/modules/household/services/shopping-service';

const addItemSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  quantity: z.number().min(1),
  unit: z.string().optional(),
  store: z.string().optional(),
  estimatedPrice: z.number().optional(),
  isRecurring: z.boolean().optional().default(false),
  recurringFrequency: z.string().optional(),
  // Optional and still verified; see the tenancy pattern, section 1.
  entityId: z.string().min(1).optional(),
});

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, session, entityId) => {
    try {
      const list = await shoppingService.getList(entityId, session.userId);
      return success(list);
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
        const parsed = addItemSchema.safeParse(body);
        if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

        const { entityId: _requested, ...draft } = parsed.data;
        const item = await shoppingService.addItem(entityId, session.userId, {
          ...draft,
          userId: session.userId,
        });
        return success(item, 201);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    })
  );
}
