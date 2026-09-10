import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope, withRole } from '@/shared/middleware/auth';
import * as warrantyService from '@/modules/household/services/warranty-service';

const createSchema = z.object({
  name: z.string().min(1),
  costPerMonth: z.number().min(0),
  billingCycle: z.enum(['MONTHLY', 'ANNUAL']),
  renewalDate: z.string().transform(s => new Date(s)),
  category: z.string().min(1),
  isActive: z.boolean().default(true),
  autoRenew: z.boolean().default(false),
  cancellationUrl: z.string().optional(),
  // Optional and still verified; see the tenancy pattern, section 1.
  entityId: z.string().min(1).optional(),
});

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (_req, session, entityId) => {
    try {
      const subscriptions = await warrantyService.getSubscriptions(entityId, session.userId);
      return success(subscriptions);
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
        const subscription = await warrantyService.addSubscription(entityId, session.userId, {
          ...draft,
          userId: session.userId,
        });
        return success(subscription, 201);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    })
  );
}
