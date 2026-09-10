// ============================================================================
// Shadow Voice Agent — the tool layer's entity scope
// ============================================================================
//
// P-34. THE ONE SEAM. Every database read and write a Shadow tool performs goes
// through this file, and nothing in this file can address a row without the
// active entity, because `entityId` is a private field of the object that owns
// the query and is merged into the `where` (or the `data`) by the method, not
// by the caller.
//
// ----------------------------------------------------------------------------
// WHY THIS EXISTS
// ----------------------------------------------------------------------------
//
// `tool-router.ts` registers 31 tools that Claude may call. Eighteen of them
// mentioned `activeEntity`; eleven took an id STRAIGHT OUT OF `input` and
// queried on it with no entity filter at all:
//
//     input.taskId (x2)   input.messageId (x2)  input.eventId
//     input.contactId     input.invoiceId       input.workflowId (x2)
//     input.entityId      input.projectId
//
// `input` is the tool_use block of an LLM response. It is not a request body a
// person typed; it is whatever the model emitted after reading an inbox, a
// knowledge entry, a call transcript or a web page. A prompt injection that
// names another tenant's cuid therefore reached Postgres unfiltered, and two of
// the eleven were WRITES -- `update_task` and `classify_email` both mutated any
// row in the database by id.
//
// The spec forbids exactly this, in the same words, and names this layer as the
// place it is enforced:
//
//   docs/specs/PAF-Shadow-Voice-Agent-v3-Final-Claude-Code-Prompt.md,
//   Addition 5.2 -- "CROSS-ENTITY SAFEGUARD: Shadow NEVER leaks data between
//   entities ... Enforced at the tool router level: tools only return data for
//   the active entity unless explicitly queried cross-entity."
//
// ----------------------------------------------------------------------------
// IT IS THE SAME RULE AS THE ROUTES, REACHED THE SAME WAY
// ----------------------------------------------------------------------------
//
// `docs/parallel-build/decision-01-entity-isolation.md`: `record.entityId` must
// equal the scoped entity id. Ownership is necessary and NOT sufficient -- the
// rule holds between two entities of the SAME user, because MedLink carries a
// HIPAA compliance profile and CRE Forge does not.
//
// P-30 put that rule inside `withEntityScope`, where 49 route helpers inherited
// it without one route file being edited. This file is the agent layer's half of
// the same rule. It does not invent a second notion of scope: the entity id it
// holds is a `VerifiedEntityId`, the brand minted in
// `src/shared/middleware/auth.ts` (frozen), and the only way to obtain one here
// is `verifyEntityForUser`, the coordinator's P-00b amendment for exactly this
// case -- "trusted server-side code that already knows whose work it is doing".
// There is no cast anywhere in this file and no other mint.
//
// ----------------------------------------------------------------------------
// WHY THE VERIFICATION HAPPENS HERE AND NOT ONLY IN `buildContext`
// ----------------------------------------------------------------------------
//
// `buildContext` also verifies now (see `context-engine.ts`), and it must,
// because the system prompt prints the entity's name, type and compliance
// profile. But the tool layer verifies AGAIN, on every tool call, and does not
// trust `context.activeEntity.id` to have been checked by whoever built the
// context.
//
// That is not belt-and-braces for its own sake. `AgentContext` is a plain
// object constructed in more than one place over time -- the chat route, the
// proactive engine, the phone pipeline, a test -- and the defect this package
// exists to close was precisely "an id was resolved and then trusted". A second
// gate that costs one indexed primary-key lookup per tool call is the cheapest
// possible insurance against the next caller who builds a context by hand.
//
// ----------------------------------------------------------------------------
// WHAT A TOOL RETURNS WHEN THE ID IS NOT IN SCOPE
// ----------------------------------------------------------------------------
//
// One string, `NOT_IN_SCOPE`, for all three cases: the row does not exist, the
// row belongs to another of this user's entities, or the row belongs to a
// stranger. They are deliberately indistinguishable.
//
// P-30 chose a DISTINCT code for routes (403 `ENTITY_SCOPE_MISMATCH`) and gave
// a good reason: that branch is reachable only after ownership passed, so the
// caller already knows the entity exists and nothing is disclosed. That
// argument does not transfer to a tool, for one reason: THE CALLER IS NOT THE
// ACCOUNT HOLDER. A tool's return value is fed straight back into the model's
// context window, and the text that put the id there may have been written by
// somebody else -- an email body, a scraped page, a caller on the phone. A
// distinct "that exists, but it is in another entity" answer is a
// confirmed-existence oracle addressable in natural language, with no rate
// limit and no HTTP status for a WAF to count.
//
// So the refusal carries no signal, and -- this is the part that matters more
// than the wording -- there is NO BRANCH that could accidentally carry one. The
// scoping and the refusal are the same act: `findFirst({ id, entityId })`
// returns null, and null is the only failure the caller can observe. A future
// edit cannot make the two cases diverge without deleting the query.
//
// ----------------------------------------------------------------------------
// HOW A NEW TOOL IS CORRECT BY DEFAULT
// ----------------------------------------------------------------------------
//
//   1. `tool-router.ts` no longer imports `@/lib/db`. It cannot: `eslint.config.mjs`
//      forbids that import in that file by path, and `npx eslint src` gates CI.
//      A new tool that wants a database has to come here.
//   2. The scoped path is the SHORT one. `registerScoped` hands the execute
//      function a ready `ShadowEntityScope` and has already refused the
//      no-entity case; writing the unscoped version would mean adding a method
//      to this file, next to thirty that all merge `entityId`.
//   3. Every method here closes over `this.#entityId`. There is no method that
//      takes an entity id as an argument, so there is nothing to pass wrong.
// ============================================================================

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  verifyEntityForUser,
  type VerifiedEntityId,
} from '@/shared/middleware/auth';
import type { AgentContext } from '../types';

// ---------------------------------------------------------------------------
// The two refusals a tool can return
// ---------------------------------------------------------------------------

/**
 * The tool was called with no entity in scope.
 *
 * The wording is unchanged from the eighteen tools that already returned it, so
 * the model's behaviour on this branch does not change and the existing
 * assertions on `'No active entity'` keep meaning what they meant.
 */
export const NO_ACTIVE_ENTITY = {
  error: 'No active entity. Switch to an entity first.',
} as const;

/**
 * The id the model supplied is not addressable from the entity in scope.
 *
 * Identical for "no such row", "another of your entities" and "someone else's".
 * See the header: the caller may be an injected instruction, so the refusal
 * must not confirm that the id names anything.
 */
export function notInScope(noun: string): { error: string } {
  return { error: `${noun} not found in the active entity.` };
}

/**
 * Read an id off an LLM-generated tool input.
 *
 * `input` is `Record<string, unknown>`; a model can emit a number, an array or
 * an object where the schema said string. Prisma would throw on those, and a
 * thrown Prisma error becomes `ToolResult.error` -- a raw driver message handed
 * to the model. This returns null instead, and the caller returns `notInScope`.
 */
export function readId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

// ---------------------------------------------------------------------------
// The scope object
// ---------------------------------------------------------------------------

/**
 * Every database operation the Shadow tools are allowed to perform, bound to
 * one verified entity.
 *
 * `#entityId` is a true private field: it is not readable from outside the
 * class even with a cast, so no caller can extract it and query around the
 * methods. `entityId` is exposed read-only for the two call sites that must
 * hand a plain entity id to code outside this module (the workflow executor,
 * which takes one, and the consent-receipt write).
 */
export class ShadowEntityScope {
  readonly #entityId: VerifiedEntityId;

  constructor(entityId: VerifiedEntityId) {
    this.#entityId = entityId;
  }

  /** The verified entity, for the two APIs outside this module that need it. */
  get entityId(): VerifiedEntityId {
    return this.#entityId;
  }

  // --- Dashboard -----------------------------------------------------------

  async dashboardStats() {
    const entityId = this.#entityId;
    const [taskCounts, unreadCount, upcomingEvents, financeSummary] =
      await Promise.all([
        prisma.task.groupBy({
          by: ['status'],
          where: { entityId, deletedAt: null },
          _count: { id: true },
        }),
        prisma.message.count({
          where: { entityId, read: false, deletedAt: null },
        }),
        prisma.calendarEvent.findMany({
          where: { entityId, startTime: { gte: new Date() } },
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

    return { taskCounts, unreadCount, upcomingEvents, financeSummary };
  }

  // --- Tasks ---------------------------------------------------------------

  async listTasks(filters: {
    status?: string;
    priority?: string;
    projectId?: string;
    limit: number;
  }) {
    const where: Prisma.TaskWhereInput = {
      entityId: this.#entityId,
      deletedAt: null,
    };
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    // A projectId off `input` narrows within the entity; it cannot widen past
    // it, because `entityId` is already on the same `where`.
    if (filters.projectId) where.projectId = filters.projectId;

    return prisma.task.findMany({
      where,
      orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
      take: filters.limit,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        projectId: true,
        tags: true,
      },
    });
  }

  /**
   * Create a task in this entity.
   *
   * `projectId` is checked rather than merely stored: `Task.projectId` is a
   * foreign key with no entity constraint of its own, so an injected id would
   * otherwise file this entity's task under ANOTHER entity's project -- and
   * `get_project_status` counts tasks by `projectId`, so the row would then be
   * readable from the other side. Returns null when the project is out of
   * scope, which the tool reports as `notInScope('Project')`.
   */
  async createTask(data: {
    title: string;
    description: string | null;
    priority: string;
    dueDate: Date | null;
    projectId: string | null;
    tags: string[];
    assigneeId: string;
  }) {
    if (data.projectId) {
      const project = await this.findProjectId(data.projectId);
      if (!project) return null;
    }

    return prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        entityId: this.#entityId,
        priority: data.priority,
        status: 'TODO',
        dueDate: data.dueDate,
        projectId: data.projectId,
        tags: data.tags,
        assigneeId: data.assigneeId,
      },
    });
  }

  /**
   * Update a task by id, refusing any id outside this entity.
   *
   * `findFirst` then `update` rather than `update({ where: { id, entityId } })`:
   * Prisma's extended-unique `where` would do the filtering correctly, but a
   * miss throws `P2025` and that Prisma error text becomes the tool's `error`
   * string in `executeTool`'s catch. The two-step keeps the refusal ours, and
   * keeps it identical to the "no such row" refusal.
   */
  async updateTask(id: string, data: Prisma.TaskUpdateInput) {
    const found = await prisma.task.findFirst({
      where: { id, entityId: this.#entityId },
      select: { id: true },
    });
    if (!found) return null;

    return prisma.task.update({ where: { id: found.id }, data });
  }

  async projectTaskCounts(projectId: string) {
    return prisma.task.groupBy({
      by: ['status'],
      where: { projectId, entityId: this.#entityId, deletedAt: null },
      _count: { id: true },
    });
  }

  // --- Inbox / messages ----------------------------------------------------

  async listMessages(filters: {
    unreadOnly?: boolean;
    starred?: boolean;
    channel?: string;
    limit: number;
  }) {
    const where: Prisma.MessageWhereInput = {
      entityId: this.#entityId,
      deletedAt: null,
    };
    if (filters.unreadOnly) where.read = false;
    if (filters.starred) where.starred = true;
    if (filters.channel) where.channel = filters.channel;

    return prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit,
      select: {
        id: true,
        channel: true,
        subject: true,
        body: true,
        triageScore: true,
        read: true,
        starred: true,
        createdAt: true,
      },
    });
  }

  /** Update a message by id, refusing any id outside this entity. */
  async updateMessage(id: string, data: Prisma.MessageUpdateInput) {
    const found = await prisma.message.findFirst({
      where: { id, entityId: this.#entityId },
      select: { id: true },
    });
    if (!found) return null;

    return prisma.message.update({ where: { id: found.id }, data });
  }

  async createMessage(data: {
    senderId: string;
    recipientId: string;
    subject: string;
    body: string;
    threadId: string | null;
    draftStatus: string;
  }) {
    return prisma.message.create({
      data: {
        channel: 'email',
        senderId: data.senderId,
        recipientId: data.recipientId,
        entityId: this.#entityId,
        subject: data.subject,
        body: data.body,
        threadId: data.threadId,
        draftStatus: data.draftStatus,
        sensitivity: 'INTERNAL',
      },
    });
  }

  // --- Calendar ------------------------------------------------------------

  async listCalendarEvents(filters: {
    startDate?: string;
    endDate?: string;
    limit: number;
  }) {
    const where: Prisma.CalendarEventWhereInput = { entityId: this.#entityId };
    if (filters.startDate || filters.endDate) {
      const startFilter: Prisma.DateTimeFilter = {};
      if (filters.startDate) startFilter.gte = new Date(filters.startDate);
      if (filters.endDate) startFilter.lte = new Date(filters.endDate);
      where.startTime = startFilter;
    } else {
      where.startTime = { gte: new Date() };
    }

    return prisma.calendarEvent.findMany({
      where,
      orderBy: { startTime: 'asc' },
      take: filters.limit,
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        participantIds: true,
        recurrence: true,
      },
    });
  }

  async createCalendarEvent(data: {
    title: string;
    startTime: Date;
    endTime: Date;
    participantIds: string[];
  }) {
    return prisma.calendarEvent.create({
      data: {
        title: data.title,
        entityId: this.#entityId,
        startTime: data.startTime,
        endTime: data.endTime,
        participantIds: data.participantIds,
      },
    });
  }

  /** Update an event by id, refusing any id outside this entity. */
  async updateCalendarEvent(id: string, data: Prisma.CalendarEventUpdateInput) {
    const found = await prisma.calendarEvent.findFirst({
      where: { id, entityId: this.#entityId },
      select: { id: true },
    });
    if (!found) return null;

    return prisma.calendarEvent.update({ where: { id: found.id }, data });
  }

  // --- Contacts ------------------------------------------------------------

  async listContacts(filters: { search?: string; tags?: string[]; limit: number }) {
    const where: Prisma.ContactWhereInput = {
      entityId: this.#entityId,
      deletedAt: null,
    };
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.tags && filters.tags.length > 0) {
      where.tags = { hasSome: filters.tags };
    }

    return prisma.contact.findMany({
      where,
      orderBy: { name: 'asc' },
      take: filters.limit,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        relationshipScore: true,
        tags: true,
        lastTouch: true,
      },
    });
  }

  /** Read one contact by id, refusing any id outside this entity. */
  async getContact(id: string) {
    return prisma.contact.findFirst({
      where: { id, entityId: this.#entityId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        channels: true,
        relationshipScore: true,
        lastTouch: true,
        commitments: true,
        preferences: true,
        tags: true,
      },
    });
  }

  /** Confirm a contact id is in this entity, without returning the record. */
  async findContactId(id: string): Promise<string | null> {
    const contact = await prisma.contact.findFirst({
      where: { id, entityId: this.#entityId },
      select: { id: true },
    });
    return contact?.id ?? null;
  }

  async createContact(data: {
    name: string;
    email: string | null;
    phone: string | null;
    tags: string[];
  }) {
    return prisma.contact.create({
      data: {
        entityId: this.#entityId,
        name: data.name,
        email: data.email,
        phone: data.phone,
        tags: data.tags,
      },
    });
  }

  // --- Finance -------------------------------------------------------------

  async listFinancialRecords(filters: {
    status?: string;
    type?: string;
    limit: number;
  }) {
    const where: Prisma.FinancialRecordWhereInput = { entityId: this.#entityId };
    if (filters.status) where.status = filters.status;
    if (filters.type) where.type = filters.type;

    return prisma.financialRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit,
      select: {
        id: true,
        type: true,
        amount: true,
        currency: true,
        status: true,
        dueDate: true,
        category: true,
        vendor: true,
        description: true,
      },
    });
  }

  async listExpenses(filters: { category?: string; limit: number }) {
    const where: Prisma.FinancialRecordWhereInput = {
      entityId: this.#entityId,
      type: 'expense',
    };
    if (filters.category) where.category = filters.category;

    return prisma.financialRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit,
      select: {
        id: true,
        amount: true,
        currency: true,
        category: true,
        vendor: true,
        description: true,
        createdAt: true,
      },
    });
  }

  async createFinancialRecord(data: {
    type: string;
    amount: number;
    currency: string;
    category: string;
    vendor: string | null;
    description: string | null;
    dueDate: Date | null;
  }) {
    return prisma.financialRecord.create({
      data: { entityId: this.#entityId, ...data, status: 'PENDING' },
    });
  }

  /** Read one financial record by id, refusing any id outside this entity. */
  async getFinancialRecord(id: string) {
    return prisma.financialRecord.findFirst({
      where: { id, entityId: this.#entityId },
    });
  }

  async financeSummary() {
    const entityId = this.#entityId;
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

    return { income, expenses, pending };
  }

  // --- Knowledge base ------------------------------------------------------

  async searchKnowledge(filters: { query: string; tags?: string[]; limit: number }) {
    const where: Prisma.KnowledgeEntryWhereInput = {
      entityId: this.#entityId,
      content: { contains: filters.query, mode: 'insensitive' },
    };
    if (filters.tags && filters.tags.length > 0) {
      where.tags = { hasSome: filters.tags };
    }

    return prisma.knowledgeEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit,
      select: {
        id: true,
        content: true,
        tags: true,
        source: true,
        createdAt: true,
      },
    });
  }

  async createKnowledgeEntry(data: {
    content: string;
    tags: string[];
    source: string;
  }) {
    return prisma.knowledgeEntry.create({
      data: { entityId: this.#entityId, ...data },
    });
  }

  // --- Workflows -----------------------------------------------------------

  /**
   * Find a workflow by id, refusing any id outside this entity.
   *
   * This is the site the package is named for. `trigger_workflow` resolved the
   * active entity, ignored it on the id branch, and scoped it correctly three
   * lines below on the name branch -- so the two halves of one tool disagreed
   * about tenancy and the correct pattern was already in the file.
   */
  async findWorkflowById(id: string) {
    return prisma.workflow.findFirst({
      where: { id, entityId: this.#entityId },
    });
  }

  async findActiveWorkflowByName(name: string) {
    return prisma.workflow.findFirst({
      where: {
        entityId: this.#entityId,
        name: { contains: name, mode: 'insensitive' },
        status: 'ACTIVE',
      },
    });
  }

  // --- Projects ------------------------------------------------------------

  async listProjects(filters: { status?: string; limit: number }) {
    const where: Prisma.ProjectWhereInput = { entityId: this.#entityId };
    if (filters.status) where.status = filters.status;

    return prisma.project.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit,
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        health: true,
        createdAt: true,
      },
    });
  }

  /** Read one project by id, refusing any id outside this entity. */
  async getProject(id: string) {
    return prisma.project.findFirst({
      where: { id, entityId: this.#entityId },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        health: true,
        milestones: true,
      },
    });
  }

  /** Confirm a project id is in this entity, without returning the record. */
  async findProjectId(id: string): Promise<string | null> {
    const project = await prisma.project.findFirst({
      where: { id, entityId: this.#entityId },
      select: { id: true },
    });
    return project?.id ?? null;
  }

  // --- Audit ---------------------------------------------------------------

  /**
   * Write an ActionLog row.
   *
   * `ActionLog` carries no `entityId` column, so there is nothing for this
   * scope to filter -- it is on this class anyway so that the tool router has
   * no reason to reach for `prisma` directly, which is the property the eslint
   * rule protects. `target` is always a row this scope already resolved.
   */
  async logAction(data: {
    actorId?: string;
    actionType: string;
    target: string;
    reason: string;
    blastRadius: string;
    reversible: boolean;
  }) {
    return prisma.actionLog.create({
      data: {
        actor: 'SHADOW',
        actorId: data.actorId ?? null,
        actionType: data.actionType,
        target: data.target,
        reason: data.reason,
        blastRadius: data.blastRadius,
        reversible: data.reversible,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Minting a scope
// ---------------------------------------------------------------------------

/**
 * The only way a tool gets a `ShadowEntityScope`.
 *
 * Returns null when there is no entity in scope OR when the entity in the
 * context does not belong to the user in the context. The second case is the
 * one that matters: it means a hand-built `AgentContext` naming somebody else's
 * entity buys nothing, because the entity is re-proved here against the
 * database on every tool call.
 */
export async function resolveToolScope(
  context: AgentContext
): Promise<ShadowEntityScope | null> {
  const candidate = context.activeEntity?.id;
  if (!candidate) return null;

  const verified = await verifyEntityForUser(candidate, context.user.id);
  if (!verified) return null;

  return new ShadowEntityScope(verified);
}

// ---------------------------------------------------------------------------
// User-scoped access, for the two tools that are about entities themselves
// ---------------------------------------------------------------------------
//
// `switch_entity` and `get_entity_list` are not scoped to ONE entity -- their
// subject is the set of entities the user owns -- so they cannot take a
// `ShadowEntityScope`. They are scoped to the USER instead, and these are the
// only two functions in the module that are.
//
// `switch_entity` was the eleventh unscoped site and the worst-shaped one:
// `prisma.entity.findUnique({ where: { id: input.entityId } })` with no filter
// of any kind, returning the row's `name` and `type`. That is a cross-USER
// disclosure, not merely cross-entity -- one injected cuid and the model reads
// out a stranger's company name. `findOwnedEntity` closes it by construction:
// there is no lookup here that is not filtered by `userId`.

/** Every entity the user owns. */
export async function listEntitiesForUser(userId: string) {
  return prisma.entity.findMany({
    where: { userId },
    select: { id: true, name: true, type: true, createdAt: true },
    orderBy: { name: 'asc' },
  });
}

/** One entity the user owns, by id. Null for anyone else's, and for missing. */
export async function findOwnedEntityById(userId: string, id: string) {
  return prisma.entity.findFirst({
    where: { id, userId },
    select: { id: true, name: true, type: true },
  });
}

/** One entity the user owns, by name fragment. */
export async function findOwnedEntityByName(userId: string, name: string) {
  return prisma.entity.findFirst({
    where: { userId, name: { contains: name, mode: 'insensitive' } },
    select: { id: true, name: true, type: true },
  });
}
