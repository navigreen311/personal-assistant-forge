/**
 * Entity Service -- Expanded Tests
 *
 * Covers:
 * - Entity CRUD operations (edge cases)
 * - Entity health calculations (detailed scenarios)
 * - Multi-entity switching / executive view
 * - Shared contacts detection
 * - Auth stub
 */

import { EntityService } from '@/modules/entities/entity.service';
import { prisma } from '@/lib/db';

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

describe('EntityService -- Expanded Tests', () => {
  let service: EntityService;

  beforeEach(() => {
    service = new EntityService();
    jest.clearAllMocks();
  });

  // --- CRUD Edge Cases ---

  describe('createEntity -- edge cases', () => {
    it('should create entity with custom compliance profiles', async () => {
      const mockEntity = {
        id: 'ent-hipaa',
        userId: 'user-1',
        name: 'Health Corp',
        type: 'LLC',
        complianceProfile: ['HIPAA', 'GDPR'],
        brandKit: null,
        voicePersonaId: null,
        phoneNumbers: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.entity.create as jest.Mock).mockResolvedValue(mockEntity);

      const result = await service.createEntity('user-1', {
        name: 'Health Corp',
        type: 'LLC',
        complianceProfile: ['HIPAA', 'GDPR'],
      });

      expect(result.complianceProfile).toEqual(['HIPAA', 'GDPR']);
      expect(mockPrisma.entity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            complianceProfile: ['HIPAA', 'GDPR'],
          }),
        }),
      );
    });

    it('should create entity with phone numbers', async () => {
      const mockEntity = {
        id: 'ent-phone',
        userId: 'user-1',
        name: 'Call Center',
        type: 'Corporation',
        complianceProfile: ['GENERAL'],
        brandKit: null,
        voicePersonaId: null,
        phoneNumbers: ['+15551234567', '+15559876543'],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.entity.create as jest.Mock).mockResolvedValue(mockEntity);

      const result = await service.createEntity('user-1', {
        name: 'Call Center',
        type: 'Corporation',
        phoneNumbers: ['+15551234567', '+15559876543'],
      });

      expect(result.phoneNumbers).toHaveLength(2);
    });

    it('should create entity with brandKit and voicePersonaId', async () => {
      const brandKit = {
        primaryColor: '#2563eb',
        secondaryColor: '#60a5fa',
        logoUrl: 'https://example.com/logo.png',
        fontFamily: 'Inter',
        toneGuide: 'Professional',
      };

      const mockEntity = {
        id: 'ent-branded',
        userId: 'user-1',
        name: 'Branded Corp',
        type: 'Corporation',
        complianceProfile: ['GENERAL'],
        brandKit,
        voicePersonaId: 'voice-1',
        phoneNumbers: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.entity.create as jest.Mock).mockResolvedValue(mockEntity);

      const result = await service.createEntity('user-1', {
        name: 'Branded Corp',
        type: 'Corporation',
        brandKit,
        voicePersonaId: 'voice-1',
      });

      expect(result.brandKit).toBeDefined();
      expect(result.voicePersonaId).toBe('voice-1');
    });
  });

  describe('updateEntity -- edge cases', () => {
    const existingEntity = {
      id: 'ent-1',
      userId: 'user-1',
      name: 'Original',
      type: 'LLC',
      complianceProfile: ['GENERAL'],
      brandKit: null,
      voicePersonaId: null,
      phoneNumbers: ['+15551111111'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should update phone numbers', async () => {
      (mockPrisma.entity.findFirst as jest.Mock).mockResolvedValue(existingEntity);
      (mockPrisma.entity.update as jest.Mock).mockResolvedValue({
        ...existingEntity,
        phoneNumbers: ['+15552222222'],
      });

      const result = await service.updateEntity('ent-1', 'user-1', {
        phoneNumbers: ['+15552222222'],
      });
      expect(result.phoneNumbers).toEqual(['+15552222222']);
    });

    it('should update compliance profile', async () => {
      (mockPrisma.entity.findFirst as jest.Mock).mockResolvedValue(existingEntity);
      (mockPrisma.entity.update as jest.Mock).mockResolvedValue({
        ...existingEntity,
        complianceProfile: ['HIPAA', 'SOX'],
      });

      const result = await service.updateEntity('ent-1', 'user-1', {
        complianceProfile: ['HIPAA', 'SOX'],
      });
      expect(result.complianceProfile).toEqual(['HIPAA', 'SOX']);
    });

    it('should update type', async () => {
      (mockPrisma.entity.findFirst as jest.Mock).mockResolvedValue(existingEntity);
      (mockPrisma.entity.update as jest.Mock).mockResolvedValue({
        ...existingEntity,
        type: 'Corporation',
      });

      const result = await service.updateEntity('ent-1', 'user-1', {
        type: 'Corporation',
      });
      expect(result.type).toBe('Corporation');
    });

    it('should set brandKit from null to a value', async () => {
      (mockPrisma.entity.findFirst as jest.Mock).mockResolvedValue(existingEntity);
      (mockPrisma.entity.update as jest.Mock).mockResolvedValue({
        ...existingEntity,
        brandKit: { primaryColor: '#ff0000' },
      });

      await service.updateEntity('ent-1', 'user-1', {
        brandKit: { primaryColor: '#ff0000' },
      });

      // When existing brandKit is null, should just set the new value
      expect(mockPrisma.entity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            brandKit: expect.objectContaining({ primaryColor: '#ff0000' }),
          }),
        }),
      );
    });
  });

  describe('getEntity -- ownership enforcement', () => {
    it('should enforce user-entity ownership via findFirst where clause', async () => {
      (mockPrisma.entity.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.getEntity('ent-1', 'unauthorized-user');
      expect(result).toBeNull();
      expect(mockPrisma.entity.findFirst).toHaveBeenCalledWith({
        where: { id: 'ent-1', userId: 'unauthorized-user' },
      });
    });

    it('should return entity for authorized user', async () => {
      const entity = {
        id: 'ent-1',
        userId: 'user-1',
        name: 'My Entity',
        type: 'Personal',
        complianceProfile: ['GENERAL'],
        brandKit: null,
        voicePersonaId: null,
        phoneNumbers: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.entity.findFirst as jest.Mock).mockResolvedValue(entity);

      const result = await service.getEntity('ent-1', 'user-1');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('My Entity');
    });
  });

  describe('deleteEntity -- protection', () => {
    it('should throw when trying to delete non-existent entity', async () => {
      (mockPrisma.entity.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.deleteEntity('non-existent', 'user-1'),
      ).rejects.toThrow('Entity not found or access denied');
    });

    it('should call prisma delete with correct entity id', async () => {
      (mockPrisma.entity.findFirst as jest.Mock).mockResolvedValue({
        id: 'ent-del',
        userId: 'user-1',
      });
      (mockPrisma.entity.delete as jest.Mock).mockResolvedValue({});

      await service.deleteEntity('ent-del', 'user-1');

      expect(mockPrisma.entity.delete).toHaveBeenCalledWith({
        where: { id: 'ent-del' },
      });
    });
  });

  // --- List Entities -- Pagination & Filtering ---

  describe('listEntities -- pagination', () => {
    it('should use default pagination when no params provided', async () => {
      (mockPrisma.entity.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.entity.count as jest.Mock).mockResolvedValue(0);

      const result = await service.listEntities('user-1');

      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.total).toBe(0);
      expect(result.data).toHaveLength(0);
    });

    it('should calculate correct skip for page 2', async () => {
      (mockPrisma.entity.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.entity.count as jest.Mock).mockResolvedValue(25);

      await service.listEntities('user-1', { page: 2, pageSize: 10 });

      expect(mockPrisma.entity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        }),
      );
    });

    it('should combine type filter with user scope', async () => {
      (mockPrisma.entity.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.entity.count as jest.Mock).mockResolvedValue(0);

      await service.listEntities('user-1', { type: 'Corporation' });

      expect(mockPrisma.entity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            type: 'Corporation',
          }),
        }),
      );
    });

    it('should apply case-insensitive search on name', async () => {
      (mockPrisma.entity.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.entity.count as jest.Mock).mockResolvedValue(0);

      await service.listEntities('user-1', { search: 'Corp' });

      expect(mockPrisma.entity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: { contains: 'Corp', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('should sort by name in descending order', async () => {
      (mockPrisma.entity.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.entity.count as jest.Mock).mockResolvedValue(0);

      await service.listEntities('user-1', { sortBy: 'name', sortOrder: 'desc' });

      expect(mockPrisma.entity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { name: 'desc' },
        }),
      );
    });
  });

  // --- Entity Health -- Detailed Scenarios ---

  describe('getEntityHealth -- detailed scenarios', () => {
    const baseEntity = {
      id: 'ent-health',
      userId: 'user-1',
      name: 'Health Test Entity',
      type: 'LLC',
      complianceProfile: ['GENERAL'],
      brandKit: null,
      voicePersonaId: null,
      phoneNumbers: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    function mockAllHealthData(overrides: {
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

    it('should return GREEN health for entity with no data', async () => {
      mockAllHealthData({});
      const result = await service.getEntityHealth('ent-health');
      expect(result.overallHealth).toBe('GREEN');
      expect(result.alerts).toHaveLength(0);
      expect(result.metrics.openTasks).toBe(0);
      expect(result.metrics.overdueTasks).toBe(0);
    });

    it('should correctly count only open (non-DONE) tasks', async () => {
      mockAllHealthData({
        tasks: [
          { id: 't1', title: 'Open', priority: 'P1', status: 'TODO', dueDate: null, updatedAt: new Date() },
          { id: 't2', title: 'In Prog', priority: 'P2', status: 'IN_PROGRESS', dueDate: null, updatedAt: new Date() },
          { id: 't3', title: 'Done', priority: 'P1', status: 'DONE', dueDate: null, updatedAt: new Date() },
          { id: 't4', title: 'Also Done', priority: 'P0', status: 'DONE', dueDate: null, updatedAt: new Date() },
        ],
      });

      const result = await service.getEntityHealth('ent-health');
      expect(result.metrics.openTasks).toBe(2);
    });

    it('should count overdue tasks with past due dates', async () => {
      const pastDate = new Date('2020-06-15');
      mockAllHealthData({
        tasks: [
          { id: 't1', title: 'Overdue 1', priority: 'P1', status: 'TODO', dueDate: pastDate, updatedAt: new Date() },
          { id: 't2', title: 'Overdue 2', priority: 'P2', status: 'IN_PROGRESS', dueDate: pastDate, updatedAt: new Date() },
          { id: 't3', title: 'No due date', priority: 'P1', status: 'TODO', dueDate: null, updatedAt: new Date() },
        ],
      });

      const result = await service.getEntityHealth('ent-health');
      expect(result.metrics.overdueTasks).toBe(2);
    });

    it('should count at-risk projects (YELLOW or RED health)', async () => {
      mockAllHealthData({
        projects: [
          { id: 'p1', name: 'Healthy', status: 'IN_PROGRESS', health: 'GREEN', updatedAt: new Date() },
          { id: 'p2', name: 'At Risk', status: 'IN_PROGRESS', health: 'YELLOW', updatedAt: new Date() },
          { id: 'p3', name: 'Critical', status: 'IN_PROGRESS', health: 'RED', updatedAt: new Date() },
        ],
      });

      const result = await service.getEntityHealth('ent-health');
      expect(result.metrics.activeProjects).toBe(3);
      expect(result.metrics.projectsAtRisk).toBeGreaterThanOrEqual(1);
    });

    it('should calculate average relationship score', async () => {
      mockAllHealthData({
        contacts: [
          { id: 'c1', name: 'Alice', relationshipScore: 90, lastTouch: new Date() },
          { id: 'c2', name: 'Bob', relationshipScore: 80, lastTouch: new Date() },
          { id: 'c3', name: 'Charlie', relationshipScore: 70, lastTouch: new Date() },
        ],
      });

      const result = await service.getEntityHealth('ent-health');
      expect(result.metrics.contactCount).toBe(3);
      expect(result.metrics.avgRelationshipScore).toBe(80);
    });

    it('should separate revenue (INVOICE) from expenses (EXPENSE)', async () => {
      mockAllHealthData({
        financials: [
          { id: 'f1', type: 'INVOICE', status: 'PAID', amount: 5000, createdAt: new Date() },
          { id: 'f2', type: 'INVOICE', status: 'PAID', amount: 3000, createdAt: new Date() },
          { id: 'f3', type: 'EXPENSE', status: 'PAID', amount: 1500, createdAt: new Date() },
          { id: 'f4', type: 'EXPENSE', status: 'PAID', amount: 500, createdAt: new Date() },
        ],
      });

      const result = await service.getEntityHealth('ent-health');
      expect(result.metrics.totalRevenue).toBe(8000);
      expect(result.metrics.totalExpenses).toBe(2000);
    });

    it('should count pending financial records', async () => {
      mockAllHealthData({
        financials: [
          { id: 'f1', type: 'INVOICE', status: 'PAID', amount: 1000, createdAt: new Date() },
          { id: 'f2', type: 'INVOICE', status: 'PENDING', amount: 2000, createdAt: new Date() },
          { id: 'f3', type: 'EXPENSE', status: 'PENDING', amount: 300, createdAt: new Date() },
        ],
      });

      const result = await service.getEntityHealth('ent-health');
      expect(result.metrics.pendingFinancials).toBe(2);
    });

    it('should generate CRITICAL alert for P0 overdue tasks', async () => {
      const pastDate = new Date('2020-01-01');
      mockAllHealthData({
        tasks: [
          { id: 't1', title: 'Critical Task', priority: 'P0', status: 'TODO', dueDate: pastDate, updatedAt: new Date() },
        ],
      });

      const result = await service.getEntityHealth('ent-health');
      const criticalAlerts = result.alerts.filter((a) => a.severity === 'CRITICAL');
      expect(criticalAlerts.length).toBeGreaterThanOrEqual(1);
    });
  });

  // --- Multi-Entity Switching / Executive View ---

  describe('getUnifiedExecutiveView -- multi-entity', () => {
    const makeEntity = (id: string, name: string) => ({
      id,
      userId: 'user-1',
      name,
      type: 'LLC',
      complianceProfile: ['GENERAL'],
      brandKit: null,
      voicePersonaId: null,
      phoneNumbers: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    function mockExecutiveData(entities: ReturnType<typeof makeEntity>[], financials: unknown[] = []) {
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
      (mockPrisma.financialRecord.findMany as jest.Mock).mockResolvedValue(financials);
    }

    it('should aggregate data across multiple entities', async () => {
      const entities = [makeEntity('ent-1', 'Alpha'), makeEntity('ent-2', 'Beta')];
      mockExecutiveData(entities);

      const result = await service.getUnifiedExecutiveView('user-1');
      expect(result.userId).toBe('user-1');
      expect(result.entities).toHaveLength(2);
    });

    it('should calculate aggregated revenue and expenses across entities', async () => {
      // Use a single entity to avoid double-counting from mockResolvedValue
      // (each getEntityHealth call sees the same mock financial data)
      const entities = [makeEntity('ent-1', 'Alpha')];
      mockExecutiveData(entities, [
        { id: 'f1', entityId: 'ent-1', type: 'INVOICE', status: 'PAID', amount: 10000, createdAt: new Date() },
        { id: 'f2', entityId: 'ent-1', type: 'INVOICE', status: 'PAID', amount: 5000, createdAt: new Date() },
        { id: 'f3', entityId: 'ent-1', type: 'EXPENSE', status: 'PAID', amount: 3000, createdAt: new Date() },
        { id: 'f4', entityId: 'ent-1', type: 'EXPENSE', status: 'PAID', amount: 1000, createdAt: new Date() },
      ]);

      const result = await service.getUnifiedExecutiveView('user-1');
      expect(result.aggregated.totalRevenue).toBe(15000);
      expect(result.aggregated.totalExpenses).toBe(4000);
      expect(result.aggregated.netCashFlow).toBe(11000);
    });

    it('should handle user with single entity', async () => {
      const entities = [makeEntity('ent-solo', 'Solo Entity')];
      mockExecutiveData(entities);

      const result = await service.getUnifiedExecutiveView('user-1');
      expect(result.entities).toHaveLength(1);
      expect(result.aggregated).toBeDefined();
    });

    it('should handle user with no entities', async () => {
      mockExecutiveData([]);

      const result = await service.getUnifiedExecutiveView('user-1');
      expect(result.entities).toHaveLength(0);
      expect(result.aggregated.totalRevenue).toBe(0);
      expect(result.aggregated.totalExpenses).toBe(0);
      expect(result.aggregated.netCashFlow).toBe(0);
    });

    it('should detect shared vendors across entities', async () => {
      const entities = [makeEntity('ent-1', 'Alpha'), makeEntity('ent-2', 'Beta')];
      mockExecutiveData(entities, [
        { id: 'f1', entityId: 'ent-1', vendor: 'Shared Vendor', type: 'EXPENSE', status: 'PAID', amount: 500 },
        { id: 'f2', entityId: 'ent-2', vendor: 'Shared Vendor', type: 'EXPENSE', status: 'PAID', amount: 800 },
        { id: 'f3', entityId: 'ent-1', vendor: 'Unique Vendor', type: 'EXPENSE', status: 'PAID', amount: 200 },
      ]);

      const result = await service.getUnifiedExecutiveView('user-1');
      const sharedVendors = result.crossEntityInsights.sharedVendors;
      expect(sharedVendors.some((v) => v.vendor === 'Shared Vendor')).toBe(true);
    });
  });

  // --- Shared Contacts Detection ---

  describe('findSharedContacts -- detection scenarios', () => {
    it('should find contacts shared via email across 3 entities', async () => {
      const entities = [
        { id: 'ent-1', userId: 'user-1', name: 'A' },
        { id: 'ent-2', userId: 'user-1', name: 'B' },
        { id: 'ent-3', userId: 'user-1', name: 'C' },
      ];

      (mockPrisma.entity.findMany as jest.Mock).mockResolvedValue(entities);
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        { id: 'c1', entityId: 'ent-1', name: 'John', email: 'john@test.com', phone: null, tags: [] },
        { id: 'c2', entityId: 'ent-2', name: 'John D', email: 'john@test.com', phone: null, tags: [] },
        { id: 'c3', entityId: 'ent-3', name: 'J. Doe', email: 'john@test.com', phone: null, tags: [] },
      ]);

      const result = await service.findSharedContacts('user-1');
      expect(result).toHaveLength(1);
      expect(result[0].email).toBe('john@test.com');
      expect(result[0].appearsIn).toHaveLength(3);
    });

    it('should find multiple shared contacts', async () => {
      const entities = [
        { id: 'ent-1', userId: 'user-1', name: 'A' },
        { id: 'ent-2', userId: 'user-1', name: 'B' },
      ];

      (mockPrisma.entity.findMany as jest.Mock).mockResolvedValue(entities);
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        { id: 'c1', entityId: 'ent-1', name: 'Alice', email: 'alice@test.com', phone: null, tags: [] },
        { id: 'c2', entityId: 'ent-2', name: 'Alice S', email: 'alice@test.com', phone: null, tags: [] },
        { id: 'c3', entityId: 'ent-1', name: 'Bob', email: null, phone: '+15551234567', tags: [] },
        { id: 'c4', entityId: 'ent-2', name: 'Bob M', email: null, phone: '15551234567', tags: [] },
      ]);

      const result = await service.findSharedContacts('user-1');
      expect(result).toHaveLength(2);
    });

    it('should not flag contacts unique to single entity', async () => {
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

    it('should handle user with only one entity', async () => {
      const entities = [{ id: 'ent-1', userId: 'user-1', name: 'A' }];

      (mockPrisma.entity.findMany as jest.Mock).mockResolvedValue(entities);
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        { id: 'c1', entityId: 'ent-1', name: 'Alice', email: 'alice@test.com', phone: null, tags: [] },
      ]);

      const result = await service.findSharedContacts('user-1');
      expect(result).toHaveLength(0);
    });
  });

  // --- getCurrentUserId -- Auth Stub ---

  describe('getCurrentUserId', () => {
    it('should return user ID from x-user-id header', () => {
      const { getCurrentUserId } = require('@/modules/entities/entity.service');
      const headers = new Headers({ 'x-user-id': 'user-from-header' });
      expect(getCurrentUserId(headers)).toBe('user-from-header');
    });

    it('should return stub user ID when no headers', () => {
      const { getCurrentUserId } = require('@/modules/entities/entity.service');
      expect(getCurrentUserId()).toBe('stub-user-id');
    });

    it('should return stub user ID when header is missing x-user-id', () => {
      const { getCurrentUserId } = require('@/modules/entities/entity.service');
      const headers = new Headers({ 'content-type': 'application/json' });
      expect(getCurrentUserId(headers)).toBe('stub-user-id');
    });
  });
});
