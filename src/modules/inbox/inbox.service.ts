import { prisma } from '@/lib/db';
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
// Extracts userId from the x-user-id header, falling back to 'default-user'
export function getCurrentUserId(headers?: Record<string, string | string[] | undefined>): string {
  if (!headers) return 'default-user';
  const userId = headers['x-user-id'];
  if (typeof userId === 'string' && userId.length > 0) return userId;
  return 'default-user';
}

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
  async listInbox(
    userId: string,
    params: InboxListParams
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

    if (params.entityId) where.entityId = params.entityId;
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

    const stats = await this.getInboxStats(userId, params.entityId);

    return { items, total, page, pageSize, stats };
  }

  async getMessageDetail(
    messageId: string,
    _userId: string
  ): Promise<InboxItem | null> {
    const msg = await prisma.message.findUnique({
      where: { id: messageId },
      include: { entity: true, contact: true },
    });

    if (!msg) return null;

    // Load thread messages
    let threadMessages: Message[] | undefined;
    if (msg.threadId) {
      const thread = await this.getThread(msg.threadId, msg.entityId);
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

  async getThread(threadId: string, entityId: string): Promise<Message[]> {
    const messages = await prisma.message.findMany({
      where: { threadId, entityId },
      orderBy: { createdAt: 'asc' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return messages.map((msg: any) => mapMessageRow(msg));
  }

  async markAsRead(messageId: string, isRead: boolean): Promise<void> {
    const msg = await prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new Error(`Message not found: ${messageId}`);
    await prisma.message.update({
      where: { id: messageId },
      data: { read: isRead },
    });
  }

  async toggleStar(messageId: string): Promise<void> {
    const msg = await prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new Error(`Message not found: ${messageId}`);
    const current = msg.starred ?? false;
    await prisma.message.update({
      where: { id: messageId },
      data: { starred: !current },
    });
  }

  async sendDraft(messageId: string, _userId: string): Promise<Message> {
    const msg = await prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new Error(`Message not found: ${messageId}`);
    if (msg.draftStatus !== 'DRAFT' && msg.draftStatus !== 'APPROVED') {
      throw new Error(`Message is not a draft: ${messageId}`);
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { draftStatus: 'SENT' },
    });

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

  async archiveMessage(messageId: string): Promise<void> {
    const msg = await prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new Error(`Message not found: ${messageId}`);
    // Mark as read and un-star when archived
    await prisma.message.update({
      where: { id: messageId },
      data: { read: true, starred: false },
    });
  }

  async getInboxStats(userId: string, entityId?: string): Promise<InboxStats> {
    const where: Record<string, unknown> = {};
    if (entityId) where.entityId = entityId;

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

  async createFollowUp(input: CreateFollowUpInput): Promise<FollowUpReminder> {
    const msg = await prisma.message.findUnique({
      where: { id: input.messageId },
    });
    if (!msg) throw new Error(`Message not found: ${input.messageId}`);

    const status = 'PENDING';
    const reason = input.reason ?? 'Follow up required';

    const row = await prisma.followUpReminder.create({
      data: {
        userId: getCurrentUserId(),
        messageId: input.messageId,
        description: reason,
        dueDate: input.reminderAt,
        priority: encodeFollowUpPriority(status, input.entityId),
        completed: false,
      },
    });

    return mapFollowUpRow(row);
  }

  async listFollowUps(
    userId: string,
    entityId?: string
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

  async completeFollowUp(followUpId: string): Promise<void> {
    const row = await prisma.followUpReminder.findUnique({ where: { id: followUpId } });
    if (!row) throw new Error(`Follow-up not found: ${followUpId}`);

    const { entityId } = decodeFollowUpPriority(row.priority);

    await prisma.followUpReminder.update({
      where: { id: followUpId },
      data: {
        completed: true,
        completedAt: new Date(),
        priority: encodeFollowUpPriority('COMPLETED', entityId),
      },
    });
  }

  async snoozeFollowUp(followUpId: string, newDate: Date): Promise<void> {
    const row = await prisma.followUpReminder.findUnique({ where: { id: followUpId } });
    if (!row) throw new Error(`Follow-up not found: ${followUpId}`);

    const { entityId } = decodeFollowUpPriority(row.priority);

    // Reset to pending with new date (matching original behavior)
    await prisma.followUpReminder.update({
      where: { id: followUpId },
      data: {
        dueDate: newDate,
        priority: encodeFollowUpPriority('PENDING', entityId),
        completed: false,
        completedAt: null,
      },
    });
  }

  async cancelFollowUp(followUpId: string): Promise<void> {
    const row = await prisma.followUpReminder.findUnique({ where: { id: followUpId } });
    if (!row) throw new Error(`Follow-up not found: ${followUpId}`);

    const { entityId } = decodeFollowUpPriority(row.priority);

    await prisma.followUpReminder.update({
      where: { id: followUpId },
      data: {
        priority: encodeFollowUpPriority('CANCELLED', entityId),
      },
    });
  }

  // --- Canned Response CRUD ---

  async createCannedResponse(
    input: CreateCannedResponseInput
  ): Promise<CannedResponse> {
    const meta: CannedResponseMeta = {
      entityId: input.entityId,
      channel: input.channel,
      category: input.category,
      subject: input.subject,
      tone: input.tone,
      usageCount: 0,
    };

    const row = await prisma.cannedResponse.create({
      data: {
        userId: getCurrentUserId(),
        title: input.name,
        content: input.body,
        tags: input.variables ?? [],
        shortcut: encodeCannedResponseMeta(meta),
      },
    });

    return mapCannedResponseRow(row);
  }

  async listCannedResponses(
    entityId: string,
    channel?: MessageChannel
  ): Promise<CannedResponse[]> {
    const rows = await prisma.cannedResponse.findMany({
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

  async getCannedResponse(responseId: string): Promise<CannedResponse | null> {
    const row = await prisma.cannedResponse.findUnique({ where: { id: responseId } });
    if (!row) return null;
    return mapCannedResponseRow(row);
  }

  async updateCannedResponse(
    responseId: string,
    updates: Partial<CreateCannedResponseInput>
  ): Promise<CannedResponse> {
    const existing = await prisma.cannedResponse.findUnique({ where: { id: responseId } });
    if (!existing) throw new Error(`Canned response not found: ${responseId}`);

    const currentMeta = decodeCannedResponseMeta(existing.shortcut);

    const newMeta: CannedResponseMeta = {
      entityId: updates.entityId ?? currentMeta.entityId,
      channel: updates.channel ?? currentMeta.channel,
      category: updates.category ?? currentMeta.category,
      subject: updates.subject !== undefined ? updates.subject : currentMeta.subject,
      tone: updates.tone ?? currentMeta.tone,
      usageCount: currentMeta.usageCount,
      lastUsed: currentMeta.lastUsed,
    };

    const row = await prisma.cannedResponse.update({
      where: { id: responseId },
      data: {
        title: updates.name ?? existing.title,
        content: updates.body ?? existing.content,
        tags: updates.variables ?? existing.tags,
        shortcut: encodeCannedResponseMeta(newMeta),
      },
    });

    return mapCannedResponseRow(row);
  }

  async deleteCannedResponse(responseId: string): Promise<void> {
    const existing = await prisma.cannedResponse.findUnique({ where: { id: responseId } });
    if (!existing) {
      throw new Error(`Canned response not found: ${responseId}`);
    }
    await prisma.cannedResponse.delete({ where: { id: responseId } });
  }

  async incrementCannedResponseUsage(responseId: string): Promise<void> {
    const existing = await prisma.cannedResponse.findUnique({ where: { id: responseId } });
    if (existing) {
      const meta = decodeCannedResponseMeta(existing.shortcut);
      meta.usageCount += 1;
      meta.lastUsed = new Date().toISOString();

      await prisma.cannedResponse.update({
        where: { id: responseId },
        data: {
          shortcut: encodeCannedResponseMeta(meta),
        },
      });
    }
  }
}
