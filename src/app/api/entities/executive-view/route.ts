import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { EntityService, getCurrentUserId } from '@/modules/entities/entity.service';

const entityService = new EntityService();

export async function GET(request: NextRequest) {
  try {
    const userId = getCurrentUserId(request.headers);
    const executiveView = await entityService.getUnifiedExecutiveView(userId);
    return success(executiveView);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to get executive view', 500);
  }
}
