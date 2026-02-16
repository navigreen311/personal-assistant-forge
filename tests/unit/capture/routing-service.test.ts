// Mock AI client — must be before imports
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn().mockRejectedValue(new Error('AI unavailable in test')),
}));

import { RoutingService } from '@/modules/capture/services/routing-service';
import type { CaptureItem } from '@/modules/capture/types';

function makeCaptureItem(overrides: Partial<CaptureItem> = {}): CaptureItem {
  return {
    id: 'test-id',
    userId: 'user-1',
    source: 'MANUAL',
    contentType: 'TEXT',
    rawContent: 'Test content',
    metadata: {},
    status: 'PENDING',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('RoutingService', () => {
  let service: RoutingService;

  beforeEach(() => {
    service = new RoutingService();
  });

  describe('routeCapture', () => {
    it('should apply rules in priority order', async () => {
      // The default rules should be ordered by priority
      const rules = service.getRoutingRules();
      for (let i = 1; i < rules.length; i++) {
        expect(rules[i - 1].priority).toBeGreaterThanOrEqual(rules[i].priority);
      }
    });

    it('should return first matching rule result', async () => {
      const capture = makeCaptureItem({
        source: 'EMAIL_FORWARD',
        rawContent: 'Please find the invoice attached',
      });

      const result = await service.routeCapture(capture);
      expect(result.targetType).toBe('EXPENSE');
      expect(result.appliedRules.length).toBe(1);
    });

    it('should route email forwards with invoice keywords to EXPENSE', async () => {
      const capture = makeCaptureItem({
        source: 'EMAIL_FORWARD',
        rawContent: 'Here is your receipt for $50',
      });

      const result = await service.routeCapture(capture);
      expect(result.targetType).toBe('EXPENSE');
    });

    it('should route camera scans of business cards to CONTACT', async () => {
      const capture = makeCaptureItem({
        source: 'CAMERA_SCAN',
        contentType: 'BUSINESS_CARD',
        rawContent: 'John Smith - CEO',
      });

      const result = await service.routeCapture(capture);
      expect(result.targetType).toBe('CONTACT');
    });

    it('should route content with action verbs to TASK', async () => {
      const capture = makeCaptureItem({
        rawContent: 'I need to follow up with the vendor by Friday',
      });

      const result = await service.routeCapture(capture);
      expect(result.targetType).toBe('TASK');
    });

    it('should handle no matching rules gracefully', async () => {
      // Clear all rules first
      service.clearRules();

      const capture = makeCaptureItem({
        rawContent: 'Some random content with no pattern matches',
      });

      const result = await service.routeCapture(capture);
      expect(result.targetType).toBe('NOTE');
      expect(result.confidence).toBeLessThan(0.5);
      expect(result.appliedRules).toEqual([]);
    });
  });

  describe('evaluateConditions', () => {
    it('should match equals conditions', () => {
      const capture = makeCaptureItem({ source: 'VOICE' });
      const result = service.evaluateConditions(capture, [
        { field: 'source', operator: 'equals', value: 'VOICE' },
      ]);
      expect(result).toBe(true);
    });

    it('should match contains conditions', () => {
      const capture = makeCaptureItem({ rawContent: 'Please pay this invoice' });
      const result = service.evaluateConditions(capture, [
        { field: 'keyword', operator: 'contains', value: 'invoice' },
      ]);
      expect(result).toBe(true);
    });

    it('should match regex patterns', () => {
      const capture = makeCaptureItem({ rawContent: 'Total: $123.45' });
      const result = service.evaluateConditions(capture, [
        { field: 'content', operator: 'matches', value: '\\$\\d+\\.\\d{2}' },
      ]);
      expect(result).toBe(true);
    });

    it('should require all conditions to match (AND logic)', () => {
      const capture = makeCaptureItem({
        source: 'EMAIL_FORWARD',
        rawContent: 'No matching keywords here',
      });

      const result = service.evaluateConditions(capture, [
        { field: 'source', operator: 'equals', value: 'EMAIL_FORWARD' },
        { field: 'keyword', operator: 'contains', value: 'invoice' },
      ]);
      expect(result).toBe(false);
    });
  });

  describe('addRoutingRule', () => {
    it('should add rule and assign ID', () => {
      service.clearRules();

      const rule = service.addRoutingRule({
        name: 'Test Rule',
        conditions: [{ field: 'source', operator: 'equals', value: 'CLIPBOARD' }],
        actions: { targetType: 'NOTE' },
        priority: 10,
        isActive: true,
      });

      expect(rule.id).toBeDefined();
      expect(rule.name).toBe('Test Rule');
    });

    it('should maintain priority ordering', () => {
      service.clearRules();

      service.addRoutingRule({
        name: 'Low Priority',
        conditions: [{ field: 'source', operator: 'equals', value: 'MANUAL' }],
        actions: { targetType: 'NOTE' },
        priority: 10,
        isActive: true,
      });

      service.addRoutingRule({
        name: 'High Priority',
        conditions: [{ field: 'source', operator: 'equals', value: 'VOICE' }],
        actions: { targetType: 'TASK' },
        priority: 100,
        isActive: true,
      });

      const rules = service.getRoutingRules();
      expect(rules[0].name).toBe('High Priority');
      expect(rules[1].name).toBe('Low Priority');
    });
  });

  describe('updateRoutingRule', () => {
    it('should update a rule', () => {
      service.clearRules();

      const rule = service.addRoutingRule({
        name: 'Original',
        conditions: [{ field: 'source', operator: 'equals', value: 'MANUAL' }],
        actions: { targetType: 'NOTE' },
        priority: 10,
        isActive: true,
      });

      const updated = service.updateRoutingRule(rule.id, { name: 'Updated' });
      expect(updated.name).toBe('Updated');
    });

    it('should throw for non-existent rule', () => {
      expect(() => service.updateRoutingRule('fake-id', { name: 'X' })).toThrow();
    });
  });

  describe('deleteRoutingRule', () => {
    it('should remove a rule', () => {
      service.clearRules();

      const rule = service.addRoutingRule({
        name: 'Delete Me',
        conditions: [{ field: 'source', operator: 'equals', value: 'MANUAL' }],
        actions: { targetType: 'NOTE' },
        priority: 10,
        isActive: true,
      });

      service.deleteRoutingRule(rule.id);
      expect(service.getRoutingRules().length).toBe(0);
    });

    it('should throw for non-existent rule', () => {
      expect(() => service.deleteRoutingRule('fake-id')).toThrow();
    });
  });

  describe('AI-powered routing', () => {
    const { generateJSON } = jest.requireMock('@/lib/ai') as { generateJSON: jest.Mock };

    beforeEach(() => {
      service = new RoutingService();
      generateJSON.mockReset();
      generateJSON.mockRejectedValue(new Error('AI unavailable'));
    });

    it('should route captures based on AI classification when no rules match', async () => {
      service.clearRules();

      generateJSON.mockResolvedValueOnce({
        targetType: 'TASK',
        confidence: 0.8,
        reasoning: 'Contains action items',
      });

      const capture = makeCaptureItem({
        rawContent: 'Please review and approve the budget proposal',
      });

      const result = await service.routeCapture(capture);

      expect(generateJSON).toHaveBeenCalled();
      expect(result.targetType).toBe('TASK');
    });

    it('should fall back to rule-based routing on AI failure', async () => {
      // Keep default rules — this should match the action verb rule
      const capture = makeCaptureItem({
        rawContent: 'I need to follow up with the vendor',
      });

      const result = await service.routeCapture(capture);

      // Default rule should match "need to" / "follow up"
      expect(result.targetType).toBe('TASK');
      expect(result.appliedRules.length).toBe(1);
    });

    it('should fall back to NOTE on AI failure with no rules', async () => {
      service.clearRules();
      generateJSON.mockRejectedValueOnce(new Error('AI error'));

      const capture = makeCaptureItem({
        rawContent: 'Random content that matches nothing',
      });

      const result = await service.routeCapture(capture);

      expect(result.targetType).toBe('NOTE');
      expect(result.confidence).toBeLessThan(0.5);
    });
  });
});
