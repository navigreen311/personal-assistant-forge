// ============================================================================
// GET    /api/rules/:id - Read a policy rule
// PUT    /api/rules/:id - Update a policy rule
// DELETE /api/rules/:id - Deactivate a policy rule
// ============================================================================
//
// P-09 (T-001): none of the three had any scope, so another tenant's policy
// rules could be read, rewritten or switched off by id. Switching one off is
// the interesting verb: policy rules are what say "do not do that", and a rule
// that quietly stops applying looks exactly like a rule that is still there.
//
// `Rule.entityId` is nullable. A rule with no entity is a PLATFORM rule; it is
// readable, and deliberately NOT writable through this route -- one tenant
// editing a rule that binds everyone is the worst case in the file.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { getRuleById, updateRule, deleteRule } from '@/engines/policy/rule-crud';
import {
  withAuth,
  withEntityScope,
  type VerifiedEntityId,
} from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';

const UpdateRuleSchema = z.object({
  name: z.string().min(1).optional(),
  scope: z.enum(['GLOBAL', 'ENTITY', 'PROJECT', 'CONTACT', 'CHANNEL']).optional(),
  entityId: z.string().optional(),
  condition: z.record(z.string(), z.unknown()).optional(),
  action: z.record(z.string(), z.unknown()).optional(),
  precedence: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Resolve the rule's owner from the row and prove the caller is it.
 *
 * `allowPlatformRule` says what happens for a rule with `entityId = null`:
 * reads pass through with no entity in scope, writes are refused.
 */
async function withRuleScope(
  request: NextRequest,
  ruleId: string,
  options: { allowPlatformRule: boolean },
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId | null
  ) => Promise<Response>
): Promise<Response> {
  return withAuth(request, async (authedReq, session) => {
    const owner = await prisma.rule.findUnique({
      where: { id: ruleId },
      select: { entityId: true },
    });
    if (!owner) {
      return error('NOT_FOUND', `Rule ${ruleId} not found`, 404);
    }

    if (owner.entityId === null) {
      if (!options.allowPlatformRule) {
        return error(
          'FORBIDDEN',
          'This is a platform-wide rule and cannot be changed here',
          403
        );
      }
      return handler(authedReq, session, null);
    }

    return withEntityScope(
      authedReq,
      (req, innerSession, entityId) => handler(req, innerSession, entityId),
      owner.entityId
    );
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withRuleScope(request, id, { allowPlatformRule: true }, async () => {
    try {
      const rule = await getRuleById(id);

      if (!rule) {
        return error('NOT_FOUND', `Rule ${id} not found`, 404);
      }

      return success(rule);
    } catch (err) {
      return error('INTERNAL_ERROR', (err as Error).message, 500);
    }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withRuleScope(
    request,
    id,
    { allowPlatformRule: false },
    async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = UpdateRuleSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', 'Invalid request body', 400, {
            issues: parsed.error.issues,
          });
        }

        const existing = await getRuleById(id);
        if (!existing) {
          return error('NOT_FOUND', `Rule ${id} not found`, 404);
        }

        // The rule stays where it was proved to be. A caller cannot move a rule
        // into another tenant, or out of its own, by naming an entityId.
        const { entityId: _requested, ...updates } = parsed.data;
        const updated = await updateRule(id, {
          ...updates,
          entityId: entityId ?? undefined,
        });
        return success(updated);
      } catch (err) {
        return error('INTERNAL_ERROR', (err as Error).message, 500);
      }
    }
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withRuleScope(request, id, { allowPlatformRule: false }, async () => {
    try {
      const existing = await getRuleById(id);

      if (!existing) {
        return error('NOT_FOUND', `Rule ${id} not found`, 404);
      }

      await deleteRule(id);
      return success({ deleted: true });
    } catch (err) {
      return error('INTERNAL_ERROR', (err as Error).message, 500);
    }
  });
}
