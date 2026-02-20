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

import {
  initializeChecklist,
  getChecklist,
  completeTask,
  getCurrentPhase,
} from '@/engines/adoption/activation-service';

// Make crypto.randomUUID deterministic for testing
let uuidCounter = 0;

function resetUUIDs() {
  uuidCounter = 0;
}

beforeAll(() => {
  jest.spyOn(crypto, 'randomUUID').mockImplementation(() => {
    uuidCounter++;
    const padded = String(uuidCounter).padStart(12, '0');
    return ('00000000-0000-0000-0000-' + padded) as ReturnType<typeof crypto.randomUUID>;
  });
});

afterAll(() => {
  jest.restoreAllMocks();
});

beforeEach(() => {
  _adoptionStore.clear();
  resetUUIDs();
});

describe('activation-service', () => {
  it('should initialize checklist with 5 phases and 15 tasks', async () => {
    const uid = 'init-user';
    resetUUIDs();
    const checklist = await initializeChecklist(uid);

    expect(checklist.userId).toBe(uid);
    expect(checklist.phases).toHaveLength(5);

    const totalTasks = checklist.phases.reduce((sum, p) => sum + p.tasks.length, 0);
    expect(totalTasks).toBe(15);

    for (const phase of checklist.phases) {
      expect(phase.tasks).toHaveLength(3);
      expect(phase.status).toBe('NOT_STARTED');
    }

    expect(checklist.overallProgress).toBe(0);
    expect(checklist.currentDay).toBe(1);
  });

  it('should return existing checklist or initialize new one via getChecklist', async () => {
    const uid = 'get-user';

    resetUUIDs();
    const checklist1 = await getChecklist(uid);
    expect(checklist1.userId).toBe(uid);
    expect(checklist1.phases).toHaveLength(5);

    resetUUIDs();
    const checklist2 = await getChecklist(uid);
    expect(checklist2.userId).toBe(uid);
    expect(checklist2.phases).toHaveLength(5);

    expect(checklist2.phases[0].tasks[0].id).toBe(checklist1.phases[0].tasks[0].id);
  });

  it('should mark task complete and update phase status', async () => {
    const uid = 'complete-user';
    resetUUIDs();
    const checklist = await initializeChecklist(uid);
    const taskId = checklist.phases[0].tasks[0].id;

    resetUUIDs();
    const updated = await completeTask(uid, taskId);
    const task = updated.phases[0].tasks.find(t => t.id === taskId);

    expect(task?.isComplete).toBe(true);
    expect(task?.completedAt).toBeInstanceOf(Date);
    expect(updated.phases[0].status).toBe('IN_PROGRESS');

    resetUUIDs();
    const taskId2 = (await getChecklist(uid)).phases[0].tasks[1].id;
    resetUUIDs();
    await completeTask(uid, taskId2);

    resetUUIDs();
    const taskId3 = (await getChecklist(uid)).phases[0].tasks[2].id;
    resetUUIDs();
    const fullyCompleted = await completeTask(uid, taskId3);

    expect(fullyCompleted.phases[0].status).toBe('COMPLETE');
  });

  it('should update overall progress percentage', async () => {
    const uid = 'progress-user';

    resetUUIDs();
    const checklist = await initializeChecklist(uid);
    expect(checklist.overallProgress).toBe(0);

    resetUUIDs();
    const taskId = (await getChecklist(uid)).phases[0].tasks[0].id;
    resetUUIDs();
    const updated = await completeTask(uid, taskId);
    expect(updated.overallProgress).toBe(Math.round((1 / 15) * 100));

    resetUUIDs();
    const taskId2 = (await getChecklist(uid)).phases[0].tasks[1].id;
    resetUUIDs();
    await completeTask(uid, taskId2);

    resetUUIDs();
    const taskId3 = (await getChecklist(uid)).phases[0].tasks[2].id;
    resetUUIDs();
    const updated3 = await completeTask(uid, taskId3);
    expect(updated3.overallProgress).toBe(Math.round((3 / 15) * 100));
  });

  it('should return the phase matching the current day range', async () => {
    const uid = 'phase-user';
    resetUUIDs();
    await initializeChecklist(uid);

    resetUUIDs();
    const phase = await getCurrentPhase(uid);
    expect(phase.name).toBe('Inbox Mastery');
    expect(phase.dayRange[0]).toBeLessThanOrEqual(1);
    expect(phase.dayRange[1]).toBeGreaterThanOrEqual(1);
  });

  it('should not re-complete an already completed task', async () => {
    const uid = 'idempotent-user';
    resetUUIDs();
    const checklist = await initializeChecklist(uid);
    const taskId = checklist.phases[0].tasks[0].id;

    resetUUIDs();
    const first = await completeTask(uid, taskId);
    const firstCompletedAt = first.phases[0].tasks[0].completedAt;

    resetUUIDs();
    const second = await completeTask(uid, taskId);
    expect(second.phases[0].tasks[0].completedAt).toEqual(firstCompletedAt);
    expect(second.overallProgress).toBe(first.overallProgress);
  });
});
