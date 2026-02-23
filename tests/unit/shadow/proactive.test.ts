// ---- Prisma mock ----

jest.mock('@/lib/db', () => ({
  prisma: {
    entity: { findMany: jest.fn(), findUnique: jest.fn() },
    calendarEvent: { findMany: jest.fn() },
    message: { findMany: jest.fn(), count: jest.fn() },
    task: { findMany: jest.fn(), count: jest.fn() },
    financialRecord: { findMany: jest.fn() },
    budget: { findMany: jest.fn() },
    notification: { create: jest.fn(), count: jest.fn() },
    shadowOutreach: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
    shadowProactiveConfig: { findUnique: jest.fn(), upsert: jest.fn() },
    shadowChannelEffectiveness: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    shadowTrigger: { findMany: jest.fn(), update: jest.fn() },
    shadowEntityProfile: { findUnique: jest.fn() },
    shadowVoiceSession: { findUnique: jest.fn(), update: jest.fn() },
    workflow: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    contact: { findMany: jest.fn() },
  },
}));

import { prisma } from '@/lib/db';
import { MorningBriefingService } from '@/modules/shadow/proactive/morning-briefing';
import { NotificationEscalator } from '@/modules/shadow/proactive/notification-escalator';
import { AdaptiveChannelService } from '@/modules/shadow/proactive/adaptive-channel';
import { DigestOptimizer } from '@/modules/shadow/proactive/digest-optimizer';
import { WorkflowCompanionService } from '@/modules/shadow/proactive/workflow-companion';
import { EntityPersonaService } from '@/modules/shadow/proactive/entity-persona';
import { SuggestionEngine } from '@/modules/shadow/proactive/suggestion-engine';

// ---- Typed mocks ----

const mockEntity = prisma.entity as jest.Mocked<typeof prisma.entity>;
const mockCalendarEvent = prisma.calendarEvent as jest.Mocked<typeof prisma.calendarEvent>;
const mockMessage = prisma.message as jest.Mocked<typeof prisma.message>;
const mockTask = prisma.task as jest.Mocked<typeof prisma.task>;
const mockFinancialRecord = prisma.financialRecord as jest.Mocked<typeof prisma.financialRecord>;
const mockBudget = prisma.budget as jest.Mocked<typeof prisma.budget>;
const mockNotification = prisma.notification as jest.Mocked<typeof prisma.notification>;
const mockShadowOutreach = prisma.shadowOutreach as jest.Mocked<typeof prisma.shadowOutreach>;
const mockProactiveConfig = prisma.shadowProactiveConfig as jest.Mocked<typeof prisma.shadowProactiveConfig>;
const mockChannelEffectiveness = prisma.shadowChannelEffectiveness as jest.Mocked<typeof prisma.shadowChannelEffectiveness>;
const mockShadowTrigger = prisma.shadowTrigger as jest.Mocked<typeof prisma.shadowTrigger>;
const mockShadowEntityProfile = prisma.shadowEntityProfile as jest.Mocked<typeof prisma.shadowEntityProfile>;
const mockShadowVoiceSession = prisma.shadowVoiceSession as jest.Mocked<typeof prisma.shadowVoiceSession>;
const mockWorkflow = prisma.workflow as jest.Mocked<typeof prisma.workflow>;
const mockContact = prisma.contact as jest.Mocked<typeof prisma.contact>;

// ---- Common test data ----

const USER_ID = 'user-1';
const ENTITY_ID = 'entity-1';
const SESSION_ID = 'session-1';

function mockDefaultEntities() {
  (mockEntity.findMany as jest.Mock).mockResolvedValue([
    { id: ENTITY_ID, userId: USER_ID, name: 'TestEntity', type: 'Personal' },
  ]);
}

// ===========================================================================
// Morning Briefing Service
// ===========================================================================

describe('MorningBriefingService', () => {
  let service: MorningBriefingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MorningBriefingService();
    mockDefaultEntities();
  });

  describe('generateBriefing', () => {
    it('should return a complete briefing structure with all sections', async () => {
      // Setup mocks for all parallel queries
      (mockCalendarEvent.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'ev-1',
          title: 'Team Standup',
          startTime: new Date('2026-02-23T09:00:00'),
          endTime: new Date('2026-02-23T09:30:00'),
        },
        {
          id: 'ev-2',
          title: 'Client Call',
          startTime: new Date('2026-02-23T14:00:00'),
          endTime: new Date('2026-02-23T15:00:00'),
        },
      ]);

      (mockMessage.findMany as jest.Mock).mockResolvedValue([
        { id: 'm-1', triageScore: 9, intent: 'NEEDS_REPLY', read: false },
        { id: 'm-2', triageScore: 5, intent: 'INFO', read: false },
        { id: 'm-3', triageScore: 2, intent: 'FYI', read: false },
      ]);

      (mockTask.findMany as jest.Mock)
        .mockResolvedValueOnce([ // overdue
          { id: 't-1', title: 'Overdue task', priority: 'P1', dueDate: new Date('2026-02-20') },
        ])
        .mockResolvedValueOnce([ // due today
          { id: 't-2', title: 'Due today', priority: 'P2', dueDate: new Date('2026-02-23') },
        ])
        .mockResolvedValueOnce([ // top priorities
          { id: 't-3', title: 'Top priority', priority: 'P0', dueDate: new Date('2026-02-24') },
        ]);

      (mockFinancialRecord.findMany as jest.Mock).mockResolvedValue([
        { id: 'f-1', type: 'INVOICE', amount: 5000, dueDate: new Date('2026-02-20') },
      ]);

      (mockBudget.findMany as jest.Mock).mockResolvedValue([
        { id: 'b-1', name: 'Marketing', amount: 10000, spent: 9200, status: 'active' },
      ]);

      const result = await service.generateBriefing(USER_ID);

      // Verify structure
      expect(result).toHaveProperty('calendar');
      expect(result).toHaveProperty('inbox');
      expect(result).toHaveProperty('tasks');
      expect(result).toHaveProperty('finance');
      expect(result).toHaveProperty('recommendations');
      expect(result).toHaveProperty('summary');

      // Verify calendar
      expect(result.calendar.events).toHaveLength(2);
      expect(result.calendar.events[0].title).toBe('Team Standup');
      expect(result.calendar.events[0].type).toBe('meeting');
      expect(result.calendar.events[1].type).toBe('call');
      expect(result.calendar.conflicts).toBe(0);

      // Verify inbox
      expect(result.inbox.total).toBe(3);
      expect(result.inbox.urgent).toBe(1);
      expect(result.inbox.needsReply).toBe(1);
      expect(result.inbox.fyi).toBe(1);

      // Verify tasks
      expect(result.tasks.overdue).toBe(1);
      expect(result.tasks.dueToday).toBe(1);
      expect(result.tasks.topPriorities).toHaveLength(1);
      expect(result.tasks.topPriorities[0].priority).toBe('P0');

      // Verify finance
      expect(result.finance.overdueInvoices).toBe(1);
      expect(result.finance.cashFlowAlert).toContain('5,000');
      expect(result.finance.budgetWarnings).toHaveLength(1);
      expect(result.finance.budgetWarnings[0]).toContain('Marketing');

      // Verify recommendations
      expect(result.recommendations.length).toBeGreaterThan(0);

      // Verify summary is a non-empty string
      expect(typeof result.summary).toBe('string');
      expect(result.summary.length).toBeGreaterThan(10);
    });

    it('should detect calendar conflicts when events overlap', async () => {
      (mockCalendarEvent.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'ev-1',
          title: 'Meeting A',
          startTime: new Date('2026-02-23T10:00:00'),
          endTime: new Date('2026-02-23T11:00:00'),
        },
        {
          id: 'ev-2',
          title: 'Meeting B',
          startTime: new Date('2026-02-23T10:30:00'),
          endTime: new Date('2026-02-23T11:30:00'),
        },
      ]);

      (mockMessage.findMany as jest.Mock).mockResolvedValue([]);
      (mockTask.findMany as jest.Mock).mockResolvedValue([]);
      (mockFinancialRecord.findMany as jest.Mock).mockResolvedValue([]);
      (mockBudget.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.generateBriefing(USER_ID);
      expect(result.calendar.conflicts).toBe(1);
    });

    it('should return empty briefing when no data exists', async () => {
      (mockCalendarEvent.findMany as jest.Mock).mockResolvedValue([]);
      (mockMessage.findMany as jest.Mock).mockResolvedValue([]);
      (mockTask.findMany as jest.Mock).mockResolvedValue([]);
      (mockFinancialRecord.findMany as jest.Mock).mockResolvedValue([]);
      (mockBudget.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.generateBriefing(USER_ID);

      expect(result.calendar.events).toHaveLength(0);
      expect(result.inbox.total).toBe(0);
      expect(result.tasks.overdue).toBe(0);
      expect(result.finance.overdueInvoices).toBe(0);
      expect(result.summary).toContain('clear');
    });
  });

  describe('deliverBriefing', () => {
    it('should not deliver when briefing is disabled', async () => {
      (mockProactiveConfig.findUnique as jest.Mock).mockResolvedValue({
        userId: USER_ID,
        briefingEnabled: false,
        briefingChannel: 'in_app',
      });

      const result = await service.deliverBriefing(USER_ID);
      expect(result.delivered).toBe(false);
      expect(mockNotification.create).not.toHaveBeenCalled();
    });

    it('should create notification and outreach record on delivery', async () => {
      (mockProactiveConfig.findUnique as jest.Mock).mockResolvedValue({
        userId: USER_ID,
        briefingEnabled: true,
        briefingChannel: 'push',
      });

      // Mock briefing data queries
      (mockCalendarEvent.findMany as jest.Mock).mockResolvedValue([]);
      (mockMessage.findMany as jest.Mock).mockResolvedValue([]);
      (mockTask.findMany as jest.Mock).mockResolvedValue([]);
      (mockFinancialRecord.findMany as jest.Mock).mockResolvedValue([]);
      (mockBudget.findMany as jest.Mock).mockResolvedValue([]);
      (mockNotification.create as jest.Mock).mockResolvedValue({});
      (mockShadowOutreach.create as jest.Mock).mockResolvedValue({});

      const result = await service.deliverBriefing(USER_ID);

      expect(result.channel).toBe('push');
      expect(result.delivered).toBe(true);
      expect(mockNotification.create).toHaveBeenCalledTimes(1);
      expect(mockShadowOutreach.create).toHaveBeenCalledTimes(1);
    });
  });
});

// ===========================================================================
// Notification Escalator
// ===========================================================================

describe('NotificationEscalator', () => {
  let escalator: NotificationEscalator;

  beforeEach(() => {
    jest.clearAllMocks();
    escalator = new NotificationEscalator();
  });

  describe('escalation step progression', () => {
    it('should progress through all 5 escalation steps for P0', async () => {
      const baseParams = {
        userId: USER_ID,
        notificationId: 'notif-1',
        type: 'crisis',
        priority: 'P0' as const,
        title: 'Server down',
        content: 'Production server is unresponsive',
      };

      // Step 1: in_app_push (no prior outreach)
      (mockShadowOutreach.findMany as jest.Mock).mockResolvedValue([]);
      (mockProactiveConfig.findUnique as jest.Mock).mockResolvedValue(null);
      (mockShadowOutreach.create as jest.Mock).mockResolvedValue({});

      let result = await escalator.escalate(baseParams);
      expect(result.channel).toBe('in_app_push');
      expect(result.attempt).toBe(1);
      expect(result.status).toBe('escalated');

      // Step 2: phone_sms (1 prior attempt)
      (mockShadowOutreach.findMany as jest.Mock).mockResolvedValue([
        { id: 'o-1', channel: 'in_app_push', status: 'pending', createdAt: new Date() },
      ]);

      result = await escalator.escalate(baseParams);
      expect(result.channel).toBe('phone_sms');
      expect(result.attempt).toBe(2);

      // Step 3: sms_action_links (2 prior attempts)
      (mockShadowOutreach.findMany as jest.Mock).mockResolvedValue([
        { id: 'o-1', channel: 'in_app_push', status: 'pending', createdAt: new Date() },
        { id: 'o-2', channel: 'phone_sms', status: 'pending', createdAt: new Date() },
      ]);

      result = await escalator.escalate(baseParams);
      expect(result.channel).toBe('sms_action_links');
      expect(result.attempt).toBe(3);

      // Step 4: phone_call_2 (3 prior attempts)
      (mockShadowOutreach.findMany as jest.Mock).mockResolvedValue([
        { id: 'o-1', channel: 'in_app_push', status: 'pending', createdAt: new Date() },
        { id: 'o-2', channel: 'phone_sms', status: 'pending', createdAt: new Date() },
        { id: 'o-3', channel: 'sms_action_links', status: 'pending', createdAt: new Date() },
      ]);

      result = await escalator.escalate(baseParams);
      expect(result.channel).toBe('phone_call_2');
      expect(result.attempt).toBe(4);

      // Step 5: phone_tree (4 prior attempts, P0 only)
      (mockShadowOutreach.findMany as jest.Mock).mockResolvedValue([
        { id: 'o-1', channel: 'in_app_push', status: 'pending', createdAt: new Date() },
        { id: 'o-2', channel: 'phone_sms', status: 'pending', createdAt: new Date() },
        { id: 'o-3', channel: 'sms_action_links', status: 'pending', createdAt: new Date() },
        { id: 'o-4', channel: 'phone_call_2', status: 'pending', createdAt: new Date() },
      ]);

      result = await escalator.escalate(baseParams);
      expect(result.channel).toBe('phone_tree');
      expect(result.attempt).toBe(5);
    });

    it('should not reach phone_tree for P1 priority', () => {
      const step = escalator.getNextEscalationStep(4, 'P1');
      expect(step).toBeNull();
    });

    it('should allow phone_tree for P0 priority', () => {
      const step = escalator.getNextEscalationStep(4, 'P0');
      expect(step).not.toBeNull();
      expect(step!.channel).toBe('phone_tree');
    });

    it('should return exhausted when all steps are used', async () => {
      (mockShadowOutreach.findMany as jest.Mock).mockResolvedValue([
        { id: 'o-1', channel: 'in_app_push', status: 'pending', createdAt: new Date() },
        { id: 'o-2', channel: 'phone_sms', status: 'pending', createdAt: new Date() },
        { id: 'o-3', channel: 'sms_action_links', status: 'pending', createdAt: new Date() },
        { id: 'o-4', channel: 'phone_call_2', status: 'pending', createdAt: new Date() },
        { id: 'o-5', channel: 'phone_tree', status: 'pending', createdAt: new Date() },
      ]);

      const result = await escalator.escalate({
        userId: USER_ID,
        notificationId: 'notif-1',
        type: 'crisis',
        priority: 'P0',
        title: 'Test',
        content: 'Test',
      });

      expect(result.status).toBe('exhausted');
    });

    it('should stop escalation when acknowledged', async () => {
      (mockShadowOutreach.findMany as jest.Mock).mockResolvedValue([
        { id: 'o-1', channel: 'in_app_push', status: 'acknowledged', createdAt: new Date() },
      ]);

      const result = await escalator.escalate({
        userId: USER_ID,
        notificationId: 'notif-1',
        type: 'crisis',
        priority: 'P0',
        title: 'Test',
        content: 'Test',
      });

      expect(result.status).toBe('acknowledged');
      expect(mockShadowOutreach.create).not.toHaveBeenCalled();
    });
  });

  describe('getEscalationState', () => {
    it('should return null when no escalation exists', async () => {
      (mockShadowOutreach.findMany as jest.Mock).mockResolvedValue([]);
      const state = await escalator.getEscalationState('notif-nonexistent');
      expect(state).toBeNull();
    });

    it('should return correct state for ongoing escalation', async () => {
      (mockShadowOutreach.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'o-1',
          userId: USER_ID,
          channel: 'in_app_push',
          status: 'pending',
          content: '[P1] Test',
          createdAt: new Date('2026-02-23T08:00:00'),
        },
        {
          id: 'o-2',
          userId: USER_ID,
          channel: 'phone_sms',
          status: 'pending',
          content: '[P1] Test',
          createdAt: new Date('2026-02-23T08:05:00'),
        },
      ]);

      const state = await escalator.getEscalationState('notif-1');
      expect(state).not.toBeNull();
      expect(state!.currentAttempt).toBe(2);
      expect(state!.currentChannel).toBe('phone_sms');
      expect(state!.status).toBe('escalated');
      expect(state!.acknowledged).toBe(false);
    });
  });

  describe('anti-spam: quiet hours', () => {
    it('should block phone calls during quiet hours', async () => {
      (mockShadowOutreach.findMany as jest.Mock).mockResolvedValue([
        { id: 'o-1', channel: 'in_app_push', status: 'pending', createdAt: new Date() },
      ]);

      // Configure quiet hours to be active NOW
      const now = new Date();
      const currentHour = now.getHours();
      const quietStart = `${String(currentHour - 1).padStart(2, '0')}:00`;
      const quietEnd = `${String(currentHour + 1).padStart(2, '0')}:00`;

      (mockProactiveConfig.findUnique as jest.Mock).mockResolvedValue({
        userId: USER_ID,
        quietHoursStart: quietStart,
        quietHoursEnd: quietEnd,
        callWindowStart: '00:00',
        callWindowEnd: '23:59',
        maxCallsPerDay: 5,
        maxCallsPerHour: 2,
        cooldownMinutes: 0,
      });

      (mockShadowOutreach.create as jest.Mock).mockResolvedValue({});

      const result = await escalator.escalate({
        userId: USER_ID,
        notificationId: 'notif-2',
        type: 'overdue_task',
        priority: 'P1',
        title: 'Overdue',
        content: 'Task overdue',
      });

      expect(result.status).toBe('blocked');
    });
  });

  describe('anti-spam: call window', () => {
    it('should block phone calls outside call window', async () => {
      (mockShadowOutreach.findMany as jest.Mock).mockResolvedValue([
        { id: 'o-1', channel: 'in_app_push', status: 'pending', createdAt: new Date() },
      ]);

      // Set call window to be in the past
      (mockProactiveConfig.findUnique as jest.Mock).mockResolvedValue({
        userId: USER_ID,
        quietHoursStart: '23:00',
        quietHoursEnd: '23:59',
        callWindowStart: '01:00',
        callWindowEnd: '01:01', // Effectively no window
        maxCallsPerDay: 5,
        maxCallsPerHour: 2,
        cooldownMinutes: 0,
      });

      (mockShadowOutreach.create as jest.Mock).mockResolvedValue({});

      const result = await escalator.escalate({
        userId: USER_ID,
        notificationId: 'notif-2',
        type: 'overdue_task',
        priority: 'P1',
        title: 'Overdue',
        content: 'Task overdue',
      });

      // The channel is phone_sms, which should be blocked outside call window
      // (unless by coincidence the test runs at 01:00)
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();
      const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      const inWindow = timeStr >= '01:00' && timeStr <= '01:01';

      if (!inWindow) {
        expect(result.status).toBe('blocked');
      }
    });
  });

  describe('anti-spam: max calls per day', () => {
    it('should block when daily call limit is reached', async () => {
      (mockShadowOutreach.findMany as jest.Mock).mockResolvedValue([
        { id: 'o-1', channel: 'in_app_push', status: 'pending', createdAt: new Date() },
      ]);

      const now = new Date();
      const hour = now.getHours();

      (mockProactiveConfig.findUnique as jest.Mock).mockResolvedValue({
        userId: USER_ID,
        quietHoursStart: '23:00',
        quietHoursEnd: '23:59',
        callWindowStart: '00:00',
        callWindowEnd: '23:59',
        maxCallsPerDay: 2,
        maxCallsPerHour: 10,
        cooldownMinutes: 0,
      });

      // Already made 2 calls today
      (mockShadowOutreach.count as jest.Mock).mockResolvedValue(2);
      (mockShadowOutreach.create as jest.Mock).mockResolvedValue({});

      const result = await escalator.escalate({
        userId: USER_ID,
        notificationId: 'notif-3',
        type: 'overdue_task',
        priority: 'P1',
        title: 'Test',
        content: 'Test',
      });

      expect(result.status).toBe('blocked');
    });
  });

  describe('anti-spam: cooldown', () => {
    it('should block when cooldown is active', async () => {
      (mockShadowOutreach.findMany as jest.Mock).mockResolvedValue([]);

      (mockProactiveConfig.findUnique as jest.Mock).mockResolvedValue({
        userId: USER_ID,
        quietHoursStart: '23:00',
        quietHoursEnd: '23:59',
        callWindowStart: '00:00',
        callWindowEnd: '23:59',
        maxCallsPerDay: 10,
        maxCallsPerHour: 10,
        cooldownMinutes: 60,
      });

      // Recent outreach on same channel within cooldown
      (mockShadowOutreach.count as jest.Mock).mockResolvedValue(0);
      (mockShadowOutreach.findFirst as jest.Mock).mockResolvedValue({
        id: 'o-recent',
        channel: 'in_app_push',
        createdAt: new Date(), // just now
      });
      (mockShadowOutreach.create as jest.Mock).mockResolvedValue({});

      const result = await escalator.escalate({
        userId: USER_ID,
        notificationId: 'notif-4',
        type: 'overdue_task',
        priority: 'P2',
        title: 'Test',
        content: 'Test',
      });

      expect(result.status).toBe('blocked');
    });
  });
});

// ===========================================================================
// Adaptive Channel Service
// ===========================================================================

describe('AdaptiveChannelService', () => {
  let service: AdaptiveChannelService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdaptiveChannelService();
  });

  describe('getBestChannel', () => {
    it('should always return phone for P0 priority', async () => {
      (mockChannelEffectiveness.findMany as jest.Mock).mockResolvedValue([]);
      const channel = await service.getBestChannel(USER_ID, 'overdue_task', 'P0');
      expect(channel).toBe('phone');
    });

    it('should always return phone for crisis trigger type', async () => {
      (mockChannelEffectiveness.findMany as jest.Mock).mockResolvedValue([]);
      const channel = await service.getBestChannel(USER_ID, 'crisis', 'P2');
      expect(channel).toBe('phone');
    });

    it('should always return phone for vip_email trigger type', async () => {
      (mockChannelEffectiveness.findMany as jest.Mock).mockResolvedValue([]);
      const channel = await service.getBestChannel(USER_ID, 'vip_email', 'P2');
      expect(channel).toBe('phone');
    });

    it('should downgrade from phone after 3 ignored calls for non-P0', async () => {
      (mockChannelEffectiveness.findMany as jest.Mock).mockResolvedValue([
        {
          channel: 'phone',
          triggerType: 'overdue_task',
          attempts: 5,
          responses: 1, // 4 ignored calls (5 attempts - 1 response)
          responseRate: 0.2,
          avgResponseTime: null,
        },
        {
          channel: 'sms',
          triggerType: 'overdue_task',
          attempts: 3,
          responses: 2,
          responseRate: 0.67,
          avgResponseTime: 30000,
        },
      ]);

      const channel = await service.getBestChannel(USER_ID, 'overdue_task', 'P1');
      expect(channel).not.toBe('phone');
      // Should pick SMS since it has better rate
      expect(channel).toBe('sms');
    });

    it('should use push as default for non-P0 when no data exists', async () => {
      (mockChannelEffectiveness.findMany as jest.Mock).mockResolvedValue([]);
      const channel = await service.getBestChannel(USER_ID, 'overdue_task', 'P1');
      expect(channel).toBe('push');
    });

    it('should fall back to in_app when no priority data exists', async () => {
      (mockChannelEffectiveness.findMany as jest.Mock).mockResolvedValue([]);
      const channel = await service.getBestChannel(USER_ID, 'overdue_task', 'P2');
      expect(channel).toBe('in_app');
    });
  });

  describe('recordAttempt', () => {
    it('should create new record if none exists', async () => {
      (mockChannelEffectiveness.findUnique as jest.Mock).mockResolvedValue(null);
      (mockChannelEffectiveness.create as jest.Mock).mockResolvedValue({});

      await service.recordAttempt(USER_ID, 'push', 'overdue_task');

      expect(mockChannelEffectiveness.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: USER_ID,
          channel: 'push',
          triggerType: 'overdue_task',
          attempts: 1,
          responses: 0,
        }),
      });
    });

    it('should increment attempts on existing record', async () => {
      (mockChannelEffectiveness.findUnique as jest.Mock).mockResolvedValue({
        id: 'ce-1',
        attempts: 3,
        responses: 2,
        responseRate: 0.67,
      });
      (mockChannelEffectiveness.update as jest.Mock).mockResolvedValue({});

      await service.recordAttempt(USER_ID, 'push', 'overdue_task');

      expect(mockChannelEffectiveness.update).toHaveBeenCalledWith({
        where: { id: 'ce-1' },
        data: expect.objectContaining({
          attempts: 4,
          responseRate: 0.5, // 2/4
        }),
      });
    });
  });

  describe('recordResponse', () => {
    it('should increment responses and update avg response time', async () => {
      (mockChannelEffectiveness.findUnique as jest.Mock).mockResolvedValue({
        id: 'ce-1',
        attempts: 5,
        responses: 2,
        responseRate: 0.4,
        avgResponseTime: 10000,
      });
      (mockChannelEffectiveness.update as jest.Mock).mockResolvedValue({});

      await service.recordResponse(USER_ID, 'push', 'overdue_task', 20000);

      expect(mockChannelEffectiveness.update).toHaveBeenCalledWith({
        where: { id: 'ce-1' },
        data: expect.objectContaining({
          responses: 3,
          responseRate: 0.6, // 3/5
        }),
      });
    });
  });
});

// ===========================================================================
// Digest Optimizer
// ===========================================================================

describe('DigestOptimizer', () => {
  let optimizer: DigestOptimizer;

  beforeEach(() => {
    jest.clearAllMocks();
    optimizer = new DigestOptimizer();
  });

  describe('shouldBatchItem', () => {
    it('should NOT batch P0 items', () => {
      expect(
        optimizer.shouldBatchItem({ priority: 'P0' })
      ).toBe(false);
    });

    it('should NOT batch items with deadline less than 4 hours away', () => {
      const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
      expect(
        optimizer.shouldBatchItem({ priority: 'P2', deadline: twoHoursFromNow })
      ).toBe(false);
    });

    it('should NOT batch items with deadline exactly 3 hours away', () => {
      const threeHoursFromNow = new Date(Date.now() + 3 * 60 * 60 * 1000);
      expect(
        optimizer.shouldBatchItem({ priority: 'P1', deadline: threeHoursFromNow })
      ).toBe(false);
    });

    it('should batch P1 items with no deadline', () => {
      expect(
        optimizer.shouldBatchItem({ priority: 'P1' })
      ).toBe(true);
    });

    it('should batch P2 items with deadline more than 4 hours away', () => {
      const tenHoursFromNow = new Date(Date.now() + 10 * 60 * 60 * 1000);
      expect(
        optimizer.shouldBatchItem({ priority: 'P2', deadline: tenHoursFromNow })
      ).toBe(true);
    });

    it('should batch low priority items', () => {
      expect(
        optimizer.shouldBatchItem({ priority: 'low' })
      ).toBe(true);
    });
  });

  describe('generateDigest', () => {
    it('should exclude P0 items from digest output', async () => {
      (mockShadowOutreach.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'do-1',
          channel: 'digest',
          status: 'pending_digest',
          content: JSON.stringify({
            type: 'task',
            title: 'Critical task',
            priority: 'P0',
            content: 'Must handle now',
            addedAt: new Date().toISOString(),
          }),
          createdAt: new Date(),
        },
        {
          id: 'do-2',
          channel: 'digest',
          status: 'pending_digest',
          content: JSON.stringify({
            type: 'task',
            title: 'Normal task',
            priority: 'P2',
            content: 'Can wait',
            addedAt: new Date().toISOString(),
          }),
          createdAt: new Date(),
        },
      ]);
      (mockShadowOutreach.updateMany as jest.Mock).mockResolvedValue({});

      const result = await optimizer.generateDigest(USER_ID);

      // P0 should be excluded
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('Normal task');
      expect(result.items[0].priority).toBe('P2');
    });

    it('should exclude items with deadline less than 4 hours away', async () => {
      const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const tenHoursFromNow = new Date(Date.now() + 10 * 60 * 60 * 1000);

      (mockShadowOutreach.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'do-1',
          channel: 'digest',
          status: 'pending_digest',
          content: JSON.stringify({
            type: 'task',
            title: 'Urgent deadline task',
            priority: 'P2',
            deadline: twoHoursFromNow.toISOString(),
            content: 'Due soon',
            addedAt: new Date().toISOString(),
          }),
          createdAt: new Date(),
        },
        {
          id: 'do-2',
          channel: 'digest',
          status: 'pending_digest',
          content: JSON.stringify({
            type: 'task',
            title: 'Later deadline task',
            priority: 'P2',
            deadline: tenHoursFromNow.toISOString(),
            content: 'Can wait',
            addedAt: new Date().toISOString(),
          }),
          createdAt: new Date(),
        },
      ]);
      (mockShadowOutreach.updateMany as jest.Mock).mockResolvedValue({});

      const result = await optimizer.generateDigest(USER_ID);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('Later deadline task');
    });

    it('should mark all pending records as delivered', async () => {
      (mockShadowOutreach.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'do-1',
          channel: 'digest',
          status: 'pending_digest',
          content: JSON.stringify({
            type: 'task',
            title: 'Task 1',
            priority: 'P2',
            content: 'Content',
            addedAt: new Date().toISOString(),
          }),
          createdAt: new Date(),
        },
      ]);
      (mockShadowOutreach.updateMany as jest.Mock).mockResolvedValue({});

      await optimizer.generateDigest(USER_ID);

      expect(mockShadowOutreach.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['do-1'] } },
        data: { status: 'digest_delivered' },
      });
    });

    it('should return empty digest with clear message', async () => {
      (mockShadowOutreach.findMany as jest.Mock).mockResolvedValue([]);
      (mockShadowOutreach.updateMany as jest.Mock).mockResolvedValue({});

      const result = await optimizer.generateDigest(USER_ID);

      expect(result.items).toHaveLength(0);
      expect(result.summary).toContain('No items');
    });
  });

  describe('addToDigest', () => {
    it('should store item as outreach record', async () => {
      (mockShadowOutreach.create as jest.Mock).mockResolvedValue({});

      await optimizer.addToDigest(USER_ID, {
        type: 'task',
        title: 'New task',
        priority: 'P2',
        content: 'Some content',
      });

      expect(mockShadowOutreach.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: USER_ID,
          channel: 'digest',
          status: 'pending_digest',
        }),
      });
    });
  });
});

// ===========================================================================
// Workflow Companion Service
// ===========================================================================

describe('WorkflowCompanionService', () => {
  let service: WorkflowCompanionService;

  const mockWorkflowData = {
    id: 'wf-1',
    name: 'Client Onboarding',
    entityId: ENTITY_ID,
    triggers: [],
    steps: [
      { id: 's1', order: 1, action: 'Send welcome email', params: { template: 'welcome' } },
      { id: 's2', order: 2, action: 'Create project folder' },
      { id: 's3', order: 3, action: 'Schedule kickoff meeting' },
    ],
    status: 'ACTIVE',
    lastRun: null,
    successRate: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WorkflowCompanionService();

    (mockWorkflow.findUnique as jest.Mock).mockResolvedValue(mockWorkflowData);
    (mockEntity.findUnique as jest.Mock).mockResolvedValue({
      id: ENTITY_ID,
      userId: USER_ID,
    });
    (mockShadowVoiceSession.update as jest.Mock).mockResolvedValue({});
  });

  describe('startCompanion', () => {
    it('should initialize companion state with first step', async () => {
      const state = await service.startCompanion({
        sessionId: SESSION_ID,
        workflowId: 'wf-1',
        userId: USER_ID,
      });

      expect(state.workflowName).toBe('Client Onboarding');
      expect(state.totalSteps).toBe(3);
      expect(state.currentStep).toBe(0);
      expect(state.currentStepName).toBe('Send welcome email');
      expect(state.isComplete).toBe(false);
      expect(state.isPaused).toBe(false);
      expect(state.completedSteps).toHaveLength(0);
      expect(state.announcement).toContain('Starting workflow');
      expect(state.options).toContain('ai_handle');
    });

    it('should throw when workflow not found', async () => {
      (mockWorkflow.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.startCompanion({
          sessionId: SESSION_ID,
          workflowId: 'nonexistent',
          userId: USER_ID,
        })
      ).rejects.toThrow('Workflow not found');
    });

    it('should throw when user does not own the workflow entity', async () => {
      (mockEntity.findUnique as jest.Mock).mockResolvedValue({
        id: ENTITY_ID,
        userId: 'other-user',
      });

      await expect(
        service.startCompanion({
          sessionId: SESSION_ID,
          workflowId: 'wf-1',
          userId: USER_ID,
        })
      ).rejects.toThrow('Access denied');
    });
  });

  describe('navigate', () => {
    beforeEach(async () => {
      await service.startCompanion({
        sessionId: SESSION_ID,
        workflowId: 'wf-1',
        userId: USER_ID,
      });
    });

    it('should skip current step and advance', async () => {
      const state = await service.navigate(SESSION_ID, 'skip');

      expect(state.skippedSteps).toContain(0);
      expect(state.currentStep).toBe(1);
      expect(state.currentStepName).toBe('Create project folder');
    });

    it('should not go back from first step', async () => {
      const state = await service.navigate(SESSION_ID, 'back');
      expect(state.currentStep).toBe(0);
      expect(state.announcement).toContain('Cannot go back');
    });

    it('should go back after advancing', async () => {
      await service.navigate(SESSION_ID, 'skip'); // move to step 1
      const state = await service.navigate(SESSION_ID, 'back'); // back to step 0

      expect(state.currentStep).toBe(0);
      expect(state.currentStepName).toBe('Send welcome email');
    });

    it('should toggle pause state', async () => {
      let state = await service.navigate(SESSION_ID, 'pause');
      expect(state.isPaused).toBe(true);
      expect(state.announcement).toContain('paused');

      state = await service.navigate(SESSION_ID, 'pause');
      expect(state.isPaused).toBe(false);
      expect(state.announcement).toContain('resumed');
    });

    it('should finish all remaining steps with finish_all', async () => {
      const state = await service.navigate(SESSION_ID, 'finish_all');

      expect(state.isComplete).toBe(true);
      expect(state.completedSteps).toContain(0);
      expect(state.completedSteps).toContain(1);
      expect(state.completedSteps).toContain(2);
      expect(state.announcement).toContain('complete');
    });

    it('should report status correctly', async () => {
      await service.navigate(SESSION_ID, 'skip'); // skip step 0

      const state = await service.navigate(SESSION_ID, 'status');
      expect(state.announcement).toContain('1 skipped');
      expect(state.announcement).toContain('step 2 of 3');
    });
  });

  describe('processStepChoice', () => {
    beforeEach(async () => {
      await service.startCompanion({
        sessionId: SESSION_ID,
        workflowId: 'wf-1',
        userId: USER_ID,
      });
    });

    it('should advance to next step on ai_handle', async () => {
      const state = await service.processStepChoice({
        sessionId: SESSION_ID,
        choice: 'ai_handle',
      });

      expect(state.completedSteps).toContain(0);
      expect(state.currentStep).toBe(1);
      expect(state.currentStepName).toBe('Create project folder');
      expect(state.announcement).toContain('AI');
    });

    it('should advance to next step on user_handle', async () => {
      const state = await service.processStepChoice({
        sessionId: SESSION_ID,
        choice: 'user_handle',
      });

      expect(state.completedSteps).toContain(0);
      expect(state.currentStep).toBe(1);
    });

    it('should advance with delegate and show delegatee name', async () => {
      const state = await service.processStepChoice({
        sessionId: SESSION_ID,
        choice: 'delegate',
        delegateTo: 'Alice',
      });

      expect(state.announcement).toContain('Alice');
      expect(state.currentStep).toBe(1);
    });

    it('should mark workflow complete when last step is processed', async () => {
      await service.processStepChoice({ sessionId: SESSION_ID, choice: 'ai_handle' });
      await service.processStepChoice({ sessionId: SESSION_ID, choice: 'ai_handle' });
      const state = await service.processStepChoice({
        sessionId: SESSION_ID,
        choice: 'ai_handle',
      });

      expect(state.isComplete).toBe(true);
      expect(state.completedSteps).toHaveLength(3);
      expect(state.announcement).toContain('complete');
      expect(state.options).toHaveLength(0);
    });

    it('should throw when session not found', async () => {
      await expect(
        service.processStepChoice({
          sessionId: 'nonexistent',
          choice: 'ai_handle',
        })
      ).rejects.toThrow('Companion session not found');
    });
  });
});

// ===========================================================================
// Entity Persona Service
// ===========================================================================

describe('EntityPersonaService', () => {
  let service: EntityPersonaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EntityPersonaService();
  });

  describe('getEntityProfile', () => {
    it('should return full profile with defaults when no shadow profile exists', async () => {
      (mockEntity.findUnique as jest.Mock).mockResolvedValue({
        id: ENTITY_ID,
        name: 'TestEntity',
        type: 'Business',
      });
      (mockShadowEntityProfile.findUnique as jest.Mock).mockResolvedValue(null);

      const profile = await service.getEntityProfile(ENTITY_ID);

      expect(profile).not.toBeNull();
      expect(profile!.entityName).toBe('TestEntity');
      expect(profile!.voicePersona).toBe('default');
      expect(profile!.tone).toBe('professional-friendly');
      expect(profile!.neverDisclose).toEqual([]);
    });

    it('should return null when entity not found', async () => {
      (mockEntity.findUnique as jest.Mock).mockResolvedValue(null);

      const profile = await service.getEntityProfile('nonexistent');
      expect(profile).toBeNull();
    });
  });

  describe('detectEntity', () => {
    it('should detect entity by name in message', async () => {
      (mockEntity.findMany as jest.Mock).mockResolvedValue([
        { id: 'ent-1', name: 'MedLink', type: 'Business' },
        { id: 'ent-2', name: 'Personal', type: 'Personal' },
      ]);
      (mockShadowEntityProfile.findUnique as jest.Mock).mockResolvedValue(null);
      (mockContact.findMany as jest.Mock).mockResolvedValue([]);

      const entityId = await service.detectEntity(USER_ID, 'Switch to MedLink please');
      expect(entityId).toBe('ent-1');
    });

    it('should detect entity by contact name', async () => {
      (mockEntity.findMany as jest.Mock).mockResolvedValue([
        { id: 'ent-1', name: 'HealthCo', type: 'Business' },
      ]);
      (mockShadowEntityProfile.findUnique as jest.Mock).mockResolvedValue(null);
      (mockContact.findMany as jest.Mock).mockResolvedValue([
        { name: 'Dr. Smith' },
      ]);

      const entityId = await service.detectEntity(
        USER_ID,
        'I need to call Dr. Smith about the appointment'
      );
      expect(entityId).toBe('ent-1');
    });

    it('should return null when no match is found', async () => {
      (mockEntity.findMany as jest.Mock).mockResolvedValue([
        { id: 'ent-1', name: 'MedLink', type: 'Business' },
      ]);
      (mockShadowEntityProfile.findUnique as jest.Mock).mockResolvedValue(null);
      (mockContact.findMany as jest.Mock).mockResolvedValue([]);

      const entityId = await service.detectEntity(USER_ID, 'What is the weather today?');
      expect(entityId).toBeNull();
    });

    it('should return null for empty message', async () => {
      const entityId = await service.detectEntity(USER_ID, '');
      expect(entityId).toBeNull();
    });

    it('should detect entity from VIP contacts in profile', async () => {
      (mockEntity.findMany as jest.Mock).mockResolvedValue([
        { id: 'ent-1', name: 'Corp', type: 'Business' },
      ]);
      (mockShadowEntityProfile.findUnique as jest.Mock).mockResolvedValue({
        vipContacts: ['CEO John'],
      });
      (mockContact.findMany as jest.Mock).mockResolvedValue([]);

      const entityId = await service.detectEntity(
        USER_ID,
        'CEO John is on the phone'
      );
      expect(entityId).toBe('ent-1');
    });
  });

  describe('switchEntity', () => {
    it('should switch entity by direct ID', async () => {
      (mockEntity.findUnique as jest.Mock).mockResolvedValue({
        id: ENTITY_ID,
        userId: USER_ID,
        name: 'MedLink',
      });
      (mockShadowVoiceSession.findUnique as jest.Mock).mockResolvedValue({
        id: SESSION_ID,
        activeEntityId: 'other-entity',
      });
      (mockShadowVoiceSession.update as jest.Mock).mockResolvedValue({});
      (mockShadowEntityProfile.findUnique as jest.Mock).mockResolvedValue({
        greeting: 'Welcome to MedLink.',
      });

      const result = await service.switchEntity({
        sessionId: SESSION_ID,
        userId: USER_ID,
        targetEntityId: ENTITY_ID,
      });

      expect(result.entityId).toBe(ENTITY_ID);
      expect(result.entityName).toBe('MedLink');
      expect(result.personaChanged).toBe(true);
      expect(result.announcement).toContain('MedLink');
    });

    it('should switch entity by keyword', async () => {
      (mockEntity.findMany as jest.Mock).mockResolvedValue([
        { id: 'ent-1', name: 'MedLink' },
        { id: 'ent-2', name: 'Personal' },
      ]);
      (mockEntity.findUnique as jest.Mock).mockResolvedValue({
        id: 'ent-1',
        userId: USER_ID,
        name: 'MedLink',
      });
      (mockShadowVoiceSession.findUnique as jest.Mock).mockResolvedValue({
        id: SESSION_ID,
        activeEntityId: 'ent-2',
      });
      (mockShadowVoiceSession.update as jest.Mock).mockResolvedValue({});
      (mockShadowEntityProfile.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.switchEntity({
        sessionId: SESSION_ID,
        userId: USER_ID,
        contactKeyword: 'MedLink',
      });

      expect(result.entityId).toBe('ent-1');
      expect(result.personaChanged).toBe(true);
    });

    it('should throw when entity not owned by user', async () => {
      (mockEntity.findUnique as jest.Mock).mockResolvedValue({
        id: ENTITY_ID,
        userId: 'other-user',
        name: 'NotMine',
      });

      await expect(
        service.switchEntity({
          sessionId: SESSION_ID,
          userId: USER_ID,
          targetEntityId: ENTITY_ID,
        })
      ).rejects.toThrow('Access denied');
    });

    it('should report no change when already on same entity', async () => {
      (mockEntity.findUnique as jest.Mock).mockResolvedValue({
        id: ENTITY_ID,
        userId: USER_ID,
        name: 'MedLink',
      });
      (mockShadowVoiceSession.findUnique as jest.Mock).mockResolvedValue({
        id: SESSION_ID,
        activeEntityId: ENTITY_ID, // same entity
      });
      (mockShadowVoiceSession.update as jest.Mock).mockResolvedValue({});
      (mockShadowEntityProfile.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.switchEntity({
        sessionId: SESSION_ID,
        userId: USER_ID,
        targetEntityId: ENTITY_ID,
      });

      expect(result.personaChanged).toBe(false);
      expect(result.announcement).toContain('Already');
    });
  });
});

// ===========================================================================
// Suggestion Engine
// ===========================================================================

describe('SuggestionEngine', () => {
  let engine: SuggestionEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    engine = new SuggestionEngine();
    mockDefaultEntities();
  });

  describe('getSuggestions', () => {
    it('should return suggestions sorted by priority', async () => {
      (mockTask.findMany as jest.Mock)
        .mockResolvedValueOnce([ // overdue tasks
          { id: 't-1', title: 'Overdue P0', priority: 'P0', dueDate: new Date('2026-02-20') },
          { id: 't-2', title: 'Overdue P2', priority: 'P2', dueDate: new Date('2026-02-21') },
        ]);

      (mockMessage.findMany as jest.Mock).mockResolvedValue([
        { id: 'm-1', subject: 'Urgent from CEO', triageScore: 10 },
      ]);

      (mockContact.findMany as jest.Mock).mockResolvedValue([]);
      (mockWorkflow.findMany as jest.Mock).mockResolvedValue([]);
      (mockFinancialRecord.findMany as jest.Mock).mockResolvedValue([]);

      const suggestions = await engine.getSuggestions(USER_ID);

      expect(suggestions.length).toBeGreaterThan(0);
      // Critical items should come first
      const priorities = suggestions.map((s) => s.priority);
      const critIdx = priorities.indexOf('critical');
      const medIdx = priorities.indexOf('medium');
      if (critIdx >= 0 && medIdx >= 0) {
        expect(critIdx).toBeLessThan(medIdx);
      }
    });

    it('should include overdue invoice suggestions', async () => {
      (mockTask.findMany as jest.Mock).mockResolvedValue([]);
      (mockMessage.findMany as jest.Mock).mockResolvedValue([]);
      (mockContact.findMany as jest.Mock).mockResolvedValue([]);
      (mockWorkflow.findMany as jest.Mock).mockResolvedValue([]);
      (mockFinancialRecord.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'inv-1',
          type: 'INVOICE',
          amount: 7500,
          vendor: 'Acme Corp',
          dueDate: new Date('2026-02-15'),
        },
      ]);

      const suggestions = await engine.getSuggestions(USER_ID);

      const invoiceSuggestion = suggestions.find((s) => s.type === 'overdue_invoice');
      expect(invoiceSuggestion).toBeDefined();
      expect(invoiceSuggestion!.title).toContain('7,500');
      expect(invoiceSuggestion!.priority).toBe('high'); // >= 5000
    });
  });

  describe('evaluateTriggers', () => {
    it('should evaluate triggers and return results', async () => {
      (mockShadowTrigger.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'trig-1',
          userId: USER_ID,
          triggerName: 'Overdue check',
          triggerType: 'overdue_task',
          conditions: { minOverdue: 1 },
          action: { channel: 'push' },
          enabled: true,
          cooldownMinutes: 60,
          lastTriggered: null,
        },
      ]);

      // Task count for overdue evaluation
      (mockTask.count as jest.Mock).mockResolvedValue(3);
      (mockShadowTrigger.update as jest.Mock).mockResolvedValue({});

      const results = await engine.evaluateTriggers(USER_ID);

      expect(results).toHaveLength(1);
      expect(results[0].triggerName).toBe('Overdue check');
      expect(results[0].shouldFire).toBe(true);
      expect(results[0].channel).toBe('push');
    });

    it('should respect cooldown periods', async () => {
      const recentTrigger = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago

      (mockShadowTrigger.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'trig-1',
          userId: USER_ID,
          triggerName: 'Test trigger',
          triggerType: 'overdue_task',
          conditions: {},
          action: {},
          enabled: true,
          cooldownMinutes: 60, // 60 min cooldown
          lastTriggered: recentTrigger, // triggered 10 min ago
        },
      ]);

      const results = await engine.evaluateTriggers(USER_ID);

      expect(results).toHaveLength(1);
      expect(results[0].shouldFire).toBe(false);
      expect(results[0].content).toContain('Cooldown');
    });
  });
});
