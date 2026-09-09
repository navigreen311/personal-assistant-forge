// ============================================================================
// GET /api/rules/:id/audit - Where a policy rule has been applied
// ============================================================================
//
// P-09 (T-001): no scope. The rule's name and its whole application history --
// action logs and the consent receipts attached to them -- were readable by id.

import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import {
  withAuth,
  withEntityScope,
  type VerifiedEntityId,
} from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';

async function withRuleScope(
  request: NextRequest,
  ruleId: string,
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

    // A platform-wide rule has no owning entity; its audit trail is readable
    // by any authenticated user, the same as the rule itself.
    if (owner.entityId === null) {
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
  return withRuleScope(request, id, async () => {
    try {
      // Find the rule
      const rule = await prisma.rule.findUnique({ where: { id } });
      if (!rule) {
        return error('NOT_FOUND', `Rule ${id} not found`, 404);
      }

      // Find action logs where this rule was applied
      // Action logs reference rules through their reason or target fields
      const actionLogs = await prisma.actionLog.findMany({
        where: {
          OR: [
            { reason: { contains: id } },
            { target: { contains: id } },
          ],
        },
        orderBy: { timestamp: 'desc' },
        take: 50,
      });

      // Get associated consent receipts
      const actionIds = actionLogs.map((l) => l.id);
      const receipts = await prisma.consentReceipt.findMany({
        where: { actionId: { in: actionIds } },
      });

      const receiptMap = new Map(receipts.map((r) => [r.actionId, r]));

      const auditEntries = actionLogs.map((log) => ({
        actionId: log.id,
        timestamp: log.timestamp,
        actor: log.actor,
        actionType: log.actionType,
        target: log.target,
        reason: log.reason,
        status: log.status,
        consentReceipt: receiptMap.get(log.id) ?? null,
      }));

      return success({
        ruleId: id,
        ruleName: rule.name,
        auditEntries,
        totalEntries: auditEntries.length,
      });
    } catch (err) {
      return error('INTERNAL_ERROR', (err as Error).message, 500);
    }
  });
}
