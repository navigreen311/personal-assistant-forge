// ============================================================================
// GET /api/finance/stats - Returns enhanced financial statistics
// ============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';

// --- Validation Schema ---

const querySchema = z.object({
  entityId: z.string().min(1).optional(),
  period: z.enum(['thisMonth', 'lastMonth', 'thisQuarter', 'thisYear']).optional(),
});

// --- Safe query wrappers ---

async function safeCount(queryFn: () => Promise<number>): Promise<number> {
  try {
    return await queryFn();
  } catch {
    return 0;
  }
}

async function safeAggregate<T>(queryFn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await queryFn();
  } catch {
    return fallback;
  }
}

// --- Date range helpers ---

function getDateRange(period?: string): { start: Date; end: Date } {
  const now = new Date();

  switch (period) {
    case 'lastMonth': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start, end };
    }
    case 'thisQuarter': {
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
      const start = new Date(now.getFullYear(), quarterMonth, 1);
      const end = now;
      return { start, end };
    }
    case 'thisYear': {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = now;
      return { start, end };
    }
    case 'thisMonth':
    default: {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = now;
      return { start, end };
    }
  }
}

// --- Default Stats ---

const DEFAULT_STATS = {
  totalIncome: 0,
  totalExpenses: 0,
  netCashFlow: 0,
  pendingAR: 0,
  overdueAP: 0,
  burnRate: 0,
  runway: 0,
  saasSpend: 0,
  taxReserve: 0,
};

// --- Handler ---

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { entityId, period } = parsed.data;

      // Verify entity ownership if entityId is provided
      if (entityId) {
        const entity = await prisma.entity.findUnique({
          where: { id: entityId },
        });

        if (!entity) {
          return error('NOT_FOUND', 'Entity not found', 404);
        }

        if (entity.userId !== session.userId) {
          return error('FORBIDDEN', 'You do not have access to this entity', 403);
        }
      }

      // Get all entity IDs for this user if no specific entityId
      let entityIds: string[] = [];
      if (entityId) {
        entityIds = [entityId];
      } else {
        try {
          const entities = await prisma.entity.findMany({
            where: { userId: session.userId },
            select: { id: true },
          });
          entityIds = entities.map((e) => e.id);
        } catch {
          return success(DEFAULT_STATS);
        }
      }

      if (entityIds.length === 0) {
        return success(DEFAULT_STATS);
      }

      const { start, end } = getDateRange(period);

      const entityFilter =
        entityIds.length === 1
          ? { entityId: entityIds[0] }
          : { entityId: { in: entityIds } };

      const dateFilter = {
        createdAt: { gte: start, lte: end },
      };

      // Run all queries in parallel
      const [
        incomeResult,
        expensesResult,
        pendingARResult,
        overdueAPResult,
        burnRateResult,
        saasSpendResult,
      ] = await Promise.all([
        // Total income: sum of income transactions in period
        safeAggregate(
          () =>
            (prisma as any).financialRecord.aggregate({
              where: {
                ...entityFilter,
                ...dateFilter,
                type: 'INCOME',
              },
              _sum: { amount: true },
            }),
          { _sum: { amount: null } }
        ),

        // Total expenses: sum of expense transactions in period
        safeAggregate(
          () =>
            (prisma as any).financialRecord.aggregate({
              where: {
                ...entityFilter,
                ...dateFilter,
                type: 'EXPENSE',
              },
              _sum: { amount: true },
            }),
          { _sum: { amount: null } }
        ),

        // Pending AR: sum of outstanding invoices (status SENT, VIEWED, or OVERDUE)
        safeAggregate(
          () =>
            (prisma as any).financialRecord.aggregate({
              where: {
                ...entityFilter,
                type: 'INVOICE',
                status: { in: ['SENT', 'VIEWED', 'OVERDUE', 'PENDING'] },
              },
              _sum: { amount: true },
            }),
          { _sum: { amount: null } }
        ),

        // Overdue AP: sum of overdue payables
        safeAggregate(
          () =>
            (prisma as any).financialRecord.aggregate({
              where: {
                ...entityFilter,
                type: { in: ['EXPENSE', 'PAYABLE'] },
                status: 'OVERDUE',
                dueDate: { lt: new Date() },
              },
              _sum: { amount: true },
            }),
          { _sum: { amount: null } }
        ),

        // Burn rate: average monthly operating expenses (last 3 months)
        (async (): Promise<number> => {
          try {
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

            const result = await (prisma as any).financialRecord.aggregate({
              where: {
                ...entityFilter,
                type: 'EXPENSE',
                createdAt: { gte: threeMonthsAgo },
              },
              _sum: { amount: true },
            });

            const totalExpenses3m = result._sum?.amount ?? 0;
            return Math.round((totalExpenses3m / 3) * 100) / 100;
          } catch {
            return 0;
          }
        })(),

        // SaaS spend: sum of recurring subscription costs in period
        (async (): Promise<number> => {
          try {
            const result = await (prisma as any).financialRecord.aggregate({
              where: {
                ...entityFilter,
                ...dateFilter,
                type: 'EXPENSE',
                category: { in: ['SUBSCRIPTION', 'SAAS', 'SOFTWARE'] },
              },
              _sum: { amount: true },
            });
            return result._sum?.amount ?? 0;
          } catch {
            return 0;
          }
        })(),
      ]);

      const totalIncome = incomeResult._sum?.amount ?? 0;
      const totalExpenses = expensesResult._sum?.amount ?? 0;
      const netCashFlow = totalIncome - totalExpenses;
      const pendingAR = pendingARResult._sum?.amount ?? 0;
      const overdueAP = overdueAPResult._sum?.amount ?? 0;
      const burnRate = burnRateResult;
      const runway = burnRate > 0 ? Math.round((netCashFlow / burnRate) * 100) / 100 : 0;
      const saasSpend = saasSpendResult;
      const taxReserve = netCashFlow > 0 ? Math.round(netCashFlow * 0.25 * 100) / 100 : 0;

      return success({
        totalIncome,
        totalExpenses,
        netCashFlow,
        pendingAR,
        overdueAP,
        burnRate,
        runway,
        saasSpend,
        taxReserve,
      });
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to fetch finance stats',
        500
      );
    }
  });
}
