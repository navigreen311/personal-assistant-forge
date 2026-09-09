import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { listNumbers } from '@/modules/voiceforge/services/number-manager';
import { withEntityScope } from '@/shared/middleware/auth';

/**
 * Single-entity list (section 5b). A number inventory is per-entity -- it is
 * what the entity is billed for -- so withEntityScope is correct and nothing
 * silently narrows: the route previously 400ed without an explicit entityId.
 */
export async function GET(request: NextRequest) {
  return withEntityScope(request, async (_req, _session, entityId) => {
    try {
      const numbers = await listNumbers(entityId);
      return success(numbers);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
