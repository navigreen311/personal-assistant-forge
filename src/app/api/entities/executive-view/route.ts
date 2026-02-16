import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { EntityService } from '@/modules/entities/entity.service';
import { withAuth } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';

const entityService = new EntityService();

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const executiveView = await entityService.getUnifiedExecutiveView(session.userId);
      return success(executiveView);
    } catch (err) {
      return error('INTERNAL_ERROR', 'Failed to get executive view', 500);
    }
  });
}
