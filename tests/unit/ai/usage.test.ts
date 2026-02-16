import {
  estimateCost,
  estimateTokens,
  createUsageRecord,
  UsageTracker,
} from '@/lib/ai/usage';

describe('Usage Tracking', () => {
  describe('estimateCost', () => {
    it('should calculate cost for claude-sonnet-4-5-20250929', () => {
      // 1000 input tokens at $3/million = $0.003
      // 500 output tokens at $15/million = $0.0075
      // Total = $0.0105
      const cost = estimateCost('claude-sonnet-4-5-20250929', 1000, 500);
      expect(cost).toBeCloseTo(0.0105, 6);
    });

    it('should calculate cost for claude-opus-4-20250514', () => {
      // 1000 input tokens at $15/million = $0.015
      // 500 output tokens at $75/million = $0.0375
      // Total = $0.0525
      const cost = estimateCost('claude-opus-4-20250514', 1000, 500);
      expect(cost).toBeCloseTo(0.0525, 6);
    });

    it('should use default pricing for unknown models', () => {
      // Falls back to Sonnet pricing
      const cost = estimateCost('unknown-model', 1000, 500);
      const sonnetCost = estimateCost('claude-sonnet-4-5-20250929', 1000, 500);
      expect(cost).toBe(sonnetCost);
    });

    it('should return 0 for 0 tokens', () => {
      const cost = estimateCost('claude-sonnet-4-5-20250929', 0, 0);
      expect(cost).toBe(0);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate ~1 token per 4 characters', () => {
      const text = 'abcdefghijklmnop'; // 16 chars => 4 tokens
      expect(estimateTokens(text)).toBe(4);
    });

    it('should return 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('should round up', () => {
      // 5 chars => ceil(5/4) = 2
      expect(estimateTokens('hello')).toBe(2);
    });
  });

  describe('createUsageRecord', () => {
    it('should create a record with all fields populated', () => {
      const record = createUsageRecord({
        model: 'claude-sonnet-4-5-20250929',
        inputTokens: 1000,
        outputTokens: 500,
        moduleId: 'inbox',
        templateId: 'triage-email',
        userId: 'user-1',
        entityId: 'entity-1',
        durationMs: 1500,
        success: true,
      });

      expect(record.id).toBeDefined();
      expect(record.timestamp).toBeInstanceOf(Date);
      expect(record.model).toBe('claude-sonnet-4-5-20250929');
      expect(record.inputTokens).toBe(1000);
      expect(record.outputTokens).toBe(500);
      expect(record.totalTokens).toBe(1500);
      expect(record.moduleId).toBe('inbox');
      expect(record.templateId).toBe('triage-email');
      expect(record.userId).toBe('user-1');
      expect(record.entityId).toBe('entity-1');
      expect(record.durationMs).toBe(1500);
      expect(record.success).toBe(true);
    });

    it('should calculate estimated cost', () => {
      const record = createUsageRecord({
        model: 'claude-sonnet-4-5-20250929',
        inputTokens: 1000,
        outputTokens: 500,
        moduleId: 'inbox',
        userId: 'user-1',
        durationMs: 1500,
        success: true,
      });

      expect(record.estimatedCostUsd).toBeCloseTo(0.0105, 6);
    });

    it('should generate a unique ID', () => {
      const record1 = createUsageRecord({
        model: 'claude-sonnet-4-5-20250929',
        inputTokens: 100,
        outputTokens: 50,
        moduleId: 'inbox',
        userId: 'user-1',
        durationMs: 500,
        success: true,
      });

      const record2 = createUsageRecord({
        model: 'claude-sonnet-4-5-20250929',
        inputTokens: 100,
        outputTokens: 50,
        moduleId: 'inbox',
        userId: 'user-1',
        durationMs: 500,
        success: true,
      });

      expect(record1.id).not.toBe(record2.id);
    });
  });

  describe('UsageTracker', () => {
    let tracker: UsageTracker;

    beforeEach(() => {
      tracker = new UsageTracker();
    });

    function makeRecord(overrides: Partial<{
      model: string;
      inputTokens: number;
      outputTokens: number;
      moduleId: string;
      userId: string;
      durationMs: number;
      success: boolean;
      timestamp: Date;
    }> = {}) {
      const record = createUsageRecord({
        model: overrides.model ?? 'claude-sonnet-4-5-20250929',
        inputTokens: overrides.inputTokens ?? 1000,
        outputTokens: overrides.outputTokens ?? 500,
        moduleId: overrides.moduleId ?? 'inbox',
        userId: overrides.userId ?? 'user-1',
        durationMs: overrides.durationMs ?? 1000,
        success: overrides.success ?? true,
      });
      if (overrides.timestamp) {
        record.timestamp = overrides.timestamp;
      }
      return record;
    }

    it('should record and retrieve usage records', () => {
      const record = makeRecord();
      tracker.record(record);

      const records = tracker.getRecords();
      expect(records).toHaveLength(1);
      expect(records[0].id).toBe(record.id);
    });

    it('should filter records by time range', () => {
      const jan = makeRecord({ timestamp: new Date('2025-01-15') });
      const feb = makeRecord({ timestamp: new Date('2025-02-15') });
      const mar = makeRecord({ timestamp: new Date('2025-03-15') });

      tracker.record(jan);
      tracker.record(feb);
      tracker.record(mar);

      const results = tracker.getRecordsByRange(
        new Date('2025-02-01'),
        new Date('2025-02-28'),
      );
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(feb.id);
    });

    it('should filter records by module', () => {
      const inboxRecord = makeRecord({ moduleId: 'inbox' });
      const calendarRecord = makeRecord({ moduleId: 'calendar' });

      tracker.record(inboxRecord);
      tracker.record(calendarRecord);

      const results = tracker.getRecordsByModule('inbox');
      expect(results).toHaveLength(1);
      expect(results[0].moduleId).toBe('inbox');
    });

    it('should filter records by user', () => {
      const user1Record = makeRecord({ userId: 'user-1' });
      const user2Record = makeRecord({ userId: 'user-2' });

      tracker.record(user1Record);
      tracker.record(user2Record);

      const results = tracker.getRecordsByUser('user-1');
      expect(results).toHaveLength(1);
      expect(results[0].userId).toBe('user-1');
    });

    describe('getSummary', () => {
      it('should calculate total tokens and cost', () => {
        tracker.record(makeRecord({ inputTokens: 1000, outputTokens: 500 }));
        tracker.record(makeRecord({ inputTokens: 2000, outputTokens: 1000 }));

        const summary = tracker.getSummary();
        expect(summary.totalCalls).toBe(2);
        expect(summary.totalInputTokens).toBe(3000);
        expect(summary.totalOutputTokens).toBe(1500);
        expect(summary.totalTokens).toBe(4500);
        expect(summary.totalCostUsd).toBeGreaterThan(0);
      });

      it('should calculate average latency', () => {
        tracker.record(makeRecord({ durationMs: 1000 }));
        tracker.record(makeRecord({ durationMs: 3000 }));

        const summary = tracker.getSummary();
        expect(summary.averageLatencyMs).toBe(2000);
      });

      it('should calculate success rate', () => {
        tracker.record(makeRecord({ success: true }));
        tracker.record(makeRecord({ success: true }));
        tracker.record(makeRecord({ success: false }));

        const summary = tracker.getSummary();
        // 2/3 ≈ 0.6667
        expect(summary.successRate).toBeCloseTo(0.6667, 3);
      });

      it('should break down by model', () => {
        tracker.record(makeRecord({ model: 'claude-sonnet-4-5-20250929' }));
        tracker.record(makeRecord({ model: 'claude-opus-4-20250514' }));
        tracker.record(makeRecord({ model: 'claude-sonnet-4-5-20250929' }));

        const summary = tracker.getSummary();
        expect(summary.byModel['claude-sonnet-4-5-20250929'].calls).toBe(2);
        expect(summary.byModel['claude-opus-4-20250514'].calls).toBe(1);
      });

      it('should break down by module', () => {
        tracker.record(makeRecord({ moduleId: 'inbox' }));
        tracker.record(makeRecord({ moduleId: 'calendar' }));
        tracker.record(makeRecord({ moduleId: 'inbox' }));

        const summary = tracker.getSummary();
        expect(summary.byModule['inbox'].calls).toBe(2);
        expect(summary.byModule['calendar'].calls).toBe(1);
      });

      it('should handle empty records', () => {
        const summary = tracker.getSummary();
        expect(summary.totalCalls).toBe(0);
        expect(summary.totalTokens).toBe(0);
        expect(summary.totalCostUsd).toBe(0);
        expect(summary.averageLatencyMs).toBe(0);
        expect(summary.successRate).toBe(0);
      });
    });

    describe('checkBudget', () => {
      it('should return within budget when usage is low', () => {
        tracker.record(makeRecord({ userId: 'user-1', inputTokens: 100, outputTokens: 50 }));

        const result = tracker.checkBudget('user-1', 10.0);
        expect(result.withinBudget).toBe(true);
        expect(result.usedUsd).toBeGreaterThan(0);
        expect(result.remainingUsd).toBeGreaterThan(0);
        expect(result.usedUsd + result.remainingUsd).toBeCloseTo(10.0, 2);
      });

      it('should return not within budget when limit exceeded', () => {
        // Create many records to exceed a tiny budget
        for (let i = 0; i < 100; i++) {
          tracker.record(makeRecord({ userId: 'user-1', inputTokens: 10000, outputTokens: 5000 }));
        }

        const result = tracker.checkBudget('user-1', 0.001);
        expect(result.withinBudget).toBe(false);
        expect(result.remainingUsd).toBe(0);
      });

      it('should only count records for the specified user', () => {
        tracker.record(makeRecord({ userId: 'user-1', inputTokens: 10000, outputTokens: 5000 }));
        tracker.record(makeRecord({ userId: 'user-2', inputTokens: 10000, outputTokens: 5000 }));

        const result = tracker.checkBudget('user-1', 100);
        // Should only count user-1's records
        const user1Cost = estimateCost('claude-sonnet-4-5-20250929', 10000, 5000);
        expect(result.usedUsd).toBeCloseTo(user1Cost, 4);
      });
    });

    it('should clear all records', () => {
      tracker.record(makeRecord());
      tracker.record(makeRecord());
      expect(tracker.getRecords()).toHaveLength(2);

      tracker.clear();
      expect(tracker.getRecords()).toHaveLength(0);
    });
  });
});
