// ============================================================================
// Project CRUD Service — Unit Tests
// Tests for createProject, getProject, updateProject, deleteProject,
// listProjects, calculateProjectHealth, getProjectSummary
// ============================================================================

// --- Mocks (must be defined before imports) ---

const mockEntityFindUnique = jest.fn();
const mockProjectCreate = jest.fn();
const mockProjectFindUnique = jest.fn();
const mockProjectFindMany = jest.fn();
const mockProjectUpdate = jest.fn();
const mockProjectCount = jest.fn();
const mockTaskFindMany = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    entity: {
      findUnique: (...args: unknown[]) => mockEntityFindUnique(...args),
    },
    project: {
      create: (...args: unknown[]) => mockProjectCreate(...args),
      findUnique: (...args: unknown[]) => mockProjectFindUnique(...args),
      findMany: (...args: unknown[]) => mockProjectFindMany(...args),
      update: (...args: unknown[]) => mockProjectUpdate(...args),
      count: (...args: unknown[]) => mockProjectCount(...args),
    },
    task: {
      findMany: (...args: unknown[]) => mockTaskFindMany(...args),
    },
  },
}));

import {
  createProject,
  getProject,
  updateProject,
  deleteProject,
  listProjects,
  calculateProjectHealth,
  getProjectSummary,
} from '@/modules/tasks/services/project-crud';

// --- Helpers ---

function makePrismaProject(overrides: Partial<{
  id: string;
  name: string;
  entityId: string;
  description: string | null;
  milestones: unknown;
  status: string;
  health: string;
  createdAt: Date;
  updatedAt: Date;
}> = {}) {
  const now = new Date();
  return {
    id: overrides.id ?? 'proj-1',
    name: overrides.name ?? 'Test Project',
    entityId: overrides.entityId ?? 'ent-1',
    description: overrides.description ?? null,
    milestones: overrides.milestones ?? [],
    status: overrides.status ?? 'TODO',
    health: overrides.health ?? 'GREEN',
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

// --- Tests ---

describe('ProjectCRUD', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── createProject ─────────────────────────────────────

  describe('createProject', () => {
    it('should create a project with required fields', async () => {
      mockEntityFindUnique.mockResolvedValue({ id: 'ent-1' });
      const prismaProject = makePrismaProject({ name: 'My Project' });
      mockProjectCreate.mockResolvedValue(prismaProject);

      const result = await createProject({ name: 'My Project', entityId: 'ent-1' });

      expect(result.id).toBe('proj-1');
      expect(result.name).toBe('My Project');
      expect(result.entityId).toBe('ent-1');
      expect(result.status).toBe('TODO');
      expect(result.health).toBe('GREEN');
      expect(mockProjectCreate).toHaveBeenCalledTimes(1);
    });

    it('should throw when entity does not exist', async () => {
      mockEntityFindUnique.mockResolvedValue(null);

      await expect(
        createProject({ name: 'Orphan Project', entityId: 'nonexistent' })
      ).rejects.toThrow('Entity not found: nonexistent');
    });

    it('should pass description when provided', async () => {
      mockEntityFindUnique.mockResolvedValue({ id: 'ent-1' });
      const prismaProject = makePrismaProject({ description: 'A description' });
      mockProjectCreate.mockResolvedValue(prismaProject);

      const result = await createProject({
        name: 'Described Project',
        entityId: 'ent-1',
        description: 'A description',
      });

      expect(result.description).toBe('A description');
      expect(mockProjectCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: 'A description',
          }),
        })
      );
    });

    it('should set default status to TODO and health to GREEN', async () => {
      mockEntityFindUnique.mockResolvedValue({ id: 'ent-1' });
      mockProjectCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'proj-new',
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );

      await createProject({ name: 'Defaults', entityId: 'ent-1' });

      expect(mockProjectCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'TODO',
            health: 'GREEN',
          }),
        })
      );
    });

    it('should serialize milestones when provided', async () => {
      mockEntityFindUnique.mockResolvedValue({ id: 'ent-1' });
      const milestones = [
        { id: 'm1', title: 'Alpha Release', dueDate: new Date('2026-06-01'), status: 'TODO' as const },
      ];
      const prismaProject = makePrismaProject({ milestones });
      mockProjectCreate.mockResolvedValue(prismaProject);

      const result = await createProject({
        name: 'With Milestones',
        entityId: 'ent-1',
        milestones,
      });

      expect(result.milestones).toHaveLength(1);
      expect(result.milestones[0].title).toBe('Alpha Release');
    });
  });

  // ─── getProject ────────────────────────────────────────

  describe('getProject', () => {
    it('should return mapped project when found', async () => {
      const prismaProject = makePrismaProject({ id: 'proj-42', name: 'Found' });
      mockProjectFindUnique.mockResolvedValue(prismaProject);

      const result = await getProject('proj-42');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('proj-42');
      expect(result!.name).toBe('Found');
      expect(result!.status).toBe('TODO');
    });

    it('should return null when project does not exist', async () => {
      mockProjectFindUnique.mockResolvedValue(null);

      const result = await getProject('nonexistent');

      expect(result).toBeNull();
    });

    it('should map description null to undefined', async () => {
      const prismaProject = makePrismaProject({ description: null });
      mockProjectFindUnique.mockResolvedValue(prismaProject);

      const result = await getProject('proj-1');

      expect(result).not.toBeNull();
      expect(result!.description).toBeUndefined();
    });
  });

  // ─── updateProject ─────────────────────────────────────

  describe('updateProject', () => {
    it('should update name when provided', async () => {
      const existing = makePrismaProject({ id: 'proj-1', name: 'Old Name' });
      const updated = makePrismaProject({ id: 'proj-1', name: 'New Name' });
      mockProjectFindUnique.mockResolvedValue(existing);
      mockProjectUpdate.mockResolvedValue(updated);

      const result = await updateProject('proj-1', { name: 'New Name' });

      expect(result.name).toBe('New Name');
      expect(mockProjectUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'proj-1' },
          data: expect.objectContaining({ name: 'New Name' }),
        })
      );
    });

    it('should throw when project does not exist', async () => {
      mockProjectFindUnique.mockResolvedValue(null);

      await expect(
        updateProject('nonexistent', { name: 'Updated' })
      ).rejects.toThrow('Project not found: nonexistent');
    });

    it('should update multiple fields at once', async () => {
      const existing = makePrismaProject();
      const updated = makePrismaProject({
        name: 'Updated',
        status: 'IN_PROGRESS',
        health: 'YELLOW',
      });
      mockProjectFindUnique.mockResolvedValue(existing);
      mockProjectUpdate.mockResolvedValue(updated);

      const result = await updateProject('proj-1', {
        name: 'Updated',
        status: 'IN_PROGRESS',
        health: 'YELLOW',
      });

      expect(result.name).toBe('Updated');
      expect(result.status).toBe('IN_PROGRESS');
      expect(result.health).toBe('YELLOW');
    });

    it('should only include defined fields in update data', async () => {
      const existing = makePrismaProject();
      mockProjectFindUnique.mockResolvedValue(existing);
      mockProjectUpdate.mockResolvedValue(makePrismaProject({ description: 'Only this' }));

      await updateProject('proj-1', { description: 'Only this' });

      const updateCall = mockProjectUpdate.mock.calls[0][0];
      expect(updateCall.data).toEqual({ description: 'Only this' });
      expect(updateCall.data.name).toBeUndefined();
      expect(updateCall.data.status).toBeUndefined();
    });
  });

  // ─── deleteProject ─────────────────────────────────────

  describe('deleteProject', () => {
    it('should soft-delete by setting status to CANCELLED', async () => {
      mockProjectUpdate.mockResolvedValue({});

      await deleteProject('proj-1');

      expect(mockProjectUpdate).toHaveBeenCalledWith({
        where: { id: 'proj-1' },
        data: { status: 'CANCELLED' },
      });
    });

    it('should return void (no return value)', async () => {
      mockProjectUpdate.mockResolvedValue({});

      const result = await deleteProject('proj-1');

      expect(result).toBeUndefined();
    });
  });

  // ─── listProjects ──────────────────────────────────────

  describe('listProjects', () => {
    const mockProjects = [
      makePrismaProject({ id: 'p1', name: 'Alpha' }),
      makePrismaProject({ id: 'p2', name: 'Beta' }),
    ];

    it('should return paginated project list', async () => {
      mockProjectFindMany.mockResolvedValue(mockProjects);
      mockProjectCount.mockResolvedValue(2);

      const result = await listProjects('ent-1');

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.data[0].name).toBe('Alpha');
    });

    it('should filter by status', async () => {
      mockProjectFindMany.mockResolvedValue([mockProjects[0]]);
      mockProjectCount.mockResolvedValue(1);

      const result = await listProjects('ent-1', { status: 'TODO' });

      expect(result.data).toHaveLength(1);
      expect(mockProjectFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'TODO' }),
        })
      );
    });

    it('should filter by health', async () => {
      mockProjectFindMany.mockResolvedValue([]);
      mockProjectCount.mockResolvedValue(0);

      const result = await listProjects('ent-1', { health: 'RED' });

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(mockProjectFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ health: 'RED' }),
        })
      );
    });

    it('should apply pagination correctly', async () => {
      mockProjectFindMany.mockResolvedValue([mockProjects[1]]);
      mockProjectCount.mockResolvedValue(2);

      await listProjects('ent-1', undefined, 2, 1);

      expect(mockProjectFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 1,  // (page 2 - 1) * pageSize 1
          take: 1,
        })
      );
    });

    it('should order by updatedAt descending', async () => {
      mockProjectFindMany.mockResolvedValue(mockProjects);
      mockProjectCount.mockResolvedValue(2);

      await listProjects('ent-1');

      expect(mockProjectFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { updatedAt: 'desc' },
        })
      );
    });
  });

  // ─── calculateProjectHealth ────────────────────────────

  describe('calculateProjectHealth', () => {
    it('should return GREEN when no tasks exist', async () => {
      mockTaskFindMany.mockResolvedValue([]);

      const result = await calculateProjectHealth('proj-1');

      expect(result).toBe('GREEN');
    });

    it('should return RED when >30% tasks are overdue', async () => {
      const pastDate = new Date('2020-01-01');
      const tasks = [
        { id: 't1', status: 'TODO', dueDate: pastDate },
        { id: 't2', status: 'TODO', dueDate: pastDate },
        { id: 't3', status: 'DONE', dueDate: null },
      ];
      mockTaskFindMany.mockResolvedValue(tasks);
      mockProjectFindUnique.mockResolvedValue(makePrismaProject({ milestones: [] }));

      const result = await calculateProjectHealth('proj-1');

      // 2 out of 3 overdue = 66% > 30%, so RED
      expect(result).toBe('RED');
    });

    it('should return RED when >20% tasks are blocked', async () => {
      const tasks = [
        { id: 't1', status: 'BLOCKED', dueDate: null },
        { id: 't2', status: 'TODO', dueDate: null },
        { id: 't3', status: 'DONE', dueDate: null },
      ];
      mockTaskFindMany.mockResolvedValue(tasks);
      mockProjectFindUnique.mockResolvedValue(makePrismaProject({ milestones: [] }));

      const result = await calculateProjectHealth('proj-1');

      // 1 out of 3 blocked = 33% > 20%, so RED
      expect(result).toBe('RED');
    });

    it('should return YELLOW when >10% overdue but <=30%', async () => {
      const pastDate = new Date('2020-01-01');
      const tasks = [
        { id: 't1', status: 'TODO', dueDate: pastDate },
        { id: 't2', status: 'DONE', dueDate: null },
        { id: 't3', status: 'DONE', dueDate: null },
        { id: 't4', status: 'DONE', dueDate: null },
        { id: 't5', status: 'DONE', dueDate: null },
        { id: 't6', status: 'DONE', dueDate: null },
      ];
      mockTaskFindMany.mockResolvedValue(tasks);
      mockProjectFindUnique.mockResolvedValue(makePrismaProject({ milestones: [] }));

      const result = await calculateProjectHealth('proj-1');

      // 1 out of 6 overdue = ~16.7% (>10% but <=30%), YELLOW
      expect(result).toBe('YELLOW');
    });

    it('should return GREEN when all metrics are healthy', async () => {
      const tasks = [
        { id: 't1', status: 'DONE', dueDate: null },
        { id: 't2', status: 'DONE', dueDate: null },
        { id: 't3', status: 'DONE', dueDate: null },
        { id: 't4', status: 'DONE', dueDate: null },
      ];
      mockTaskFindMany.mockResolvedValue(tasks);
      mockProjectFindUnique.mockResolvedValue(makePrismaProject({ milestones: [] }));

      const result = await calculateProjectHealth('proj-1');

      // 100% completion, 0% overdue, 0% blocked => GREEN
      expect(result).toBe('GREEN');
    });

    it('should return RED when milestones are overdue', async () => {
      const tasks = [
        { id: 't1', status: 'DONE', dueDate: null },
        { id: 't2', status: 'DONE', dueDate: null },
        { id: 't3', status: 'DONE', dueDate: null },
        { id: 't4', status: 'DONE', dueDate: null },
      ];
      mockTaskFindMany.mockResolvedValue(tasks);
      mockProjectFindUnique.mockResolvedValue(
        makePrismaProject({
          milestones: [
            { id: 'm1', title: 'Past Milestone', dueDate: new Date('2020-01-01'), status: 'TODO' },
          ],
        })
      );

      const result = await calculateProjectHealth('proj-1');

      expect(result).toBe('RED');
    });
  });

  // ─── getProjectSummary ─────────────────────────────────

  describe('getProjectSummary', () => {
    it('should return summary with task counts and completion', async () => {
      const prismaProject = makePrismaProject({ id: 'proj-1', milestones: [] });
      mockProjectFindUnique.mockResolvedValue(prismaProject);

      const tasks = [
        { id: 't1', status: 'TODO', dueDate: null },
        { id: 't2', status: 'IN_PROGRESS', dueDate: null },
        { id: 't3', status: 'DONE', dueDate: null },
        { id: 't4', status: 'DONE', dueDate: null },
      ];
      mockTaskFindMany.mockResolvedValue(tasks);

      const result = await getProjectSummary('proj-1');

      expect(result.project.id).toBe('proj-1');
      expect(result.taskCounts.TODO).toBe(1);
      expect(result.taskCounts.IN_PROGRESS).toBe(1);
      expect(result.taskCounts.DONE).toBe(2);
      expect(result.completionPercent).toBe(50);
    });

    it('should throw when project does not exist', async () => {
      mockProjectFindUnique.mockResolvedValue(null);

      await expect(getProjectSummary('nonexistent')).rejects.toThrow(
        'Project not found: nonexistent'
      );
    });

    it('should return 0% completion when no tasks exist', async () => {
      const prismaProject = makePrismaProject({ milestones: [] });
      mockProjectFindUnique.mockResolvedValue(prismaProject);
      mockTaskFindMany.mockResolvedValue([]);

      const result = await getProjectSummary('proj-1');

      expect(result.completionPercent).toBe(0);
      expect(result.taskCounts.TODO).toBe(0);
      expect(result.taskCounts.DONE).toBe(0);
    });

    it('should identify the next upcoming milestone', async () => {
      const futureDate = new Date('2027-06-01');
      const farFuture = new Date('2028-01-01');
      const milestones = [
        { id: 'm1', title: 'Far Away', dueDate: farFuture, status: 'TODO' },
        { id: 'm2', title: 'Coming Soon', dueDate: futureDate, status: 'TODO' },
      ];
      const prismaProject = makePrismaProject({ milestones });
      mockProjectFindUnique.mockResolvedValue(prismaProject);
      mockTaskFindMany.mockResolvedValue([]);

      const result = await getProjectSummary('proj-1');

      expect(result.nextMilestone).toBeDefined();
      expect(result.nextMilestone!.title).toBe('Coming Soon');
    });
  });
});
