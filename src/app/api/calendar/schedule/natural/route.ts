import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { NLPSchedulingService } from '@/modules/calendar/nlp.service';
import { SchedulingService } from '@/modules/calendar/scheduling.service';
import { naturalLanguageSchema } from '@/modules/calendar/calendar.validation';

const nlpService = new NLPSchedulingService();
const schedulingService = new SchedulingService();

function getCurrentUserId(): string {
  return 'stub-user-id';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = naturalLanguageSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid input', 400, {
        issues: parsed.error.issues,
      });
    }

    const userId = getCurrentUserId();
    const input = {
      text: parsed.data.text,
      entityId: parsed.data.entityId,
      userId,
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
        entityId: parsed.data.entityId,
        duration: intent.duration ?? 30,
        priority: intent.priority,
        type: intent.type,
        preferredTimeRanges: resolvedRanges.length > 0 ? resolvedRanges : undefined,
        location: intent.location,
      },
      userId
    );

    return success({ parsed: intent, suggestions });
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to process natural language request', 500);
  }
}
