import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { NLPSchedulingService } from '@/modules/calendar/nlp.service';
import { naturalLanguageSchema } from '@/modules/calendar/calendar.validation';

const nlpService = new NLPSchedulingService();

function getCurrentUserId(): string {
  // Stub for auth — replace when Worker 02 delivers auth module
  return 'stub-user-id';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = naturalLanguageSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid parse request', 400, {
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

    // Resolve time hints to actual date ranges
    const resolvedRanges = nlpService.resolveTimeHints(
      intent.timeHints,
      new Date(),
      'UTC'
    );

    // Resolve participant names to contacts
    const resolvedParticipants = await nlpService.resolveParticipants(
      intent.participantNames,
      parsed.data.entityId
    );

    return success({
      intent,
      resolvedTimeRanges: resolvedRanges,
      resolvedParticipants,
    });
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to parse scheduling text', 500);
  }
}
