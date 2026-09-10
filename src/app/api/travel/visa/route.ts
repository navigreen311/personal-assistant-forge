import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import * as visaService from '@/modules/travel/services/visa-checker-service';

/**
 * Deliberately `withAuth` and not `withEntityScope`.
 *
 * This route reads nothing tenant-owned and writes nothing: the answer depends
 * only on a citizenship and a destination, both supplied by the caller, against
 * a built-in reference table. There is no entity to scope to, so introducing one
 * would be theatre. Discarding the session as `_session` is correct here -- the
 * only thing the session establishes is that the caller is signed in.
 *
 * Stated explicitly because "withAuth + `_session`" is the exact shape of the
 * bug the tenancy pass exists to close, and a reviewer should be able to see
 * that this instance is the intended one.
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (req) => {
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
