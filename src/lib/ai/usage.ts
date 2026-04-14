// ============================================================================
// Usage Tracking
// Token usage tracking, cost estimation, and budget monitoring for AI API calls.
// NOTE: Production use should persist records to database (ActionLog table or
// dedicated analytics). Monetary values use `number` type here — production
// should use integer cents to avoid floating-point precision issues.
// ============================================================================

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4-6': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-haiku-3-5-20241022': { inputPerMillion: 0.8, outputPerMillion: 4 },
  'claude-opus-4-20250514': { inputPerMillion: 15, outputPerMillion: 75 },
};

// Default pricing used when a model is not found in the registry
const DEFAULT_PRICING: ModelPricing = MODEL_PRICING['claude-sonnet-4-6'];

export interface UsageRecord {
  id: string;
  timestamp: Date;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  moduleId: string;
  templateId?: string;
  userId: string;
  entityId?: string;
  durationMs: number;
  success: boolean;
  errorType?: string;
}

export interface UsageSummary {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  averageLatencyMs: number;
  successRate: number;
  byModel: Record<string, { calls: number; tokens: number; costUsd: number }>;
  byModule: Record<string, { calls: number; tokens: number; costUsd: number }>;
}

// ---------------------------------------------------------------------------
// Cost Estimation
// ---------------------------------------------------------------------------

/**
 * Estimate cost in USD for a given model and token usage.
 * Returns cost rounded to 6 decimal places.
 * Falls back to Claude Sonnet pricing for unknown models.
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
  return Number((inputCost + outputCost).toFixed(6));
}

/**
 * Estimate token count from text (rough approximation).
 * Approximately 4 characters per token for English text.
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Record Creation
// ---------------------------------------------------------------------------

let recordCounter = 0;

/**
 * Create a usage record from API call parameters.
 * Generates a unique ID and calculates estimated cost.
 */
export function createUsageRecord(params: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  moduleId: string;
  templateId?: string;
  userId: string;
  entityId?: string;
  durationMs: number;
  success: boolean;
  errorType?: string;
}): UsageRecord {
  recordCounter++;
  const id = `usage-${Date.now()}-${recordCounter}`;
  const totalTokens = params.inputTokens + params.outputTokens;
  const cost = estimateCost(params.model, params.inputTokens, params.outputTokens);

  return {
    id,
    timestamp: new Date(),
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    totalTokens,
    estimatedCostUsd: cost,
    moduleId: params.moduleId,
    templateId: params.templateId,
    userId: params.userId,
    entityId: params.entityId,
    durationMs: params.durationMs,
    success: params.success,
    errorType: params.errorType,
  };
}

// ---------------------------------------------------------------------------
// Usage Tracker
// ---------------------------------------------------------------------------

/**
 * In-memory usage tracker for the current process.
 * Production use should persist to database (ActionLog table or dedicated analytics).
 */
export class UsageTracker {
  private records: UsageRecord[] = [];

  /** Record a new usage entry. */
  record(record: UsageRecord): void {
    this.records.push(record);
  }

  /** Get all records. */
  getRecords(): UsageRecord[] {
    return [...this.records];
  }

  /** Get records filtered by time range. */
  getRecordsByRange(start: Date, end: Date): UsageRecord[] {
    return this.records.filter(
      (r) => r.timestamp >= start && r.timestamp <= end,
    );
  }

  /** Get records filtered by module. */
  getRecordsByModule(moduleId: string): UsageRecord[] {
    return this.records.filter((r) => r.moduleId === moduleId);
  }

  /** Get records filtered by user. */
  getRecordsByUser(userId: string): UsageRecord[] {
    return this.records.filter((r) => r.userId === userId);
  }

  /** Generate an aggregated summary. */
  getSummary(records?: UsageRecord[]): UsageSummary {
    const data = records ?? this.records;

    if (data.length === 0) {
      return {
        totalCalls: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        totalCostUsd: 0,
        averageLatencyMs: 0,
        successRate: 0,
        byModel: {},
        byModule: {},
      };
    }

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCostUsd = 0;
    let totalLatencyMs = 0;
    let successCount = 0;

    const byModel: Record<string, { calls: number; tokens: number; costUsd: number }> = {};
    const byModule: Record<string, { calls: number; tokens: number; costUsd: number }> = {};

    for (const record of data) {
      totalInputTokens += record.inputTokens;
      totalOutputTokens += record.outputTokens;
      totalCostUsd += record.estimatedCostUsd;
      totalLatencyMs += record.durationMs;
      if (record.success) successCount++;

      // Aggregate by model
      if (!byModel[record.model]) {
        byModel[record.model] = { calls: 0, tokens: 0, costUsd: 0 };
      }
      byModel[record.model].calls++;
      byModel[record.model].tokens += record.totalTokens;
      byModel[record.model].costUsd += record.estimatedCostUsd;

      // Aggregate by module
      if (!byModule[record.moduleId]) {
        byModule[record.moduleId] = { calls: 0, tokens: 0, costUsd: 0 };
      }
      byModule[record.moduleId].calls++;
      byModule[record.moduleId].tokens += record.totalTokens;
      byModule[record.moduleId].costUsd += record.estimatedCostUsd;
    }

    return {
      totalCalls: data.length,
      totalInputTokens,
      totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      totalCostUsd: Number(totalCostUsd.toFixed(6)),
      averageLatencyMs: Math.round(totalLatencyMs / data.length),
      successRate: Number((successCount / data.length).toFixed(4)),
      byModel,
      byModule,
    };
  }

  /** Get the total cost for a time period. */
  getCostForPeriod(start: Date, end: Date): number {
    const records = this.getRecordsByRange(start, end);
    return Number(
      records.reduce((sum, r) => sum + r.estimatedCostUsd, 0).toFixed(6),
    );
  }

  /** Check if a user is approaching a budget limit. */
  checkBudget(
    userId: string,
    budgetUsd: number,
  ): { withinBudget: boolean; usedUsd: number; remainingUsd: number } {
    const userRecords = this.getRecordsByUser(userId);
    const usedUsd = Number(
      userRecords.reduce((sum, r) => sum + r.estimatedCostUsd, 0).toFixed(6),
    );
    const remainingUsd = Number(Math.max(0, budgetUsd - usedUsd).toFixed(6));

    return {
      withinBudget: usedUsd <= budgetUsd,
      usedUsd,
      remainingUsd,
    };
  }

  /** Clear all records (for testing). */
  clear(): void {
    this.records = [];
  }
}

/** Singleton instance. */
export const usageTracker = new UsageTracker();
