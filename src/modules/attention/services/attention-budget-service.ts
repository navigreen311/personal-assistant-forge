import { prisma } from '@/lib/db';
import type { AttentionBudget } from '../types';

function getDefaultResetAt(): Date {
  const resetAt = new Date();
  resetAt.setHours(24, 0, 0, 0);
  return resetAt;
}

function getTodayStart(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function toAttentionBudget(record: {
  userId: string;
  totalMinutes: number;
  consumedMinutes: number;
  resetAt: Date;
}): AttentionBudget {
  return {
    userId: record.userId,
    dailyBudget: record.totalMinutes,
    usedToday: record.consumedMinutes,
    remaining: record.totalMinutes - record.consumedMinutes,
    resetAt: record.resetAt,
  };
}

async function getOrCreateRecord(userId: string) {
  const today = getTodayStart();

  let record = await prisma.attentionBudget.findUnique({
    where: { userId_date: { userId, date: today } },
  });

  if (!record) {
    record = await prisma.attentionBudget.create({
      data: {
        userId,
        date: today,
        totalMinutes: 10,
        consumedMinutes: 0,
        resetAt: getDefaultResetAt(),
      },
    });
  }

  // Check if budget needs reset (past resetAt time)
  if (new Date() >= record.resetAt) {
    record = await prisma.attentionBudget.update({
      where: { id: record.id },
      data: {
        consumedMinutes: 0,
        resetAt: getDefaultResetAt(),
      },
    });
  }

  return record;
}

export async function getBudget(userId: string): Promise<AttentionBudget> {
  const record = await getOrCreateRecord(userId);
  return toAttentionBudget(record);
}

export async function consumeBudget(
  userId: string,
  amount = 1
): Promise<{ allowed: boolean; budget: AttentionBudget }> {
  const record = await getOrCreateRecord(userId);
  const remaining = record.totalMinutes - record.consumedMinutes;

  if (remaining < amount) {
    return { allowed: false, budget: toAttentionBudget(record) };
  }

  const updated = await prisma.attentionBudget.update({
    where: { id: record.id },
    data: { consumedMinutes: record.consumedMinutes + amount },
  });

  return { allowed: true, budget: toAttentionBudget(updated) };
}

export async function setBudget(userId: string, dailyBudget: number): Promise<AttentionBudget> {
  const record = await getOrCreateRecord(userId);

  const updated = await prisma.attentionBudget.update({
    where: { id: record.id },
    data: {
      totalMinutes: dailyBudget,
    },
  });

  return toAttentionBudget(updated);
}

export async function resetBudget(userId: string): Promise<AttentionBudget> {
  const record = await getOrCreateRecord(userId);

  const updated = await prisma.attentionBudget.update({
    where: { id: record.id },
    data: {
      consumedMinutes: 0,
      resetAt: getDefaultResetAt(),
    },
  });

  return toAttentionBudget(updated);
}

export async function deductBudget(
  userId: string,
  amount: number,
  reason: string
): Promise<{ allowed: boolean; overBudget: boolean; budget: AttentionBudget }> {
  const record = await getOrCreateRecord(userId);
  const overBudget = record.totalMinutes - record.consumedMinutes <= 0;

  const updated = await prisma.attentionBudget.update({
    where: { id: record.id },
    data: { consumedMinutes: record.consumedMinutes + amount },
  });

  // Log deduction
  try {
    await prisma.actionLog.create({
      data: {
        actor: userId,
        actorId: userId,
        actionType: 'BUDGET_DEDUCTION',
        target: userId,
        reason: `${reason} (amount: ${amount})`,
        blastRadius: 'LOW',
        reversible: false,
        status: overBudget ? 'OVER_BUDGET' : 'COMPLETED',
      },
    });
  } catch {
    // Best-effort logging
  }

  return {
    allowed: !overBudget,
    overBudget,
    budget: toAttentionBudget(updated),
  };
}

export async function setBudgetLimit(userId: string, dailyLimit: number): Promise<AttentionBudget> {
  return setBudget(userId, dailyLimit);
}

export async function getBudgetHistory(
  userId: string,
  days: number
): Promise<Array<{ reason: string; timestamp: Date; status: string }>> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  try {
    const logs = await prisma.actionLog.findMany({
      where: {
        actorId: userId,
        actionType: 'BUDGET_DEDUCTION',
        timestamp: { gte: since },
      },
      orderBy: { timestamp: 'desc' },
    });

    return logs.map((log: { reason: string; timestamp: Date; status: string }) => ({
      reason: log.reason,
      timestamp: log.timestamp,
      status: log.status,
    }));
  } catch {
    return [];
  }
}

export async function isLowBudget(
  userId: string,
  threshold = 0.2
): Promise<{ isLow: boolean; remaining: number }> {
  const budget = await getBudget(userId);
  const ratio = budget.dailyBudget > 0 ? budget.remaining / budget.dailyBudget : 0;
  return {
    isLow: ratio <= threshold,
    remaining: budget.remaining,
  };
}
