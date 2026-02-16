import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { generateRedline } from '@/modules/documents/services/versioning-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const v1 = request.nextUrl.searchParams.get('v1');
    const v2 = request.nextUrl.searchParams.get('v2');

    if (!v1 || !v2) return error('VALIDATION_ERROR', 'v1 and v2 query params are required', 400);

    const redline = await generateRedline(id, parseInt(v1, 10), parseInt(v2, 10));
    return success(redline);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
