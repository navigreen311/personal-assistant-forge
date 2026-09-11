import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import {
  initiateOutboundCall,
  ScriptMismatchError,
  ScriptResolutionError,
} from '@/modules/voiceforge/services/outbound-agent';
import { withEntityScope, withRole } from '@/shared/middleware/auth';
import { withRateLimit } from '@/shared/middleware/rate-limit';

const OutboundCallSchema = z.object({
  entityId: z.string().min(1).optional(),
  contactId: z.string().min(1),
  personaId: z.string().min(1),
  scriptId: z.string().optional(),
  purpose: z.string().min(1),
  maxDuration: z.number().positive().optional(),
  recordCall: z.boolean().optional(),
  guardrails: z.object({
    maxCommitments: z.number().int().nonnegative(),
    forbiddenTopics: z.array(z.string()),
    escalationTriggers: z.array(z.string()),
    complianceProfile: z.array(z.string()),
    maxSilenceSeconds: z.number().positive(),
  }),
});

async function handlePOST(request: NextRequest) {
  return withRole(request, ['owner', 'admin'], () =>
    withEntityScope(request, async (req, session, entityId) => {
      try {
        const body = await req.json();
        const parsed = OutboundCallSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', 'Invalid request body', 400, {
            issues: parsed.error.issues,
          });
        }

        // entityId LAST: it overwrites whatever the caller asked for. userId comes
        // from the session, never the wire -- VAF integrations (sentiment
        // monitoring, voiceprint) look up per-user config with it.
        const { entityId: _requested, ...draft } = parsed.data;
        const result = await initiateOutboundCall({
          ...draft,
          userId: session.userId,
          entityId,
        });
        return success(result, 201);
      } catch (err) {
        // P-42 — a call naming a script this entity does not have is refused
        // here, before any Call row exists. 404 rather than 403 deliberately:
        // `getScript` is entity-scoped, so a foreign id and a nonexistent id
        // are the same answer, and saying "forbidden" would confirm that
        // another tenant's script exists.
        if (err instanceof ScriptResolutionError) {
          return error('SCRIPT_NOT_FOUND', err.message, 404);
        }
        if (err instanceof ScriptMismatchError) {
          return error('SCRIPT_MISMATCH', err.message, 409);
        }
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    })
  );
}

// ---------------------------------------------------------------------------
// P-18 / T-012 — rate limit: tier "send".
//
// The limiter sits OUTSIDE the auth wrappers, so a refused request never reaches
// the handler, the entity-ownership query, or the work itself. (On a user-keyed
// tier the limiter does decrypt the session token -- that is what makes the
// bucket unspoofable -- but nothing beyond that runs.) The tier, its budget and
// the reason for that budget live in RATE_LIMIT_POLICY in
// src/shared/middleware/rate-limit.ts; nothing about the limit is decided here,
// so no route can quietly hold a different number from the published table.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  return withRateLimit(request, 'send', handlePOST);
}
