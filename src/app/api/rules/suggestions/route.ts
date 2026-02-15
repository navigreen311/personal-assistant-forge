import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { detectCorrectionPattern } from '@/engines/policy/rule-suggestion';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const userId = searchParams.get('userId');

    if (!userId) {
      return error('VALIDATION_ERROR', 'userId query parameter is required', 400);
    }

    const lookbackDays = searchParams.has('lookbackDays')
      ? parseInt(searchParams.get('lookbackDays')!, 10)
      : undefined;

    const suggestions = await detectCorrectionPattern(userId, lookbackDays);
    return success(suggestions);
  } catch (err) {
    return error('INTERNAL_ERROR', (err as Error).message, 500);
  }
}
