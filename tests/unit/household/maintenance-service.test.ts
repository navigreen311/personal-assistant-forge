import { addDays } from 'date-fns';

jest.mock('@/lib/db', () => ({
  prisma: {
    task: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';
import {
  createTask,
  getUpcomingTasks,
  getOverdueTasks,
  completeTask,
  getSeasonalSchedule,
  generateAnnualSchedule,
} from '@/modules/household/services/maintenance-service';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGenerateJSON = generateJSON as jest.Mock;

describe('maintenance-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createTask', () => {
    it('should create Task with tags including maintenance', async () => {
      const futureDate = addDays(new Date(), 10);
      const taskInput = {
        userId: 'user-1',
        category: 'HVAC' as const,
        title: 'Replace HVAC filter',
        frequency: 'QUARTERLY' as const,
        season: 'ANY' as const,
        nextDueDate: futureDate,
        estimatedCostUsd: 30,
      };

      (mockPrisma.task.create as jest.Mock).mockResolvedValue({
        id: 'task-1',
        title: 'Replace HVAC filter',
        description: null,
        entityId: 'user-1',
        status: 'TODO',
        dueDate: futureDate,
        tags: ['maintenance'],
        createdFrom: {
          category: 'HVAC',
          frequency: 'QUARTERLY',
          season: 'ANY',
          estimatedCostUsd: 30,
          nextDueDate: futureDate.toISOString(),
          lastCompletedDate: null,
          assignedProviderId: undefined,
          maintenanceStatus: 'UPCOMING',
          notes: undefined,
        },
      });

      const result = await createTask('user-1', taskInput);

      expect(mockPrisma.task.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tags: ['maintenance'],
          title: 'Replace HVAC filter',
          entityId: 'user-1',
        }),
      });
      expect(result.id).toBe('task-1');
      expect(result.status).toBe('UPCOMING');
    });

    it('should store category, frequency, season in metadata', async () => {
      const futureDate = addDays(new Date(), 10);
      (mockPrisma.task.create as jest.Mock).mockResolvedValue({
        id: 'task-2',
        title: 'Clean gutters',
        description: null,
        entityId: 'user-1',
        status: 'TODO',
        dueDate: futureDate,
        tags: ['maintenance'],
        createdFrom: {
          category: 'GENERAL',
          frequency: 'BIANNUAL',
          season: 'SPRING',
          estimatedCostUsd: 150,
          nextDueDate: futureDate.toISOString(),
          lastCompletedDate: null,
          maintenanceStatus: 'UPCOMING',
        },
      });

      await createTask('user-1', {
        userId: 'user-1',
        category: 'GENERAL',
        title: 'Clean gutters',
        frequency: 'BIANNUAL',
        season: 'SPRING',
        nextDueDate: futureDate,
        estimatedCostUsd: 150,
      });

      const callArgs = (mockPrisma.task.create as jest.Mock).mock.calls[0][0];
      expect(callArgs.data.createdFrom).toEqual(
        expect.objectContaining({
          category: 'GENERAL',
          frequency: 'BIANNUAL',
          season: 'SPRING',
        })
      );
    });

    it('should set status to OVERDUE if nextDueDate is past', async () => {
      const pastDate = addDays(new Date(), -5);
      (mockPrisma.task.create as jest.Mock).mockResolvedValue({
        id: 'task-3',
        title: 'Overdue task',
        description: null,
        entityId: 'user-1',
        status: 'TODO',
        dueDate: pastDate,
        tags: ['maintenance'],
        createdFrom: {
          category: 'GENERAL',
          frequency: 'MONTHLY',
          season: 'ANY',
          nextDueDate: pastDate.toISOString(),
          maintenanceStatus: 'OVERDUE',
        },
      });

      const result = await createTask('user-1', {
        userId: 'user-1',
        category: 'GENERAL',
        title: 'Overdue task',
        frequency: 'MONTHLY',
        season: 'ANY',
        nextDueDate: pastDate,
      });

      expect(result.status).toBe('OVERDUE');
      const callArgs = (mockPrisma.task.create as jest.Mock).mock.calls[0][0];
      expect(callArgs.data.createdFrom.maintenanceStatus).toBe('OVERDUE');
    });
  });

  describe('getUpcomingTasks', () => {
    it('should query tasks with maintenance tag', async () => {
      (mockPrisma.task.findMany as jest.Mock).mockResolvedValue([]);

      await getUpcomingTasks('user-1', 30);

      expect(mockPrisma.task.findMany).toHaveBeenCalledWith({
        where: {
          entityId: 'user-1',
          tags: { has: 'maintenance' },
          deletedAt: null,
        },
      });
    });

    it('should filter by date range', async () => {
      const futureDate = addDays(new Date(), 10);
      const farFuture = addDays(new Date(), 60);

      (mockPrisma.task.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'task-1',
          title: 'Within range',
          description: null,
          entityId: 'user-1',
          status: 'TODO',
          dueDate: futureDate,
          tags: ['maintenance'],
          createdFrom: {
            category: 'HVAC',
            frequency: 'QUARTERLY',
            nextDueDate: futureDate.toISOString(),
            maintenanceStatus: 'UPCOMING',
          },
        },
        {
          id: 'task-2',
          title: 'Out of range',
          description: null,
          entityId: 'user-1',
          status: 'TODO',
          dueDate: farFuture,
          tags: ['maintenance'],
          createdFrom: {
            category: 'HVAC',
            frequency: 'QUARTERLY',
            nextDueDate: farFuture.toISOString(),
            maintenanceStatus: 'UPCOMING',
          },
        },
      ]);

      const result = await getUpcomingTasks('user-1', 30);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Within range');
    });

    it('should deserialize metadata to MaintenanceTask', async () => {
      const futureDate = addDays(new Date(), 5);
      (mockPrisma.task.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'task-1',
          title: 'HVAC filter',
          description: 'Replace the filter',
          entityId: 'user-1',
          status: 'TODO',
          dueDate: futureDate,
          tags: ['maintenance'],
          createdFrom: {
            category: 'HVAC',
            frequency: 'QUARTERLY',
            season: 'ANY',
            estimatedCostUsd: 30,
            nextDueDate: futureDate.toISOString(),
            maintenanceStatus: 'UPCOMING',
          },
        },
      ]);

      const result = await getUpcomingTasks('user-1', 30);

      expect(result[0]).toEqual(
        expect.objectContaining({
          id: 'task-1',
          category: 'HVAC',
          frequency: 'QUARTERLY',
          season: 'ANY',
          estimatedCostUsd: 30,
          status: 'UPCOMING',
        })
      );
    });
  });

  describe('getOverdueTasks', () => {
    it('should return overdue tasks', async () => {
      const pastDate = addDays(new Date(), -5);
      (mockPrisma.task.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'task-1',
          title: 'Overdue',
          description: null,
          entityId: 'user-1',
          status: 'TODO',
          dueDate: pastDate,
          tags: ['maintenance'],
          createdFrom: {
            category: 'GENERAL',
            frequency: 'MONTHLY',
            nextDueDate: pastDate.toISOString(),
            maintenanceStatus: 'UPCOMING',
          },
        },
      ]);

      const result = await getOverdueTasks('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('OVERDUE');
    });
  });

  describe('completeTask', () => {
    it('should mark task as completed', async () => {
      const now = new Date();
      (mockPrisma.task.findUnique as jest.Mock).mockResolvedValue({
        id: 'task-1',
        title: 'Replace HVAC filter',
        description: null,
        entityId: 'user-1',
        priority: 'P1',
        status: 'TODO',
        dueDate: now,
        tags: ['maintenance'],
        createdFrom: {
          category: 'HVAC',
          frequency: 'QUARTERLY',
          season: 'ANY',
          maintenanceStatus: 'UPCOMING',
        },
      });

      (mockPrisma.task.update as jest.Mock).mockResolvedValue({
        id: 'task-1',
        title: 'Replace HVAC filter',
        description: null,
        entityId: 'user-1',
        status: 'DONE',
        dueDate: now,
        tags: ['maintenance'],
        createdFrom: {
          category: 'HVAC',
          frequency: 'QUARTERLY',
          season: 'ANY',
          maintenanceStatus: 'COMPLETED',
          lastCompletedDate: now.toISOString(),
        },
      });

      (mockPrisma.task.create as jest.Mock).mockResolvedValue({
        id: 'task-2',
        title: 'Replace HVAC filter',
        description: null,
        entityId: 'user-1',
        status: 'TODO',
        tags: ['maintenance'],
        createdFrom: { maintenanceStatus: 'UPCOMING' },
      });

      const result = await completeTask('task-1');

      expect(result.status).toBe('COMPLETED');
      expect(mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task-1' },
          data: expect.objectContaining({
            status: 'DONE',
          }),
        })
      );
    });

    it('should create next occurrence for recurring tasks', async () => {
      const now = new Date();
      (mockPrisma.task.findUnique as jest.Mock).mockResolvedValue({
        id: 'task-1',
        title: 'Replace HVAC filter',
        description: null,
        entityId: 'user-1',
        priority: 'P1',
        status: 'TODO',
        dueDate: now,
        tags: ['maintenance'],
        createdFrom: {
          category: 'HVAC',
          frequency: 'QUARTERLY',
          season: 'ANY',
          maintenanceStatus: 'UPCOMING',
        },
      });

      (mockPrisma.task.update as jest.Mock).mockResolvedValue({
        id: 'task-1',
        title: 'Replace HVAC filter',
        description: null,
        entityId: 'user-1',
        status: 'DONE',
        dueDate: now,
        tags: ['maintenance'],
        createdFrom: { maintenanceStatus: 'COMPLETED' },
      });

      (mockPrisma.task.create as jest.Mock).mockResolvedValue({
        id: 'task-next',
        title: 'Replace HVAC filter',
        description: null,
        entityId: 'user-1',
        status: 'TODO',
        tags: ['maintenance'],
        createdFrom: { maintenanceStatus: 'UPCOMING' },
      });

      await completeTask('task-1');

      expect(mockPrisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Replace HVAC filter',
            tags: ['maintenance'],
          }),
        })
      );
    });

    it('should not create next occurrence for ONE_TIME tasks', async () => {
      const now = new Date();
      (mockPrisma.task.findUnique as jest.Mock).mockResolvedValue({
        id: 'task-1',
        title: 'One time fix',
        description: null,
        entityId: 'user-1',
        priority: 'P1',
        status: 'TODO',
        dueDate: now,
        tags: ['maintenance'],
        createdFrom: {
          category: 'GENERAL',
          frequency: 'ONE_TIME',
          maintenanceStatus: 'UPCOMING',
        },
      });

      (mockPrisma.task.update as jest.Mock).mockResolvedValue({
        id: 'task-1',
        title: 'One time fix',
        description: null,
        entityId: 'user-1',
        status: 'DONE',
        dueDate: now,
        tags: ['maintenance'],
        createdFrom: { maintenanceStatus: 'COMPLETED' },
      });

      await completeTask('task-1');

      expect(mockPrisma.task.create).not.toHaveBeenCalled();
    });

    it('should throw if task not found', async () => {
      (mockPrisma.task.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(completeTask('nonexistent')).rejects.toThrow('Task nonexistent not found');
    });
  });

  describe('getSeasonalSchedule', () => {
    it('should filter by season', async () => {
      const futureDate = addDays(new Date(), 10);
      (mockPrisma.task.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'task-1',
          title: 'Spring task',
          description: null,
          entityId: 'user-1',
          status: 'TODO',
          dueDate: futureDate,
          tags: ['maintenance'],
          createdFrom: { category: 'LAWN', frequency: 'MONTHLY', season: 'SPRING', maintenanceStatus: 'UPCOMING', nextDueDate: futureDate.toISOString() },
        },
        {
          id: 'task-2',
          title: 'Any season task',
          description: null,
          entityId: 'user-1',
          status: 'TODO',
          dueDate: futureDate,
          tags: ['maintenance'],
          createdFrom: { category: 'HVAC', frequency: 'QUARTERLY', season: 'ANY', maintenanceStatus: 'UPCOMING', nextDueDate: futureDate.toISOString() },
        },
        {
          id: 'task-3',
          title: 'Fall task',
          description: null,
          entityId: 'user-1',
          status: 'TODO',
          dueDate: futureDate,
          tags: ['maintenance'],
          createdFrom: { category: 'GENERAL', frequency: 'ANNUAL', season: 'FALL', maintenanceStatus: 'UPCOMING', nextDueDate: futureDate.toISOString() },
        },
      ]);

      const result = await getSeasonalSchedule('user-1', 'SPRING');

      expect(result).toHaveLength(2);
      expect(result.map(t => t.title)).toContain('Spring task');
      expect(result.map(t => t.title)).toContain('Any season task');
    });
  });

  describe('generateAnnualSchedule', () => {
    it('should create template tasks for the current year', async () => {
      (mockPrisma.task.create as jest.Mock).mockImplementation(({ data }) =>
        Promise.resolve({
          id: `task-${Math.random().toString(36).slice(2)}`,
          title: data.title,
          description: data.description,
          entityId: data.entityId,
          status: data.status,
          dueDate: data.dueDate,
          tags: data.tags,
          createdFrom: data.createdFrom,
        })
      );

      mockGenerateJSON.mockRejectedValue(new Error('AI unavailable'));

      const result = await generateAnnualSchedule('user-1');

      expect(result.length).toBeGreaterThanOrEqual(20);
      expect(mockPrisma.task.create).toHaveBeenCalledTimes(result.length);
    });

    it('should call generateJSON for AI optimization', async () => {
      (mockPrisma.task.create as jest.Mock).mockImplementation(({ data }) =>
        Promise.resolve({
          id: `task-${Math.random().toString(36).slice(2)}`,
          title: data.title,
          description: data.description,
          entityId: data.entityId,
          status: data.status,
          dueDate: data.dueDate,
          tags: data.tags,
          createdFrom: data.createdFrom,
        })
      );

      mockGenerateJSON.mockResolvedValue({ optimizations: [] });

      await generateAnnualSchedule('user-1');

      expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
    });

    it('should fallback to original templates on AI failure', async () => {
      (mockPrisma.task.create as jest.Mock).mockImplementation(({ data }) =>
        Promise.resolve({
          id: `task-${Math.random().toString(36).slice(2)}`,
          title: data.title,
          description: data.description,
          entityId: data.entityId,
          status: data.status,
          dueDate: data.dueDate,
          tags: data.tags,
          createdFrom: data.createdFrom,
        })
      );

      mockGenerateJSON.mockRejectedValue(new Error('AI unavailable'));

      const result = await generateAnnualSchedule('user-1');

      // Should still create all template tasks
      expect(result.length).toBeGreaterThanOrEqual(20);
    });
  });
});
