import { EntityService } from '@/modules/entities/entity.service';
import { prisma } from '@/lib/db';

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    entity: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    project: { findMany: jest.fn() },
    task: { findMany: jest.fn() },
    message: { findMany: jest.fn(), count: jest.fn() },
    workflow: { findMany: jest.fn() },
    financialRecord: { findMany: jest.fn(), count: jest.fn() },
    contact: { findMany: jest.fn(), count: jest.fn() },
    calendarEvent: { findMany: jest.fn() },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('EntityService', () => {
  let service: EntityService;

  beforeEach(() => {
    service = new EntityService();
    jest.clearAllMocks();
  });

  // ─── createEntity ─────────────────────────────────────

  describe('createEntity', () => {
    it('should create entity with required fields', async () => {
      const mockEntity = {
        id: 'ent-1',
        userId: 'user-1',
        name: 'Test LLC',
        type: 'LLC',
        complianceProfile: ['GENERAL'],
        brandKit: null,
        voicePersonaId: null,
        phoneNumbers: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.entity.create as jest.Mock).mockResolvedValue(mockEntity);

      const result = await service.createEntity('user-1', {
        name: 'Test LLC',
        type: 'LLC',
      });

      expect(result.name).toBe('Test LLC');
      expect(result.type).toBe('LLC');
      expect(result.userId).toBe('user-1');
    });

    it('should set default compliance profile to GENERAL', async () => {
      const mockEntity = {
        id: 'ent-1',
        userId: 'user-1',
        name: 'Test',
        type: 'Personal',
        complianceProfile: ['GENERAL'],
        brandKit: null,
        voicePersonaId: null,
        phoneNumbers: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.entity.create as jest.Mock).mockResolvedValue(mockEntity);

      await service.createEntity('user-1', { name: 'Test', type: 'Personal' });

      expect(mockPrisma.entity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            complianceProfile: ['GENERAL'],
          }),
        }),
      );
    });

    it('should associate entity with user', async () => {
      const mockEntity = {
        id: 'ent-1',
        userId: 'user-42',
        name: 'Corp',
        type: 'Corporation',
        complianceProfile: [],
        brandKit: null,
        voicePersonaId: null,
        phoneNumbers: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.entity.create as jest.Mock).mockResolvedValue(mockEntity);

      const result = await service.createEntity('user-42', {
        name: 'Corp',
        type: 'Corporation',
        complianceProfile: ['HIPAA'],
      });

      expect(result.userId).toBe('user-42');
      expect(mockPrisma.entity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-42' }),
        }),
      );
    });
  });

  // ─── getEntity ────────────────────────────────────────

  describe('getEntity', () => {
    it('should return entity when user owns it', async () => {
      const mockEntity = {
        id: 'ent-1',
        userId: 'user-1',
        name: 'My Entity',
        type: 'LLC',
        complianceProfile: [],
        brandKit: null,
        voicePersonaId: null,
        phoneNumbers: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.entity.findFirst as jest.Mock).mockResolvedValue(mockEntity);

      const result = await service.getEntity('ent-1', 'user-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('ent-1');
    });

    it('should return null when user does not own it', async () => {
      (mockPrisma.entity.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.getEntity('ent-1', 'other-user');
      expect(result).toBeNull();
    });

    it('should return null for non-existent entity', async () => {
      (mockPrisma.entity.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.getEntity('non-existent', 'user-1');
      expect(result).toBeNull();
    });
  });

  // ─── updateEntity ─────────────────────────────────────

  describe('updateEntity', () => {
    const existingEntity = {
      id: 'ent-1',
      userId: 'user-1',
      name: 'Old Name',
      type: 'LLC',
      complianceProfile: [],
      brandKit: { primaryColor: '#000000', secondaryColor: '#ffffff' },
      voicePersonaId: null,
      phoneNumbers: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should update allowed fields', async () => {
      (mockPrisma.entity.findFirst as jest.Mock).mockResolvedValue(existingEntity);
      (mockPrisma.entity.update as jest.Mock).mockResolvedValue({
        ...existingEntity,
        name: 'New Name',
      });

      const result = await service.updateEntity('ent-1', 'user-1', {
        name: 'New Name',
      });
      expect(result.name).toBe('New Name');
    });

    it('should not allow updating another user entity', async () => {
      (mockPrisma.entity.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateEntity('ent-1', 'other-user', { name: 'Hacked' }),
      ).rejects.toThrow('Entity not found or access denied');
    });

    it('should merge brandKit updates (partial update)', async () => {
      (mockPrisma.entity.findFirst as jest.Mock).mockResolvedValue(existingEntity);
      (mockPrisma.entity.update as jest.Mock).mockResolvedValue({
        ...existingEntity,
        brandKit: {
          primaryColor: '#000000',
          secondaryColor: '#ffffff',
          logoUrl: 'https://example.com/logo.png',
        },
      });

      await service.updateEntity('ent-1', 'user-1', {
        brandKit: { logoUrl: 'https://example.com/logo.png' },
      });

      expect(mockPrisma.entity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            brandKit: expect.objectContaining({
              primaryColor: '#000000',
              secondaryColor: '#ffffff',
              logoUrl: 'https://example.com/logo.png',
            }),
          }),
        }),
      );
    });
  });

  // ─── deleteEntity ─────────────────────────────────────

  describe('deleteEntity', () => {
    it('should delete entity owned by user', async () => {
      (mockPrisma.entity.findFirst as jest.Mock).mockResolvedValue({
        id: 'ent-1',
        userId: 'user-1',
      });
      (mockPrisma.entity.delete as jest.Mock).mockResolvedValue({});

      await expect(
        service.deleteEntity('ent-1', 'user-1'),
      ).resolves.not.toThrow();
    });

    it('should reject deletion of entity not owned by user', async () => {
      (mockPrisma.entity.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.deleteEntity('ent-1', 'other-user'),
      ).rejects.toThrow('Entity not found or access denied');
    });
  });

  // ─── listEntities ─────────────────────────────────────

  describe('listEntities', () => {
    const mockEntities = [
      {
        id: 'ent-1',
        userId: 'user-1',
        name: 'Alpha',
        type: 'LLC',
        complianceProfile: [],
        brandKit: null,
        voicePersonaId: null,
        phoneNumbers: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'ent-2',
        userId: 'user-1',
        name: 'Beta',
        type: 'Corporation',
        complianceProfile: [],
        brandKit: null,
        voicePersonaId: null,
        phoneNumbers: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    it('should return paginated results', async () => {
      (mockPrisma.entity.findMany as jest.Mock).mockResolvedValue(mockEntities);
      (mockPrisma.entity.count as jest.Mock).mockResolvedValue(2);

      const result = await service.listEntities('user-1', {
        page: 1,
        pageSize: 10,
      });
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
    });

    it('should filter by type', async () => {
      (mockPrisma.entity.findMany as jest.Mock).mockResolvedValue([mockEntities[0]]);
      (mockPrisma.entity.count as jest.Mock).mockResolvedValue(1);

      const result = await service.listEntities('user-1', { type: 'LLC' });
      expect(result.data).toHaveLength(1);
      expect(mockPrisma.entity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'LLC' }),
        }),
      );
    });

    it('should search by name', async () => {
      (mockPrisma.entity.findMany as jest.Mock).mockResolvedValue([mockEntities[0]]);
      (mockPrisma.entity.count as jest.Mock).mockResolvedValue(1);

      await service.listEntities('user-1', { search: 'Alpha' });
      expect(mockPrisma.entity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: { contains: 'Alpha', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('should sort by specified field', async () => {
      (mockPrisma.entity.findMany as jest.Mock).mockResolvedValue(mockEntities);
      (mockPrisma.entity.count as jest.Mock).mockResolvedValue(2);

      await service.listEntities('user-1', {
        sortBy: 'name',
        sortOrder: 'asc',
      });
      expect(mockPrisma.entity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { name: 'asc' },
        }),
      );
    });
  });

  // ─── getEntityHealth ──────────────────────────────────

  describe('getEntityHealth', () => {
    const baseEntity = {
      id: 'ent-1',
      userId: 'user-1',
      name: 'Test Entity',
      type: 'LLC',
      complianceProfile: ['GENERAL'],
      brandKit: null,
      voicePersonaId: null,
      phoneNumbers: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    function mockHealthData(overrides: {
      projects?: unknown[];
      tasks?: unknown[];
      messages?: unknown[];
      workflows?: unknown[];
      financials?: unknown[];
      contacts?: unknown[];
    }) {
      (mockPrisma.entity.findUniqueOrThrow as jest.Mock).mockResolvedValue(baseEntity);
      (mockPrisma.project.findMany as jest.Mock).mockResolvedValue(overrides.projects ?? []);
      (mockPrisma.task.findMany as jest.Mock).mockResolvedValue(overrides.tasks ?? []);
      (mockPrisma.message.findMany as jest.Mock).mockResolvedValue(overrides.messages ?? []);
      (mockPrisma.workflow.findMany as jest.Mock).mockResolvedValue(overrides.workflows ?? []);
      (mockPrisma.financialRecord.findMany as jest.Mock).mockResolvedValue(overrides.financials ?? []);
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue(overrides.contacts ?? []);
    }

    it('should calculate GREEN health when no issues', async () => {
      mockHealthData({});
      const result = await service.getEntityHealth('ent-1');
      expect(result.overallHealth).toBe('GREEN');
      expect(result.alerts).toHaveLength(0);
    });

    it('should calculate YELLOW health when some tasks overdue', async () => {
      const pastDate = new Date('2020-01-01');
      mockHealthData({
        tasks: [
          {
            id: 't1',
            title: 'Overdue',
            priority: 'P1',
            status: 'TODO',
            dueDate: pastDate,
            updatedAt: new Date(),
          },
        ],
      });

      const result = await service.getEntityHealth('ent-1');
      expect(result.overallHealth).toBe('YELLOW');
      expect(result.metrics.overdueTasks).toBe(1);
    });

    it('should calculate RED health when critical issues exist', async () => {
      const pastDate = new Date('2020-01-01');
      mockHealthData({
        tasks: [
          {
            id: 't1',
            title: 'Critical Overdue',
            priority: 'P0',
            status: 'TODO',
            dueDate: pastDate,
            updatedAt: new Date(),
          },
        ],
        projects: [
          { id: 'p1', name: 'Bad Project', status: 'IN_PROGRESS', health: 'RED', updatedAt: new Date() },
        ],
      });

      const result = await service.getEntityHealth('ent-1');
      expect(result.overallHealth).toBe('RED');
      expect(result.alerts.some((a) => a.severity === 'CRITICAL')).toBe(true);
    });

    it('should count metrics correctly', async () => {
      const pastDate = new Date('2020-01-01');
      mockHealthData({
        tasks: [
          { id: 't1', title: 'Open', priority: 'P0', status: 'TODO', dueDate: null, updatedAt: new Date() },
          { id: 't2', title: 'Done', priority: 'P1', status: 'DONE', dueDate: null, updatedAt: new Date() },
          { id: 't3', title: 'Overdue', priority: 'P1', status: 'IN_PROGRESS', dueDate: pastDate, updatedAt: new Date() },
        ],
        projects: [
          { id: 'p1', name: 'Active', status: 'IN_PROGRESS', health: 'GREEN', updatedAt: new Date() },
          { id: 'p2', name: 'At Risk', status: 'IN_PROGRESS', health: 'YELLOW', updatedAt: new Date() },
        ],
        contacts: [
          { id: 'c1', name: 'Alice', relationshipScore: 80, lastTouch: new Date() },
          { id: 'c2', name: 'Bob', relationshipScore: 60, lastTouch: new Date() },
        ],
        financials: [
          { id: 'f1', type: 'INVOICE', status: 'PAID', amount: 1000, createdAt: new Date() },
          { id: 'f2', type: 'EXPENSE', status: 'PAID', amount: 500, createdAt: new Date() },
          { id: 'f3', type: 'INVOICE', status: 'PENDING', amount: 200, createdAt: new Date() },
        ],
      });

      const result = await service.getEntityHealth('ent-1');
      expect(result.metrics.openTasks).toBe(2);
      expect(result.metrics.overdueTasks).toBe(1);
      expect(result.metrics.activeProjects).toBe(2);
      expect(result.metrics.projectsAtRisk).toBe(1);
      expect(result.metrics.contactCount).toBe(2);
      expect(result.metrics.avgRelationshipScore).toBe(70);
      expect(result.metrics.totalRevenue).toBe(1000);
      expect(result.metrics.totalExpenses).toBe(500);
      expect(result.metrics.pendingFinancials).toBe(1);
    });
  });

  // ─── getUnifiedExecutiveView ──────────────────────────

  describe('getUnifiedExecutiveView', () => {
    it('should aggregate metrics across all entities', async () => {
      const entities = [
        {
          id: 'ent-1',
          userId: 'user-1',
          name: 'Entity 1',
          type: 'LLC',
          complianceProfile: ['GENERAL'],
          brandKit: null,
          voicePersonaId: null,
          phoneNumbers: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (mockPrisma.entity.findMany as jest.Mock).mockResolvedValue(entities);
      (mockPrisma.entity.findUniqueOrThrow as jest.Mock).mockResolvedValue(entities[0]);
      (mockPrisma.project.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.task.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.message.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.workflow.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.financialRecord.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.calendarEvent.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getUnifiedExecutiveView('user-1');
      expect(result.userId).toBe('user-1');
      expect(result.entities).toHaveLength(1);
      expect(result.aggregated).toBeDefined();
    });

    it('should identify shared vendors', async () => {
      const entities = [
        { id: 'ent-1', userId: 'user-1', name: 'A', type: 'LLC', complianceProfile: ['GENERAL'], brandKit: null, voicePersonaId: null, phoneNumbers: [], createdAt: new Date(), updatedAt: new Date() },
        { id: 'ent-2', userId: 'user-1', name: 'B', type: 'LLC', complianceProfile: ['GENERAL'], brandKit: null, voicePersonaId: null, phoneNumbers: [], createdAt: new Date(), updatedAt: new Date() },
      ];

      (mockPrisma.entity.findMany as jest.Mock).mockResolvedValue(entities);
      (mockPrisma.entity.findUniqueOrThrow as jest.Mock).mockImplementation(
        ({ where }: { where: { id: string } }) =>
          Promise.resolve(entities.find((e) => e.id === where.id)),
      );
      (mockPrisma.project.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.task.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.message.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.workflow.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.calendarEvent.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.financialRecord.findMany as jest.Mock).mockResolvedValue([
        { id: 'f1', entityId: 'ent-1', vendor: 'ACME Corp', type: 'EXPENSE', status: 'PAID', amount: 100 },
        { id: 'f2', entityId: 'ent-2', vendor: 'ACME Corp', type: 'EXPENSE', status: 'PAID', amount: 200 },
      ]);

      const result = await service.getUnifiedExecutiveView('user-1');
      expect(result.crossEntityInsights.sharedVendors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ vendor: 'ACME Corp' }),
        ]),
      );
    });

    it('should calculate net cash flow', async () => {
      const entities = [
        { id: 'ent-1', userId: 'user-1', name: 'A', type: 'LLC', complianceProfile: ['GENERAL'], brandKit: null, voicePersonaId: null, phoneNumbers: [], createdAt: new Date(), updatedAt: new Date() },
      ];

      (mockPrisma.entity.findMany as jest.Mock).mockResolvedValue(entities);
      (mockPrisma.entity.findUniqueOrThrow as jest.Mock).mockResolvedValue(entities[0]);
      (mockPrisma.project.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.task.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.message.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.workflow.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.calendarEvent.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.financialRecord.findMany as jest.Mock).mockResolvedValue([
        { id: 'f1', entityId: 'ent-1', type: 'INVOICE', status: 'PAID', amount: 5000, createdAt: new Date() },
        { id: 'f2', entityId: 'ent-1', type: 'EXPENSE', status: 'PAID', amount: 2000, createdAt: new Date() },
      ]);

      const result = await service.getUnifiedExecutiveView('user-1');
      expect(result.aggregated.totalRevenue).toBe(5000);
      expect(result.aggregated.totalExpenses).toBe(2000);
      expect(result.aggregated.netCashFlow).toBe(3000);
    });
  });

  // ─── findSharedContacts ───────────────────────────────

  describe('findSharedContacts', () => {
    it('should find contacts appearing in multiple entities by email', async () => {
      const entities = [
        { id: 'ent-1', userId: 'user-1', name: 'A' },
        { id: 'ent-2', userId: 'user-1', name: 'B' },
      ];

      (mockPrisma.entity.findMany as jest.Mock).mockResolvedValue(entities);
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        { id: 'c1', entityId: 'ent-1', name: 'John', email: 'john@test.com', phone: null, tags: ['client'] },
        { id: 'c2', entityId: 'ent-2', name: 'John Doe', email: 'john@test.com', phone: null, tags: ['vendor'] },
      ]);

      const result = await service.findSharedContacts('user-1');
      expect(result).toHaveLength(1);
      expect(result[0].email).toBe('john@test.com');
      expect(result[0].appearsIn).toHaveLength(2);
    });

    it('should find contacts appearing in multiple entities by phone', async () => {
      const entities = [
        { id: 'ent-1', userId: 'user-1', name: 'A' },
        { id: 'ent-2', userId: 'user-1', name: 'B' },
      ];

      (mockPrisma.entity.findMany as jest.Mock).mockResolvedValue(entities);
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        { id: 'c1', entityId: 'ent-1', name: 'Jane', email: null, phone: '+1-555-123-4567', tags: [] },
        { id: 'c2', entityId: 'ent-2', name: 'Jane S', email: null, phone: '15551234567', tags: [] },
      ]);

      const result = await service.findSharedContacts('user-1');
      expect(result).toHaveLength(1);
      expect(result[0].appearsIn).toHaveLength(2);
    });

    it('should return empty for no shared contacts', async () => {
      const entities = [
        { id: 'ent-1', userId: 'user-1', name: 'A' },
        { id: 'ent-2', userId: 'user-1', name: 'B' },
      ];

      (mockPrisma.entity.findMany as jest.Mock).mockResolvedValue(entities);
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        { id: 'c1', entityId: 'ent-1', name: 'Alice', email: 'alice@test.com', phone: null, tags: [] },
        { id: 'c2', entityId: 'ent-2', name: 'Bob', email: 'bob@test.com', phone: null, tags: [] },
      ]);

      const result = await service.findSharedContacts('user-1');
      expect(result).toHaveLength(0);
    });
  });
});
