import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import { NLPSchedulingService } from '@/modules/calendar/nlp.service';
import { SchedulingService } from '@/modules/calendar/scheduling.service';
import { naturalLanguageSchema } from '@/modules/calendar/calendar.validation';

const nlpService = new NLPSchedulingService();
const schedulingService = new SchedulingService();

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, session, entityId) => {
    try {
      const body = await req.json();
      const parsed = naturalLanguageSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid input', 400, {
          issues: parsed.error.issues,
        });
      }

      // The verified scope, not `parsed.data.entityId`.
      const input = {
        text: parsed.data.text,
        entityId,
        userId: session.userId,
      };

      const intent = await nlpService.parseScheduleRequest(input);

      // Resolve time hints
      const resolvedRanges = nlpService.resolveTimeHints(
        intent.timeHints,
        new Date(),
        'America/Chicago'
      );

      // Build a schedule request from parsed intent
      const suggestions = await schedulingService.findAvailableSlots(
        {
          title: intent.title,
          entityId,
          duration: intent.duration ?? 30,
          priority: intent.priority,
          type: intent.type,
          preferredTimeRanges: resolvedRanges.length > 0 ? resolvedRanges : undefined,
          location: intent.location,
        },
        session.userId
      );

      return success({ parsed: intent, suggestions });
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to process natural language request', 500);
    }
  });
}
