import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope } from '@/shared/middleware/auth';
import * as flightMonitorService from '@/modules/travel/services/flight-monitor-service';
import { prisma } from '@/lib/db';

/**
 * Same `[id]` shape as ../route.ts, and duplicated on purpose: Next.js route
 * files may export only HTTP handlers, so this cannot be shared between the two
 * files. See the tenancy pattern, section 4 and trap 3d.
 *
 * The alerts themselves are read out of the itinerary's own stored metadata --
 * no airline is contacted. See flight-monitor-service.checkFlightStatus.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.calendarEvent.findFirst({
      where: { prepPacket: { path: ['itineraryId'], equals: id } },
      select: { entityId: true },
    });
    if (!owner) return error('NOT_FOUND', 'Itinerary not found', 404);

    return withEntityScope(
      authedReq,
      async (_req, _session, entityId) => {
        try {
          const alerts = await flightMonitorService.checkFlightStatus(entityId, id);
          return success(alerts);
        } catch (err) {
          return error(
            'INTERNAL_ERROR',
            err instanceof Error ? err.message : 'Unknown error',
            500
          );
        }
      },
      owner.entityId
    );
  });
}
