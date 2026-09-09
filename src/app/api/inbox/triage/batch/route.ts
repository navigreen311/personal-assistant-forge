import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';

import { TriageService } from '@/modules/inbox';
import { batchTriageSchema } from '@/modules/inbox/inbox.validation';

const triageService = new TriageService();

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const body = await req.json();
      const parsed = batchTriageSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid batch triage request', 400, {
          issues: parsed.error.issues,
        });
      }

      // A bulk route: `messageIds` is caller-supplied and stays that way.
      // Each id is scoped individually inside batchTriage, so foreign ids are
      // skipped and report as not processed rather than triaged.
      const { entityId: _requested, ...request_ } = parsed.data;

      const result = await triageService.batchTriage(request_, entityId);
      return success(result, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
