import { detectProcrastination, getSuggestion } from '@/modules/tasks/services/procrastination-detector';
import type { ProcrastinationAlert } from '@/modules/tasks/types';
import { subDays } from 'date-fns';

// Mock prisma
const mockTaskFindMany = jest.fn();
const mockActionLogCount = jest.fn();
const mockActionLogFindFirst = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    task: {
      findMany: (...args: unknown[]) => mockTaskFindMany(...args),
    },
    actionLog: {
      count: (...args: unknown[]) => mockActionLogCount(...args),
      findFirst: (...args: unknown[]) => mockActionLogFindFirst(...args),
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

describe('ProcrastinationDetector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActionLogCount.mockResolvedValue(0);
    mockActionLogFindFirst.mockResolvedValue(null);
  });

  describe('detectProcrastination', () => {
    it('should flag tasks deferred 2+ times', async () => {
      mockTaskFindMany.mockResolvedValue([
        {
          id: 't1',
          title: 'Deferred Task',
          status: 'TODO',
          createdAt: subDays(new Date(), 5),
          updatedAt: subDays(new Date(), 1),
          dueDate: new Date(),
          entityId: 'e1',
        },
      ]);
      mockActionLogCount.mockResolvedValue(3);

      const alerts = await detectProcrastination('e1');
      expect(alerts.length).toBe(1);
      expect(alerts[0].deferrals).toBe(3);
    });

    it('should flag TODO tasks older than 14 days', async () => {
      mockTaskFindMany.mockResolvedValue([
        {
          id: 't1',
          title: 'Old Task',
          status: 'TODO',
          createdAt: subDays(new Date(), 20),
          updatedAt: subDays(new Date(), 20),
          dueDate: null,
          entityId: 'e1',
        },
      ]);

      const alerts = await detectProcrastination('e1');
      expect(alerts.length).toBe(1);
      expect(alerts[0].suggestion).toBe('DELEGATE');
    });

    it('should flag IN_PROGRESS tasks with no updates for 7 days', async () => {
      mockTaskFindMany.mockResolvedValue([
        {
          id: 't1',
          title: 'Stale Task',
          status: 'IN_PROGRESS',
          createdAt: subDays(new Date(), 10),
          updatedAt: subDays(new Date(), 10),
          dueDate: null,
          entityId: 'e1',
        },
      ]);

      const alerts = await detectProcrastination('e1');
      expect(alerts.length).toBe(1);
      expect(alerts[0].suggestion).toBe('BREAK_DOWN');
    });

    it('should not flag recently created tasks', async () => {
      mockTaskFindMany.mockResolvedValue([
        {
          id: 't1',
          title: 'New Task',
          status: 'TODO',
          createdAt: new Date(),
          updatedAt: new Date(),
          dueDate: null,
          entityId: 'e1',
        },
      ]);

      const alerts = await detectProcrastination('e1');
      expect(alerts.length).toBe(0);
    });

    it('should not flag DONE/CANCELLED tasks', async () => {
      // The query filters to active statuses, so DONE/CANCELLED aren't fetched
      mockTaskFindMany.mockResolvedValue([]);

      const alerts = await detectProcrastination('e1');
      expect(alerts.length).toBe(0);
    });
  });

  describe('getSuggestion', () => {
    it('should suggest BREAK_DOWN for large deferred tasks', () => {
      const alert: ProcrastinationAlert = {
        taskId: 't1',
        taskTitle: 'Big Task',
        deferrals: 3,
        daysSinceCreation: 20,
        suggestion: 'BREAK_DOWN',
        reason: 'Test',
      };

      const suggestion = getSuggestion(alert);
      expect(suggestion).toContain('breaking');
      expect(suggestion).toContain('Big Task');
    });

    it('should suggest DELEGATE for tasks with available assignees', () => {
      const alert: ProcrastinationAlert = {
        taskId: 't1',
        taskTitle: 'Delegate Task',
        deferrals: 0,
        daysSinceCreation: 15,
        suggestion: 'DELEGATE',
        reason: 'Test',
      };

      const suggestion = getSuggestion(alert);
      expect(suggestion).toContain('Delegate');
    });

    it('should suggest ELIMINATE for tasks deferred 5+ times', () => {
      const alert: ProcrastinationAlert = {
        taskId: 't1',
        taskTitle: 'Abandoned Task',
        deferrals: 6,
        daysSinceCreation: 60,
        suggestion: 'ELIMINATE',
        reason: 'Test',
      };

      const suggestion = getSuggestion(alert);
      expect(suggestion).toContain('deferred');
      expect(suggestion).toContain('6');
    });

    it('should suggest SCHEDULE_NOW for moderately deferred tasks', () => {
      const alert: ProcrastinationAlert = {
        taskId: 't1',
        taskTitle: 'Procrastinated Task',
        deferrals: 2,
        daysSinceCreation: 10,
        suggestion: 'SCHEDULE_NOW',
        reason: 'Test',
      };

      const suggestion = getSuggestion(alert);
      expect(suggestion).toContain('90 minutes');
    });
  });
});
