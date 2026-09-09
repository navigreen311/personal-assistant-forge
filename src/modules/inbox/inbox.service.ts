import { prisma } from '@/lib/db';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { Message, MessageChannel, Contact, Commitment, ContactPreferences } from '@/shared/types';
import type {
  InboxItem,
  InboxListParams,
  InboxStats,
  FollowUpReminder,
  CreateFollowUpInput,
  CannedResponse,
  CreateCannedResponseInput,
  MessageCategory,
  MessageIntent,
} from './inbox.types';
import { TriageService } from './triage.service';

// --- Auth ---
//
// T-005. `getCurrentUserId(headers?)` stood here. It read the `x-user-id`
// REQUEST HEADER and, failing that, returned the literal string
// 'default-user'. Two call sites below (createFollowUp, createCannedResponse)
// invoked it with NO ARGUMENT AT ALL, so every follow-up reminder and every
// canned response in the system was stamped with the same hardcoded identity
// -- not a trusted header, an invented user. `FollowUpReminder.userId` and
// `CannedResponse.userId` are foreign keys to `User`, so those writes could
// only ever succeed against a database that happened to contain a user with
// that id; everywhere else they failed at the constraint.
//
// The authenticated caller now arrives as an explicit `userId` argument from
// the route, and the entity in scope as a `VerifiedEntityId` that only
// withEntityScope can mint. See docs/parallel-build/tenancy-pattern.md.

// --- Compatibility shims for tests ---
// These objects maintain backward-compatible interfaces with a clear() method,
// but all actual data flows through Prisma.

export const followUpsStore = {
  clear: async () => {
    await prisma.followUpReminder.deleteMany({});
  },
};

export const cannedResponsesStore = {
  clear: async () => {
    await prisma.cannedResponse.deleteMany({});
  },
};

export const readState = {
  clear: async () => {
    await prisma.message.updateMany({ data: { read: false } });
  },
};

export const starredState = {
  clear: async () => {
    await prisma.message.updateMany({ data: { starred: false } });
  },
};

const triageService = new TriageService();

// --- Prisma row -> FollowUpReminder mapping ---
// Prisma model fields: id, userId, messageId?, description, dueDate, priority, completed, completedAt, createdAt, updatedAt
// TS interface fields: id, messageId, entityId, reminderAt, reason, status, createdAt

// We encode entityId and status in the `priority` field as "STATUS:entityId" since
// the Prisma model lacks dedicated entityId and status-string columns.
function encodeFollowUpPriority(status: string, entityId: string): string {
  return `${status}:${entityId}`;
}

function decodeFollowUpPriority(priority: string): { status: FollowUpReminder['status']; entityId: string } {
  const colonIndex = priority.indexOf(':');
  if (colonIndex === -1) {
    return { status: 'PENDING', entityId: '' };
  }
  const status = priority.substring(0, colonIndex) as FollowUpReminder['status'];
  const entityId = priority.substring(colonIndex + 1);
  return { status, entityId };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFollowUpRow(row: any): FollowUpReminder {
  const { status, entityId } = decodeFollowUpPriority(row.priority);
  return {
    id: row.id,
    messageId: row.messageId ?? '',
    entityId,
    reminderAt: row.dueDate,
    reason: row.description,
    status,
    createdAt: row.createdAt,
  };
}

// --- Prisma row -> CannedResponse mapping ---
// Prisma model fields: id, userId, title, content, tags, shortcut, createdAt, updatedAt
// TS interface fields: id, name, entityId, channel, category, subject, body, variables, tone, usageCount, lastUsed, createdAt, updatedAt
//
// We store extended metadata as a JSON string in the `shortcut` field:
// { entityId, channel, category, subject, tone, usageCount, lastUsed }
// `title` -> `name`, `content` -> `body`, `tags` -> `variables`

interface CannedResponseMeta {
  entityId: string;
  channel: MessageChannel;
  category: string;
  subject?: string;
  tone: string;
  usageCount: number;
  lastUsed?: string; // ISO date string
}

function encodeCannedResponseMeta(meta: CannedResponseMeta): string {
  return JSON.stringify(meta);
}

function decodeCannedResponseMeta(shortcut: string | null): CannedResponseMeta {
  if (!shortcut) {
    return { entityId: '', channel: 'EMAIL', category: '', tone: 'PROFESSIONAL', usageCount: 0 };
  }
  try {
    return JSON.parse(shortcut) as CannedResponseMeta;
  } catch {
    return { entityId: '', channel: 'EMAIL', category: '', tone: 'PROFESSIONAL', usageCount: 0 };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCannedResponseRow(row: any): CannedResponse {
  const meta = decodeCannedResponseMeta(row.shortcut);
  return {
    id: row.id,
    name: row.title,
    entityId: meta.entityId,
    channel: meta.channel,
    category: meta.category,
    subject: meta.subject,
    body: row.content,
    variables: row.tags ?? [],
    tone: meta.tone as CannedResponse['tone'],
    usageCount: meta.usageCount,
    lastUsed: meta.lastUsed ? new Date(meta.lastUsed) : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMessageRow(row: any): Message {
  return {
    id: row.id,
    channel: row.channel as MessageChannel,
    senderId: row.senderId,
    recipientId: row.recipientId,
    entityId: row.entityId,
    threadId: row.threadId ?? undefined,
    subject: row.subject ?? undefined,
    body: row.body,
    triageScore: row.triageScore,
    intent: row.intent ?? undefined,
    sensitivity: row.sensitivity as Message['sensitivity'],
    draftStatus: row.draftStatus as Message['draftStatus'],
    attachments: (row.attachments ?? []) as Message['attachments'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapContactRow(row: any): Contact {
  return {
    id: row.id,
    entityId: row.entityId,
    name: row.name,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    channels: (row.channels ?? []) as Contact['channels'],
    relationshipScore: row.relationshipScore,
    lastTouch: row.lastTouch,
    commitments: (row.commitments ?? []) as Commitment[],
    preferences: (row.preferences ?? {}) as ContactPreferences,
    tags: row.tags ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class InboxService {
  /**
   * The inbox for ONE verified entity.
   *
   * `entityId` is the leading, required argument and is NOT a field on the
   * filter bag: the bag is parsed wholesale off the query string, so a scope
   * living inside it would be the caller's own value again. See
   * docs/parallel-build/tenancy-pattern.md sec.2.
   */
  async listInbox(
    entityId: VerifiedEntityId,
    params: Omit<InboxListParams, 'entityId'> = {}
  ): Promise<{
    items: InboxItem[];
    total: number;
    page: number;
    pageSize: number;
    stats: InboxStats;
  }> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const sortBy = params.sortBy ?? 'triageScore';
    const sortOrder = params.sortOrder ?? 'desc';

    // Build Prisma where clause
    const where: Record<string, unknown> = {};

    if (params.channel) where.channel = params.channel;
    if (params.sensitivity) where.sensitivity = params.sensitivity;
    if (params.intent) where.intent = params.intent;
    if (params.threadId) where.threadId = params.threadId;

    if (params.minTriageScore || params.maxTriageScore) {
      where.triageScore = {
        ...(params.minTriageScore ? { gte: params.minTriageScore } : {}),
        ...(params.maxTriageScore ? { lte: params.maxTriageScore } : {}),
      };
    }

    if (params.dateFrom || params.dateTo) {
      where.createdAt = {
        ...(params.dateFrom ? { gte: params.dateFrom } : {}),
        ...(params.dateTo ? { lte: params.dateTo } : {}),
      };
    }

    if (params.search) {
      where.OR = [
        { body: { contains: params.search, mode: 'insensitive' } },
        { subject: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    // Filter by read/starred state using Prisma fields
    if (params.isRead !== undefined) {
      where.read = params.isRead;
    }
    if (params.isStarred !== undefined) {
      where.starred = params.isStarred;
    }

    // The scope, applied LAST and unconditionally, so no combination of
    // filters above can widen it.
    where.entityId = entityId;

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          entity: true,
          contact: true,
        },
      }),
      prisma.message.count({ where }),
    ]);

    // Fetch pending follow-ups for returned message IDs
    const messageIds = messages.map((m: { id: string }) => m.id);
    const pendingFollowUps = messageIds.length > 0
      ? await prisma.followUpReminder.findMany({
          where: {
            messageId: { in: messageIds },
            completed: false,
          },
        })
      : [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: InboxItem[] = messages.map((msg: any) => {
      const followUpRow = pendingFollowUps.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (f: any) => f.messageId === msg.id && decodeFollowUpPriority(f.priority).status === 'PENDING'
      );
      const followUp = followUpRow ? mapFollowUpRow(followUpRow) : undefined;

      return {
        message: mapMessageRow(msg),
        senderName: msg.contact?.name ?? msg.senderId,
        senderContact: msg.contact ? mapContactRow(msg.contact) : undefined,
        entityName: msg.entity?.name ?? msg.entityId,
        isRead: msg.read ?? false,
        isStarred: msg.starred ?? false,
        followUp,
      };
    });

    const stats = await this.getInboxStats(entityId);

    return { items, total, page, pageSize, stats };
  }

  async getMessageDetail(
    messageId: string,
    entityId: VerifiedEntityId
  ): Promise<InboxItem | null> {
    // findFirst, not findUnique: the scope is in the WHERE clause, so another
    // tenant's message is simply not found and there is no check to forget.
    const msg = await prisma.message.findFirst({
      where: { id: messageId, entityId },
      include: { entity: true, contact: true },
    });

    if (!msg) return null;

    // Load thread messages -- every hop is scoped.
    let threadMessages: Message[] | undefined;
    if (msg.threadId) {
      const thread = await this.getThread(msg.threadId, entityId);
      threadMessages = thread;
    }

    // Get triage result if available
    let triageResult;
    if (msg.intent) {
      const intent = msg.intent as MessageIntent;
      triageResult = {
        messageId: msg.id,
        urgencyScore: msg.triageScore,
        intent,
        sensitivity: msg.sensitivity as Message['sensitivity'],
        category: 'OPERATIONS' as MessageCategory,
        suggestedPriority: (msg.triageScore >= 8 ? 'P0' : msg.triageScore >= 5 ? 'P1' : 'P2') as 'P0' | 'P1' | 'P2',
        suggestedAction: triageService.suggestAction(msg.triageScore, intent),
        reasoning: `Score ${msg.triageScore}/10. Intent: ${msg.intent}.`,
        confidence: 0.7,
        flags: triageService.detectFlags(`${msg.subject ?? ''} ${msg.body}`),
      };
    }

    // Read/starred from Prisma Message fields
    const isRead = msg.read ?? false;
    const isStarred = msg.starred ?? false;

    // Find pending follow-up from Prisma
    const followUpRow = await prisma.followUpReminder.findFirst({
      where: {
        messageId: msg.id,
        completed: false,
      },
    });
    const followUp = followUpRow && decodeFollowUpPriority(followUpRow.priority).status === 'PENDING'
      ? mapFollowUpRow(followUpRow)
      : undefined;

    return {
      message: mapMessageRow(msg),
      senderName: (msg as unknown as Record<string, Record<string, unknown>>).contact?.name as string ?? msg.senderId,
      senderContact: (msg as unknown as Record<string, unknown>).contact
        ? mapContactRow((msg as unknown as Record<string, unknown>).contact)
        : undefined,
      entityName: (msg as unknown as Record<string, Record<string, unknown>>).entity?.name as string ?? msg.entityId,
      threadMessages,
      triageResult,
      isRead,
      isStarred,
      followUp,
    };
  }

  async getThread(threadId: string, entityId: VerifiedEntityId): Promise<Message[]> {
    const messages = await prisma.message.findMany({
      where: { threadId, entityId },
      orderBy: { createdAt: 'asc' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return messages.map((msg: any) => mapMessageRow(msg));
  }

  async markAsRead(
    messageId: string,
    isRead: boolean,
    entityId: VerifiedEntityId
  ): Promise<void> {
    // updateMany, because a unique WHERE cannot also carry the entity.
    // count === 0 is "not yours or not there" -- indistinguishable on purpose.
    const result = await prisma.message.updateMany({
      where: { id: messageId, entityId },
      data: { read: isRead },
    });
    if (result.count === 0) throw new Error(`Message not found: ${messageId}`);
  }

  async toggleStar(messageId: string, entityId: VerifiedEntityId): Promise<void> {
    const msg = await prisma.message.findFirst({ where: { id: messageId, entityId } });
    if (!msg) throw new Error(`Message not found: ${messageId}`);
    const current = msg.starred ?? false;
    const result = await prisma.message.updateMany({
      where: { id: messageId, entityId },
      data: { starred: !current },
    });
    if (result.count === 0) throw new Error(`Message not found: ${messageId}`);
  }

  async sendDraft(messageId: string, entityId: VerifiedEntityId): Promise<Message> {
    const msg = await prisma.message.findFirst({ where: { id: messageId, entityId } });
    if (!msg) throw new Error(`Message not found: ${messageId}`);
    if (msg.draftStatus !== 'DRAFT' && msg.draftStatus !== 'APPROVED') {
      throw new Error(`Message is not a draft: ${messageId}`);
    }

    const sent = await prisma.message.updateMany({
      where: { id: messageId, entityId },
      data: { draftStatus: 'SENT' },
    });
    if (sent.count === 0) throw new Error(`Message not found: ${messageId}`);

    const updated = { ...msg, draftStatus: 'SENT' };

    return {
      id: updated.id,
      channel: updated.channel as MessageChannel,
      senderId: updated.senderId,
      recipientId: updated.recipientId,
      entityId: updated.entityId,
      threadId: updated.threadId ?? undefined,
      subject: updated.subject ?? undefined,
      body: updated.body,
      triageScore: updated.triageScore,
      intent: updated.intent ?? undefined,
      sensitivity: updated.sensitivity as Message['sensitivity'],
      draftStatus: updated.draftStatus as Message['draftStatus'],
      attachments: updated.attachments as unknown as Message['attachments'],
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async archiveMessage(messageId: string, entityId: VerifiedEntityId): Promise<void> {
    // Mark as read and un-star when archived
    const result = await prisma.message.updateMany({
      where: { id: messageId, entityId },
      data: { read: true, starred: false },
    });
    if (result.count === 0) throw new Error(`Message not found: ${messageId}`);
  }

  async getInboxStats(entityId: VerifiedEntityId): Promise<InboxStats> {
    // entityId is required, not optional. It used to be optional, and an
    // omitted value counted every message in the database.
    const where: Record<string, unknown> = { entityId };

    const messages = await prisma.message.findMany({
      where,
      select: {
        id: true,
        channel: true,
        triageScore: true,
        intent: true,
        draftStatus: true,
        read: true,
      },
    });

    const total = messages.length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unread = messages.filter((m: any) => !(m.read ?? false)).length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const urgent = messages.filter((m: any) => m.triageScore >= 8).length;
    const needsResponse = messages.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (m: any) =>
        (m.intent === 'REQUEST' || m.intent === 'INQUIRY') &&
        m.draftStatus !== 'SENT'
    ).length;

    const byChannel = {} as Record<MessageChannel, number>;
    const channels: MessageChannel[] = [
      'EMAIL', 'SMS', 'SLACK', 'TEAMS', 'DISCORD', 'WHATSAPP', 'TELEGRAM', 'VOICE', 'MANUAL',
    ];
    for (const ch of channels) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      byChannel[ch] = messages.filter((m: any) => m.channel === ch).length;
    }

    const byCategory = {} as Record<MessageCategory, number>;
    const categories: MessageCategory[] = [
      'OPERATIONS', 'SALES', 'FINANCE', 'LEGAL', 'HR', 'MARKETING', 'SUPPORT', 'PERSONAL', 'COMPLIANCE', 'EXECUTIVE',
    ];
    for (const cat of categories) {
      byCategory[cat] = 0;
    }

    const avgTriageScore =
      total > 0
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? messages.reduce((sum: number, m: any) => sum + m.triageScore, 0) / total
        : 0;

    return {
      total,
      unread,
      urgent,
      needsResponse,
      byChannel,
      byCategory,
      avgTriageScore: Math.round(avgTriageScore * 10) / 10,
    };
  }

  // --- Follow-Up Management ---

  /**
   * T-005 call site 1 of 2. This wrote `userId: getCurrentUserId()` -- with no
   * argument, so always the literal 'default-user'. It now takes the
   * authenticated caller, and the message must be inside the verified entity.
   */
  async createFollowUp(
    input: Omit<CreateFollowUpInput, 'entityId'>,
    entityId: VerifiedEntityId,
    userId: string
  ): Promise<FollowUpReminder> {
    const msg = await prisma.message.findFirst({
      where: { id: input.messageId, entityId },
    });
    if (!msg) throw new Error(`Message not found: ${input.messageId}`);

    const status = 'PENDING';
    const reason = input.reason ?? 'Follow up required';

    const row = await prisma.followUpReminder.create({
      data: {
        userId,
        messageId: input.messageId,
        description: reason,
        dueDate: input.reminderAt,
        priority: encodeFollowUpPriority(status, entityId),
        completed: false,
      },
    });

    return mapFollowUpRow(row);
  }

  async listFollowUps(
    userId: string,
    entityId?: VerifiedEntityId
  ): Promise<FollowUpReminder[]> {
    const rows = await prisma.followUpReminder.findMany({
      where: {
        userId,
      },
      orderBy: { dueDate: 'asc' },
    });

    let followUps = rows.map(mapFollowUpRow);

    if (entityId) {
      followUps = followUps.filter((f) => f.entityId === entityId);
    }

    return followUps.sort(
      (a, b) => a.reminderAt.getTime() - b.reminderAt.getTime()
    );
  }

  // FollowUpReminder has no entityId column -- the schema is frozen and the
  // entity is encoded into `priority`. Its real scope column is `userId`, a
  // foreign key to User, so that is what goes in the WHERE clause. `update`
  // takes a unique WHERE and cannot carry it, so these use findFirst +
  // updateMany and treat count === 0 as not-found.

  async completeFollowUp(followUpId: string, userId: string): Promise<void> {
    const row = await prisma.followUpReminder.findFirst({
      where: { id: followUpId, userId },
    });
    if (!row) throw new Error(`Follow-up not found: ${followUpId}`);

    const { entityId } = decodeFollowUpPriority(row.priority);

    await prisma.followUpReminder.updateMany({
      where: { id: followUpId, userId },
      data: {
        completed: true,
        completedAt: new Date(),
        priority: encodeFollowUpPriority('COMPLETED', entityId),
      },
    });
  }

  async snoozeFollowUp(followUpId: string, newDate: Date, userId: string): Promise<void> {
    const row = await prisma.followUpReminder.findFirst({
      where: { id: followUpId, userId },
    });
    if (!row) throw new Error(`Follow-up not found: ${followUpId}`);

    const { entityId } = decodeFollowUpPriority(row.priority);

    // Reset to pending with new date (matching original behavior)
    await prisma.followUpReminder.updateMany({
      where: { id: followUpId, userId },
      data: {
        dueDate: newDate,
        priority: encodeFollowUpPriority('PENDING', entityId),
        completed: false,
        completedAt: null,
      },
    });
  }

  async cancelFollowUp(followUpId: string, userId: string): Promise<void> {
    const row = await prisma.followUpReminder.findFirst({
      where: { id: followUpId, userId },
    });
    if (!row) throw new Error(`Follow-up not found: ${followUpId}`);

    const { entityId } = decodeFollowUpPriority(row.priority);

    await prisma.followUpReminder.updateMany({
      where: { id: followUpId, userId },
      data: {
        priority: encodeFollowUpPriority('CANCELLED', entityId),
      },
    });
  }

  // --- Canned Response CRUD ---

  /**
   * T-005 call site 2 of 2. Same defect, same fix: the row is owned by the
   * authenticated caller, and it names a verified entity.
   */
  async createCannedResponse(
    input: Omit<CreateCannedResponseInput, 'entityId'>,
    entityId: VerifiedEntityId,
    userId: string
  ): Promise<CannedResponse> {
    const meta: CannedResponseMeta = {
      entityId,
      channel: input.channel,
      category: input.category,
      subject: input.subject,
      tone: input.tone,
      usageCount: 0,
    };

    const row = await prisma.cannedResponse.create({
      data: {
        userId,
        title: input.name,
        content: input.body,
        tags: input.variables ?? [],
        shortcut: encodeCannedResponseMeta(meta),
      },
    });

    return mapCannedResponseRow(row);
  }

  // CannedResponse likewise has no entityId column; `userId` is the scope in
  // the database and the entity is metadata inside `shortcut`. Both are
  // applied: the WHERE clause narrows to the caller's own rows, and the
  // decoded entity narrows further to the verified entity.

  async listCannedResponses(
    entityId: VerifiedEntityId,
    userId: string,
    channel?: MessageChannel
  ): Promise<CannedResponse[]> {
    const rows = await prisma.cannedResponse.findMany({
      where: { userId },
      orderBy: { title: 'asc' },
    });

    let responses = rows
      .map(mapCannedResponseRow)
      .filter((r) => r.entityId === entityId);

    if (channel) {
      responses = responses.filter((r) => r.channel === channel);
    }

    return responses.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getCannedResponse(
    responseId: string,
    userId: string
  ): Promise<CannedResponse | null> {
    const row = await prisma.cannedResponse.findFirst({
      where: { id: responseId, userId },
    });
    if (!row) return null;
    return mapCannedResponseRow(row);
  }

  async updateCannedResponse(
    responseId: string,
    updates: Omit<Partial<CreateCannedResponseInput>, 'entityId'>,
    userId: string
  ): Promise<CannedResponse> {
    const existing = await prisma.cannedResponse.findFirst({
      where: { id: responseId, userId },
    });
    if (!existing) throw new Error(`Canned response not found: ${responseId}`);

    const currentMeta = decodeCannedResponseMeta(existing.shortcut);

    const newMeta: CannedResponseMeta = {
      // The entity is NOT re-assignable through an update body. It used to be
      // `updates.entityId ?? currentMeta.entityId`, which moved a canned
      // response into any entity the caller cared to name, verified by nobody.
      entityId: currentMeta.entityId,
      channel: updates.channel ?? currentMeta.channel,
      category: updates.category ?? currentMeta.category,
      subject: updates.subject !== undefined ? updates.subject : currentMeta.subject,
      tone: updates.tone ?? currentMeta.tone,
      usageCount: currentMeta.usageCount,
      lastUsed: currentMeta.lastUsed,
    };

    const nextRow = {
      ...existing,
      title: updates.name ?? existing.title,
      content: updates.body ?? existing.content,
      tags: updates.variables ?? existing.tags,
      shortcut: encodeCannedResponseMeta(newMeta),
    };

    const updated = await prisma.cannedResponse.updateMany({
      where: { id: responseId, userId },
      data: {
        title: nextRow.title,
        content: nextRow.content,
        tags: nextRow.tags,
        shortcut: nextRow.shortcut,
      },
    });
    if (updated.count === 0) {
      throw new Error(`Canned response not found: ${responseId}`);
    }

    return mapCannedResponseRow(nextRow);
  }

  async deleteCannedResponse(responseId: string, userId: string): Promise<void> {
    const removed = await prisma.cannedResponse.deleteMany({
      where: { id: responseId, userId },
    });
    if (removed.count === 0) {
      throw new Error(`Canned response not found: ${responseId}`);
    }
  }

  async incrementCannedResponseUsage(responseId: string, userId: string): Promise<void> {
    const existing = await prisma.cannedResponse.findFirst({
      where: { id: responseId, userId },
    });
    if (existing) {
      const meta = decodeCannedResponseMeta(existing.shortcut);
      meta.usageCount += 1;
      meta.lastUsed = new Date().toISOString();

      await prisma.cannedResponse.updateMany({
        where: { id: responseId, userId },
        data: {
          shortcut: encodeCannedResponseMeta(meta),
        },
      });
    }
  }
}
