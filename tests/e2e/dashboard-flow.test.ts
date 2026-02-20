/**
 * E2E Test: Dashboard Flow
 * Tests the dashboard experience for an authenticated user:
 * - Dashboard data loading (stats endpoints)
 * - Quick actions availability (task creation, calendar, inbox)
 * - Activity feed loading (inbox stats, memory stats)
 * - Navigation between modules (tasks, calendar, finance, inbox)
 * - Unauthorized access to dashboard endpoints
 *
 * Routes under test:
 * - GET /api/tasks (task list for dashboard)
 * - GET /api/calendar (calendar view for dashboard)
 * - GET /api/inbox/stats (inbox stats for dashboard widget)
 * - GET /api/finance/dashboard (finance summary widget)
 * - GET /api/memory/stats (memory/activity stats)
 * - GET /api/attention (notification routing config)
 * - POST /api/tasks (quick action: create task)
 */

// --- Infrastructure mocks (must be before imports) ---

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
  entity: {
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
  task: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  financialRecord: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  message: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

jest.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}));

jest.mock('@/lib/ai', () => ({
  generateText: jest.fn(),
  generateJSON: jest.fn(),
  chat: jest.fn(),
  streamText: jest.fn(),
}));

// Mock the service modules that routes depend on
const mockListTasks = jest.fn();
const mockCreateTask = jest.fn();
jest.mock('@/modules/tasks/services/task-crud', () => ({
  listTasks: (...args: unknown[]) => mockListTasks(...args),
  createTask: (...args: unknown[]) => mockCreateTask(...args),
}));

const mockGetCalendarViewData = jest.fn();
const mockCreateEvent = jest.fn();
jest.mock('@/modules/calendar/scheduling.service', () => ({
  SchedulingService: jest.fn().mockImplementation(() => ({
    getCalendarViewData: (...args: unknown[]) => mockGetCalendarViewData(...args),
    createEvent: (...args: unknown[]) => mockCreateEvent(...args),
  })),
}));

const mockGetInboxStats = jest.fn();
jest.mock('@/modules/inbox', () => ({
  InboxService: jest.fn().mockImplementation(() => ({
    getInboxStats: (...args: unknown[]) => mockGetInboxStats(...args),
  })),
}));

const mockGetUnifiedDashboard = jest.fn();
jest.mock('@/modules/finance/services/dashboard-service', () => ({
  getUnifiedDashboard: (...args: unknown[]) => mockGetUnifiedDashboard(...args),
}));

const mockGetMemoryStats = jest.fn();
jest.mock('@/engines/memory/memory-service', () => ({
  getMemoryStats: (...args: unknown[]) => mockGetMemoryStats(...args),
}));

const mockGetRoutingConfig = jest.fn();
const mockRouteNotification = jest.fn();
const mockUpdateRoutingConfig = jest.fn();
jest.mock('@/modules/attention/services/priority-router', () => ({
  getRoutingConfig: (...args: unknown[]) => mockGetRoutingConfig(...args),
  routeNotification: (...args: unknown[]) => mockRouteNotification(...args),
  updateRoutingConfig: (...args: unknown[]) => mockUpdateRoutingConfig(...args),
}));

// Must mock calendar validation to avoid import issues
jest.mock('@/modules/calendar/calendar.validation', () => ({
  calendarViewSchema: {
    safeParse: jest.fn().mockReturnValue({
      success: true,
      data: {
        viewMode: 'week',
        date: new Date().toISOString(),
        entityId: 'entity-1',
      },
    }),
  },
  scheduleRequestSchema: {
    safeParse: jest.fn().mockReturnValue({
      success: true,
      data: {
        title: 'Test Event',
        entityId: 'entity-1',
        duration: 60,
      },
    }),
  },
}));

import { getToken } from 'next-auth/jwt';
import { GET as tasksGetHandler, POST as tasksPostHandler } from '@/app/api/tasks/route';
import { GET as calendarGetHandler } from '@/app/api/calendar/route';
import { GET as inboxStatsGetHandler } from '@/app/api/inbox/stats/route';
import { GET as financeDashboardGetHandler } from '@/app/api/finance/dashboard/route';
import { GET as memoryStatsGetHandler } from '@/app/api/memory/stats/route';
import { GET as attentionGetHandler } from '@/app/api/attention/route';
import {
  createMockSession,
  createMockEntity,
  createGetRequest,
  createPostRequest,
  expectSuccessResponse,
  expectErrorResponse,
} from './setup';

const mockedGetToken = getToken as jest.MockedFunction<typeof getToken>;

// --- Test Suite ---

describe('Dashboard Flow E2E Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. Dashboard Data Loading (Stats Endpoints)
  // =========================================================================

  describe('Dashboard Data Loading', () => {
    it('should load task list for dashboard widget', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      const mockTasks = {
        data: [
          {
            id: 'task-1',
            title: 'Review quarterly report',
            status: 'TODO',
            priority: 'P0',
            dueDate: new Date('2026-02-25'),
            entityId: 'entity-1',
          },
          {
            id: 'task-2',
            title: 'Prepare presentation',
            status: 'IN_PROGRESS',
            priority: 'P1',
            dueDate: new Date('2026-02-28'),
            entityId: 'entity-1',
          },
          {
            id: 'task-3',
            title: 'Send follow-up emails',
            status: 'TODO',
            priority: 'P2',
            dueDate: null,
            entityId: 'entity-1',
          },
        ],
        total: 3,
      };

      mockListTasks.mockResolvedValue(mockTasks);

      const req = createGetRequest('/api/tasks', {
        entityId: 'entity-1',
        status: 'TODO,IN_PROGRESS',
        page: '1',
        pageSize: '10',
      });

      const res = await tasksGetHandler(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(3);
      expect(body.meta.total).toBe(3);
      expect(body.meta.page).toBe(1);
      expect(body.meta.pageSize).toBe(10);

      // Verify service was called with correct filters
      expect(mockListTasks).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: 'entity-1',
          status: ['TODO', 'IN_PROGRESS'],
        }),
        undefined,
        1,
        10
      );
    });

    it('should load inbox stats for dashboard widget', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      const mockStats = {
        total: 42,
        unread: 8,
        urgent: 2,
        needsResponse: 5,
        byChannel: {
          EMAIL: 30,
          SMS: 7,
          SLACK: 5,
        },
      };

      mockGetInboxStats.mockResolvedValue(mockStats);

      const req = createGetRequest('/api/inbox/stats', {
        entityId: 'entity-1',
      });

      const res = await inboxStatsGetHandler(req);
      const body = await expectSuccessResponse(res, 200);

      expect(body.data).toEqual(mockStats);
      expect(mockGetInboxStats).toHaveBeenCalledWith('user-1', 'entity-1');
    });

    it('should load finance dashboard summary', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      const mockDashboard = {
        summaries: [
          {
            entityId: 'entity-1',
            entityName: 'Personal',
            totalIncome: 15000,
            totalExpenses: 5000,
            netCashFlow: 10000,
            pendingInvoices: 3,
            pendingInvoiceAmount: 4500,
            overdueBills: 0,
            overdueBillAmount: 0,
            currency: 'USD',
          },
        ],
        alerts: [],
        crossEntityTotal: {
          totalIncome: 15000,
          totalExpenses: 5000,
          netCashFlow: 10000,
        },
      };

      mockGetUnifiedDashboard.mockResolvedValue(mockDashboard);

      const req = createGetRequest('/api/finance/dashboard', {
        userId: 'user-1',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-03-31T23:59:59.999Z',
      });

      const res = await financeDashboardGetHandler(req);
      const body = await expectSuccessResponse(res, 200);

      expect(body.data).toEqual(mockDashboard);
      expect(mockGetUnifiedDashboard).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          start: expect.any(Date),
          end: expect.any(Date),
        })
      );
    });

    it('should load memory/activity stats', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      const mockMemoryStats = {
        totalMemories: 150,
        shortTerm: 12,
        working: 5,
        longTerm: 120,
        episodic: 13,
        recentAccess: 8,
        decayPending: 3,
      };

      mockGetMemoryStats.mockResolvedValue(mockMemoryStats);

      const req = createGetRequest('/api/memory/stats');

      const res = await memoryStatsGetHandler(req);
      const body = await expectSuccessResponse(res, 200);

      expect(body.data).toEqual(mockMemoryStats);
      expect(mockGetMemoryStats).toHaveBeenCalledWith('user-1');
    });

    it('should load calendar view data for dashboard', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      const mockCalendarData = {
        events: [
          {
            id: 'event-1',
            title: 'Team Standup',
            start: new Date('2026-02-20T09:00:00Z'),
            end: new Date('2026-02-20T09:30:00Z'),
            entityId: 'entity-1',
          },
          {
            id: 'event-2',
            title: 'Client Meeting',
            start: new Date('2026-02-20T14:00:00Z'),
            end: new Date('2026-02-20T15:00:00Z'),
            entityId: 'entity-1',
          },
        ],
        conflicts: [],
        freeSlots: [
          { start: new Date('2026-02-20T10:00:00Z'), end: new Date('2026-02-20T12:00:00Z') },
        ],
      };

      mockGetCalendarViewData.mockResolvedValue(mockCalendarData);

      const req = createGetRequest('/api/calendar', {
        viewMode: 'week',
        date: '2026-02-20T00:00:00.000Z',
        entityId: 'entity-1',
      });

      const res = await calendarGetHandler(req);
      const body = await expectSuccessResponse(res, 200);

      // Dates are serialized to ISO strings in JSON responses
      const data = body.data as Record<string, unknown>;
      const events = data.events as Record<string, unknown>[];
      expect(events).toHaveLength(2);
      expect(events[0].id).toBe('event-1');
      expect(events[0].title).toBe('Team Standup');
      expect(events[0].start).toBe('2026-02-20T09:00:00.000Z');
      expect(events[0].end).toBe('2026-02-20T09:30:00.000Z');
      expect(events[1].id).toBe('event-2');
      expect(events[1].title).toBe('Client Meeting');
      expect(data.conflicts).toEqual([]);
      expect((data.freeSlots as unknown[]).length).toBe(1);
    });

    it('should load attention/notification routing config', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      const mockConfig = {
        rules: [
          { priority: 'P0', action: 'INTERRUPT', channels: ['push', 'sms'] },
          { priority: 'P1', action: 'NEXT_DIGEST', channels: ['push'] },
          { priority: 'P2', action: 'WEEKLY_REVIEW', channels: ['email'] },
        ],
      };

      mockGetRoutingConfig.mockResolvedValue(mockConfig);

      const req = createGetRequest('/api/attention');

      const res = await attentionGetHandler(req);
      const body = await expectSuccessResponse(res, 200);

      expect(body.data).toEqual(mockConfig);
      expect(mockGetRoutingConfig).toHaveBeenCalledWith('user-1');
    });
  });

  // =========================================================================
  // 2. Quick Actions Availability
  // =========================================================================

  describe('Quick Actions', () => {
    it('should create a task via quick action (POST /api/tasks)', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      const newTask = {
        id: 'quick-task-1',
        title: 'Quick capture: Call dentist',
        entityId: 'entity-1',
        status: 'TODO',
        priority: 'P1',
        tags: ['quick-capture'],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCreateTask.mockResolvedValue(newTask);

      const req = createPostRequest('/api/tasks', {
        title: 'Quick capture: Call dentist',
        entityId: 'entity-1',
        priority: 'P1',
        tags: ['quick-capture'],
      });

      const res = await tasksPostHandler(req);
      const body = await expectSuccessResponse(res, 201);

      // Dates are serialized to ISO strings in JSON responses
      const data = body.data as Record<string, unknown>;
      expect(data.id).toBe('quick-task-1');
      expect(data.title).toBe('Quick capture: Call dentist');
      expect(data.entityId).toBe('entity-1');
      expect(data.status).toBe('TODO');
      expect(data.priority).toBe('P1');
      expect(data.tags).toEqual(['quick-capture']);
      expect(data.createdAt).toBeDefined();
      expect(data.updatedAt).toBeDefined();
      expect(mockCreateTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Quick capture: Call dentist',
          entityId: 'entity-1',
          priority: 'P1',
          tags: ['quick-capture'],
        })
      );
    });

    it('should reject task creation with missing title', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      const req = createPostRequest('/api/tasks', {
        entityId: 'entity-1',
        // missing title
      });

      const res = await tasksPostHandler(req);

      await expectErrorResponse(res, 400, 'VALIDATION_ERROR');
    });

    it('should reject task creation with missing entityId', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      const req = createPostRequest('/api/tasks', {
        title: 'A task without entity',
        // missing entityId
      });

      const res = await tasksPostHandler(req);

      await expectErrorResponse(res, 400, 'VALIDATION_ERROR');
    });

    it('should handle task creation service errors gracefully', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      mockCreateTask.mockRejectedValue(new Error('Database connection timeout'));

      const req = createPostRequest('/api/tasks', {
        title: 'Task that will fail',
        entityId: 'entity-1',
      });

      const res = await tasksPostHandler(req);

      await expectErrorResponse(res, 500, 'CREATE_FAILED');
    });
  });

  // =========================================================================
  // 3. Activity Feed Loading
  // =========================================================================

  describe('Activity Feed Loading', () => {
    it('should load inbox stats as part of activity feed', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      const mockStats = {
        total: 25,
        unread: 3,
        urgent: 1,
        needsResponse: 2,
        byChannel: { EMAIL: 20, SMS: 5 },
      };

      mockGetInboxStats.mockResolvedValue(mockStats);

      const req = createGetRequest('/api/inbox/stats', {
        entityId: 'entity-1',
      });

      const res = await inboxStatsGetHandler(req);
      const body = await expectSuccessResponse(res, 200);

      const stats = body.data as Record<string, unknown>;
      expect(stats.total).toBe(25);
      expect(stats.unread).toBe(3);
      expect(stats.urgent).toBe(1);
    });

    it('should load memory stats for activity tracking', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      const mockMemoryStats = {
        totalMemories: 200,
        shortTerm: 15,
        working: 8,
        longTerm: 160,
        episodic: 17,
        recentAccess: 12,
        decayPending: 5,
      };

      mockGetMemoryStats.mockResolvedValue(mockMemoryStats);

      const req = createGetRequest('/api/memory/stats');

      const res = await memoryStatsGetHandler(req);
      const body = await expectSuccessResponse(res, 200);

      const stats = body.data as Record<string, unknown>;
      expect(stats.totalMemories).toBe(200);
      expect(stats.recentAccess).toBe(12);
    });

    it('should handle inbox stats service error gracefully', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      mockGetInboxStats.mockRejectedValue(new Error('Redis connection failed'));

      const req = createGetRequest('/api/inbox/stats', {
        entityId: 'entity-1',
      });

      const res = await inboxStatsGetHandler(req);

      await expectErrorResponse(res, 500, 'INTERNAL_ERROR');
    });

    it('should handle memory stats service error gracefully', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      mockGetMemoryStats.mockRejectedValue(new Error('Memory store unavailable'));

      const req = createGetRequest('/api/memory/stats');

      const res = await memoryStatsGetHandler(req);

      await expectErrorResponse(res, 500, 'INTERNAL_ERROR');
    });
  });

  // =========================================================================
  // 4. Navigation Between Modules
  // =========================================================================

  describe('Navigation Between Modules', () => {
    it('should load tasks with different filter configurations', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      // First: load all TODO tasks
      mockListTasks.mockResolvedValueOnce({
        data: [
          { id: 'task-1', title: 'TODO Task', status: 'TODO', priority: 'P1' },
        ],
        total: 1,
      });

      const todoReq = createGetRequest('/api/tasks', {
        entityId: 'entity-1',
        status: 'TODO',
        page: '1',
        pageSize: '20',
      });

      const todoRes = await tasksGetHandler(todoReq);
      const todoBody = await todoRes.json();

      expect(todoRes.status).toBe(200);
      expect(todoBody.data).toHaveLength(1);
      expect(mockListTasks).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'TODO' }),
        undefined,
        1,
        20
      );

      // Then: navigate to "all tasks" view
      mockListTasks.mockResolvedValueOnce({
        data: [
          { id: 'task-1', title: 'TODO Task', status: 'TODO', priority: 'P1' },
          { id: 'task-2', title: 'Done Task', status: 'DONE', priority: 'P2' },
          { id: 'task-3', title: 'In Progress', status: 'IN_PROGRESS', priority: 'P0' },
        ],
        total: 3,
      });

      const allReq = createGetRequest('/api/tasks', {
        entityId: 'entity-1',
        page: '1',
        pageSize: '20',
      });

      const allRes = await tasksGetHandler(allReq);
      const allBody = await allRes.json();

      expect(allRes.status).toBe(200);
      expect(allBody.data).toHaveLength(3);
    });

    it('should load tasks with priority filter for P0 items', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      mockListTasks.mockResolvedValue({
        data: [
          { id: 'task-urgent', title: 'Critical Fix', status: 'TODO', priority: 'P0' },
        ],
        total: 1,
      });

      const req = createGetRequest('/api/tasks', {
        entityId: 'entity-1',
        priority: 'P0',
        page: '1',
        pageSize: '20',
      });

      const res = await tasksGetHandler(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toHaveLength(1);
      expect(mockListTasks).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 'P0' }),
        undefined,
        1,
        20
      );
    });

    it('should load tasks with sorting', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      mockListTasks.mockResolvedValue({
        data: [
          { id: 'task-2', title: 'Later task', status: 'TODO', priority: 'P2', dueDate: new Date('2026-03-01') },
          { id: 'task-1', title: 'Earlier task', status: 'TODO', priority: 'P1', dueDate: new Date('2026-02-22') },
        ],
        total: 2,
      });

      const req = createGetRequest('/api/tasks', {
        entityId: 'entity-1',
        sort: 'dueDate:asc',
        page: '1',
        pageSize: '20',
      });

      const res = await tasksGetHandler(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toHaveLength(2);
      expect(mockListTasks).toHaveBeenCalledWith(
        expect.objectContaining({ entityId: 'entity-1' }),
        { field: 'dueDate', direction: 'asc' },
        1,
        20
      );
    });

    it('should navigate from tasks to calendar view', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      // Load calendar after viewing tasks
      mockGetCalendarViewData.mockResolvedValue({
        events: [
          {
            id: 'event-1',
            title: 'Meeting',
            start: new Date('2026-02-20T10:00:00Z'),
            end: new Date('2026-02-20T11:00:00Z'),
          },
        ],
        conflicts: [],
        freeSlots: [],
      });

      const calReq = createGetRequest('/api/calendar', {
        viewMode: 'day',
        date: '2026-02-20T00:00:00.000Z',
        entityId: 'entity-1',
      });

      const calRes = await calendarGetHandler(calReq);
      const calBody = await expectSuccessResponse(calRes, 200);

      const calData = calBody.data as Record<string, unknown>;
      expect(calData.events).toBeDefined();
      expect((calData.events as unknown[]).length).toBe(1);
    });

    it('should navigate from tasks to finance dashboard', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      mockGetUnifiedDashboard.mockResolvedValue({
        summaries: [
          {
            entityId: 'entity-1',
            entityName: 'Personal',
            totalIncome: 20000,
            totalExpenses: 8000,
            netCashFlow: 12000,
            pendingInvoices: 1,
            pendingInvoiceAmount: 2000,
            overdueBills: 0,
            overdueBillAmount: 0,
            currency: 'USD',
          },
        ],
        alerts: [
          {
            id: 'alert-1',
            type: 'LOW_BALANCE',
            severity: 'INFO',
            message: 'Checking account below $5,000 threshold',
          },
        ],
        crossEntityTotal: {
          totalIncome: 20000,
          totalExpenses: 8000,
          netCashFlow: 12000,
        },
      });

      const finReq = createGetRequest('/api/finance/dashboard', {
        userId: 'user-1',
        startDate: '2026-02-01T00:00:00.000Z',
        endDate: '2026-02-28T23:59:59.999Z',
      });

      const finRes = await financeDashboardGetHandler(finReq);
      const finBody = await expectSuccessResponse(finRes, 200);

      const finData = finBody.data as Record<string, unknown>;
      expect(finData.summaries).toBeDefined();
      expect(finData.alerts).toBeDefined();
      expect(finData.crossEntityTotal).toBeDefined();
    });
  });

  // =========================================================================
  // 5. Unauthorized Access to Dashboard Endpoints
  // =========================================================================

  describe('Unauthorized Access to Dashboard Endpoints', () => {
    it('should return 401 for unauthenticated task list', async () => {
      mockedGetToken.mockResolvedValue(null);

      const req = createGetRequest('/api/tasks', { entityId: 'entity-1' });
      const res = await tasksGetHandler(req);

      await expectErrorResponse(res, 401, 'UNAUTHORIZED');
    });

    it('should return 401 for unauthenticated task creation', async () => {
      mockedGetToken.mockResolvedValue(null);

      const req = createPostRequest('/api/tasks', {
        title: 'Sneaky task',
        entityId: 'entity-1',
      });
      const res = await tasksPostHandler(req);

      await expectErrorResponse(res, 401, 'UNAUTHORIZED');
    });

    it('should return 401 for unauthenticated calendar view', async () => {
      mockedGetToken.mockResolvedValue(null);

      const req = createGetRequest('/api/calendar');
      const res = await calendarGetHandler(req);

      await expectErrorResponse(res, 401, 'UNAUTHORIZED');
    });

    it('should return 401 for unauthenticated inbox stats', async () => {
      mockedGetToken.mockResolvedValue(null);

      const req = createGetRequest('/api/inbox/stats');
      const res = await inboxStatsGetHandler(req);

      await expectErrorResponse(res, 401, 'UNAUTHORIZED');
    });

    it('should return 401 for unauthenticated finance dashboard', async () => {
      mockedGetToken.mockResolvedValue(null);

      const req = createGetRequest('/api/finance/dashboard', {
        userId: 'user-1',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-03-31T23:59:59.999Z',
      });
      const res = await financeDashboardGetHandler(req);

      await expectErrorResponse(res, 401, 'UNAUTHORIZED');
    });

    it('should return 401 for unauthenticated memory stats', async () => {
      mockedGetToken.mockResolvedValue(null);

      const req = createGetRequest('/api/memory/stats');
      const res = await memoryStatsGetHandler(req);

      await expectErrorResponse(res, 401, 'UNAUTHORIZED');
    });

    it('should return 401 for unauthenticated attention config', async () => {
      mockedGetToken.mockResolvedValue(null);

      const req = createGetRequest('/api/attention');
      const res = await attentionGetHandler(req);

      await expectErrorResponse(res, 401, 'UNAUTHORIZED');
    });
  });

  // =========================================================================
  // 6. Dashboard with Empty Data
  // =========================================================================

  describe('Dashboard with Empty Data (New User)', () => {
    it('should handle empty task list gracefully', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      mockListTasks.mockResolvedValue({
        data: [],
        total: 0,
      });

      const req = createGetRequest('/api/tasks', {
        entityId: 'entity-1',
        page: '1',
        pageSize: '20',
      });

      const res = await tasksGetHandler(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toHaveLength(0);
      expect(body.meta.total).toBe(0);
    });

    it('should handle empty inbox stats for new user', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      mockGetInboxStats.mockResolvedValue({
        total: 0,
        unread: 0,
        urgent: 0,
        needsResponse: 0,
        byChannel: {},
      });

      const req = createGetRequest('/api/inbox/stats', {
        entityId: 'entity-1',
      });

      const res = await inboxStatsGetHandler(req);
      const body = await expectSuccessResponse(res, 200);

      const stats = body.data as Record<string, unknown>;
      expect(stats.total).toBe(0);
      expect(stats.unread).toBe(0);
    });

    it('should handle zero-balance finance dashboard', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      mockGetUnifiedDashboard.mockResolvedValue({
        summaries: [
          {
            entityId: 'entity-1',
            entityName: 'Personal',
            totalIncome: 0,
            totalExpenses: 0,
            netCashFlow: 0,
            pendingInvoices: 0,
            pendingInvoiceAmount: 0,
            overdueBills: 0,
            overdueBillAmount: 0,
            currency: 'USD',
          },
        ],
        alerts: [],
        crossEntityTotal: {
          totalIncome: 0,
          totalExpenses: 0,
          netCashFlow: 0,
        },
      });

      const req = createGetRequest('/api/finance/dashboard', {
        userId: 'user-1',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-03-31T23:59:59.999Z',
      });

      const res = await financeDashboardGetHandler(req);
      const body = await expectSuccessResponse(res, 200);

      const data = body.data as Record<string, unknown>;
      const summaries = data.summaries as Record<string, unknown>[];
      expect(summaries[0].totalIncome).toBe(0);
      expect(summaries[0].netCashFlow).toBe(0);
    });
  });

  // =========================================================================
  // 7. Concurrent Dashboard Requests (Simulated Parallel Load)
  // =========================================================================

  describe('Concurrent Dashboard Requests', () => {
    it('should handle multiple dashboard endpoints being called concurrently', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      // Setup all mocks
      mockListTasks.mockResolvedValue({ data: [{ id: 'task-1', title: 'Task' }], total: 1 });
      mockGetInboxStats.mockResolvedValue({ total: 5, unread: 2, urgent: 0, needsResponse: 1, byChannel: {} });
      mockGetMemoryStats.mockResolvedValue({ totalMemories: 50, shortTerm: 5, working: 3, longTerm: 40, episodic: 2 });
      mockGetRoutingConfig.mockResolvedValue({ rules: [] });

      // Fire all requests concurrently
      const [tasksRes, inboxRes, memoryRes, attentionRes] = await Promise.all([
        tasksGetHandler(createGetRequest('/api/tasks', { entityId: 'entity-1', page: '1', pageSize: '5' })),
        inboxStatsGetHandler(createGetRequest('/api/inbox/stats', { entityId: 'entity-1' })),
        memoryStatsGetHandler(createGetRequest('/api/memory/stats')),
        attentionGetHandler(createGetRequest('/api/attention')),
      ]);

      // All should succeed
      expect(tasksRes.status).toBe(200);
      expect(inboxRes.status).toBe(200);
      expect(memoryRes.status).toBe(200);
      expect(attentionRes.status).toBe(200);

      // All services should have been called
      expect(mockListTasks).toHaveBeenCalled();
      expect(mockGetInboxStats).toHaveBeenCalled();
      expect(mockGetMemoryStats).toHaveBeenCalled();
      expect(mockGetRoutingConfig).toHaveBeenCalled();
    });
  });
});
