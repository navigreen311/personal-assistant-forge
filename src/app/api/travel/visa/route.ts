import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import * as visaService from '@/modules/travel/services/visa-checker-service';

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const { searchParams } = req.nextUrl;
      const citizenship = searchParams.get('citizenship');
      const destination = searchParams.get('destination');

      if (!citizenship || !destination) {
        return error('MISSING_PARAM', 'citizenship and destination are required', 400);
      }

      const requirement = await visaService.checkVisaRequirements(citizenship, destination);
      return success(requirement);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
