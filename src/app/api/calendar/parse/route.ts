import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import { NLPSchedulingService } from '@/modules/calendar/nlp.service';
import { naturalLanguageSchema } from '@/modules/calendar/calendar.validation';

const nlpService = new NLPSchedulingService();

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, session, entityId) => {
    try {
      const body = await req.json();
      const parsed = naturalLanguageSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid parse request', 400, {
          issues: parsed.error.issues,
        });
      }

      // `entityId` is the verified one, not `parsed.data.entityId`. It is the
      // WHERE clause of the contact search in `resolveParticipants` below, so
      // the unverified value meant "resolve these names against any tenant's
      // address book and hand back their contact ids".
      const input = {
        text: parsed.data.text,
        entityId,
        userId: session.userId,
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
        entityId
      );

      return success({
        intent,
        resolvedTimeRanges: resolvedRanges,
        resolvedParticipants,
      });
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to parse scheduling text', 500);
    }
  });
}
