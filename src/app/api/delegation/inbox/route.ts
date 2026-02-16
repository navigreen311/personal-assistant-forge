import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { getDailySuggestions } from '@/modules/delegation/services/delegation-inbox-service';

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) return error('VALIDATION_ERROR', 'userId is required', 400);

    const suggestions = await getDailySuggestions(userId);
    return success(suggestions);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
