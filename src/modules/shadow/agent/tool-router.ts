// Shadow Voice Agent — Tool Router
// Defines 31 tools that map to existing PAF APIs. Each tool has a name,
// description, input_schema (JSON Schema), and an execute function.
//
// ============================================================================
// THIS FILE HAS NO DATABASE CLIENT, ON PURPOSE (P-34)
// ============================================================================
//
// `import { prisma } from '@/lib/db'` used to be line 5. Eleven tools took an
// id straight out of `input` -- the tool_use block of an LLM response -- and
// queried on it with no entity filter, so a prompt injection naming another
// tenant's cuid reached Postgres unfiltered. Two of the eleven were writes.
//
// Every query now goes through `ShadowEntityScope` in `./entity-scope.ts`,
// which holds a `VerifiedEntityId` in a private field and merges it into the
// `where` itself. `registerScoped` below resolves and verifies that entity
// before a tool body runs, so a scoped tool cannot start without one and cannot
// query outside it.
//
// `eslint.config.mjs` forbids importing `@/lib/db` from this file, and
// `npx eslint src` gates CI -- so a tool added next month gets the scope by
// default rather than by discipline. The reasoning, the refusal semantics and
// the Decision-01 citation are all in the header of `./entity-scope.ts`.
// ============================================================================

import { executeWorkflowForEntityOwner } from '@/modules/workflows/services/workflow-executor';
import type { ToolDefinition, ToolResult, AgentContext } from '../types';
import {
  NO_ACTIVE_ENTITY,
  notInScope,
  readId,
  resolveToolScope,
  findOwnedEntityById,
  findOwnedEntityByName,
  listEntitiesForUser,
  type ShadowEntityScope,
} from './entity-scope';

// ─── Tool Definition Registry ───────────────────────────────────────────────

interface InternalToolDef extends ToolDefinition {
  execute: (
    input: Record<string, unknown>,
    context: AgentContext,
  ) => Promise<unknown>;
}

/**
 * A tool whose work is confined to one entity.
 *
 * The third argument is the difference: it is the only database handle in this
 * module, and `registerScoped` is the only thing that can produce one.
 */
interface ScopedToolDef extends ToolDefinition {
  execute: (
    input: Record<string, unknown>,
    context: AgentContext,
    scope: ShadowEntityScope,
  ) => Promise<unknown>;
}

/** Numeric tool inputs are LLM-generated; a missing or silly limit gets `fallback`. */
function readLimit(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    return fallback;
  }
  return Math.min(Math.floor(value), 100);
}

/** String arrays off an LLM input, with anything non-string dropped. */
function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
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

  /**
   * Register a tool that may only act inside the active entity.
   *
   * The entity is resolved from the context and re-proved against the database
   * (`resolveToolScope` -> `verifyEntityForUser`) BEFORE the tool body runs. A
   * body that never receives a scope never runs, so there is no path on which a
   * scoped tool executes with no entity, and no boilerplate for a tool author
   * to forget.
   */
  private registerScoped(tool: ScopedToolDef): void {
    this.register({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema,
      execute: async (input, context) => {
        const scope = await resolveToolScope(context);
        if (!scope) return NO_ACTIVE_ENTITY;
        return tool.execute(input, context, scope);
      },
    });
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
    this.registerScoped({
      name: 'get_dashboard_stats',
      description: 'Get overview stats for the current entity: task counts by status, unread messages, upcoming events, and financial summary.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async (_input, _context, scope) => {
        const { taskCounts, unreadCount, upcomingEvents, financeSummary } =
          await scope.dashboardStats();

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
    this.registerScoped({
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
      execute: async (input, _context, scope) => {
        const tasks = await scope.listTasks({
          status: readString(input.status),
          priority: readString(input.priority),
          projectId: readString(input.projectId),
          limit: readLimit(input.limit, 10),
        });

        return { tasks, count: tasks.length };
      },
    });

    this.registerScoped({
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
      execute: async (input, context, scope) => {
        const title = readString(input.title);
        if (!title) return { error: 'title is required' };

        const task = await scope.createTask({
          title,
          description: readString(input.description) ?? null,
          priority: readString(input.priority) ?? 'P1',
          dueDate: input.dueDate ? new Date(input.dueDate as string) : null,
          projectId: readId(input.projectId),
          tags: readStringArray(input.tags),
          assigneeId: context.user.id,
        });

        // Null means the `projectId` the model supplied is not in this entity.
        if (!task) return notInScope('Project');

        return { created: true, taskId: task.id, title: task.title };
      },
    });

    this.registerScoped({
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
      execute: async (input, _context, scope) => {
        const taskId = readId(input.taskId);
        if (!taskId) return notInScope('Task');

        const data: Record<string, unknown> = {};
        if (input.title) data.title = input.title;
        if (input.status) data.status = input.status;
        if (input.priority) data.priority = input.priority;
        if (input.dueDate) data.dueDate = new Date(input.dueDate as string);
        if (input.description) data.description = input.description;

        const task = await scope.updateTask(taskId, data);
        if (!task) return notInScope('Task');

        return { updated: true, taskId: task.id, title: task.title, status: task.status };
      },
    });

    this.registerScoped({
      name: 'complete_task',
      description: 'Mark a task as complete.',
      input_schema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Task ID to complete' },
        },
        required: ['taskId'],
      },
      execute: async (input, _context, scope) => {
        const taskId = readId(input.taskId);
        if (!taskId) return notInScope('Task');

        const task = await scope.updateTask(taskId, { status: 'DONE' });
        if (!task) return notInScope('Task');

        return { completed: true, taskId: task.id, title: task.title };
      },
    });
  }

  // ─── Inbox / Email Tools ──────────────────────────────────────────────

  private registerInboxTools(): void {
    this.registerScoped({
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
      execute: async (input, _context, scope) => {
        const messages = await scope.listMessages({
          unreadOnly: input.unreadOnly === true,
          starred: input.starred === true,
          channel: readString(input.channel),
          limit: readLimit(input.limit, 10),
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

    this.registerScoped({
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
      execute: async (input, _context, scope) => {
        const messageId = readId(input.messageId);
        if (!messageId) return notInScope('Message');

        const message = await scope.updateMessage(messageId, {
          triageScore: input.triageScore as number,
          intent: readString(input.intent) ?? null,
        });
        if (!message) return notInScope('Message');

        return { classified: true, messageId: message.id, triageScore: message.triageScore };
      },
    });

    this.registerScoped({
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
      // ---------------------------------------------------------------------
      // `recipientId` is a Contact id off LLM input -- `Message.recipientId`
      // carries no foreign key, so an injected id was simply stored, attaching
      // another tenant's contact to this entity's message. `relationship-
      // intelligence.ts` reads `OR: [{ senderId }, { recipientId }]` by contact
      // id, so the row was then readable from the other side.
      //
      // KNOWN, PRE-EXISTING, NOT FIXED HERE: `Message.senderId` IS foreign-key
      // constrained, to `Contact.id` (baseline migration, line 1466), and this
      // tool writes `context.user.id` into it -- a User id. So the insert below
      // has never once succeeded, in this tool or in
      // `broadcast-manager.ts:101`, which writes an ENTITY id into the same
      // column. Every reader treats the value as a free string
      // (`msg.contact?.name ?? msg.senderId` in inbox.service and dashboard),
      // so the code and the constraint disagree and the constraint is the odd
      // one out. `prisma/schema.prisma` is frozen for this package; recorded in
      // PARALLEL_BUILD_ESCALATION_P34.md. It is left exactly as found rather
      // than guessed at, and the scoping above runs BEFORE it, so the tenancy
      // refusal is reached whether or not the write would work.
      // ---------------------------------------------------------------------
      execute: async (input, context, scope) => {
        const recipientId = readId(input.recipientId);
        const subject = readString(input.subject);
        const body = readString(input.body);
        if (!recipientId || !subject || !body) {
          return { error: 'recipientId, subject, and body are required' };
        }
        if (!(await scope.findContactId(recipientId))) return notInScope('Contact');

        const draft = await scope.createMessage({
          senderId: context.user.id,
          recipientId,
          subject,
          body,
          threadId: readId(input.threadId),
          draftStatus: 'DRAFT',
        });

        return { drafted: true, messageId: draft.id, subject: draft.subject };
      },
    });

    this.registerScoped({
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
      execute: async (input, context, scope) => {
        if (input.messageId !== undefined) {
          const messageId = readId(input.messageId);
          if (!messageId) return notInScope('Message');

          const message = await scope.updateMessage(messageId, {
            draftStatus: 'SENT',
          });
          if (!message) return notInScope('Message');

          return { sent: true, messageId: message.id };
        }

        const recipientId = readId(input.recipientId);
        const subject = readString(input.subject);
        const body = readString(input.body);
        if (!recipientId || !subject || !body) {
          return { error: 'recipientId, subject, and body are required for new emails' };
        }
        // Same contact scoping, and the same `senderId` caveat, as `draft_email`.
        if (!(await scope.findContactId(recipientId))) return notInScope('Contact');

        const message = await scope.createMessage({
          senderId: context.user.id,
          recipientId,
          subject,
          body,
          threadId: null,
          draftStatus: 'SENT',
        });

        return { sent: true, messageId: message.id };
      },
    });
  }

  // ─── Calendar Tools ───────────────────────────────────────────────────

  private registerCalendarTools(): void {
    this.registerScoped({
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
      execute: async (input, _context, scope) => {
        const events = await scope.listCalendarEvents({
          startDate: readString(input.startDate),
          endDate: readString(input.endDate),
          limit: readLimit(input.limit, 10),
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

    this.registerScoped({
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
      execute: async (input, _context, scope) => {
        const title = readString(input.title);
        const startTime = readString(input.startTime);
        const endTime = readString(input.endTime);
        if (!title || !startTime || !endTime) {
          return { error: 'title, startTime and endTime are required' };
        }

        const event = await scope.createCalendarEvent({
          title,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          participantIds: readStringArray(input.participantIds),
        });

        return { created: true, eventId: event.id, title: event.title };
      },
    });

    this.registerScoped({
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
      execute: async (input, _context, scope) => {
        const eventId = readId(input.eventId);
        if (!eventId) return notInScope('Calendar event');

        const data: Record<string, unknown> = {};
        if (input.title) data.title = input.title;
        if (input.startTime) data.startTime = new Date(input.startTime as string);
        if (input.endTime) data.endTime = new Date(input.endTime as string);

        const event = await scope.updateCalendarEvent(eventId, data);
        if (!event) return notInScope('Calendar event');

        return { updated: true, eventId: event.id, title: event.title };
      },
    });
  }

  // ─── Contact Tools ────────────────────────────────────────────────────

  private registerContactTools(): void {
    this.registerScoped({
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
      execute: async (input, _context, scope) => {
        const contacts = await scope.listContacts({
          search: readString(input.search),
          tags: readStringArray(input.tags),
          limit: readLimit(input.limit, 10),
        });

        return { contacts, count: contacts.length };
      },
    });

    this.registerScoped({
      name: 'get_contact',
      description: 'Get detailed information about a specific contact.',
      input_schema: {
        type: 'object',
        properties: {
          contactId: { type: 'string', description: 'Contact ID' },
        },
        required: ['contactId'],
      },
      execute: async (input, _context, scope) => {
        const contactId = readId(input.contactId);
        if (!contactId) return notInScope('Contact');

        const contact = await scope.getContact(contactId);
        if (!contact) return notInScope('Contact');

        return { contact };
      },
    });

    this.registerScoped({
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
      execute: async (input, _context, scope) => {
        const name = readString(input.name);
        if (!name) return { error: 'name is required' };

        const contact = await scope.createContact({
          name,
          email: readString(input.email) ?? null,
          phone: readString(input.phone) ?? null,
          tags: readStringArray(input.tags),
        });

        return { created: true, contactId: contact.id, name: contact.name };
      },
    });
  }

  // ─── Finance Tools ────────────────────────────────────────────────────

  private registerFinanceTools(): void {
    this.registerScoped({
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
      execute: async (input, _context, scope) => {
        const records = await scope.listFinancialRecords({
          status: readString(input.status),
          type: readString(input.type),
          limit: readLimit(input.limit, 10),
        });

        return { records, count: records.length };
      },
    });

    this.registerScoped({
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
      execute: async (input, _context, scope) => {
        const type = readString(input.type);
        const category = readString(input.category);
        if (!type || !category || typeof input.amount !== 'number') {
          return { error: 'type, amount and category are required' };
        }

        const record = await scope.createFinancialRecord({
          type,
          amount: input.amount,
          currency: readString(input.currency) ?? 'USD',
          category,
          vendor: readString(input.vendor) ?? null,
          description: readString(input.description) ?? null,
          dueDate: input.dueDate ? new Date(input.dueDate as string) : null,
        });

        return { created: true, recordId: record.id, amount: record.amount };
      },
    });

    this.registerScoped({
      name: 'send_invoice_reminder',
      description: 'Mark an invoice for reminder/follow-up by updating its status.',
      input_schema: {
        type: 'object',
        properties: {
          invoiceId: { type: 'string', description: 'Invoice/financial record ID' },
        },
        required: ['invoiceId'],
      },
      execute: async (input, _context, scope) => {
        const invoiceId = readId(input.invoiceId);
        if (!invoiceId) return notInScope('Invoice');

        const record = await scope.getFinancialRecord(invoiceId);
        if (!record) return notInScope('Invoice');

        // Log the reminder action
        await scope.logAction({
          actionType: 'INVOICE_REMINDER_SENT',
          target: record.id,
          reason: `Reminder sent for ${record.type} of ${record.amount} ${record.currency}`,
          blastRadius: 'LOW',
          reversible: false,
        });

        return { reminderSent: true, invoiceId: record.id, amount: record.amount };
      },
    });

    this.registerScoped({
      name: 'get_finance_summary',
      description: 'Get a financial summary for the active entity.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async (_input, _context, scope) => {
        const { income, expenses, pending } = await scope.financeSummary();

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

    this.registerScoped({
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
      execute: async (input, _context, scope) => {
        const expenses = await scope.listExpenses({
          category: readString(input.category),
          limit: readLimit(input.limit, 10),
        });

        return { expenses, count: expenses.length };
      },
    });
  }

  // ─── Knowledge Base Tools ─────────────────────────────────────────────

  private registerKnowledgeTools(): void {
    this.registerScoped({
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
      execute: async (input, _context, scope) => {
        const query = readString(input.query);
        if (query === undefined) return { error: 'query is required' };

        const entries = await scope.searchKnowledge({
          query,
          tags: readStringArray(input.tags),
          limit: readLimit(input.limit, 5),
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

    this.registerScoped({
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
      execute: async (input, _context, scope) => {
        const content = readString(input.content);
        const source = readString(input.source);
        if (!content || !source) return { error: 'content and source are required' };

        const entry = await scope.createKnowledgeEntry({
          content,
          tags: readStringArray(input.tags),
          source,
        });

        return { created: true, entryId: entry.id };
      },
    });
  }

  // ─── Workflow Tools ───────────────────────────────────────────────────

  private registerWorkflowTools(): void {
    this.registerScoped({
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
      // ---------------------------------------------------------------------
      // P-34. THREE BUGS IN TWELVE LINES, all of them here.
      //
      //   1. The entity was resolved and then ignored: the `workflowId` branch
      //      called `findUnique({ where: { id } })` while the `workflowName`
      //      branch three lines below filtered on `entityId`. One tool, two
      //      answers about tenancy -- and the correct one was already written.
      //
      //   2. IT EXECUTED NOTHING. It stamped `lastRun`, returned
      //      `{ triggered: true }`, and never called the executor. P-31 built
      //      the real path; nothing here reached it.
      //
      //   3. The ActionLog row said WORKFLOW_TRIGGERED for work that did not
      //      happen. That is worse than the missing execution: an audit trail
      //      that records phantom actions is not a weaker audit trail, it is a
      //      misleading one, and it is the exact defect P-31 found in the step
      //      worker ("wrote an ActionLog row saying EXECUTED and execute
      //      nothing").
      //
      // All three are fixed by routing through
      // `executeWorkflowForEntityOwner`, which is the coordinator's sanctioned
      // server-side entry point: it re-checks `{ id, entityId }` itself, runs
      // the halt gate, creates the WorkflowExecutionRecord, walks the graph and
      // updates `lastRun`/`successRate` from the real result. The `lastRun`
      // write here is therefore deleted rather than moved -- it was the
      // executor's job and doing it twice was how the phantom looked real.
      //
      // The audit row is now written AFTER the run, records the executionId and
      // the terminal status, and is not written at all when the run throws.
      // ---------------------------------------------------------------------
      execute: async (input, context, scope) => {
        const workflowId = readId(input.workflowId);
        const workflowName = readString(input.workflowName);

        const workflow = workflowId
          ? await scope.findWorkflowById(workflowId)
          : workflowName
            ? await scope.findActiveWorkflowByName(workflowName)
            : null;

        if (!workflow) return notInScope('Workflow');

        const execution = await executeWorkflowForEntityOwner(
          workflow.id,
          context.user.id,
          'SHADOW_VOICE',
          scope.entityId,
        );

        await scope.logAction({
          actorId: context.user.id,
          actionType: 'WORKFLOW_TRIGGERED',
          target: workflow.id,
          reason: `Workflow "${workflow.name}" run by Shadow: execution ${execution.id} ${execution.status}`,
          blastRadius: 'MEDIUM',
          reversible: false,
        });

        return {
          triggered: true,
          workflowId: workflow.id,
          name: workflow.name,
          executionId: execution.id,
          status: execution.status,
          stepsRun: execution.stepResults.length,
          error: execution.error ?? null,
        };
      },
    });

    this.registerScoped({
      name: 'get_workflow_status',
      description: 'Get the current status of a workflow.',
      input_schema: {
        type: 'object',
        properties: {
          workflowId: { type: 'string', description: 'Workflow ID' },
        },
        required: ['workflowId'],
      },
      execute: async (input, _context, scope) => {
        const workflowId = readId(input.workflowId);
        if (!workflowId) return notInScope('Workflow');

        const workflow = await scope.findWorkflowById(workflowId);
        if (!workflow) return notInScope('Workflow');

        return {
          id: workflow.id,
          name: workflow.name,
          status: workflow.status,
          lastRun: workflow.lastRun?.toISOString() ?? null,
          successRate: workflow.successRate,
          steps: workflow.steps,
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
      // ---------------------------------------------------------------------
      // NOT `registerScoped`: the subject of this tool is the set of entities
      // the USER owns, so binding it to one of them would be wrong. It is
      // scoped to `context.user.id` instead, which is the only other tenancy
      // axis in this module.
      //
      // The `entityId` branch was the eleventh unscoped site and the only
      // cross-USER one: `findUnique({ where: { id } })` returning `name` and
      // `type`. One injected cuid and Shadow read out a stranger's company
      // name. `findOwnedEntityById` filters on `userId`, so a foreign id is now
      // indistinguishable from a nonexistent one.
      //
      // NOTE FOR WHOEVER WIRES THIS UP: it still does not switch anything.
      // `AgentContext` is built once per message in `buildContext` and this
      // returns a value the model reads; `core.ts` uses the result only to
      // write "Switched to entity: X" into a consent receipt. The name is a
      // promise the code does not keep. It is left as found because making it
      // real means moving `ShadowVoiceSession.activeEntityId` mid-turn and
      // rebuilding the context, which is a behaviour change this package has no
      // test surface for -- but it is recorded here and in the P-34 PR body so
      // it is not discovered a third time.
      // ---------------------------------------------------------------------
      execute: async (input, context) => {
        const entityId = readId(input.entityId);
        if (entityId) {
          const entity = await findOwnedEntityById(context.user.id, entityId);
          if (!entity) return { error: 'Entity not found' };
          return { switched: true, entityId: entity.id, name: entity.name, type: entity.type };
        }

        const entityName = readString(input.entityName);
        if (entityName) {
          const entity = await findOwnedEntityByName(context.user.id, entityName);
          if (!entity) return { error: `No entity found matching "${entityName}"` };
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
        const entities = await listEntitiesForUser(context.user.id);
        return { entities, count: entities.length };
      },
    });
  }

  // ─── Project Tools ────────────────────────────────────────────────────

  private registerProjectTools(): void {
    this.registerScoped({
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
      execute: async (input, _context, scope) => {
        const projects = await scope.listProjects({
          status: readString(input.status),
          limit: readLimit(input.limit, 10),
        });

        return { projects, count: projects.length };
      },
    });

    this.registerScoped({
      name: 'get_project_status',
      description: 'Get detailed status of a project including task breakdown.',
      input_schema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Project ID' },
        },
        required: ['projectId'],
      },
      execute: async (input, _context, scope) => {
        const projectId = readId(input.projectId);
        if (!projectId) return notInScope('Project');

        const project = await scope.getProject(projectId);
        if (!project) return notInScope('Project');

        const taskCounts = await scope.projectTaskCounts(project.id);

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
