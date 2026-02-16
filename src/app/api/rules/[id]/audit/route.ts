import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import { withAuth } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await params;

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const actionIds = actionLogs.map((l: any) => l.id as string);
      const receipts = await prisma.consentReceipt.findMany({
        where: { actionId: { in: actionIds } },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const receiptMap = new Map(receipts.map((r: any) => [r.actionId as string, r]));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const auditEntries = actionLogs.map((log: any) => ({
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
