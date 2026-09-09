import {
  createRecurringConfig,
  generateNextOccurrence,
  getUpcomingRecurrences,
  adjustCadence,
  getRecurringConfigs,
  deactivateRecurring,
  checkSLACompliance,
} from '@/modules/tasks/services/recurring-tasks';
import { addDays, subHours } from 'date-fns';

// --- Mocks ---

const mockTaskFindUnique = jest.fn();
const mockTaskFindMany = jest.fn();
const mockTaskCreate = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    task: {
      findUnique: (...args: unknown[]) => mockTaskFindUnique(...args),
      // Template lookups are scoped now -- findFirst({ id, entityId }).
      findFirst: (...args: unknown[]) => mockTaskFindUnique(...args),
      findMany: (...args: unknown[]) => mockTaskFindMany(...args),
      create: (...args: unknown[]) => mockTaskCreate(...args),
    },
  },
}));

import type { VerifiedEntityId } from '@/shared/middleware/auth';

/**
 * TEST-ONLY, and the ONLY place in this file that manufactures the brand.
 *
 * A `VerifiedEntityId` can only be minted by `withEntityScope`, which needs a
 * `NextRequest`. This suite calls services directly, with no request, so there
 * is no supported way to obtain one -- see PARALLEL_BUILD_ESCALATION_P04.md,
 * gap 2. Keeping the cast in one named helper means
 * `grep -rn "as VerifiedEntityId" src/` stays at zero and every test-side
 * manufacture is one grep away.
 */
function verified(id: string): VerifiedEntityId {
  return id as VerifiedEntityId;
}


// --- Tests ---

describe('RecurringTasks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // createRecurringConfig is async now: it proves the template task lives in
    // the caller's entity before a config is allowed to point at it. Every
    // creation therefore needs a template in scope.
    mockTaskFindUnique.mockResolvedValue({ id: 'template', entityId: 'entity-1' });
  });

  describe('createRecurringConfig', () => {
    it('should create a recurring config with a generated id', async () => {
      const nextDue = addDays(new Date(), 7);
      const config = await createRecurringConfig({
        taskTemplateId: 'template-1',
        cadence: { type: 'WEEKLY', dayOfWeek: 1 },
        nextDue,
        slaHours: 48,
        autoAdjust: false,
        isActive: true,
      }, verified('entity-1'));

      expect(config.id).toBeDefined();
      expect(config.taskTemplateId).toBe('template-1');
      expect(config.cadence).toEqual({ type: 'WEEKLY', dayOfWeek: 1 });
      expect(config.nextDue).toEqual(nextDue);
      expect(config.slaHours).toBe(48);
      expect(config.autoAdjust).toBe(false);
      expect(config.isActive).toBe(true);
      expect(config.lastGenerated).toBeUndefined();
    });

    it('should create a config with DAILY cadence', async () => {
      const config = await createRecurringConfig({
        taskTemplateId: 'template-2',
        cadence: { type: 'DAILY' },
        nextDue: new Date(),
        autoAdjust: true,
        isActive: true,
      }, verified('entity-1'));

      expect(config.cadence.type).toBe('DAILY');
      expect(config.autoAdjust).toBe(true);
    });
  });

  describe('generateNextOccurrence', () => {
    it('should throw if config does not exist', async () => {
      await expect(generateNextOccurrence('nonexistent', verified('entity-1'))).rejects.toThrow(
        'Recurring config not found: nonexistent'
      );
    });

    it('should create a new task from the template and advance nextDue', async () => {
      const nextDue = new Date('2025-06-01T10:00:00Z');
      const config = await createRecurringConfig({
        taskTemplateId: 'template-1',
        cadence: { type: 'WEEKLY', dayOfWeek: 1 },
        nextDue,
        slaHours: 48,
        autoAdjust: false,
        isActive: true,
      }, verified('entity-1'));

      mockTaskFindUnique.mockResolvedValue({
        id: 'template-1',
        title: 'Weekly Report',
        description: 'Generate weekly report',
        entityId: 'entity-1',
        projectId: 'proj-1',
        priority: 'P1',
        assigneeId: 'user-1',
        tags: ['report'],
      });

      const now = new Date();
      mockTaskCreate.mockResolvedValue({
        id: 'task-new',
        title: 'Weekly Report',
        description: 'Generate weekly report',
        entityId: 'entity-1',
        projectId: 'proj-1',
        priority: 'P1',
        status: 'TODO',
        dueDate: nextDue,
        dependencies: [],
        assigneeId: 'user-1',
        tags: ['report', 'recurring'],
        createdFrom: { type: 'RECURRING', sourceId: config.id },
        createdAt: now,
        updatedAt: now,
      });

      const task = await generateNextOccurrence(config.id, verified('entity-1'));

      expect(task.id).toBe('task-new');
      expect(task.title).toBe('Weekly Report');
      expect(task.status).toBe('TODO');
      expect(task.tags).toContain('recurring');
      expect(mockTaskCreate).toHaveBeenCalledTimes(1);
    });

    it('should throw if template task is not found', async () => {
      const config = await createRecurringConfig({
        taskTemplateId: 'missing-template',
        cadence: { type: 'DAILY' },
        nextDue: new Date(),
        autoAdjust: false,
        isActive: true,
      }, verified('entity-1'));

      mockTaskFindUnique.mockResolvedValue(null);

      await expect(generateNextOccurrence(config.id, verified('entity-1'))).rejects.toThrow(
        'Task template not found: missing-template'
      );
    });
  });

  describe('getUpcomingRecurrences', () => {
    it('should return configs with nextDue within the specified days', async () => {
      const soonDue = addDays(new Date(), 5);
      const config = await createRecurringConfig({
        taskTemplateId: 'template-soon',
        cadence: { type: 'DAILY' },
        nextDue: soonDue,
        autoAdjust: false,
        isActive: true,
      }, verified('entity-1'));

      mockTaskFindUnique.mockResolvedValue({
        id: 'template-soon',
        entityId: 'entity-1',
      });

      const results = await getUpcomingRecurrences(verified('entity-1'), 30);

      expect(results.length).toBeGreaterThanOrEqual(1);
      const found = results.find((r) => r.config.id === config.id);
      expect(found).toBeDefined();
      expect(found!.nextDue).toEqual(soonDue);
    });

    it('should exclude inactive configs', async () => {
      const config = await createRecurringConfig({
        taskTemplateId: 'template-inactive',
        cadence: { type: 'DAILY' },
        nextDue: addDays(new Date(), 2),
        autoAdjust: false,
        isActive: false,
      }, verified('entity-1'));

      mockTaskFindUnique.mockResolvedValue({
        id: 'template-inactive',
        entityId: 'entity-1',
      });

      const results = await getUpcomingRecurrences(verified('entity-1'), 30);
      const found = results.find((r) => r.config.id === config.id);
      expect(found).toBeUndefined();
    });
  });

  describe('deactivateRecurring', () => {
    it('should set isActive to false', async () => {
      const config = await createRecurringConfig({
        taskTemplateId: 'template-deactivate',
        cadence: { type: 'DAILY' },
        nextDue: new Date(),
        autoAdjust: false,
        isActive: true,
      }, verified('entity-1'));

      expect(config.isActive).toBe(true);

      await deactivateRecurring(config.id, verified('entity-1'));

      // Verify via getRecurringConfigs that the config is now inactive
      mockTaskFindUnique.mockResolvedValue({
        id: 'template-deactivate',
        entityId: 'entity-check',
      });
      const configs = await getRecurringConfigs(verified('entity-1'));
      const found = configs.find((c) => c.id === config.id);
      expect(found?.isActive).toBe(false);
    });

    it('should throw if config does not exist', async () => {
      await expect(deactivateRecurring('nonexistent', verified('entity-1'))).rejects.toThrow(
        'Recurring config not found: nonexistent'
      );
    });

    // Would fail against the pre-P-04 store, which was one process-global Map
    // with no entity on it: deactivateRecurring(id) took a bare id and any
    // authenticated caller could switch off any tenant's recurring task.
    it("refuses another tenant's config, reporting it as not found", async () => {
      const config = await createRecurringConfig(
        {
          taskTemplateId: 'template-tenant-a',
          cadence: { type: 'DAILY' },
          nextDue: new Date(),
          autoAdjust: false,
          isActive: true,
        },
        verified('entity-1')
      );

      await expect(
        deactivateRecurring(config.id, verified('entity-2'))
      ).rejects.toThrow(`Recurring config not found: ${config.id}`);

      // ...and it is untouched.
      const stillMine = await getRecurringConfigs(verified('entity-1'));
      expect(stillMine.find((c) => c.id === config.id)?.isActive).toBe(true);
    });

    it("does not list another tenant's configs", async () => {
      const config = await createRecurringConfig(
        {
          taskTemplateId: 'template-tenant-a2',
          cadence: { type: 'DAILY' },
          nextDue: new Date(),
          autoAdjust: false,
          isActive: true,
        },
        verified('entity-1')
      );

      const theirs = await getRecurringConfigs(verified('entity-2'));
      expect(theirs.find((c) => c.id === config.id)).toBeUndefined();
    });
  });

  describe('checkSLACompliance', () => {
    it('should return compliant when no tasks exist', async () => {
      const config = await createRecurringConfig({
        taskTemplateId: 'template-sla',
        cadence: { type: 'WEEKLY', dayOfWeek: 1 },
        nextDue: new Date(),
        slaHours: 168,
        autoAdjust: false,
        isActive: true,
      }, verified('entity-1'));

      mockTaskFindMany.mockResolvedValue([]);

      const result = await checkSLACompliance(config.id, verified('entity-1'));

      expect(result.compliant).toBe(true);
      expect(result.averageCompletionHours).toBe(0);
      expect(result.complianceRate).toBe(1);
    });

    it('should calculate compliance rate based on tasks completed within SLA', async () => {
      const config = await createRecurringConfig({
        taskTemplateId: 'template-sla-2',
        cadence: { type: 'WEEKLY', dayOfWeek: 1 },
        nextDue: new Date(),
        slaHours: 24,
        autoAdjust: false,
        isActive: true,
      }, verified('entity-1'));

      const now = new Date();
      // Create tasks: 4 completed within SLA (12 hours), 1 late (48 hours)
      const tasks = [
        { createdAt: subHours(now, 12), updatedAt: now, dueDate: now, status: 'DONE', tags: ['recurring'] },
        { createdAt: subHours(now, 10), updatedAt: now, dueDate: now, status: 'DONE', tags: ['recurring'] },
        { createdAt: subHours(now, 8), updatedAt: now, dueDate: now, status: 'DONE', tags: ['recurring'] },
        { createdAt: subHours(now, 6), updatedAt: now, dueDate: now, status: 'DONE', tags: ['recurring'] },
        { createdAt: subHours(now, 48), updatedAt: now, dueDate: now, status: 'DONE', tags: ['recurring'] },
      ];
      mockTaskFindMany.mockResolvedValue(tasks);

      const result = await checkSLACompliance(config.id, verified('entity-1'));

      expect(result.slaHours).toBe(24);
      // 4 out of 5 tasks were within SLA (24h): compliance = 0.8
      expect(result.complianceRate).toBe(0.8);
      expect(result.compliant).toBe(true); // >= 0.8 threshold
    });

    it('should throw if config does not exist', async () => {
      await expect(checkSLACompliance('nonexistent', verified('entity-1'))).rejects.toThrow(
        'Recurring config not found: nonexistent'
      );
    });
  });

  describe('adjustCadence', () => {
    it('should return config unchanged if autoAdjust is false', async () => {
      const config = await createRecurringConfig({
        taskTemplateId: 'template-no-adjust',
        cadence: { type: 'WEEKLY', dayOfWeek: 1 },
        nextDue: new Date(),
        autoAdjust: false,
        isActive: true,
      }, verified('entity-1'));

      const result = await adjustCadence(config.id, verified('entity-1'));

      expect(result.cadence.type).toBe('WEEKLY');
    });

    it('should not adjust when there are fewer than 3 completed tasks', async () => {
      const config = await createRecurringConfig({
        taskTemplateId: 'template-few-tasks',
        cadence: { type: 'WEEKLY', dayOfWeek: 1 },
        nextDue: new Date(),
        slaHours: 168,
        autoAdjust: true,
        isActive: true,
      }, verified('entity-1'));

      mockTaskFindMany.mockResolvedValue([
        { createdAt: new Date(), updatedAt: new Date(), dueDate: new Date(), status: 'DONE', tags: ['recurring'] },
      ]);

      const result = await adjustCadence(config.id, verified('entity-1'));

      expect(result.cadence.type).toBe('WEEKLY');
    });
  });
});
