import { prisma } from '@/lib/db';
import { generateText } from '@/lib/ai';
import type { LLMCostDashboard } from '../types';

const DEFAULT_BUDGET_CAP = 500; // $500/month default

// --- Core cost dashboard (Phase 2, now uses UsageRecord) ---

export async function getCostDashboard(
  entityId: string,
  period: string
): Promise<LLMCostDashboard> {
  const { startDate, endDate } = parsePeriodRange(period);

  // Query UsageRecord for this entity
  const records = await prisma.usageRecord.findMany({
    where: {
      entityId,
      createdAt: { gte: startDate, lte: endDate },
    },
  });

  // Aggregate by module (feature)
  const featureMap = new Map<string, { cost: number; tokenCount: number }>();
  for (const rec of records) {
    const feature = rec.module;
    const existing = featureMap.get(feature) ?? { cost: 0, tokenCount: 0 };
    existing.cost += rec.cost;
    existing.tokenCount += rec.inputTokens + rec.outputTokens;
    featureMap.set(feature, existing);
  }

  const byFeature = Array.from(featureMap.entries()).map(
    ([feature, data]) => ({
      feature,
      cost: Math.round(data.cost * 100) / 100,
      tokenCount: data.tokenCount,
    })
  );

  const totalCostUsd =
    Math.round(byFeature.reduce((sum, f) => sum + f.cost, 0) * 100) / 100;

  // Calculate projected month-end spend
  const now = new Date();
  const daysElapsed = Math.max(
    1,
    (now.getTime() - startDate.getTime()) / 86400000
  );
  const dailyBurn = totalCostUsd / daysElapsed;
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0
  ).getDate();
  const projectedMonthEnd = Math.round(dailyBurn * daysInMonth * 100) / 100;

  const percentUsed =
    Math.round((totalCostUsd / DEFAULT_BUDGET_CAP) * 10000) / 100;

  const alerts = await getCostAlerts_internal(
    totalCostUsd,
    DEFAULT_BUDGET_CAP,
    projectedMonthEnd,
    byFeature
  );

  return {
    entityId,
    period,
    totalCostUsd,
    byFeature,
    budgetCapUsd: DEFAULT_BUDGET_CAP,
    percentUsed,
    projectedMonthEnd,
    alerts,
  };
}

export async function getCostAlerts(entityId: string): Promise<string[]> {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const dashboard = await getCostDashboard(entityId, period);
  return dashboard.alerts;
}

// --- Phase 3: UsageRecord aggregation functions ---

export async function getCostsByModule(
  entityId: string,
  dateRange?: { start: Date; end: Date }
): Promise<
  {
    module: string;
    totalCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    requestCount: number;
  }[]
> {
  const where: Record<string, unknown> = { entityId };
  if (dateRange) {
    where.createdAt = { gte: dateRange.start, lte: dateRange.end };
  }

  const records = await prisma.usageRecord.findMany({ where });

  const moduleMap = new Map<
    string,
    { cost: number; input: number; output: number; count: number }
  >();
  for (const rec of records) {
    const existing = moduleMap.get(rec.module) ?? {
      cost: 0,
      input: 0,
      output: 0,
      count: 0,
    };
    existing.cost += rec.cost;
    existing.input += rec.inputTokens;
    existing.output += rec.outputTokens;
    existing.count++;
    moduleMap.set(rec.module, existing);
  }

  return Array.from(moduleMap.entries()).map(([module, data]) => ({
    module,
    totalCost: Math.round(data.cost * 100) / 100,
    totalInputTokens: data.input,
    totalOutputTokens: data.output,
    requestCount: data.count,
  }));
}

export async function getCostsByModel(
  entityId: string,
  dateRange?: { start: Date; end: Date }
): Promise<
  {
    model: string;
    totalCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    requestCount: number;
  }[]
> {
  const where: Record<string, unknown> = { entityId };
  if (dateRange) {
    where.createdAt = { gte: dateRange.start, lte: dateRange.end };
  }

  const records = await prisma.usageRecord.findMany({ where });

  const modelMap = new Map<
    string,
    { cost: number; input: number; output: number; count: number }
  >();
  for (const rec of records) {
    const existing = modelMap.get(rec.model) ?? {
      cost: 0,
      input: 0,
      output: 0,
      count: 0,
    };
    existing.cost += rec.cost;
    existing.input += rec.inputTokens;
    existing.output += rec.outputTokens;
    existing.count++;
    modelMap.set(rec.model, existing);
  }

  return Array.from(modelMap.entries()).map(([model, data]) => ({
    model,
    totalCost: Math.round(data.cost * 100) / 100,
    totalInputTokens: data.input,
    totalOutputTokens: data.output,
    requestCount: data.count,
  }));
}

export async function getCostsByPeriod(
  entityId: string,
  period: 'day' | 'week' | 'month',
  dateRange?: { start: Date; end: Date }
): Promise<{ period: string; cost: number; tokens: number }[]> {
  const where: Record<string, unknown> = { entityId };
  if (dateRange) {
    where.createdAt = { gte: dateRange.start, lte: dateRange.end };
  }

  const records = await prisma.usageRecord.findMany({ where });

  const groups = new Map<string, { cost: number; tokens: number }>();
  for (const rec of records) {
    const d = new Date(rec.createdAt);
    let key: string;
    if (period === 'day') {
      key = d.toISOString().split('T')[0];
    } else if (period === 'week') {
      const weekStart = new Date(d);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      key = weekStart.toISOString().split('T')[0];
    } else {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    const existing = groups.get(key) ?? { cost: 0, tokens: 0 };
    existing.cost += rec.cost;
    existing.tokens += rec.inputTokens + rec.outputTokens;
    groups.set(key, existing);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([p, data]) => ({
      period: p,
      cost: Math.round(data.cost * 100) / 100,
      tokens: data.tokens,
    }));
}

export async function getTotalCost(
  entityId: string,
  dateRange?: { start: Date; end: Date }
): Promise<number> {
  const where: Record<string, unknown> = { entityId };
  if (dateRange) {
    where.createdAt = { gte: dateRange.start, lte: dateRange.end };
  }

  const result = await prisma.usageRecord.aggregate({
    where,
    _sum: { cost: true },
  });

  return Math.round((result._sum.cost ?? 0) * 100) / 100;
}

export async function getCostTrend(
  entityId: string,
  periods: number
): Promise<{ period: string; cost: number; changePercent: number }[]> {
  const now = new Date();
  const results: { period: string; cost: number; changePercent: number }[] = [];
  let previousCost = 0;

  for (let i = periods - 1; i >= 0; i--) {
    const end = new Date(now);
    end.setDate(end.getDate() - i * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);

    const cost = await getTotalCost(entityId, { start, end });
    const changePercent =
      previousCost > 0
        ? Math.round(((cost - previousCost) / previousCost) * 100)
        : 0;

    results.push({
      period: start.toISOString().split('T')[0],
      cost,
      changePercent,
    });
    previousCost = cost;
  }

  return results;
}

export async function getCostForecast(
  entityId: string,
  forecastDays: number
): Promise<{ forecastedCost: number; confidence: number; basedOnDays: number }> {
  // Get last 30 days of cost data for projection
  const basedOnDays = 30;
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - basedOnDays);

  const records = await prisma.usageRecord.findMany({
    where: {
      entityId,
      createdAt: { gte: start, lte: end },
    },
  });

  if (records.length === 0) {
    return { forecastedCost: 0, confidence: 0, basedOnDays: 0 };
  }

  const totalCost = records.reduce((sum: number, r: any) => sum + r.cost, 0);
  const actualDays = Math.max(
    1,
    (end.getTime() - start.getTime()) / 86400000
  );
  const dailyAvg = totalCost / actualDays;

  // Simple linear projection
  const forecastedCost = Math.round(dailyAvg * forecastDays * 100) / 100;

  // Confidence based on data density (more records = higher confidence)
  const confidence = Math.min(95, Math.round((records.length / basedOnDays) * 50 + 30));

  return {
    forecastedCost,
    confidence,
    basedOnDays: Math.round(actualDays),
  };
}

export async function getTokenUsageSummary(
  entityId: string,
  dateRange?: { start: Date; end: Date }
): Promise<{
  totalInputTokens: number;
  totalOutputTokens: number;
  avgTokensPerRequest: number;
  mostExpensiveModule: string;
}> {
  const where: Record<string, unknown> = { entityId };
  if (dateRange) {
    where.createdAt = { gte: dateRange.start, lte: dateRange.end };
  }

  const records = await prisma.usageRecord.findMany({ where });

  if (records.length === 0) {
    return {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      avgTokensPerRequest: 0,
      mostExpensiveModule: 'none',
    };
  }

  const totalInputTokens = records.reduce((s: number, r: any) => s + r.inputTokens, 0);
  const totalOutputTokens = records.reduce((s: number, r: any) => s + r.outputTokens, 0);
  const avgTokensPerRequest = Math.round(
    (totalInputTokens + totalOutputTokens) / records.length
  );

  // Find most expensive module
  const moduleCosts = new Map<string, number>();
  for (const rec of records) {
    moduleCosts.set(rec.module, (moduleCosts.get(rec.module) ?? 0) + rec.cost);
  }
  let mostExpensiveModule = 'none';
  let maxCost = 0;
  for (const [mod, cost] of moduleCosts) {
    if (cost > maxCost) {
      maxCost = cost;
      mostExpensiveModule = mod;
    }
  }

  return {
    totalInputTokens,
    totalOutputTokens,
    avgTokensPerRequest,
    mostExpensiveModule,
  };
}

// --- Internal helpers ---

async function getCostAlerts_internal(
  totalCost: number,
  budgetCap: number,
  projected: number,
  byFeature: { feature: string; cost: number; tokenCount: number }[]
): Promise<string[]> {
  const alerts: string[] = [];

  if (totalCost >= budgetCap) {
    alerts.push(`Budget exceeded: $${totalCost} spent of $${budgetCap} cap`);
  } else if (totalCost >= budgetCap * 0.8) {
    alerts.push(
      `Approaching budget limit: $${totalCost} of $${budgetCap} (${Math.round((totalCost / budgetCap) * 100)}%)`
    );
  }

  if (projected > budgetCap * 1.2) {
    alerts.push(
      `Projected month-end spend ($${projected}) exceeds budget by ${Math.round(((projected - budgetCap) / budgetCap) * 100)}%`
    );
  }

  // Flag features consuming > 40% of budget
  for (const feature of byFeature) {
    if (feature.cost > totalCost * 0.4 && totalCost > 0) {
      alerts.push(
        `Feature "${feature.feature}" consuming ${Math.round((feature.cost / totalCost) * 100)}% of total spend`
      );
    }
  }

  // Generate AI-powered cost optimization recommendations
  if (alerts.length > 0) {
    try {
      const recommendation = await generateText(
        `You are a cloud cost optimization advisor. Analyze these LLM cost alerts and provide a brief optimization recommendation.

Current spend: $${totalCost} of $${budgetCap} budget cap
Projected month-end: $${projected}
Feature breakdown: ${byFeature.map(f => `${f.feature}: $${f.cost}`).join(', ')}
Current alerts: ${alerts.join('; ')}

Provide one specific, actionable cost optimization recommendation in 1-2 sentences.`,
        { temperature: 0.5, maxTokens: 128 }
      );
      alerts.push(`Recommendation: ${recommendation}`);
    } catch {
      // Static alerts are sufficient if AI fails
    }
  }

  return alerts;
}

function parsePeriodRange(period: string): {
  startDate: Date;
  endDate: Date;
} {
  const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const year = parseInt(monthMatch[1]);
    const month = parseInt(monthMatch[2]) - 1;
    return {
      startDate: new Date(year, month, 1),
      endDate: new Date(year, month + 1, 0, 23, 59, 59, 999),
    };
  }

  // Default to current month
  const now = new Date();
  return {
    startDate: new Date(now.getFullYear(), now.getMonth(), 1),
    endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  };
}
