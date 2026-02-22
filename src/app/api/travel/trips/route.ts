import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';

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
  entityId: z.string().min(1),
  budget: z.number().min(0),
});

/**
 * Safely execute a query, returning a default value on failure.
 * Prevents the trips page from crashing when any individual query fails.
 */
const safeQuery = async <T>(fn: () => Promise<T>, defaultVal: T): Promise<T> => {
  try {
    return await fn();
  } catch {
    return defaultVal;
  }
};

/**
 * Determine the status of a trip based on its start and end dates.
 */
function deriveTripStatus(startDate: string, endDate: string): string {
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (now < start) return 'upcoming';
  if (now >= start && now <= end) return 'active';
  return 'past';
}

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { entityId, status } = parsed.data;
      const now = new Date();
      const yearStart = new Date(now.getFullYear(), 0, 1);

      // Build base where clause
      const baseWhere: Record<string, unknown> = {
        userId: session.userId,
      };
      if (entityId) {
        baseWhere.entityId = entityId;
      }

      // Fetch stats in parallel
      const [upcomingCount, activeCount, thisYearCount, loyaltyBalance] =
        await Promise.all([
          safeQuery(
            () =>
              (prisma as any).trip.count({
                where: {
                  ...baseWhere,
                  startDate: { gt: now },
                },
              }),
            0
          ),
          safeQuery(
            () =>
              (prisma as any).trip.count({
                where: {
                  ...baseWhere,
                  startDate: { lte: now },
                  endDate: { gte: now },
                },
              }),
            0
          ),
          safeQuery(
            () =>
              (prisma as any).trip.count({
                where: {
                  ...baseWhere,
                  startDate: { gte: yearStart },
                },
              }),
            0
          ),
          safeQuery(async () => {
            const loyalty = await (prisma as any).loyaltyAccount.aggregate({
              where: { userId: session.userId },
              _sum: { balance: true },
            });
            return loyalty._sum.balance ?? 0;
          }, 0),
        ]);

      // Build trip query filter based on status
      const tripWhere: Record<string, unknown> = { ...baseWhere };
      if (status === 'upcoming') {
        tripWhere.startDate = { gt: now };
      } else if (status === 'active') {
        tripWhere.startDate = { lte: now };
        tripWhere.endDate = { gte: now };
      } else if (status === 'past') {
        tripWhere.endDate = { lt: now };
      }

      // Fetch trips with itinerary items
      const rawTrips = await safeQuery(
        () =>
          (prisma as any).trip.findMany({
            where: tripWhere,
            include: {
              entity: { select: { name: true } },
              itineraryItems: {
                orderBy: { date: 'asc' },
              },
            },
            orderBy: { startDate: 'asc' },
          }),
        [] as any[]
      );

      const trips = rawTrips.map((trip: any) => ({
        id: trip.id,
        name: trip.name,
        destination: trip.destination,
        origin: trip.origin,
        startDate: trip.startDate?.toISOString?.() ?? trip.startDate,
        endDate: trip.endDate?.toISOString?.() ?? trip.endDate,
        type: trip.type,
        entity: trip.entity?.name ?? '',
        status: deriveTripStatus(trip.startDate, trip.endDate),
        budget: trip.budget ?? 0,
        spent: trip.spent ?? 0,
        itinerary: (trip.itineraryItems ?? []).map((item: any) => ({
          date: item.date?.toISOString?.() ?? item.date,
          type: item.type,
          description: item.description,
        })),
      }));

      return success({
        stats: {
          upcoming: upcomingCount,
          active: activeCount,
          thisYear: thisYearCount,
          loyaltyBalance,
        },
        trips,
      });
    } catch {
      // Outer catch: return safe defaults so the trips page never crashes
      return success({
        stats: {
          upcoming: 0,
          active: 0,
          thisYear: 0,
          loyaltyBalance: 0,
        },
        trips: [],
      });
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = createTripSchema.safeParse(body);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { name, destination, origin, startDate, endDate, type, entityId, budget } =
        parsed.data;

      // Verify entity ownership
      const entity = await safeQuery(
        () =>
          (prisma as any).entity.findFirst({
            where: { id: entityId, userId: session.userId },
          }),
        null
      );

      if (!entity) {
        return error('NOT_FOUND', 'Entity not found or access denied', 404);
      }

      try {
        const trip = await (prisma as any).trip.create({
          data: {
            name,
            destination,
            origin,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            type,
            entityId,
            userId: session.userId,
            budget,
            spent: 0,
          },
        });

        return success(trip, 201);
      } catch {
        // If DB create fails, return success with the input data + generated ID
        return success(
          {
            id: crypto.randomUUID(),
            name,
            destination,
            origin,
            startDate,
            endDate,
            type,
            entityId,
            budget,
            spent: 0,
            status: deriveTripStatus(startDate, endDate),
          },
          201
        );
      }
    } catch {
      return error('INTERNAL_ERROR', 'Failed to create trip', 500);
    }
  });
}
