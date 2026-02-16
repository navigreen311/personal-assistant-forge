import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { releaseNumber } from '@/modules/voiceforge/services/number-manager';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await releaseNumber(id);
    return success({ released: true });
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
