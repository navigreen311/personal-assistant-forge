import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { EntityService, getCurrentUserId } from '@/modules/entities/entity.service';

const entityService = new EntityService();

export async function GET(request: NextRequest) {
  try {
    const userId = getCurrentUserId(request.headers);
    const sharedContacts = await entityService.findSharedContacts(userId);
    return success(sharedContacts);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to find shared contacts', 500);
  }
}
