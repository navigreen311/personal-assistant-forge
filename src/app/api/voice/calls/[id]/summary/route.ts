import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import { analyzeCall } from '@/modules/voiceforge/services/conversational-intel';

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

    // Parse transcript segments if available
    let segments = [];
    if (call.transcript) {
      try {
        segments = JSON.parse(call.transcript);
      } catch {
        segments = [];
      }
    }

    const analysis = await analyzeCall(call.id, segments);
    return success(analysis);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
