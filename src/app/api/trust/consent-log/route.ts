import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import { withAuth } from '@/shared/middleware/auth';

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const { searchParams } = req.nextUrl;
      const module = searchParams.get('module');
      const actionType = searchParams.get('actionType');
      const dateRange = searchParams.get('dateRange');

      // Build date filter
      let dateFilter: Date | undefined;
      const now = new Date();
      if (dateRange === 'today') {
        dateFilter = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (dateRange === 'week') {
        dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (dateRange === 'month') {
        dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      // Build ActionLog where clause
      const actionLogWhere: Record<string, unknown> = {
        actorId: session.userId,
      };

      if (module && module !== 'All') {
        actionLogWhere.target = { contains: module, mode: 'insensitive' };
      }

      if (actionType && actionType !== 'All') {
        actionLogWhere.actionType = { contains: actionType, mode: 'insensitive' };
      }

      if (dateFilter) {
        actionLogWhere.timestamp = { gte: dateFilter };
      }

      // Get action logs for this user with filters
      const actionLogs = await prisma.actionLog.findMany({
        where: actionLogWhere,
        orderBy: { timestamp: 'desc' },
        take: 200,
      });

      const actionIds = actionLogs.map((a) => a.id);

      // Get consent receipts for these action logs
      const receipts = await prisma.consentReceipt.findMany({
        where: {
          actionId: { in: actionIds },
          ...(dateFilter ? { timestamp: { gte: dateFilter } } : {}),
        },
        orderBy: { timestamp: 'desc' },
      });

      // Build a map of actionLog by id for enrichment
      const actionLogMap = new Map(
        actionLogs.map((al) => [al.id, al])
      );

      // Enrich receipts with action log data
      const enrichedReceipts = receipts.map((r) => {
        const actionLog = actionLogMap.get(r.actionId);
        return {
          id: r.id,
          actionId: r.actionId,
          description: r.description,
          reason: r.reason,
          impacted: r.impacted,
          reversible: r.reversible,
          rollbackLink: r.rollbackLink,
          confidence: r.confidence,
          timestamp: r.timestamp,
          // Enriched fields from ActionLog
          module: actionLog?.target ?? 'Unknown',
          actionType: actionLog?.actionType ?? 'Unknown',
          actor: actionLog?.actor ?? 'Unknown',
          status: actionLog?.status ?? 'PENDING',
          cost: actionLog?.cost ?? 0,
          blastRadius: actionLog?.blastRadius ?? 'LOW',
        };
      });

      // Compute aggregate stats
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayReceipts = enrichedReceipts.filter(
        (r) => new Date(r.timestamp) >= todayStart
      );
      const autoCount = todayReceipts.filter(
        (r) => r.actor === 'AI' || r.actor === 'SYSTEM'
      ).length;
      const approvedCount = todayReceipts.filter(
        (r) => r.status === 'EXECUTED'
      ).length;
      const totalCost = todayReceipts.reduce(
        (sum, r) => sum + (r.cost ?? 0),
        0
      );

      return success({
        receipts: enrichedReceipts,
        stats: {
          actionsToday: todayReceipts.length,
          autoCount,
          autoPercent: todayReceipts.length > 0
            ? Math.round((autoCount / todayReceipts.length) * 100)
            : 0,
          approvedCount,
          approvedPercent: todayReceipts.length > 0
            ? Math.round((approvedCount / todayReceipts.length) * 100)
            : 0,
          totalCost: Math.round(totalCost * 100) / 100,
        },
      });
    } catch (err) {
      return error('INTERNAL_ERROR', (err as Error).message, 500);
    }
  });
}
