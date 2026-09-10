import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope, withRole } from '@/shared/middleware/auth';
import {
  parseTaskFromText,
  resolveEntityReferences,
} from '@/modules/tasks/services/nlp-parser';

const ParseSchema = z.object({
  text: z.string().min(1),
  entityId: z.string().min(1).optional(),
});

/**
 * Parse free text into a task draft.
 *
 * The parse itself is pure text processing, but the route took an `entityId`
 * off the body and never used it -- and the resolution step that DOES touch the
 * database (matching a project name or an assignee name) was not wired up at
 * all. Both are scoped now: the caller's entity is verified, and name
 * resolution searches only inside it, so a project or teammate belonging to
 * another tenant cannot be discovered by guessing at names.
 */
export async function POST(request: NextRequest) {
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEntityScope(request, async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = ParseSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', parsed.error.message, 400);
        }

        const result = await parseTaskFromText(parsed.data.text);
        const references = await resolveEntityReferences(result, entityId);

        return success({ ...result, ...references });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to parse task';
        return error('PARSE_FAILED', message, 500);
      }
    })
  );
}
