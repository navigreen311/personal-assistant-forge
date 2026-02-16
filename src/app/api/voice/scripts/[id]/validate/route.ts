import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { getScript, validateScript } from '@/modules/voiceforge/services/script-engine';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const script = await getScript(id);

    if (!script) {
      return error('NOT_FOUND', `Script ${id} not found`, 404);
    }

    const validation = validateScript(script);
    return success(validation);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
