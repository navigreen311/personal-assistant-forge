import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { getVersions } from '@/modules/documents/services/versioning-service';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const versions = await getVersions(id);
    return success(versions);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
