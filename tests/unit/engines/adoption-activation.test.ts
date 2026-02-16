import {
  initializeChecklist,
  getChecklist,
  completeTask,
  getCurrentPhase,
} from '@/engines/adoption/activation-service';

describe('activation-service', () => {
  const userId = `test-user-${Date.now()}`;

  it('should initialize checklist with 5 phases and 15 tasks', async () => {
    const uid = `init-${Date.now()}`;
    const checklist = await initializeChecklist(uid);

    expect(checklist.userId).toBe(uid);
    expect(checklist.phases).toHaveLength(5);

    const totalTasks = checklist.phases.reduce((sum, p) => sum + p.tasks.length, 0);
    expect(totalTasks).toBe(15);

    // Each phase should have 3 tasks
    for (const phase of checklist.phases) {
      expect(phase.tasks).toHaveLength(3);
      expect(phase.status).toBe('NOT_STARTED');
    }

    expect(checklist.overallProgress).toBe(0);
    expect(checklist.currentDay).toBe(1);
  });

  it('should return existing checklist or initialize new one via getChecklist', async () => {
    const uid = `get-${Date.now()}`;

    // First call initializes
    const checklist1 = await getChecklist(uid);
    expect(checklist1.userId).toBe(uid);
    expect(checklist1.phases).toHaveLength(5);

    // Second call returns same checklist
    const checklist2 = await getChecklist(uid);
    expect(checklist2.userId).toBe(uid);
    expect(checklist2.phases).toHaveLength(5);

    // Task IDs should be the same (same instance)
    expect(checklist2.phases[0].tasks[0].id).toBe(checklist1.phases[0].tasks[0].id);
  });

  it('should mark task complete and update phase status', async () => {
    const uid = `complete-${Date.now()}`;
    const checklist = await initializeChecklist(uid);

    const firstPhase = checklist.phases[0];
    const taskId = firstPhase.tasks[0].id;

    const updated = await completeTask(uid, taskId);
    const task = updated.phases[0].tasks.find(t => t.id === taskId);

    expect(task?.isComplete).toBe(true);
    expect(task?.completedAt).toBeInstanceOf(Date);
    // Phase should be IN_PROGRESS (1 of 3 tasks complete)
    expect(updated.phases[0].status).toBe('IN_PROGRESS');

    // Complete remaining tasks in phase
    await completeTask(uid, firstPhase.tasks[1].id);
    const fullyCompleted = await completeTask(uid, firstPhase.tasks[2].id);

    expect(fullyCompleted.phases[0].status).toBe('COMPLETE');
  });

  it('should update overall progress percentage', async () => {
    const uid = `progress-${Date.now()}`;
    const checklist = await initializeChecklist(uid);

    expect(checklist.overallProgress).toBe(0);

    // Complete 1 task out of 15 = ~7%
    const taskId = checklist.phases[0].tasks[0].id;
    const updated = await completeTask(uid, taskId);
    expect(updated.overallProgress).toBe(Math.round((1 / 15) * 100));

    // Complete 2 more tasks (3/15 = 20%)
    await completeTask(uid, checklist.phases[0].tasks[1].id);
    const updated3 = await completeTask(uid, checklist.phases[0].tasks[2].id);
    expect(updated3.overallProgress).toBe(Math.round((3 / 15) * 100));
  });

  it('should return the phase matching the current day range', async () => {
    const uid = `phase-${Date.now()}`;
    await initializeChecklist(uid);

    // Default currentDay is 1, which falls in phase 0 (dayRange [1, 3])
    const phase = await getCurrentPhase(uid);
    expect(phase.name).toBe('Inbox Mastery');
    expect(phase.dayRange[0]).toBeLessThanOrEqual(1);
    expect(phase.dayRange[1]).toBeGreaterThanOrEqual(1);
  });

  it('should not re-complete an already completed task', async () => {
    const uid = `idempotent-${Date.now()}`;
    const checklist = await initializeChecklist(uid);

    const taskId = checklist.phases[0].tasks[0].id;
    const first = await completeTask(uid, taskId);
    const firstCompletedAt = first.phases[0].tasks[0].completedAt;

    const second = await completeTask(uid, taskId);
    // completedAt should remain the same (task already completed, skipped)
    expect(second.phases[0].tasks[0].completedAt).toEqual(firstCompletedAt);
    // Progress should be the same
    expect(second.overallProgress).toBe(first.overallProgress);
  });
});
