import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { SchedulingService } from '@/modules/calendar/scheduling.service';
import { z } from 'zod';

const schedulingService = new SchedulingService();

const availabilityQuerySchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  entityId: z.string().optional(),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const { searchParams } = new URL(req.url);
      const parsed = availabilityQuerySchema.safeParse({
        startDate: searchParams.get('startDate'),
        endDate: searchParams.get('endDate'),
        entityId: searchParams.get('entityId') || undefined,
      });

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid availability query', 400, {
          issues: parsed.error.issues,
        });
      }

      const events = await schedulingService.getEvents(
        session.userId,
        { start: parsed.data.startDate, end: parsed.data.endDate },
        parsed.data.entityId
      );

      // Build availability: find free slots between events during business hours (8am-6pm)
      const freeSlots: { start: Date; end: Date }[] = [];
      const dayMs = 24 * 60 * 60 * 1000;
      const startDay = new Date(parsed.data.startDate);
      startDay.setHours(0, 0, 0, 0);
      const endDay = new Date(parsed.data.endDate);
      endDay.setHours(23, 59, 59, 999);

      for (let d = new Date(startDay); d <= endDay; d = new Date(d.getTime() + dayMs)) {
        const dow = d.getDay();
        if (dow === 0 || dow === 6) continue; // skip weekends

        const dayStart = new Date(d);
        dayStart.setHours(8, 0, 0, 0);
        const dayEnd = new Date(d);
        dayEnd.setHours(18, 0, 0, 0);

        const dayEvents = events
          .filter((e) => {
            const eStart = new Date(e.startTime);
            const eEnd = new Date(e.endTime);
            return eStart < dayEnd && eEnd > dayStart;
          })
          .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

        let cursor = dayStart;
        for (const ev of dayEvents) {
          const evStart = new Date(ev.startTime) < dayStart ? dayStart : new Date(ev.startTime);
          if (cursor < evStart) {
            freeSlots.push({ start: new Date(cursor), end: new Date(evStart) });
          }
          const evEnd = new Date(ev.endTime);
          if (evEnd > cursor) cursor = evEnd;
        }
        if (cursor < dayEnd) {
          freeSlots.push({ start: new Date(cursor), end: new Date(dayEnd) });
        }
      }

      return success({
        totalEvents: events.length,
        freeSlots,
        busySlots: events.map((e) => ({
          start: e.startTime,
          end: e.endTime,
          title: e.title,
          eventId: e.id,
        })),
      });
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to fetch availability', 500);
    }
  });
}
