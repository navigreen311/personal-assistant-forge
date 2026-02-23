// Shadow Voice Agent — Tool Router
// Defines 25+ tools that map to existing PAF APIs. Each tool has a name,
// description, input_schema (JSON Schema), and an execute function that calls Prisma directly.

import { prisma } from '@/lib/db';
import type { ToolDefinition, ToolResult, AgentContext } from '../types';

// ─── Tool Definition Registry ───────────────────────────────────────────────

interface InternalToolDef extends ToolDefinition {
  execute: (
    input: Record<string, unknown>,
    context: AgentContext,
  ) => Promise<unknown>;
}

export class ToolRouter {
  private tools: Map<string, InternalToolDef>;

  constructor() {
    this.tools = new Map();
    this.registerAllTools();
  }

  /**
   * Get all tool definitions formatted for the Anthropic API.
   */
  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));
  }

  /**
   * Get the names of all registered tools.
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Execute a tool by name with given input and context.
   */
  async executeTool(
    toolName: string,
    input: Record<string, unknown>,
    context: AgentContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        toolName,
        success: false,
        error: `Unknown tool: ${toolName}`,
        durationMs: 0,
      };
    }

    const start = Date.now();
    try {
      const data = await tool.execute(input, context);
      return {
        toolName,
        success: true,
        data,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        toolName,
        success: false,
        error: msg,
        durationMs: Date.now() - start,
      };
    }
  }

  // ─── Tool Registration ──────────────────────────────────────────────────

  private register(tool: InternalToolDef): void {
    this.tools.set(tool.name, tool);
  }

  private registerAllTools(): void {
    this.registerNavigationTools();
    this.registerTaskTools();
    this.registerInboxTools();
    this.registerCalendarTools();
    this.registerContactTools();
    this.registerFinanceTools();
    this.registerKnowledgeTools();
    this.registerWorkflowTools();
    this.registerEntityTools();
    this.registerProjectTools();
    this.registerDashboardTools();
  }

  // ─── Navigation Tools ─────────────────────────────────────────────────

  private registerNavigationTools(): void {
    this.register({
      name: 'navigate_to_page',
      description: 'Navigate the user to a specific page in the application. Returns a navigation card.',
      input_schema: {
        type: 'object',
        properties: {
          page: {
            type: 'string',
            description: 'Page identifier (e.g., "dashboard", "inbox", "tasks", "calendar", "contacts", "projects", "finance", "invoices", "knowledge", "workflows", "settings", "voiceforge", "analytics", "documents")',
          },
          recordId: {
            type: 'string',
            description: 'Optional specific record ID to navigate to within the page',
          },
        },
        required: ['page'],
      },
      execute: async (input) => {
        const page = input.page as string;
        const recordId = input.recordId as string | undefined;
        const deepLink = recordId ? `/${page}/${recordId}` : `/${page}`;
        return {
          navigated: true,
          deepLink,
          page,
          recordId: recordId ?? null,
        };
      },
    });
  }

  // ─── Dashboard Tools ──────────────────────────────────────────────────

  private registerDashboardTools(): void {
    this.register({
      name: 'get_dashboard_stats',
      description: 'Get overview stats for the current entity: task counts by status, unread messages, upcoming events, and financial summary.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async (_input, context) => {
        const entityId = context.activeEntity?.id;
        if (!entityId) {
          return { error: 'No active entity. Please switch to an entity first.' };
        }

        const [taskCounts, unreadCount, upcomingEvents, financeSummary] = await Promise.all([
          prisma.task.groupBy({
            by: ['status'],
            where: { entityId, deletedAt: null },
            _count: { id: true },
          }),
          prisma.message.count({
            where: { entityId, read: false, deletedAt: null },
          }),
          prisma.calendarEvent.findMany({
            where: {
              entityId,
              startTime: { gte: new Date() },
            },
            orderBy: { startTime: 'asc' },
            take: 5,
            select: { id: true, title: true, startTime: true, endTime: true },
          }),
          prisma.financialRecord.aggregate({
            where: { entityId, status: 'PENDING' },
            _sum: { amount: true },
            _count: { id: true },
          }),
        ]);

        return {
          tasks: taskCounts.reduce(
            (acc, g) => {
              acc[g.status] = g._count.id;
              return acc;
            },
            {} as Record<string, number>,
          ),
          unreadMessages: unreadCount,
          upcomingEvents: upcomingEvents.map((e) => ({
            id: e.id,
            title: e.title,
            startTime: e.startTime.toISOString(),
            endTime: e.endTime.toISOString(),
          })),
          pendingFinancials: {
            count: financeSummary._count.id,
            totalAmount: financeSummary._sum.amount ?? 0,
          },
        };
      },
    });
  }

  // ─── Task Tools ───────────────────────────────────────────────────────

  private registerTaskTools(): void {
    this.register({
      name: 'list_tasks',
      description: 'List tasks for the active entity with optional filters for status, priority, and assignee.',
      input_schema: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Filter by status: TODO, IN_PROGRESS, BLOCKED, DONE, CANCELLED' },
          priority: { type: 'string', description: 'Filter by priority: P0, P1, P2, P3' },
          projectId: { type: 'string', description: 'Filter by project ID' },
          limit: { type: 'number', description: 'Max results to return (default 10)' },
        },
        required: [],
      },
      execute: async (input, context) => {
        const entityId = context.activeEntity?.id;
        if (!entityId) return { error: 'No active entity' };

        const where: Record<string, unknown> = { entityId, deletedAt: null };
        if (input.status) where.status = input.status;
        if (input.priority) where.priority = input.priority;
        if (input.projectId) where.projectId = input.projectId;

        const tasks = await prisma.task.findMany({
          where,
          orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
          take: (input.limit as number) ?? 10,
          select: {
            id: true, title: true, status: true, priority: true,
            dueDate: true, projectId: true, tags: true,
          },
        });

        return { tasks, count: tasks.length };
      },
    });

    this.register({
      name: 'create_task',
      description: 'Create a new task in the active entity.',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task title' },
          description: { type: 'string', description: 'Task description' },
          priority: { type: 'string', description: 'Priority: P0, P1, P2, P3 (default P1)' },
          dueDate: { type: 'string', description: 'Due date in ISO format' },
          projectId: { type: 'string', description: 'Project to assign to' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags for the task' },
        },
        required: ['title'],
      },
      execute: async (input, context) => {
        const entityId = context.activeEntity?.id;
        if (!entityId) return { error: 'No active entity' };

        const task = await prisma.task.create({
          data: {
            title: input.title as string,
            description: (input.description as string) ?? null,
            entityId,
            priority: (input.priority as string) ?? 'P1',
            status: 'TODO',
            dueDate: input.dueDate ? new Date(input.dueDate as string) : null,
            projectId: (input.projectId as string) ?? null,
            tags: (input.tags as string[]) ?? [],
            assigneeId: context.user.id,
          },
        });

        return { created: true, taskId: task.id, title: task.title };
      },
    });

    this.register({
      name: 'update_task',
      description: 'Update an existing task by ID.',
      input_schema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Task ID to update' },
          title: { type: 'string', description: 'New title' },
          status: { type: 'string', description: 'New status' },
          priority: { type: 'string', description: 'New priority' },
          dueDate: { type: 'string', description: 'New due date (ISO)' },
          description: { type: 'string', description: 'New description' },
        },
        required: ['taskId'],
      },
      execute: async (input) => {
        const data: Record<string, unknown> = {};
        if (input.title) data.title = input.title;
        if (input.status) data.status = input.status;
        if (input.priority) data.priority = input.priority;
        if (input.dueDate) data.dueDate = new Date(input.dueDate as string);
        if (input.description) data.description = input.description;

        const task = await prisma.task.update({
          where: { id: input.taskId as string },
          data,
        });

        return { updated: true, taskId: task.id, title: task.title, status: task.status };
      },
    });

    this.register({
      name: 'complete_task',
      description: 'Mark a task as complete.',
      input_schema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Task ID to complete' },
        },
        required: ['taskId'],
      },
      execute: async (input) => {
        const task = await prisma.task.update({
          where: { id: input.taskId as string },
          data: { status: 'DONE' },
        });
        return { completed: true, taskId: task.id, title: task.title };
      },
    });
  }

  // ─── Inbox / Email Tools ──────────────────────────────────────────────

  private registerInboxTools(): void {
    this.register({
      name: 'list_inbox',
      description: 'List inbox messages for the active entity with optional filters.',
      input_schema: {
        type: 'object',
        properties: {
          unreadOnly: { type: 'boolean', description: 'Only return unread messages' },
          starred: { type: 'boolean', description: 'Only return starred messages' },
          limit: { type: 'number', description: 'Max results (default 10)' },
          channel: { type: 'string', description: 'Filter by channel (email, sms, etc.)' },
        },
        required: [],
      },
      execute: async (input, context) => {
        const entityId = context.activeEntity?.id;
        if (!entityId) return { error: 'No active entity' };

        const where: Record<string, unknown> = { entityId, deletedAt: null };
        if (input.unreadOnly) where.read = false;
        if (input.starred) where.starred = true;
        if (input.channel) where.channel = input.channel;

        const messages = await prisma.message.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: (input.limit as number) ?? 10,
          select: {
            id: true, channel: true, subject: true, body: true,
            triageScore: true, read: true, starred: true, createdAt: true,
          },
        });

        return {
          messages: messages.map((m) => ({
            ...m,
            body: m.body.slice(0, 200), // Truncate for display
            createdAt: m.createdAt.toISOString(),
          })),
          count: messages.length,
        };
      },
    });

    this.register({
      name: 'classify_email',
      description: 'Classify/triage an email message by updating its triage score and intent.',
      input_schema: {
        type: 'object',
        properties: {
          messageId: { type: 'string', description: 'Message ID to classify' },
          triageScore: { type: 'number', description: 'Triage score 1-10' },
          intent: { type: 'string', description: 'Detected intent category' },
        },
        required: ['messageId', 'triageScore'],
      },
      execute: async (input) => {
        const message = await prisma.message.update({
          where: { id: input.messageId as string },
          data: {
            triageScore: input.triageScore as number,
            intent: (input.intent as string) ?? null,
          },
        });
        return { classified: true, messageId: message.id, triageScore: message.triageScore };
      },
    });

    this.register({
      name: 'draft_email',
      description: 'Create a draft email message.',
      input_schema: {
        type: 'object',
        properties: {
          recipientId: { type: 'string', description: 'Contact ID of the recipient' },
          subject: { type: 'string', description: 'Email subject line' },
          body: { type: 'string', description: 'Email body content' },
          threadId: { type: 'string', description: 'Thread ID if replying' },
        },
        required: ['recipientId', 'subject', 'body'],
      },
      execute: async (input, context) => {
        const entityId = context.activeEntity?.id;
        if (!entityId) return { error: 'No active entity' };

        const draft = await prisma.message.create({
          data: {
            channel: 'email',
            senderId: context.user.id,
            recipientId: input.recipientId as string,
            entityId,
            subject: input.subject as string,
            body: input.body as string,
            threadId: (input.threadId as string) ?? null,
            draftStatus: 'DRAFT',
            sensitivity: 'INTERNAL',
          },
        });

        return { drafted: true, messageId: draft.id, subject: draft.subject };
      },
    });

    this.register({
      name: 'send_email',
      description: 'Send an email message (either an existing draft or compose a new one).',
      input_schema: {
        type: 'object',
        properties: {
          messageId: { type: 'string', description: 'Existing draft message ID to send' },
          recipientId: { type: 'string', description: 'Contact ID (for new email)' },
          subject: { type: 'string', description: 'Subject (for new email)' },
          body: { type: 'string', description: 'Body (for new email)' },
        },
        required: [],
      },
      execute: async (input, context) => {
        if (input.messageId) {
          const message = await prisma.message.update({
            where: { id: input.messageId as string },
            data: { draftStatus: 'SENT' },
          });
          return { sent: true, messageId: message.id };
        }

        const entityId = context.activeEntity?.id;
        if (!entityId) return { error: 'No active entity' };
        if (!input.recipientId || !input.subject || !input.body) {
          return { error: 'recipientId, subject, and body are required for new emails' };
        }

        const message = await prisma.message.create({
          data: {
            channel: 'email',
            senderId: context.user.id,
            recipientId: input.recipientId as string,
            entityId,
            subject: input.subject as string,
            body: input.body as string,
            draftStatus: 'SENT',
            sensitivity: 'INTERNAL',
          },
        });

        return { sent: true, messageId: message.id };
      },
    });
  }

  // ─── Calendar Tools ───────────────────────────────────────────────────

  private registerCalendarTools(): void {
    this.register({
      name: 'list_calendar_events',
      description: 'List upcoming calendar events for the active entity.',
      input_schema: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'Start of date range (ISO)' },
          endDate: { type: 'string', description: 'End of date range (ISO)' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
        required: [],
      },
      execute: async (input, context) => {
        const entityId = context.activeEntity?.id;
        if (!entityId) return { error: 'No active entity' };

        const where: Record<string, unknown> = { entityId };
        if (input.startDate || input.endDate) {
          const startFilter: Record<string, Date> = {};
          if (input.startDate) startFilter.gte = new Date(input.startDate as string);
          if (input.endDate) startFilter.lte = new Date(input.endDate as string);
          where.startTime = startFilter;
        } else {
          where.startTime = { gte: new Date() };
        }

        const events = await prisma.calendarEvent.findMany({
          where,
          orderBy: { startTime: 'asc' },
          take: (input.limit as number) ?? 10,
          select: {
            id: true, title: true, startTime: true, endTime: true,
            participantIds: true, recurrence: true,
          },
        });

        return {
          events: events.map((e) => ({
            id: e.id,
            title: e.title,
            startTime: e.startTime.toISOString(),
            endTime: e.endTime.toISOString(),
            participantCount: e.participantIds.length,
            recurrence: e.recurrence,
          })),
          count: events.length,
        };
      },
    });

    this.register({
      name: 'create_calendar_event',
      description: 'Create a new calendar event.',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Event title' },
          startTime: { type: 'string', description: 'Start time (ISO)' },
          endTime: { type: 'string', description: 'End time (ISO)' },
          participantIds: { type: 'array', items: { type: 'string' }, description: 'Participant contact IDs' },
        },
        required: ['title', 'startTime', 'endTime'],
      },
      execute: async (input, context) => {
        const entityId = context.activeEntity?.id;
        if (!entityId) return { error: 'No active entity' };

        const event = await prisma.calendarEvent.create({
          data: {
            title: input.title as string,
            entityId,
            startTime: new Date(input.startTime as string),
            endTime: new Date(input.endTime as string),
            participantIds: (input.participantIds as string[]) ?? [],
          },
        });

        return { created: true, eventId: event.id, title: event.title };
      },
    });

    this.register({
      name: 'modify_calendar_event',
      description: 'Update an existing calendar event.',
      input_schema: {
        type: 'object',
        properties: {
          eventId: { type: 'string', description: 'Event ID to modify' },
          title: { type: 'string', description: 'New title' },
          startTime: { type: 'string', description: 'New start time (ISO)' },
          endTime: { type: 'string', description: 'New end time (ISO)' },
        },
        required: ['eventId'],
      },
      execute: async (input) => {
        const data: Record<string, unknown> = {};
        if (input.title) data.title = input.title;
        if (input.startTime) data.startTime = new Date(input.startTime as string);
        if (input.endTime) data.endTime = new Date(input.endTime as string);

        const event = await prisma.calendarEvent.update({
          where: { id: input.eventId as string },
          data,
        });

        return { updated: true, eventId: event.id, title: event.title };
      },
    });
  }

  // ─── Contact Tools ────────────────────────────────────────────────────

  private registerContactTools(): void {
    this.register({
      name: 'list_contacts',
      description: 'List contacts for the active entity with optional search.',
      input_schema: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Search by name or email' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
        required: [],
      },
      execute: async (input, context) => {
        const entityId = context.activeEntity?.id;
        if (!entityId) return { error: 'No active entity' };

        const where: Record<string, unknown> = { entityId, deletedAt: null };
        if (input.search) {
          where.OR = [
            { name: { contains: input.search as string, mode: 'insensitive' } },
            { email: { contains: input.search as string, mode: 'insensitive' } },
          ];
        }
        if (input.tags && (input.tags as string[]).length > 0) {
          where.tags = { hasSome: input.tags as string[] };
        }

        const contacts = await prisma.contact.findMany({
          where,
          orderBy: { name: 'asc' },
          take: (input.limit as number) ?? 10,
          select: {
            id: true, name: true, email: true, phone: true,
            relationshipScore: true, tags: true, lastTouch: true,
          },
        });

        return { contacts, count: contacts.length };
      },
    });

    this.register({
      name: 'get_contact',
      description: 'Get detailed information about a specific contact.',
      input_schema: {
        type: 'object',
        properties: {
          contactId: { type: 'string', description: 'Contact ID' },
        },
        required: ['contactId'],
      },
      execute: async (input) => {
        const contact = await prisma.contact.findUnique({
          where: { id: input.contactId as string },
          select: {
            id: true, name: true, email: true, phone: true,
            channels: true, relationshipScore: true, lastTouch: true,
            commitments: true, preferences: true, tags: true,
          },
        });

        if (!contact) return { error: 'Contact not found' };
        return { contact };
      },
    });

    this.register({
      name: 'create_contact',
      description: 'Create a new contact in the active entity.',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Contact name' },
          email: { type: 'string', description: 'Contact email' },
          phone: { type: 'string', description: 'Contact phone number' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
        },
        required: ['name'],
      },
      execute: async (input, context) => {
        const entityId = context.activeEntity?.id;
        if (!entityId) return { error: 'No active entity' };

        const contact = await prisma.contact.create({
          data: {
            entityId,
            name: input.name as string,
            email: (input.email as string) ?? null,
            phone: (input.phone as string) ?? null,
            tags: (input.tags as string[]) ?? [],
          },
        });

        return { created: true, contactId: contact.id, name: contact.name };
      },
    });
  }

  // ─── Finance Tools ────────────────────────────────────────────────────

  private registerFinanceTools(): void {
    this.register({
      name: 'list_invoices',
      description: 'List financial records/invoices for the active entity.',
      input_schema: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Filter by status: PENDING, PAID, OVERDUE, CANCELLED' },
          type: { type: 'string', description: 'Filter by type: invoice, expense, payment' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
        required: [],
      },
      execute: async (input, context) => {
        const entityId = context.activeEntity?.id;
        if (!entityId) return { error: 'No active entity' };

        const where: Record<string, unknown> = { entityId };
        if (input.status) where.status = input.status;
        if (input.type) where.type = input.type;

        const records = await prisma.financialRecord.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: (input.limit as number) ?? 10,
          select: {
            id: true, type: true, amount: true, currency: true,
            status: true, dueDate: true, category: true, vendor: true, description: true,
          },
        });

        return { records, count: records.length };
      },
    });

    this.register({
      name: 'create_invoice',
      description: 'Create a new invoice/financial record.',
      input_schema: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Record type: invoice, expense, payment' },
          amount: { type: 'number', description: 'Amount in currency' },
          currency: { type: 'string', description: 'Currency code (default USD)' },
          category: { type: 'string', description: 'Category' },
          vendor: { type: 'string', description: 'Vendor/client name' },
          description: { type: 'string', description: 'Description' },
          dueDate: { type: 'string', description: 'Due date (ISO)' },
        },
        required: ['type', 'amount', 'category'],
      },
      execute: async (input, context) => {
        const entityId = context.activeEntity?.id;
        if (!entityId) return { error: 'No active entity' };

        const record = await prisma.financialRecord.create({
          data: {
            entityId,
            type: input.type as string,
            amount: input.amount as number,
            currency: (input.currency as string) ?? 'USD',
            category: input.category as string,
            vendor: (input.vendor as string) ?? null,
            description: (input.description as string) ?? null,
            dueDate: input.dueDate ? new Date(input.dueDate as string) : null,
            status: 'PENDING',
          },
        });

        return { created: true, recordId: record.id, amount: record.amount };
      },
    });

    this.register({
      name: 'send_invoice_reminder',
      description: 'Mark an invoice for reminder/follow-up by updating its status.',
      input_schema: {
        type: 'object',
        properties: {
          invoiceId: { type: 'string', description: 'Invoice/financial record ID' },
        },
        required: ['invoiceId'],
      },
      execute: async (input) => {
        const record = await prisma.financialRecord.findUnique({
          where: { id: input.invoiceId as string },
        });
        if (!record) return { error: 'Invoice not found' };

        // Log the reminder action
        await prisma.actionLog.create({
          data: {
            actor: 'SHADOW',
            actionType: 'INVOICE_REMINDER_SENT',
            target: record.id,
            reason: `Reminder sent for ${record.type} of ${record.amount} ${record.currency}`,
            blastRadius: 'LOW',
            reversible: false,
          },
        });

        return { reminderSent: true, invoiceId: record.id, amount: record.amount };
      },
    });

    this.register({
      name: 'get_finance_summary',
      description: 'Get a financial summary for the active entity.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async (_input, context) => {
        const entityId = context.activeEntity?.id;
        if (!entityId) return { error: 'No active entity' };

        const [income, expenses, pending] = await Promise.all([
          prisma.financialRecord.aggregate({
            where: { entityId, type: 'invoice', status: 'PAID' },
            _sum: { amount: true },
            _count: { id: true },
          }),
          prisma.financialRecord.aggregate({
            where: { entityId, type: 'expense' },
            _sum: { amount: true },
            _count: { id: true },
          }),
          prisma.financialRecord.aggregate({
            where: { entityId, status: 'PENDING' },
            _sum: { amount: true },
            _count: { id: true },
          }),
        ]);

        return {
          totalIncome: income._sum.amount ?? 0,
          incomeCount: income._count.id,
          totalExpenses: expenses._sum.amount ?? 0,
          expenseCount: expenses._count.id,
          pendingTotal: pending._sum.amount ?? 0,
          pendingCount: pending._count.id,
          netIncome: (income._sum.amount ?? 0) - (expenses._sum.amount ?? 0),
        };
      },
    });

    this.register({
      name: 'list_expenses',
      description: 'List expense records for the active entity.',
      input_schema: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Filter by category' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
        required: [],
      },
      execute: async (input, context) => {
        const entityId = context.activeEntity?.id;
        if (!entityId) return { error: 'No active entity' };

        const where: Record<string, unknown> = { entityId, type: 'expense' };
        if (input.category) where.category = input.category;

        const expenses = await prisma.financialRecord.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: (input.limit as number) ?? 10,
          select: {
            id: true, amount: true, currency: true, category: true,
            vendor: true, description: true, createdAt: true,
          },
        });

        return { expenses, count: expenses.length };
      },
    });
  }

  // ─── Knowledge Base Tools ─────────────────────────────────────────────

  private registerKnowledgeTools(): void {
    this.register({
      name: 'search_knowledge_base',
      description: 'Search the knowledge base for relevant entries.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
          limit: { type: 'number', description: 'Max results (default 5)' },
        },
        required: ['query'],
      },
      execute: async (input, context) => {
        const entityId = context.activeEntity?.id;
        if (!entityId) return { error: 'No active entity' };

        const where: Record<string, unknown> = {
          entityId,
          content: { contains: input.query as string, mode: 'insensitive' },
        };
        if (input.tags && (input.tags as string[]).length > 0) {
          where.tags = { hasSome: input.tags as string[] };
        }

        const entries = await prisma.knowledgeEntry.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: (input.limit as number) ?? 5,
          select: {
            id: true, content: true, tags: true, source: true, createdAt: true,
          },
        });

        return {
          entries: entries.map((e) => ({
            id: e.id,
            content: e.content.slice(0, 500),
            tags: e.tags,
            source: e.source,
          })),
          count: entries.length,
        };
      },
    });

    this.register({
      name: 'add_knowledge_entry',
      description: 'Add a new entry to the knowledge base.',
      input_schema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Knowledge content' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
          source: { type: 'string', description: 'Source of the knowledge (e.g., "user_input", "meeting_notes")' },
        },
        required: ['content', 'source'],
      },
      execute: async (input, context) => {
        const entityId = context.activeEntity?.id;
        if (!entityId) return { error: 'No active entity' };

        const entry = await prisma.knowledgeEntry.create({
          data: {
            entityId,
            content: input.content as string,
            tags: (input.tags as string[]) ?? [],
            source: input.source as string,
          },
        });

        return { created: true, entryId: entry.id };
      },
    });
  }

  // ─── Workflow Tools ───────────────────────────────────────────────────

  private registerWorkflowTools(): void {
    this.register({
      name: 'trigger_workflow',
      description: 'Trigger an automation workflow by ID.',
      input_schema: {
        type: 'object',
        properties: {
          workflowId: { type: 'string', description: 'Workflow ID to trigger' },
          workflowName: { type: 'string', description: 'Workflow name to search and trigger' },
        },
        required: [],
      },
      execute: async (input, context) => {
        const entityId = context.activeEntity?.id;
        if (!entityId) return { error: 'No active entity' };

        let workflow;
        if (input.workflowId) {
          workflow = await prisma.workflow.findUnique({
            where: { id: input.workflowId as string },
          });
        } else if (input.workflowName) {
          workflow = await prisma.workflow.findFirst({
            where: {
              entityId,
              name: { contains: input.workflowName as string, mode: 'insensitive' },
              status: 'ACTIVE',
            },
          });
        }

        if (!workflow) return { error: 'Workflow not found' };

        // Mark as triggered
        await prisma.workflow.update({
          where: { id: workflow.id },
          data: { lastRun: new Date() },
        });

        await prisma.actionLog.create({
          data: {
            actor: 'SHADOW',
            actorId: context.user.id,
            actionType: 'WORKFLOW_TRIGGERED',
            target: workflow.id,
            reason: `Workflow "${workflow.name}" triggered by Shadow`,
            blastRadius: 'MEDIUM',
            reversible: false,
          },
        });

        return { triggered: true, workflowId: workflow.id, name: workflow.name };
      },
    });

    this.register({
      name: 'get_workflow_status',
      description: 'Get the current status of a workflow.',
      input_schema: {
        type: 'object',
        properties: {
          workflowId: { type: 'string', description: 'Workflow ID' },
        },
        required: ['workflowId'],
      },
      execute: async (input) => {
        const workflow = await prisma.workflow.findUnique({
          where: { id: input.workflowId as string },
          select: {
            id: true, name: true, status: true, lastRun: true,
            successRate: true, steps: true,
          },
        });

        if (!workflow) return { error: 'Workflow not found' };
        return {
          ...workflow,
          lastRun: workflow.lastRun?.toISOString() ?? null,
        };
      },
    });
  }

  // ─── Entity Tools ────────────────────────────────────────────────────

  private registerEntityTools(): void {
    this.register({
      name: 'switch_entity',
      description: 'Switch the active entity context to a different entity.',
      input_schema: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'Entity ID to switch to' },
          entityName: { type: 'string', description: 'Entity name to search for' },
        },
        required: [],
      },
      execute: async (input, context) => {
        if (input.entityId) {
          const entity = await prisma.entity.findUnique({
            where: { id: input.entityId as string },
            select: { id: true, name: true, type: true },
          });
          if (!entity) return { error: 'Entity not found' };
          return { switched: true, entityId: entity.id, name: entity.name, type: entity.type };
        }

        if (input.entityName) {
          const entity = await prisma.entity.findFirst({
            where: {
              userId: context.user.id,
              name: { contains: input.entityName as string, mode: 'insensitive' },
            },
            select: { id: true, name: true, type: true },
          });
          if (!entity) return { error: `No entity found matching "${input.entityName}"` };
          return { switched: true, entityId: entity.id, name: entity.name, type: entity.type };
        }

        return { error: 'Provide either entityId or entityName' };
      },
    });

    this.register({
      name: 'get_entity_list',
      description: 'List all entities the user has access to.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async (_input, context) => {
        const entities = await prisma.entity.findMany({
          where: { userId: context.user.id },
          select: { id: true, name: true, type: true, createdAt: true },
          orderBy: { name: 'asc' },
        });

        return { entities, count: entities.length };
      },
    });
  }

  // ─── Project Tools ────────────────────────────────────────────────────

  private registerProjectTools(): void {
    this.register({
      name: 'list_projects',
      description: 'List projects for the active entity.',
      input_schema: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Filter by status: TODO, IN_PROGRESS, DONE' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
        required: [],
      },
      execute: async (input, context) => {
        const entityId = context.activeEntity?.id;
        if (!entityId) return { error: 'No active entity' };

        const where: Record<string, unknown> = { entityId };
        if (input.status) where.status = input.status;

        const projects = await prisma.project.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: (input.limit as number) ?? 10,
          select: {
            id: true, name: true, description: true, status: true,
            health: true, createdAt: true,
          },
        });

        return { projects, count: projects.length };
      },
    });

    this.register({
      name: 'get_project_status',
      description: 'Get detailed status of a project including task breakdown.',
      input_schema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Project ID' },
        },
        required: ['projectId'],
      },
      execute: async (input) => {
        const project = await prisma.project.findUnique({
          where: { id: input.projectId as string },
          select: {
            id: true, name: true, description: true, status: true,
            health: true, milestones: true,
          },
        });

        if (!project) return { error: 'Project not found' };

        const taskCounts = await prisma.task.groupBy({
          by: ['status'],
          where: { projectId: project.id, deletedAt: null },
          _count: { id: true },
        });

        return {
          project,
          taskBreakdown: taskCounts.reduce(
            (acc, g) => {
              acc[g.status] = g._count.id;
              return acc;
            },
            {} as Record<string, number>,
          ),
        };
      },
    });
  }
}
