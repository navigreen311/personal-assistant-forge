// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

// Mock attention-budget-service
jest.mock('@/modules/attention/services/attention-budget-service', () => ({
  consumeBudget: jest.fn(),
}));

// Mock dnd-service
jest.mock('@/modules/attention/services/dnd-service', () => ({
  isDNDActive: jest.fn(),
  checkVIPBreakthrough: jest.fn(),
}));

import {
  routeNotification,
  getRoutingConfig,
  updateRoutingConfig,
  notificationStore,
  routingConfigStore,
} from '@/modules/attention/services/priority-router';

import { generateJSON as generateJSONImpl } from '@/lib/ai';

const generateJSON = jest.mocked(generateJSONImpl);
import { consumeBudget as consumeBudgetImpl } from '@/modules/attention/services/attention-budget-service';
import type { AttentionBudget } from '@/modules/attention/types';

const consumeBudget = jest.mocked(consumeBudgetImpl);
import { isDNDActive as isDNDActiveImpl, checkVIPBreakthrough as checkVIPBreakthroughImpl } from '@/modules/attention/services/dnd-service';

const isDNDActive = jest.mocked(isDNDActiveImpl);

/**
 * P-35: `consumeBudget` was mocked as `{ allowed, budget: UNUSED_BUDGET }` behind a
 * `require()`, which made the return type `any`. Typed against the real
 * signature, `{}` is not an `AttentionBudget`. The router destructures only
 * `allowed` (priority-router.ts:36,63) and never reads `budget`, so this is a
 * complete stand-in for a field nothing under test consumes -- the mock's
 * claim about the interface is now true rather than merely unchecked.
 */
const UNUSED_BUDGET: AttentionBudget = {
  userId: 'user-1',
  dailyBudget: 100,
  usedToday: 0,
  remaining: 100,
  resetAt: new Date('2026-01-01T00:00:00Z'),
};

const checkVIPBreakthrough = jest.mocked(checkVIPBreakthroughImpl);

describe('PriorityRouter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    notificationStore.clear();
    routingConfigStore.clear();
    isDNDActive.mockResolvedValue(false);
    checkVIPBreakthrough.mockResolvedValue(false);
    consumeBudget.mockResolvedValue({ allowed: true, budget: UNUSED_BUDGET });
  });

  describe('routeNotification', () => {
    const baseNotification = {
      userId: 'user-1',
      title: 'Test Alert',
      body: 'Something happened',
      source: 'monitoring',
      priority: 'P0' as const,
    };

    it('should route P0 notifications to INTERRUPT when DND is off and budget allows', async () => {
      isDNDActive.mockResolvedValue(false);
      consumeBudget.mockResolvedValue({ allowed: true, budget: UNUSED_BUDGET });

      const item = await routeNotification('user-1', baseNotification);

      expect(item.routedAction).toBe('INTERRUPT');
      expect(item.priority).toBe('P0');
      expect(item.isRead).toBe(false);
      expect(item.isBundled).toBe(false);
      expect(item.id).toBeDefined();
      expect(item.createdAt).toBeInstanceOf(Date);
    });

    it('should route P0 notifications to NEXT_DIGEST when DND is off but budget exhausted', async () => {
      isDNDActive.mockResolvedValue(false);
      consumeBudget.mockResolvedValue({ allowed: false, budget: UNUSED_BUDGET });

      const item = await routeNotification('user-1', baseNotification);

      expect(item.routedAction).toBe('NEXT_DIGEST');
    });

    it('should route P0 to INTERRUPT during DND when source is VIP', async () => {
      isDNDActive.mockResolvedValue(true);
      checkVIPBreakthrough.mockResolvedValue(true);

      const item = await routeNotification('user-1', baseNotification);

      expect(item.routedAction).toBe('INTERRUPT');
      expect(checkVIPBreakthrough).toHaveBeenCalledWith('user-1', 'monitoring');
    });

    it('should route P0 to NEXT_DIGEST during DND when source is not VIP', async () => {
      isDNDActive.mockResolvedValue(true);
      checkVIPBreakthrough.mockResolvedValue(false);

      const item = await routeNotification('user-1', baseNotification);

      expect(item.routedAction).toBe('NEXT_DIGEST');
    });

    it('should route P1 notifications to NEXT_DIGEST', async () => {
      const item = await routeNotification('user-1', {
        ...baseNotification,
        priority: 'P1' as const,
      });

      expect(item.routedAction).toBe('NEXT_DIGEST');
      expect(consumeBudget).not.toHaveBeenCalled();
    });

    it('should route P2 notifications to WEEKLY_REVIEW', async () => {
      const item = await routeNotification('user-1', {
        ...baseNotification,
        priority: 'P2' as const,
      });

      expect(item.routedAction).toBe('WEEKLY_REVIEW');
      expect(consumeBudget).not.toHaveBeenCalled();
    });

    it('should use AI classification for ambiguous priority and route P0 result', async () => {
      generateJSON.mockResolvedValue({ priority: 'P0' });
      consumeBudget.mockResolvedValue({ allowed: true, budget: UNUSED_BUDGET });

      const item = await routeNotification('user-1', {
        userId: 'user-1',
        title: 'Ambiguous notification',
        body: 'Some content',
        source: 'unknown',
        priority: undefined as unknown as 'P0',
      });

      expect(generateJSON).toHaveBeenCalledTimes(1);
      expect(item.routedAction).toBe('INTERRUPT');
      expect(consumeBudget).toHaveBeenCalledWith('user-1');
    });

    it('should use AI classification for ambiguous priority and route P1 result', async () => {
      generateJSON.mockResolvedValue({ priority: 'P1' });

      const item = await routeNotification('user-1', {
        userId: 'user-1',
        title: 'Ambiguous notification',
        body: 'Some content',
        source: 'unknown',
        priority: undefined as unknown as 'P0',
      });

      expect(item.routedAction).toBe('NEXT_DIGEST');
    });

    it('should use AI classification for ambiguous priority and route P2 result', async () => {
      generateJSON.mockResolvedValue({ priority: 'P2' });

      const item = await routeNotification('user-1', {
        userId: 'user-1',
        title: 'Ambiguous notification',
        body: 'Some content',
        source: 'unknown',
        priority: undefined as unknown as 'P0',
      });

      expect(item.routedAction).toBe('WEEKLY_REVIEW');
    });

    it('should fall back to NEXT_DIGEST when AI classification fails', async () => {
      generateJSON.mockRejectedValue(new Error('AI unavailable'));

      const item = await routeNotification('user-1', {
        userId: 'user-1',
        title: 'Ambiguous',
        body: 'Content',
        source: 'unknown',
        priority: undefined as unknown as 'P0',
      });

      expect(item.routedAction).toBe('NEXT_DIGEST');
    });

    it('should store the notification in notificationStore', async () => {
      const item = await routeNotification('user-1', {
        ...baseNotification,
        priority: 'P1' as const,
      });

      expect(notificationStore.has(item.id)).toBe(true);
      const stored = notificationStore.get(item.id)!;
      expect(stored.title).toBe('Test Alert');
      expect(stored.userId).toBe('user-1');
    });

    it('should generate unique IDs for each notification', async () => {
      const item1 = await routeNotification('user-1', {
        ...baseNotification,
        priority: 'P1' as const,
      });
      const item2 = await routeNotification('user-1', {
        ...baseNotification,
        priority: 'P1' as const,
      });

      expect(item1.id).not.toBe(item2.id);
    });

    it('should route AI-classified P0 to NEXT_DIGEST when budget is exhausted', async () => {
      generateJSON.mockResolvedValue({ priority: 'P0' });
      consumeBudget.mockResolvedValue({ allowed: false, budget: UNUSED_BUDGET });

      const item = await routeNotification('user-1', {
        userId: 'user-1',
        title: 'Test',
        body: 'Body',
        source: 'unknown',
        priority: undefined as unknown as 'P0',
      });

      expect(item.routedAction).toBe('NEXT_DIGEST');
    });
  });

  describe('getRoutingConfig', () => {
    it('should return default routing config when none is set', async () => {
      const config = await getRoutingConfig('user-1');

      expect(config).toHaveLength(3);
      expect(config[0]).toEqual({ priority: 'P0', action: 'INTERRUPT', channels: ['push', 'sms'] });
      expect(config[1]).toEqual({ priority: 'P1', action: 'NEXT_DIGEST', channels: ['email'] });
      expect(config[2]).toEqual({ priority: 'P2', action: 'WEEKLY_REVIEW', channels: ['email'] });
    });

    it('should return custom config after it has been set', async () => {
      const customConfig = [
        { priority: 'P0' as const, action: 'SILENT' as const, channels: [] },
        { priority: 'P1' as const, action: 'INTERRUPT' as const, channels: ['push'] },
        { priority: 'P2' as const, action: 'SILENT' as const, channels: [] },
      ];

      await updateRoutingConfig('user-1', customConfig);
      const config = await getRoutingConfig('user-1');

      expect(config).toEqual(customConfig);
    });

    it('should return different configs for different users', async () => {
      const customConfig = [
        { priority: 'P0' as const, action: 'SILENT' as const, channels: [] },
      ];

      await updateRoutingConfig('user-1', customConfig);

      const user1Config = await getRoutingConfig('user-1');
      const user2Config = await getRoutingConfig('user-2');

      expect(user1Config).toEqual(customConfig);
      expect(user2Config).toHaveLength(3); // default
    });
  });

  describe('updateRoutingConfig', () => {
    it('should store the routing config for a user', async () => {
      const newConfig = [
        { priority: 'P0' as const, action: 'NEXT_DIGEST' as const, channels: ['email'] },
      ];

      await updateRoutingConfig('user-1', newConfig);

      expect(routingConfigStore.get('user-1')).toEqual(newConfig);
    });

    it('should overwrite an existing config', async () => {
      const firstConfig = [
        { priority: 'P0' as const, action: 'INTERRUPT' as const, channels: ['push'] },
      ];
      const secondConfig = [
        { priority: 'P0' as const, action: 'SILENT' as const, channels: [] },
      ];

      await updateRoutingConfig('user-1', firstConfig);
      await updateRoutingConfig('user-1', secondConfig);

      const config = await getRoutingConfig('user-1');
      expect(config).toEqual(secondConfig);
    });
  });

  describe('store exports', () => {
    it('should export notificationStore as a Map', () => {
      expect(notificationStore).toBeInstanceOf(Map);
    });

    it('should export routingConfigStore as a Map', () => {
      expect(routingConfigStore).toBeInstanceOf(Map);
    });
  });
});
