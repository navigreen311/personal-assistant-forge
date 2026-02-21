// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _adoptionStore = new Map<string, any>();

jest.mock('@/lib/db', () => {
  return {
    prisma: {
      adoptionProgress: {
        upsert: jest.fn().mockImplementation((args: { where: { userId: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
          const existing = _adoptionStore.get(args.where.userId);
          if (existing) {
            const updated = { ...existing, ...args.update, updatedAt: new Date() };
            _adoptionStore.set(args.where.userId, updated);
            return Promise.resolve({ ...updated });
          }
          const record = {
            id: 'adoption-' + args.where.userId,
            ...args.create,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          _adoptionStore.set(args.where.userId, record);
          return Promise.resolve({ ...record });
        }),
        findUnique: jest.fn().mockImplementation((args: { where: { userId: string } }) => {
          const rec = _adoptionStore.get(args.where.userId);
          return Promise.resolve(rec ? { ...rec } : null);
        }),
        update: jest.fn().mockImplementation((args: { where: { userId: string }; data: Record<string, unknown> }) => {
          const rec = _adoptionStore.get(args.where.userId);
          if (rec) {
            const updated = { ...rec, ...args.data, updatedAt: new Date() };
            _adoptionStore.set(args.where.userId, updated);
            return Promise.resolve({ ...updated });
          }
          return Promise.resolve(null);
        }),
      },
    },
  };
});

jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('mock text'),
  generateJSON: jest.fn().mockResolvedValue({
    guidanceMessage: 'AI-generated guidance message',
    celebration: 'Great job!',
  }),
  chat: jest.fn().mockResolvedValue('mock chat'),
}));

import {
  getAhaMoments,
  checkAhaMomentProgress,
  markAhaMomentCompleted,
} from '@/engines/adoption/aha-moment-service';
import { generateJSON } from '@/lib/ai';

const mockGenerateJSON = generateJSON as jest.MockedFunction<typeof generateJSON>;

beforeEach(() => {
  jest.clearAllMocks();
  _adoptionStore.clear();
});

describe('aha-moment-service', () => {
  describe('getAhaMoments', () => {
    it('should return all 5 aha moments', () => {
      const moments = getAhaMoments();
      expect(moments).toHaveLength(5);
      expect(moments.map(m => m.action)).toEqual([
        'first_auto_draft_approved',
        'first_workflow_triggered',
        'voice_call_handled',
        'time_saved_one_hour',
        'first_autonomous_task',
      ]);
    });

    it('should return a copy that does not mutate the original', () => {
      const moments1 = getAhaMoments();
      moments1.pop();
      const moments2 = getAhaMoments();
      expect(moments2).toHaveLength(5);
    });
  });

  describe('checkAhaMomentProgress', () => {
    it('should return no completed moments and first milestone for new user', async () => {
      const result = await checkAhaMomentProgress('new-user');

      expect(result.completed).toHaveLength(0);
      expect(result.next).not.toBeNull();
      // Next should be the one with lowest targetDay among all (day 2)
      expect(result.next!.action).toBe('first_auto_draft_approved');
      expect(result.next!.targetDay).toBe(2);
    });

    it('should use AI-generated guidance with celebration when available', async () => {
      mockGenerateJSON.mockResolvedValueOnce({
        guidanceMessage: 'Keep going, you are doing great!',
        celebration: 'Awesome!',
      });

      const result = await checkAhaMomentProgress('ai-user');

      expect(mockGenerateJSON).toHaveBeenCalled();
      expect(result.guidanceMessage).toBe('Awesome! Keep going, you are doing great!');
    });

    it('should use AI guidance without celebration prefix when celebration is absent', async () => {
      mockGenerateJSON.mockResolvedValueOnce({
        guidanceMessage: 'Try your first auto-draft today!',
      });

      const result = await checkAhaMomentProgress('ai-no-celebrate');

      expect(result.guidanceMessage).toBe('Try your first auto-draft today!');
    });

    it('should fall back to default message when AI fails', async () => {
      mockGenerateJSON.mockRejectedValueOnce(new Error('AI unavailable'));

      const result = await checkAhaMomentProgress('fallback-user');

      // Fallback for new user with 0 completed
      expect(result.guidanceMessage).toContain('Welcome!');
      expect(result.guidanceMessage).toContain('First auto-drafted email approved');
    });

    it('should show progress message when some moments are completed', async () => {
      // Seed the store with some completed moments
      _adoptionStore.set('partial-user', {
        id: 'adoption-partial-user',
        userId: 'partial-user',
        data: {
          ahaMomentActions: ['first_auto_draft_approved', 'time_saved_one_hour'],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockGenerateJSON.mockRejectedValueOnce(new Error('AI fail'));

      const result = await checkAhaMomentProgress('partial-user');

      expect(result.completed).toHaveLength(2);
      // Next should be sorted by targetDay; remaining: workflow(10), voice(17), autonomous(25)
      expect(result.next!.action).toBe('first_workflow_triggered');
      expect(result.guidanceMessage).toContain('2/5 milestones completed');
      expect(result.guidanceMessage).toContain('First workflow triggered automatically');
    });

    it('should report all milestones completed when every action is done', async () => {
      _adoptionStore.set('power-user', {
        id: 'adoption-power-user',
        userId: 'power-user',
        data: {
          ahaMomentActions: [
            'first_auto_draft_approved',
            'first_workflow_triggered',
            'voice_call_handled',
            'time_saved_one_hour',
            'first_autonomous_task',
          ],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockGenerateJSON.mockRejectedValueOnce(new Error('AI fail'));

      const result = await checkAhaMomentProgress('power-user');

      expect(result.completed).toHaveLength(5);
      expect(result.next).toBeNull();
      expect(result.guidanceMessage).toContain('Congratulations');
      expect(result.guidanceMessage).toContain('power user');
    });
  });

  describe('markAhaMomentCompleted', () => {
    it('should mark a moment as completed for a new user', async () => {
      await markAhaMomentCompleted('mark-user', 'first_auto_draft_approved');

      const record = _adoptionStore.get('mark-user');
      expect(record).toBeDefined();
      expect(record.data.ahaMomentActions).toContain('first_auto_draft_approved');
    });

    it('should not duplicate an already completed action', async () => {
      await markAhaMomentCompleted('dup-user', 'voice_call_handled');
      await markAhaMomentCompleted('dup-user', 'voice_call_handled');

      const record = _adoptionStore.get('dup-user');
      const actions = record.data.ahaMomentActions as string[];
      const count = actions.filter((a: string) => a === 'voice_call_handled').length;
      expect(count).toBe(1);
    });

    it('should append new actions to existing completed list', async () => {
      await markAhaMomentCompleted('multi-user', 'first_auto_draft_approved');
      await markAhaMomentCompleted('multi-user', 'first_workflow_triggered');

      const record = _adoptionStore.get('multi-user');
      expect(record.data.ahaMomentActions).toEqual([
        'first_auto_draft_approved',
        'first_workflow_triggered',
      ]);
    });

    it('should preserve existing data fields when marking moments', async () => {
      _adoptionStore.set('preserve-user', {
        id: 'adoption-preserve-user',
        userId: 'preserve-user',
        data: {
          someOtherField: 'should persist',
          ahaMomentActions: ['time_saved_one_hour'],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await markAhaMomentCompleted('preserve-user', 'first_autonomous_task');

      const record = _adoptionStore.get('preserve-user');
      expect(record.data.someOtherField).toBe('should persist');
      expect(record.data.ahaMomentActions).toEqual([
        'time_saved_one_hour',
        'first_autonomous_task',
      ]);
    });
  });
});
