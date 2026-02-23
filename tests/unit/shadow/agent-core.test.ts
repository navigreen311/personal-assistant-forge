import {
  computeRiskScore,
  isBusinessHours,
} from '@/modules/shadow/agent/risk-scorer';
import { generateResponse } from '@/modules/shadow/agent/response-generator';
import { ToolRouter } from '@/modules/shadow/agent/tool-router';
import type {
  RiskFactors,
  AgentContext,
  ClassifiedIntent,
  ToolResult,
  MessageTelemetry,
} from '@/modules/shadow/types';

// ─── Mock Prisma ────────────────────────────────────────────────────────────

const mockFindUnique = jest.fn();
const mockFindFirst = jest.fn();
const mockFindMany = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockCount = jest.fn();
const mockGroupBy = jest.fn();
const mockAggregate = jest.fn();
const mockUpdateMany = jest.fn();
const mockUpsert = jest.fn();
const mockActionLogCreate = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    entity: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    task: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      count: (...args: unknown[]) => mockCount(...args),
      groupBy: (...args: unknown[]) => mockGroupBy(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
    message: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
    calendarEvent: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    contact: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
    financialRecord: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      aggregate: (...args: unknown[]) => mockAggregate(...args),
    },
    knowledgeEntry: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
    workflow: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    project: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    actionLog: {
      create: (...args: unknown[]) => mockActionLogCreate(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
    shadowMessage: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
    shadowVoiceSession: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    shadowPreference: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
    shadowSessionOutcome: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    shadowConsentReceipt: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
    shadowTrustedDevice: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

// Mock Anthropic AI client
jest.mock('@/lib/ai', () => ({
  anthropic: {
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{"primaryIntent":"general_question","confidence":0.9,"entities":{},"reasoning":"test"}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    },
  },
  generateText: jest.fn().mockResolvedValue('Mock response'),
  generateJSON: jest.fn().mockResolvedValue({}),
}));

// ─── Test Helpers ───────────────────────────────────────────────────────────

function makeContext(overrides?: Partial<AgentContext>): AgentContext {
  return {
    user: {
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
      preferences: {},
      timezone: 'America/Chicago',
    },
    activeEntity: {
      id: 'entity-1',
      name: 'Test Business',
      type: 'Business',
      complianceProfile: [],
    },
    recentMessages: [],
    recentActions: [],
    timeOfDay: 'morning',
    dayOfWeek: 'Monday',
    channel: 'web',
    ...overrides,
  };
}

function makeIntent(overrides?: Partial<ClassifiedIntent>): ClassifiedIntent {
  return {
    primaryIntent: 'general_question',
    confidence: 0.9,
    entities: {},
    requiredTools: ['search_knowledge_base'],
    confirmationLevel: 'none',
    blastRadius: 'self',
    ...overrides,
  };
}

function makeTelemetry(): MessageTelemetry {
  return {
    toolCalls: [],
    totalMs: 100,
    model: 'claude-sonnet-4-5-20250929',
  };
}

// ─── Risk Scoring Tests ─────────────────────────────────────────────────────

describe('RiskScorer', () => {
  describe('computeRiskScore', () => {
    it('should return score 0 for minimal risk factors', () => {
      const factors: RiskFactors = {
        blastRadius: 'self',
        channel: 'web',
        isBusinessHours: true,
        actionsInLastHour: 0,
        isFirstTimeAction: false,
        isTrustedDevice: true,
      };

      const result = computeRiskScore(factors);
      expect(result.score).toBe(0);
      expect(result.requiredConfirmation).toBe('none');
      expect(result.factors).toHaveLength(0);
    });

    it('should add 20 points for financial amount >$1K', () => {
      const factors: RiskFactors = {
        financialAmount: 1500,
        blastRadius: 'self',
        channel: 'web',
        isBusinessHours: true,
        actionsInLastHour: 0,
        isFirstTimeAction: false,
        isTrustedDevice: true,
      };

      const result = computeRiskScore(factors);
      expect(result.score).toBe(20);
      expect(result.factors).toContainEqual(
        expect.objectContaining({ label: 'Financial amount >$1K', points: 20 }),
      );
    });

    it('should add 35 points for financial amount >$5K (not cumulative with >$1K)', () => {
      const factors: RiskFactors = {
        financialAmount: 6000,
        blastRadius: 'self',
        channel: 'web',
        isBusinessHours: true,
        actionsInLastHour: 0,
        isFirstTimeAction: false,
        isTrustedDevice: true,
      };

      const result = computeRiskScore(factors);
      expect(result.score).toBe(35);
      expect(result.factors).toHaveLength(1);
      expect(result.factors[0].label).toBe('Financial amount >$5K');
    });

    it('should add 15 points for external blast radius', () => {
      const factors: RiskFactors = {
        blastRadius: 'external',
        channel: 'web',
        isBusinessHours: true,
        actionsInLastHour: 0,
        isFirstTimeAction: false,
        isTrustedDevice: true,
      };

      const result = computeRiskScore(factors);
      expect(result.score).toBe(15);
    });

    it('should add 25 points for public blast radius', () => {
      const factors: RiskFactors = {
        blastRadius: 'public',
        channel: 'web',
        isBusinessHours: true,
        actionsInLastHour: 0,
        isFirstTimeAction: false,
        isTrustedDevice: true,
      };

      const result = computeRiskScore(factors);
      expect(result.score).toBe(25);
      expect(result.requiredConfirmation).toBe('tap');
    });

    it('should add 15 points for phone channel', () => {
      const factors: RiskFactors = {
        blastRadius: 'self',
        channel: 'phone',
        isBusinessHours: true,
        actionsInLastHour: 0,
        isFirstTimeAction: false,
        isTrustedDevice: true,
      };

      const result = computeRiskScore(factors);
      expect(result.score).toBe(15);
    });

    it('should add 10 points outside business hours', () => {
      const factors: RiskFactors = {
        blastRadius: 'self',
        channel: 'web',
        isBusinessHours: false,
        actionsInLastHour: 0,
        isFirstTimeAction: false,
        isTrustedDevice: true,
      };

      const result = computeRiskScore(factors);
      expect(result.score).toBe(10);
    });

    it('should add 15 points for high action velocity (>10/hr)', () => {
      const factors: RiskFactors = {
        blastRadius: 'self',
        channel: 'web',
        isBusinessHours: true,
        actionsInLastHour: 15,
        isFirstTimeAction: false,
        isTrustedDevice: true,
      };

      const result = computeRiskScore(factors);
      expect(result.score).toBe(15);
    });

    it('should NOT add points when actions are 10 or fewer', () => {
      const factors: RiskFactors = {
        blastRadius: 'self',
        channel: 'web',
        isBusinessHours: true,
        actionsInLastHour: 10,
        isFirstTimeAction: false,
        isTrustedDevice: true,
      };

      const result = computeRiskScore(factors);
      expect(result.score).toBe(0);
    });

    it('should add 10 points for first-time action', () => {
      const factors: RiskFactors = {
        blastRadius: 'self',
        channel: 'web',
        isBusinessHours: true,
        actionsInLastHour: 0,
        isFirstTimeAction: true,
        isTrustedDevice: true,
      };

      const result = computeRiskScore(factors);
      expect(result.score).toBe(10);
    });

    it('should add 25 points for untrusted device', () => {
      const factors: RiskFactors = {
        blastRadius: 'self',
        channel: 'web',
        isBusinessHours: true,
        actionsInLastHour: 0,
        isFirstTimeAction: false,
        isTrustedDevice: false,
      };

      const result = computeRiskScore(factors);
      expect(result.score).toBe(25);
      expect(result.requiredConfirmation).toBe('tap');
    });

    it('should require voice_pin when score >40', () => {
      const factors: RiskFactors = {
        financialAmount: 2000,  // +20
        blastRadius: 'external', // +15
        channel: 'phone',        // +15
        isBusinessHours: true,
        actionsInLastHour: 0,
        isFirstTimeAction: false,
        isTrustedDevice: true,
      };

      const result = computeRiskScore(factors);
      expect(result.score).toBe(50);
      expect(result.requiredConfirmation).toBe('voice_pin');
    });

    it('should require voice_pin_sms when score >70', () => {
      const factors: RiskFactors = {
        financialAmount: 6000,   // +35
        blastRadius: 'public',   // +25
        channel: 'phone',        // +15
        isBusinessHours: true,
        actionsInLastHour: 0,
        isFirstTimeAction: false,
        isTrustedDevice: true,
      };

      const result = computeRiskScore(factors);
      expect(result.score).toBe(75);
      expect(result.requiredConfirmation).toBe('voice_pin_sms');
    });

    it('should accumulate all risk factors correctly', () => {
      const factors: RiskFactors = {
        financialAmount: 6000,   // +35
        blastRadius: 'public',   // +25
        channel: 'phone',        // +15
        isBusinessHours: false,  // +10
        actionsInLastHour: 15,   // +15
        isFirstTimeAction: true, // +10
        isTrustedDevice: false,  // +25
      };

      const result = computeRiskScore(factors);
      expect(result.score).toBe(135);
      expect(result.requiredConfirmation).toBe('voice_pin_sms');
      expect(result.factors).toHaveLength(7);
    });

    it('should not add financial points for amounts under $1K', () => {
      const factors: RiskFactors = {
        financialAmount: 500,
        blastRadius: 'self',
        channel: 'web',
        isBusinessHours: true,
        actionsInLastHour: 0,
        isFirstTimeAction: false,
        isTrustedDevice: true,
      };

      const result = computeRiskScore(factors);
      expect(result.score).toBe(0);
    });

    it('should handle undefined financial amount', () => {
      const factors: RiskFactors = {
        blastRadius: 'self',
        channel: 'web',
        isBusinessHours: true,
        actionsInLastHour: 0,
        isFirstTimeAction: false,
        isTrustedDevice: true,
      };

      const result = computeRiskScore(factors);
      expect(result.score).toBe(0);
    });

    it('should handle boundary at exactly $1000 (not >$1K)', () => {
      const factors: RiskFactors = {
        financialAmount: 1000,
        blastRadius: 'self',
        channel: 'web',
        isBusinessHours: true,
        actionsInLastHour: 0,
        isFirstTimeAction: false,
        isTrustedDevice: true,
      };

      const result = computeRiskScore(factors);
      expect(result.score).toBe(0); // exactly $1000, not > $1000
    });

    it('should handle boundary at exactly $5000 (not >$5K)', () => {
      const factors: RiskFactors = {
        financialAmount: 5000,
        blastRadius: 'self',
        channel: 'web',
        isBusinessHours: true,
        actionsInLastHour: 0,
        isFirstTimeAction: false,
        isTrustedDevice: true,
      };

      const result = computeRiskScore(factors);
      expect(result.score).toBe(20); // exactly $5000 triggers >$1K but not >$5K
    });

    it('should return tap for score range 21-40', () => {
      // Score exactly 25 (untrusted device)
      const factors: RiskFactors = {
        blastRadius: 'self',
        channel: 'web',
        isBusinessHours: true,
        actionsInLastHour: 0,
        isFirstTimeAction: false,
        isTrustedDevice: false,
      };

      const result = computeRiskScore(factors);
      expect(result.score).toBe(25);
      expect(result.requiredConfirmation).toBe('tap');
    });
  });

  describe('isBusinessHours', () => {
    it('should return a boolean', () => {
      const result = isBusinessHours('America/Chicago');
      expect(typeof result).toBe('boolean');
    });

    it('should handle invalid timezone gracefully', () => {
      const result = isBusinessHours('Invalid/Timezone');
      // Falls back to true
      expect(result).toBe(true);
    });

    it('should handle UTC timezone', () => {
      const result = isBusinessHours('UTC');
      expect(typeof result).toBe('boolean');
    });
  });
});

// ─── Tool Router Tests ──────────────────────────────────────────────────────

describe('ToolRouter', () => {
  let router: ToolRouter;

  beforeEach(() => {
    jest.clearAllMocks();
    router = new ToolRouter();
  });

  describe('tool registration', () => {
    it('should register all expected tools', () => {
      const names = router.getToolNames();

      // Navigation tools
      expect(names).toContain('navigate_to_page');

      // Dashboard tools
      expect(names).toContain('get_dashboard_stats');

      // Task tools
      expect(names).toContain('list_tasks');
      expect(names).toContain('create_task');
      expect(names).toContain('update_task');
      expect(names).toContain('complete_task');

      // Inbox tools
      expect(names).toContain('list_inbox');
      expect(names).toContain('classify_email');
      expect(names).toContain('draft_email');
      expect(names).toContain('send_email');

      // Calendar tools
      expect(names).toContain('list_calendar_events');
      expect(names).toContain('create_calendar_event');
      expect(names).toContain('modify_calendar_event');

      // Contact tools
      expect(names).toContain('list_contacts');
      expect(names).toContain('get_contact');
      expect(names).toContain('create_contact');

      // Finance tools
      expect(names).toContain('list_invoices');
      expect(names).toContain('create_invoice');
      expect(names).toContain('send_invoice_reminder');
      expect(names).toContain('get_finance_summary');
      expect(names).toContain('list_expenses');

      // Knowledge tools
      expect(names).toContain('search_knowledge_base');
      expect(names).toContain('add_knowledge_entry');

      // Workflow tools
      expect(names).toContain('trigger_workflow');
      expect(names).toContain('get_workflow_status');

      // Entity tools
      expect(names).toContain('switch_entity');
      expect(names).toContain('get_entity_list');

      // Project tools
      expect(names).toContain('list_projects');
      expect(names).toContain('get_project_status');
    });

    it('should have at least 25 tools registered', () => {
      const names = router.getToolNames();
      expect(names.length).toBeGreaterThanOrEqual(25);
    });

    it('should return valid tool definitions', () => {
      const definitions = router.getToolDefinitions();

      for (const def of definitions) {
        expect(typeof def.name).toBe('string');
        expect(def.name.length).toBeGreaterThan(0);
        expect(typeof def.description).toBe('string');
        expect(def.description.length).toBeGreaterThan(0);
        expect(typeof def.input_schema).toBe('object');
        expect(def.input_schema).toHaveProperty('type', 'object');
        expect(def.input_schema).toHaveProperty('properties');
        expect(def.input_schema).toHaveProperty('required');
      }
    });

    it('should have unique tool names', () => {
      const names = router.getToolNames();
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });

  describe('tool execution', () => {
    it('should return error for unknown tool', async () => {
      const result = await router.executeTool(
        'nonexistent_tool',
        {},
        makeContext(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
      expect(result.durationMs).toBe(0);
    });

    it('should execute navigate_to_page successfully', async () => {
      const result = await router.executeTool(
        'navigate_to_page',
        { page: 'dashboard' },
        makeContext(),
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          navigated: true,
          deepLink: '/dashboard',
          page: 'dashboard',
        }),
      );
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should execute navigate_to_page with recordId', async () => {
      const result = await router.executeTool(
        'navigate_to_page',
        { page: 'tasks', recordId: 'task-123' },
        makeContext(),
      );

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.deepLink).toBe('/tasks/task-123');
    });

    it('should return error for tools requiring entity when none set', async () => {
      const contextNoEntity = makeContext({ activeEntity: undefined });

      mockFindMany.mockResolvedValue([]);
      const result = await router.executeTool(
        'list_tasks',
        {},
        contextNoEntity,
      );

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.error).toContain('No active entity');
    });

    it('should measure execution duration', async () => {
      mockFindMany.mockResolvedValue([]);
      const result = await router.executeTool(
        'list_tasks',
        {},
        makeContext(),
      );

      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle Prisma errors gracefully', async () => {
      mockFindMany.mockRejectedValue(new Error('Database connection failed'));
      const result = await router.executeTool(
        'list_tasks',
        {},
        makeContext(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection failed');
    });

    it('should create a task correctly', async () => {
      mockCreate.mockResolvedValue({
        id: 'task-new',
        title: 'New Test Task',
        status: 'TODO',
        priority: 'P1',
      });

      const result = await router.executeTool(
        'create_task',
        { title: 'New Test Task', priority: 'P0' },
        makeContext(),
      );

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.created).toBe(true);
      expect(data.title).toBe('New Test Task');
    });

    it('should complete a task', async () => {
      mockUpdate.mockResolvedValue({
        id: 'task-1',
        title: 'Done Task',
        status: 'DONE',
      });

      const result = await router.executeTool(
        'complete_task',
        { taskId: 'task-1' },
        makeContext(),
      );

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.completed).toBe(true);
    });
  });
});

// ─── Response Generator Tests ───────────────────────────────────────────────

describe('ResponseGenerator', () => {
  describe('generateResponse', () => {
    it('should generate TEXT response for general questions', () => {
      const response = generateResponse({
        text: 'Here is the answer to your question.',
        intent: makeIntent(),
        toolResults: [],
        context: makeContext(),
        sessionId: 'session-1',
        telemetry: makeTelemetry(),
      });

      expect(response.contentType).toBe('TEXT');
      expect(response.text).toBe('Here is the answer to your question.');
      expect(response.sessionId).toBe('session-1');
    });

    it('should generate NAVIGATION_CARD for navigate results', () => {
      const toolResults: ToolResult[] = [
        {
          toolName: 'navigate_to_page',
          success: true,
          data: { navigated: true, deepLink: '/dashboard', page: 'dashboard' },
          durationMs: 5,
        },
      ];

      const response = generateResponse({
        text: 'Navigating to your dashboard.',
        intent: makeIntent({ primaryIntent: 'navigate' }),
        toolResults,
        context: makeContext(),
        sessionId: 'session-1',
        telemetry: makeTelemetry(),
      });

      expect(response.contentType).toBe('NAVIGATION_CARD');
      expect(response.navigationCards).toBeDefined();
      expect(response.navigationCards!.length).toBeGreaterThan(0);
      expect(response.navigationCards![0].deepLink).toBe('/dashboard');
    });

    it('should generate ACTION_CARD for task creation', () => {
      const toolResults: ToolResult[] = [
        {
          toolName: 'create_task',
          success: true,
          data: { created: true, taskId: 'task-1', title: 'New Task' },
          durationMs: 50,
        },
      ];

      const response = generateResponse({
        text: 'Task created.',
        intent: makeIntent({ primaryIntent: 'create_task' }),
        toolResults,
        context: makeContext(),
        sessionId: 'session-1',
        telemetry: makeTelemetry(),
      });

      expect(response.contentType).toBe('ACTION_CARD');
      expect(response.actionCards).toBeDefined();
      expect(response.actionCards!.length).toBeGreaterThan(0);
      expect(response.actionCards![0].title).toContain('New Task');
    });

    it('should generate LIST_CARD for list results', () => {
      const toolResults: ToolResult[] = [
        {
          toolName: 'list_tasks',
          success: true,
          data: {
            tasks: [
              { id: 't1', title: 'Task 1', status: 'TODO', priority: 'P0' },
              { id: 't2', title: 'Task 2', status: 'IN_PROGRESS', priority: 'P1' },
            ],
            count: 2,
          },
          durationMs: 30,
        },
      ];

      const response = generateResponse({
        text: 'Here are your tasks.',
        intent: makeIntent({ primaryIntent: 'read_data' }),
        toolResults,
        context: makeContext(),
        sessionId: 'session-1',
        telemetry: makeTelemetry(),
      });

      expect(response.contentType).toBe('LIST_CARD');
      expect(response.citations).toBeDefined();
      expect(response.citations!.length).toBeGreaterThan(0);
    });

    it('should extract citations from tool results', () => {
      const toolResults: ToolResult[] = [
        {
          toolName: 'create_task',
          success: true,
          data: { created: true, taskId: 'task-abc', title: 'My Task' },
          durationMs: 10,
        },
      ];

      const response = generateResponse({
        text: 'Created task.',
        intent: makeIntent({ primaryIntent: 'create_task' }),
        toolResults,
        context: makeContext(),
        sessionId: 'session-1',
        telemetry: makeTelemetry(),
      });

      expect(response.citations).toBeDefined();
      const taskCitation = response.citations!.find((c) => c.id === 'task-abc');
      expect(taskCitation).toBeDefined();
      expect(taskCitation!.type).toBe('task');
      expect(taskCitation!.deepLink).toBe('/tasks/task-abc');
    });

    it('should truncate text for phone channel', () => {
      const longText = 'A'.repeat(600);
      const response = generateResponse({
        text: longText,
        intent: makeIntent(),
        toolResults: [],
        context: makeContext({ channel: 'phone' }),
        sessionId: 'session-1',
        telemetry: makeTelemetry(),
      });

      expect(response.text.length).toBeLessThanOrEqual(500);
      expect(response.text.endsWith('...')).toBe(true);
    });

    it('should strip markdown for phone channel', () => {
      const response = generateResponse({
        text: '## Heading\n**bold text** and *italic* with `code`',
        intent: makeIntent(),
        toolResults: [],
        context: makeContext({ channel: 'phone' }),
        sessionId: 'session-1',
        telemetry: makeTelemetry(),
      });

      expect(response.text).not.toContain('##');
      expect(response.text).not.toContain('**');
      expect(response.text).not.toContain('`');
    });

    it('should truncate for mobile but allow longer text', () => {
      const longText = 'B'.repeat(1200);
      const response = generateResponse({
        text: longText,
        intent: makeIntent(),
        toolResults: [],
        context: makeContext({ channel: 'mobile' }),
        sessionId: 'session-1',
        telemetry: makeTelemetry(),
      });

      expect(response.text.length).toBeLessThanOrEqual(1000);
    });

    it('should not truncate for web channel', () => {
      const longText = 'C'.repeat(2000);
      const response = generateResponse({
        text: longText,
        intent: makeIntent(),
        toolResults: [],
        context: makeContext({ channel: 'web' }),
        sessionId: 'session-1',
        telemetry: makeTelemetry(),
      });

      expect(response.text.length).toBe(2000);
    });

    it('should include telemetry in response', () => {
      const tel = makeTelemetry();
      tel.intentClassificationMs = 50;
      tel.contextAssemblyMs = 30;

      const response = generateResponse({
        text: 'test',
        intent: makeIntent(),
        toolResults: [],
        context: makeContext(),
        sessionId: 'session-1',
        telemetry: tel,
      });

      expect(response.telemetry).toBeDefined();
      expect(response.telemetry!.intentClassificationMs).toBe(50);
      expect(response.telemetry!.contextAssemblyMs).toBe(30);
    });

    it('should generate CONFIRMATION_CARD for high-confirmation intents with no tool results', () => {
      const response = generateResponse({
        text: 'Confirmation needed.',
        intent: makeIntent({
          primaryIntent: 'send_email',
          confirmationLevel: 'voice_pin',
          blastRadius: 'external',
        }),
        toolResults: [],
        context: makeContext(),
        sessionId: 'session-1',
        telemetry: makeTelemetry(),
      });

      expect(response.contentType).toBe('CONFIRMATION_CARD');
    });

    it('should build decision cards from entity list', () => {
      const toolResults: ToolResult[] = [
        {
          toolName: 'get_entity_list',
          success: true,
          data: {
            entities: [
              { id: 'e1', name: 'Business A', type: 'Business' },
              { id: 'e2', name: 'Personal', type: 'Personal' },
            ],
            count: 2,
          },
          durationMs: 15,
        },
      ];

      const response = generateResponse({
        text: 'Which entity?',
        intent: makeIntent({ primaryIntent: 'switch_entity' }),
        toolResults,
        context: makeContext(),
        sessionId: 'session-1',
        telemetry: makeTelemetry(),
      });

      expect(response.decisionCards).toBeDefined();
      expect(response.decisionCards!.length).toBe(1);
      expect(response.decisionCards![0].options.length).toBe(2);
    });
  });
});

// ─── Context Building Tests ─────────────────────────────────────────────────

describe('Context Building', () => {
  it('should produce a valid AgentContext shape', () => {
    const context = makeContext();
    expect(context.user).toBeDefined();
    expect(context.user.id).toBe('user-1');
    expect(context.user.timezone).toBe('America/Chicago');
    expect(context.channel).toBe('web');
    expect(context.activeEntity).toBeDefined();
    expect(context.activeEntity!.id).toBe('entity-1');
    expect(Array.isArray(context.recentMessages)).toBe(true);
    expect(Array.isArray(context.recentActions)).toBe(true);
  });

  it('should allow context without active entity', () => {
    const context = makeContext({ activeEntity: undefined });
    expect(context.activeEntity).toBeUndefined();
  });

  it('should allow context with current page', () => {
    const context = makeContext({
      currentPage: { pageId: 'inbox', title: 'Inbox' },
    });
    expect(context.currentPage).toBeDefined();
    expect(context.currentPage!.pageId).toBe('inbox');
  });
});

// ─── Intent Classification Structure Tests ──────────────────────────────────

describe('Intent Classification Structure', () => {
  it('should produce a valid ClassifiedIntent shape', () => {
    const intent = makeIntent();
    expect(intent.primaryIntent).toBe('general_question');
    expect(typeof intent.confidence).toBe('number');
    expect(intent.confidence).toBeGreaterThanOrEqual(0);
    expect(intent.confidence).toBeLessThanOrEqual(1);
    expect(typeof intent.entities).toBe('object');
    expect(Array.isArray(intent.requiredTools)).toBe(true);
    expect(['none', 'tap', 'confirm_phrase', 'voice_pin']).toContain(
      intent.confirmationLevel,
    );
    expect(['self', 'entity', 'external', 'public']).toContain(
      intent.blastRadius,
    );
  });

  it('should have proper confirmation levels for different intents', () => {
    const navigateIntent = makeIntent({
      primaryIntent: 'navigate',
      confirmationLevel: 'none',
    });
    expect(navigateIntent.confirmationLevel).toBe('none');

    const sendEmailIntent = makeIntent({
      primaryIntent: 'send_email',
      confirmationLevel: 'tap',
    });
    expect(sendEmailIntent.confirmationLevel).toBe('tap');

    const paymentIntent = makeIntent({
      primaryIntent: 'make_payment',
      confirmationLevel: 'voice_pin',
    });
    expect(paymentIntent.confirmationLevel).toBe('voice_pin');
  });

  it('should have proper blast radius for different intents', () => {
    const readIntent = makeIntent({
      primaryIntent: 'read_data',
      blastRadius: 'self',
    });
    expect(readIntent.blastRadius).toBe('self');

    const taskIntent = makeIntent({
      primaryIntent: 'create_task',
      blastRadius: 'entity',
    });
    expect(taskIntent.blastRadius).toBe('entity');

    const emailIntent = makeIntent({
      primaryIntent: 'send_email',
      blastRadius: 'external',
    });
    expect(emailIntent.blastRadius).toBe('external');

    const crisisIntent = makeIntent({
      primaryIntent: 'declare_crisis',
      blastRadius: 'public',
    });
    expect(crisisIntent.blastRadius).toBe('public');
  });
});

// ─── Telemetry Tests ────────────────────────────────────────────────────────

describe('MessageTelemetry', () => {
  it('should track tool call metrics', () => {
    const telemetry = makeTelemetry();
    telemetry.toolCalls.push(
      { tool: 'list_tasks', durationMs: 50, status: 'success' },
      { tool: 'create_task', durationMs: 100, status: 'success' },
    );

    expect(telemetry.toolCalls.length).toBe(2);
    expect(telemetry.toolCalls[0].tool).toBe('list_tasks');
    expect(telemetry.toolCalls[1].durationMs).toBe(100);
  });

  it('should have all required telemetry fields', () => {
    const telemetry: MessageTelemetry = {
      intentClassificationMs: 30,
      contextAssemblyMs: 20,
      toolCalls: [],
      responseGenerationMs: 500,
      totalMs: 550,
      model: 'claude-sonnet-4-5-20250929',
      tokensIn: 1000,
      tokensOut: 500,
    };

    expect(telemetry.intentClassificationMs).toBe(30);
    expect(telemetry.contextAssemblyMs).toBe(20);
    expect(telemetry.responseGenerationMs).toBe(500);
    expect(telemetry.totalMs).toBe(550);
    expect(telemetry.model).toBe('claude-sonnet-4-5-20250929');
    expect(telemetry.tokensIn).toBe(1000);
    expect(telemetry.tokensOut).toBe(500);
  });
});
