import { prisma } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
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

// --- Auth Stub ---
// Will be replaced when Worker 02 (Auth) integrates
export function getCurrentUserId(): string {
  return 'stub-user-id';
}

// --- In-memory stores for entities not in Prisma schema ---

// Follow-ups store (no Prisma model)
const followUpsStore: Map<string, FollowUpReminder> = new Map();

// Canned responses store (no Prisma model)
const cannedResponsesStore: Map<string, CannedResponse> = new Map();

// Read/starred state (no Prisma fields for these)
const readState: Map<string, boolean> = new Map();
const starredState: Map<string, boolean> = new Map();

const triageService = new TriageService();

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

    // Filter by read/starred state (in-memory)
    // These filters are applied post-query since they're in-memory

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let items: InboxItem[] = messages.map((msg: any) => {
      const isRead = readState.get(msg.id) ?? false;
      const isStarred = starredState.get(msg.id) ?? false;
      const followUp = Array.from(followUpsStore.values()).find(
        (f) => f.messageId === msg.id && f.status === 'PENDING'
      );

      return {
        message: mapMessageRow(msg),
        senderName: msg.contact?.name ?? msg.senderId,
        senderContact: msg.contact ? mapContactRow(msg.contact) : undefined,
        entityName: msg.entity?.name ?? msg.entityId,
        isRead,
        isStarred,
        followUp,
      };
    });

    // Post-filter for read/starred
    if (params.isRead !== undefined) {
      items = items.filter((item) => item.isRead === params.isRead);
    }
    if (params.isStarred !== undefined) {
      items = items.filter((item) => item.isStarred === params.isStarred);
    }

    const stats = await this.getInboxStats(userId, params.entityId);

    return { items, total, page, pageSize, stats };
  }

  async getMessageDetail(
    messageId: string,
    userId: string
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

    const isRead = readState.get(msg.id) ?? false;
    const isStarred = starredState.get(msg.id) ?? false;
    const followUp = Array.from(followUpsStore.values()).find(
      (f) => f.messageId === msg.id && f.status === 'PENDING'
    );

    return {
      message: mapMessageRow(msg),
      senderName: (msg as any).contact?.name ?? msg.senderId,
      senderContact: (msg as any).contact ? mapContactRow((msg as any).contact) : undefined,
      entityName: (msg as any).entity?.name ?? msg.entityId,
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
    // Verify message exists
    const msg = await prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new Error(`Message not found: ${messageId}`);
    readState.set(messageId, isRead);
  }

  async toggleStar(messageId: string): Promise<void> {
    const msg = await prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new Error(`Message not found: ${messageId}`);
    const current = starredState.get(messageId) ?? false;
    starredState.set(messageId, !current);
  }

  async sendDraft(messageId: string, userId: string): Promise<Message> {
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
      attachments: updated.attachments as Message['attachments'],
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async archiveMessage(messageId: string): Promise<void> {
    const msg = await prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new Error(`Message not found: ${messageId}`);
    // Mark as read and un-star when archived
    readState.set(messageId, true);
    starredState.set(messageId, false);
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
      },
    });

    const total = messages.length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unread = messages.filter((m: any) => !(readState.get(m.id) ?? false)).length;
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

    const followUp: FollowUpReminder = {
      id: uuidv4(),
      messageId: input.messageId,
      entityId: input.entityId,
      reminderAt: input.reminderAt,
      reason: input.reason ?? 'Follow up required',
      status: 'PENDING',
      createdAt: new Date(),
    };

    followUpsStore.set(followUp.id, followUp);
    return followUp;
  }

  async listFollowUps(
    userId: string,
    entityId?: string
  ): Promise<FollowUpReminder[]> {
    let followUps = Array.from(followUpsStore.values());
    if (entityId) {
      followUps = followUps.filter((f) => f.entityId === entityId);
    }
    return followUps.sort(
      (a, b) => a.reminderAt.getTime() - b.reminderAt.getTime()
    );
  }

  async completeFollowUp(followUpId: string): Promise<void> {
    const followUp = followUpsStore.get(followUpId);
    if (!followUp) throw new Error(`Follow-up not found: ${followUpId}`);
    followUp.status = 'COMPLETED';
    followUpsStore.set(followUpId, followUp);
  }

  async snoozeFollowUp(followUpId: string, newDate: Date): Promise<void> {
    const followUp = followUpsStore.get(followUpId);
    if (!followUp) throw new Error(`Follow-up not found: ${followUpId}`);
    followUp.status = 'SNOOZED';
    followUp.reminderAt = newDate;
    followUp.status = 'PENDING'; // Reset to pending with new date
    followUpsStore.set(followUpId, followUp);
  }

  async cancelFollowUp(followUpId: string): Promise<void> {
    const followUp = followUpsStore.get(followUpId);
    if (!followUp) throw new Error(`Follow-up not found: ${followUpId}`);
    followUp.status = 'CANCELLED';
    followUpsStore.set(followUpId, followUp);
  }

  // --- Canned Response CRUD ---

  async createCannedResponse(
    input: CreateCannedResponseInput
  ): Promise<CannedResponse> {
    const response: CannedResponse = {
      id: uuidv4(),
      name: input.name,
      entityId: input.entityId,
      channel: input.channel,
      category: input.category,
      subject: input.subject,
      body: input.body,
      variables: input.variables ?? [],
      tone: input.tone,
      usageCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    cannedResponsesStore.set(response.id, response);
    return response;
  }

  async listCannedResponses(
    entityId: string,
    channel?: MessageChannel
  ): Promise<CannedResponse[]> {
    let responses = Array.from(cannedResponsesStore.values()).filter(
      (r) => r.entityId === entityId
    );
    if (channel) {
      responses = responses.filter((r) => r.channel === channel);
    }
    return responses.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getCannedResponse(responseId: string): Promise<CannedResponse | null> {
    return cannedResponsesStore.get(responseId) ?? null;
  }

  async updateCannedResponse(
    responseId: string,
    updates: Partial<CreateCannedResponseInput>
  ): Promise<CannedResponse> {
    const existing = cannedResponsesStore.get(responseId);
    if (!existing) throw new Error(`Canned response not found: ${responseId}`);

    const updated: CannedResponse = {
      ...existing,
      ...updates,
      variables: updates.variables ?? existing.variables,
      updatedAt: new Date(),
    };

    cannedResponsesStore.set(responseId, updated);
    return updated;
  }

  async deleteCannedResponse(responseId: string): Promise<void> {
    if (!cannedResponsesStore.has(responseId)) {
      throw new Error(`Canned response not found: ${responseId}`);
    }
    cannedResponsesStore.delete(responseId);
  }

  async incrementCannedResponseUsage(responseId: string): Promise<void> {
    const existing = cannedResponsesStore.get(responseId);
    if (existing) {
      existing.usageCount += 1;
      existing.lastUsed = new Date();
      cannedResponsesStore.set(responseId, existing);
    }
  }
}
