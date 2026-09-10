/**
 * Calendar collection routes.
 *
 * A NOTE ON `_session`. The anti-pattern the audit found is
 *
 *     withAuth(request, async (req, _session) => { ...body.entityId... })
 *
 * -- authenticate, discard the session, then let the caller name the tenant.
 * What you see below is
 *
 *     withEntityScope(request, async (req, session, entityId) => ...)
 *
 * which is the opposite: the session was consumed by the middleware to PROVE
 * ownership, and `entityId` is its verified result.
 *
 * BEHAVIOUR NOTE. `GET /api/calendar` used to answer across every entity the
 * caller owned when `?entityId=` was omitted, because
 * `SchedulingService.getEvents` fell back to "all my entities". It also
 * answered across ANY entity that was named, owned or not -- the same code path
 * and the same ternary. `withEntityScope` has no "all my entities" mode, so an
 * omitted `entityId` now resolves to the session's active entity. Cross-entity
 * CONFLICT detection is unaffected: `detectConflicts` reads
 * `getAllUserEvents(userId)`, which was already scoped by ownership.
 */
import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope, withRole } from '@/shared/middleware/auth';
import { SchedulingService } from '@/modules/calendar/scheduling.service';
import { calendarViewSchema, scheduleRequestSchema } from '@/modules/calendar/calendar.validation';

const schedulingService = new SchedulingService();

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, session, entityId) => {
    try {
      const { searchParams } = req.nextUrl;
      // `entityId` is deliberately NOT read off the query string here: the
      // verified one below is the only scope this handler may use.
      const parsed = calendarViewSchema.safeParse({
        viewMode: searchParams.get('viewMode') ?? 'week',
        date: searchParams.get('date') ?? new Date().toISOString(),
      });

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid query parameters', 400, {
          issues: parsed.error.issues,
        });
      }

      const data = await schedulingService.getCalendarViewData(
        session.userId,
        parsed.data.viewMode,
        parsed.data.date,
        entityId
      );

      return success(data);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to fetch calendar data', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEntityScope(request, async (req, session, entityId) => {
      try {
        const body = await req.json();
        const { selectedSlot, ...scheduleData } = body;

        const parsed = scheduleRequestSchema.safeParse(scheduleData);
        if (!parsed.success) {
          return error('VALIDATION_ERROR', 'Invalid schedule request', 400, {
            issues: parsed.error.issues,
          });
        }

        if (!selectedSlot?.start || !selectedSlot?.end) {
          return error('VALIDATION_ERROR', 'selectedSlot with start and end is required', 400);
        }

        // `entityId` is spread LAST and deliberately. `parsed.data.entityId` is a
        // plain string off the wire; `entityId` is the VerifiedEntityId
        // withEntityScope proved the caller owns. Put them the other way round
        // and createEvent stops compiling -- which is the whole point.
        const { entityId: _requested, ...draft } = parsed.data;

        const event = await schedulingService.createEvent(
          { ...draft, entityId },
          { start: new Date(selectedSlot.start), end: new Date(selectedSlot.end) },
          session.userId
        );

        return success(event, 201);
      } catch (_err) {
        return error('INTERNAL_ERROR', 'Failed to create event', 500);
      }
    })
  );
}
