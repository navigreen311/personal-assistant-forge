import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { calculateRelationshipScore } from '@/modules/communication/services/relationship-intelligence';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const score = await calculateRelationshipScore(id);
    return success({ contactId: id, score });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to calculate relationship score';
    if (message.includes('not found')) {
      return error('NOT_FOUND', message, 404);
    }
    return error('INTERNAL_ERROR', message, 500);
  }
}
