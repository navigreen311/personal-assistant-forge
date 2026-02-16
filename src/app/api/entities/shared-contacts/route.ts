import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { EntityService } from '@/modules/entities/entity.service';
import { withAuth } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';

const entityService = new EntityService();

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const sharedContacts = await entityService.findSharedContacts(session.userId);
      return success(sharedContacts);
    } catch (err) {
      return error('INTERNAL_ERROR', 'Failed to find shared contacts', 500);
    }
  });
}
