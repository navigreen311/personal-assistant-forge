import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope, withRole } from '@/shared/middleware/auth';
import * as tripService from '@/modules/travel/services/trip-service';

const querySchema = z.object({
  entityId: z.string().min(1).optional(),
  status: z.enum(['upcoming', 'active', 'past', 'all']).optional().default('all'),
  period: z.string().optional(),
});

const createTripSchema = z.object({
  name: z.string().min(1),
  destination: z.string().min(1),
  origin: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  type: z.string().min(1),
  budget: z.number().min(0),
  // Optional and still verified. It used to be REQUIRED, which made the client
  // name its own tenant -- the habit that produced the whole tenancy bug.
  entityId: z.string().min(1).optional(),
});

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const all = await tripService.listTrips(entityId, 'all');
      const now = new Date();
      const yearStart = new Date(now.getFullYear(), 0, 1);

      const trips =
        parsed.data.status === 'all'
          ? all
          : all.filter((t) => t.status === parsed.data.status);

      return success({
        stats: {
          upcoming: all.filter((t) => t.status === 'upcoming').length,
          active: all.filter((t) => t.status === 'active').length,
          thisYear: all.filter((t) => t.startDate >= yearStart).length,
          // No loyalty-account model exists in the frozen schema, so there is no
          // balance to report. Zero here means "not tracked", and returning a
          // number invented from nothing is exactly what this route used to do.
          loyaltyBalance: null,
        },
        trips: trips.map((t) => ({
          id: t.id,
          name: t.name,
          destination: t.destination,
          origin: t.origin,
          startDate: t.startDate.toISOString(),
          endDate: t.endDate.toISOString(),
          type: t.type,
          status: t.status,
          budget: t.budget,
          spent: t.spent,
          itinerary: [],
        })),
      });
    } catch (err) {
      // A broken query is reported as broken rather than served as empty state.
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEntityScope(request, async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = createTripSchema.safeParse(body);
        if (!parsed.success) {
          return error('VALIDATION_ERROR', parsed.error.message, 400);
        }

        const { entityId: _requested, ...draft } = parsed.data;
        const trip = await tripService.createTrip(entityId, draft);

        return success(
          {
            id: trip.id,
            name: trip.name,
            destination: trip.destination,
            origin: trip.origin,
            startDate: trip.startDate.toISOString(),
            endDate: trip.endDate.toISOString(),
            type: trip.type,
            status: trip.status,
            budget: trip.budget,
            spent: trip.spent,
          },
          201
        );
      } catch (err) {
        // The old handler answered 201 with a fabricated id when the write failed.
        // A failed write is a failure.
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to create trip', 500);
      }
    })
  );
}
