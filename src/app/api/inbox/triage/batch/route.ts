import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope, withRole } from '@/shared/middleware/auth';

import { TriageService } from '@/modules/inbox';
import { batchTriageSchema } from '@/modules/inbox/inbox.validation';
import { withRateLimit } from '@/shared/middleware/rate-limit';

const triageService = new TriageService();

async function handlePOST(request: NextRequest) {
  return withRole(request, ['owner', 'admin'], () =>
    withEntityScope(request, async (req, _session, entityId) => {
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
    })
  );
}

// ---------------------------------------------------------------------------
// P-18 / T-012 — rate limit: tier "bulk".
//
// The limiter sits OUTSIDE the auth wrappers so a flood is refused before it
// costs a JWT decrypt and a database round trip. The tier, its budget and the
// reason for that budget are in RATE_LIMIT_POLICY in
// src/shared/middleware/rate-limit.ts; nothing about the limit is decided here,
// so no route can quietly hold a different number from the published table.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  return withRateLimit(request, 'bulk', handlePOST);
}
