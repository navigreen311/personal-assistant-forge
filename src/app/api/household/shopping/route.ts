import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import * as shoppingService from '@/modules/household/services/shopping-service';

const addItemSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  quantity: z.number().min(1),
  unit: z.string().optional(),
  store: z.string().optional(),
  estimatedPrice: z.number().optional(),
  isRecurring: z.boolean().optional().default(false),
  recurringFrequency: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) return error('MISSING_PARAM', 'userId is required', 400);

    const list = await shoppingService.getList(userId);
    return success(list);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = addItemSchema.safeParse(body);
    if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

    const item = await shoppingService.addItem(parsed.data.userId, parsed.data);
    return success(item, 201);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
