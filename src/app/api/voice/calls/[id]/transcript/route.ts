import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import { withAuth } from '@/shared/middleware/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await params;
      const call = await prisma.call.findUnique({
        where: { id },
        select: { id: true, transcript: true },
      });

      if (!call) {
        return error('NOT_FOUND', `Call ${id} not found`, 404);
      }

      return success({
        callId: call.id,
        transcript: call.transcript ?? null,
      });
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
