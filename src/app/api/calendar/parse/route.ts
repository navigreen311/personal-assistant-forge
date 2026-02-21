import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { NLPSchedulingService } from '@/modules/calendar/nlp.service';
import { naturalLanguageSchema } from '@/modules/calendar/calendar.validation';

const nlpService = new NLPSchedulingService();

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = naturalLanguageSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid parse request', 400, {
          issues: parsed.error.issues,
        });
      }

      const input = {
        text: parsed.data.text,
        entityId: parsed.data.entityId,
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
        parsed.data.entityId
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
