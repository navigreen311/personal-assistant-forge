import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope, withRole } from '@/shared/middleware/auth';
import * as providerService from '@/modules/household/services/provider-service';

/**
 * This route used to return four hardcoded Las Vegas contractors -- names, phone
 * numbers, ratings and a cost history -- to every caller, and its POST echoed
 * the request body back with a fabricated id and never wrote anything. The
 * household module already had a real, entity-scoped provider service backed by
 * `Contact`; the route simply was not wired to it.
 */

const createSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().optional(),
  rating: z.number().min(0).max(5).default(0),
  lastUsed: z.string().transform((s) => new Date(s)).optional(),
  notes: z.string().optional(),
  // Optional and still verified; see the tenancy pattern, section 1.
  entityId: z.string().min(1).optional(),
});

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, session, entityId) => {
    try {
      const category = req.nextUrl.searchParams.get('category') ?? undefined;
      const providers = await providerService.getProviders(entityId, session.userId, category);
      return success(providers);
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
        const provider = await providerService.addProvider(entityId, session.userId, {
          ...draft,
          userId: session.userId,
        });
        return success(provider, 201);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    })
  );
}
