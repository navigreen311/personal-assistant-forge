import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const call = await prisma.call.findUnique({ where: { id } });

    if (!call) {
      return error('NOT_FOUND', `Call ${id} not found`, 404);
    }

    return success(call);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
