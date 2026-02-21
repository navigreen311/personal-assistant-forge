import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { getNumber, releaseNumber } from '@/modules/voiceforge/services/number-manager';
import { withAuth } from '@/shared/middleware/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await params;
      const number = await getNumber(id);

      if (!number) {
        return error('NOT_FOUND', `Number ${id} not found`, 404);
      }

      return success(number);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await params;
      await releaseNumber(id);
      return success({ released: true });
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
