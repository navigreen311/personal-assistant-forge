import { generateAnnualSchedule, completeTask, createTask } from '@/modules/household/services/maintenance-service';
import type { MaintenanceTask } from '@/modules/household/types';

describe('generateAnnualSchedule', () => {
  it('should create quarterly HVAC filter tasks', async () => {
    const tasks = await generateAnnualSchedule('maint-user-1');
    const hvacFilters = tasks.filter(t => t.title === 'Replace HVAC filter');
    expect(hvacFilters.length).toBe(4);
  });

  it('should create biannual gutter cleaning tasks', async () => {
    const tasks = await generateAnnualSchedule('maint-user-2');
    const gutterTasks = tasks.filter(t => t.title === 'Clean gutters');
    expect(gutterTasks.length).toBe(2);
  });

  it('should create seasonal lawn care tasks', async () => {
    const tasks = await generateAnnualSchedule('maint-user-3');
    const lawnTasks = tasks.filter(t => t.title === 'Lawn mowing and maintenance');
    expect(lawnTasks.length).toBe(9); // Mar-Nov, 9 months
    const springLawn = lawnTasks.filter(t => t.season === 'SPRING');
    const summerLawn = lawnTasks.filter(t => t.season === 'SUMMER');
    const fallLawn = lawnTasks.filter(t => t.season === 'FALL');
    expect(springLawn.length).toBe(3);
    expect(summerLawn.length).toBe(3);
    expect(fallLawn.length).toBe(3);
  });

  it('should assign correct seasons to tasks', async () => {
    const tasks = await generateAnnualSchedule('maint-user-4');
    const springGutter = tasks.find(t => t.title === 'Clean gutters' && t.season === 'SPRING');
    const fallGutter = tasks.find(t => t.title === 'Clean gutters' && t.season === 'FALL');
    expect(springGutter).toBeDefined();
    expect(fallGutter).toBeDefined();
  });

  it('should calculate next due dates correctly', async () => {
    const tasks = await generateAnnualSchedule('maint-user-5');
    for (const task of tasks) {
      expect(task.nextDueDate).toBeDefined();
      expect(task.nextDueDate instanceof Date).toBe(true);
    }
  });
});

describe('completeTask', () => {
  it('should calculate next due date based on frequency', async () => {
    const task = await createTask('complete-user-1', {
      userId: 'complete-user-1',
      category: 'HVAC',
      title: 'Test Task',
      frequency: 'QUARTERLY',
      nextDueDate: new Date('2026-03-15'),
    });

    const completed = await completeTask(task.id);
    expect(completed.status).toBe('COMPLETED');
    expect(completed.lastCompletedDate).toBeDefined();
  });

  it('should handle ONE_TIME tasks (no next date)', async () => {
    const task = await createTask('complete-user-2', {
      userId: 'complete-user-2',
      category: 'GENERAL',
      title: 'One Time Task',
      frequency: 'ONE_TIME',
      nextDueDate: new Date('2026-06-01'),
    });

    const completed = await completeTask(task.id);
    expect(completed.status).toBe('COMPLETED');
  });
});
