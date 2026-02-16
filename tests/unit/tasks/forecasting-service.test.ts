import {
  calculateVelocity,
  forecastProjectCompletion,
  getBurndownData,
  detectVelocityAnomalies,
} from '@/modules/tasks/services/forecasting-service';
import type { VelocityMetrics } from '@/modules/tasks/types';
import { addWeeks } from 'date-fns';

// Mock prisma
const mockTaskCount = jest.fn();
const mockTaskFindMany = jest.fn();
const mockProjectFindUnique = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    task: {
      count: (...args: unknown[]) => mockTaskCount(...args),
      findMany: (...args: unknown[]) => mockTaskFindMany(...args),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    project: {
      findUnique: (...args: unknown[]) => mockProjectFindUnique(...args),
    },
  },
}));

describe('ForecastingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTaskCount.mockResolvedValue(0);
    mockTaskFindMany.mockResolvedValue([]);
    mockProjectFindUnique.mockResolvedValue({
      id: 'p1',
      name: 'Test Project',
      entityId: 'e1',
      milestones: [],
      status: 'IN_PROGRESS',
      health: 'GREEN',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  describe('calculateVelocity', () => {
    it('should calculate tasks completed per week', async () => {
      // Return 3 for each of the 8 weeks
      mockTaskCount.mockResolvedValue(3);

      const velocity = await calculateVelocity('e1', undefined, 8);
      expect(velocity.currentVelocity).toBe(3);
      expect(velocity.averageVelocity).toBe(3);
      expect(velocity.weeklyData.length).toBe(8);
    });

    it('should detect increasing velocity trend', async () => {
      // First calls return lower values, later calls return higher
      let callCount = 0;
      mockTaskCount.mockImplementation(() => {
        callCount++;
        return Promise.resolve(callCount <= 4 ? 2 : 5);
      });

      const velocity = await calculateVelocity('e1', undefined, 8);
      expect(velocity.trend).toBe('INCREASING');
    });

    it('should detect decreasing velocity trend', async () => {
      let callCount = 0;
      mockTaskCount.mockImplementation(() => {
        callCount++;
        return Promise.resolve(callCount <= 4 ? 5 : 1);
      });

      const velocity = await calculateVelocity('e1', undefined, 8);
      expect(velocity.trend).toBe('DECREASING');
    });
  });

  describe('forecastProjectCompletion', () => {
    it('should predict completion date based on velocity', async () => {
      mockTaskFindMany.mockResolvedValue([
        { id: 't1', status: 'TODO' },
        { id: 't2', status: 'TODO' },
        { id: 't3', status: 'TODO' },
        { id: 't4', status: 'IN_PROGRESS' },
      ]);
      mockTaskCount.mockResolvedValue(2); // 2 tasks per week

      const forecast = await forecastProjectCompletion('p1');
      expect(forecast.projectId).toBe('p1');
      expect(forecast.remainingTasks).toBe(4);
      expect(forecast.predictedCompletionDate).toBeDefined();
    });

    it('should include confidence level', async () => {
      mockTaskFindMany.mockResolvedValue([{ id: 't1', status: 'TODO' }]);
      mockTaskCount.mockResolvedValue(1);

      const forecast = await forecastProjectCompletion('p1');
      expect(forecast.confidence).toBeGreaterThanOrEqual(0);
      expect(forecast.confidence).toBeLessThanOrEqual(1);
    });

    it('should identify risks when velocity is declining', async () => {
      mockTaskFindMany.mockResolvedValue([
        { id: 't1', status: 'TODO' },
        { id: 't2', status: 'BLOCKED' },
      ]);

      let callCount = 0;
      mockTaskCount.mockImplementation(() => {
        callCount++;
        return Promise.resolve(callCount <= 4 ? 5 : 1);
      });

      const forecast = await forecastProjectCompletion('p1');
      expect(forecast.risks.length).toBeGreaterThan(0);
    });
  });

  describe('getBurndownData', () => {
    it('should generate ideal remaining line', async () => {
      const now = new Date();
      mockTaskFindMany.mockResolvedValue([
        { id: 't1', status: 'DONE', dueDate: now, createdAt: now, updatedAt: now },
        { id: 't2', status: 'TODO', dueDate: addWeeks(now, 4), createdAt: now, updatedAt: now },
      ]);

      mockProjectFindUnique.mockResolvedValue({
        id: 'p1',
        createdAt: now,
        milestones: [{ dueDate: addWeeks(now, 8) }],
      });

      const burndown = await getBurndownData('p1');
      expect(burndown.totalTasks).toBe(2);
      expect(burndown.completedTasks).toBe(1);
      expect(burndown.dataPoints.length).toBeGreaterThan(0);
    });

    it('should generate actual remaining data points', async () => {
      const now = new Date();
      mockTaskFindMany.mockResolvedValue([
        { id: 't1', status: 'DONE', dueDate: now, createdAt: now, updatedAt: now },
      ]);
      mockProjectFindUnique.mockResolvedValue({
        id: 'p1',
        createdAt: now,
        milestones: [],
      });

      const burndown = await getBurndownData('p1');
      for (const dp of burndown.dataPoints) {
        expect(dp.actualRemaining).toBeDefined();
        expect(dp.idealRemaining).toBeDefined();
      }
    });

    it('should handle empty project', async () => {
      mockTaskFindMany.mockResolvedValue([]);

      const burndown = await getBurndownData('p1');
      expect(burndown.totalTasks).toBe(0);
      expect(burndown.dataPoints.length).toBe(0);
    });
  });

  describe('detectVelocityAnomalies', () => {
    it('should detect significant drops', () => {
      const metrics: VelocityMetrics = {
        entityId: 'e1',
        currentVelocity: 1,
        averageVelocity: 5,
        trend: 'DECREASING',
        weeklyData: [
          { week: '2026-01-05', completed: 5 },
          { week: '2026-01-12', completed: 5 },
          { week: '2026-01-19', completed: 1 },
        ],
      };

      const anomalies = detectVelocityAnomalies(metrics);
      expect(anomalies.length).toBeGreaterThan(0);
      expect(anomalies[0]).toContain('dropped');
    });

    it('should detect significant spikes', () => {
      const metrics: VelocityMetrics = {
        entityId: 'e1',
        currentVelocity: 15,
        averageVelocity: 5,
        trend: 'INCREASING',
        weeklyData: [
          { week: '2026-01-05', completed: 5 },
          { week: '2026-01-12', completed: 5 },
          { week: '2026-01-19', completed: 15 },
        ],
      };

      const anomalies = detectVelocityAnomalies(metrics);
      expect(anomalies.length).toBeGreaterThan(0);
      expect(anomalies.some((a) => a.includes('spike'))).toBe(true);
    });

    it('should detect zero velocity', () => {
      const metrics: VelocityMetrics = {
        entityId: 'e1',
        currentVelocity: 0,
        averageVelocity: 5,
        trend: 'DECREASING',
        weeklyData: [
          { week: '2026-01-05', completed: 5 },
          { week: '2026-01-12', completed: 3 },
          { week: '2026-01-19', completed: 0 },
        ],
      };

      const anomalies = detectVelocityAnomalies(metrics);
      expect(anomalies.some((a) => a.includes('No tasks completed'))).toBe(true);
    });
  });
});
