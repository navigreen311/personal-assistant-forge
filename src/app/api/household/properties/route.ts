import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope, withRole } from '@/shared/middleware/auth';
import * as propertyService from '@/modules/household/services/property-service';

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
  // Optional and still verified; see the tenancy pattern, section 1.
  entityId: z.string().min(1).optional(),
});

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (_req, session, entityId) => {
    try {
      const properties = await propertyService.getProperties(entityId, session.userId);
      return success(properties);
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

        const { entityId: _requested, monthlyCosts, ...rest } = parsed.data;
        const property = await propertyService.addProperty(entityId, session.userId, {
          ...rest,
          monthlyCosts: monthlyCosts ?? {
            mortgage: 0,
            insurance: 0,
            utilities: 0,
            hoa: 0,
            maintenance: 0,
          },
        });
        return success(property, 201);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    })
  );
}
