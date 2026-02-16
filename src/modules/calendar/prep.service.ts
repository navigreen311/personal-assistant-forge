import { prisma } from '@/lib/db';
import type { CalendarEvent, PrepPacket } from '@/shared/types';
import type { PrepPacketRequest, GeneratedPrepPacket } from './calendar.types';

export class PrepPacketService {
  async generatePrepPacket(request: PrepPacketRequest): Promise<GeneratedPrepPacket> {
    const event = await prisma.calendarEvent.findUniqueOrThrow({
      where: { id: request.eventId },
    });

    const participantIds = event.participantIds;
    const entityId = request.entityId;

    const [attendeeProfiles, lastInteractions, openItems] = await Promise.all([
      this.getAttendeeProfiles(participantIds, entityId),
      this.getLastInteractions(participantIds, entityId),
      this.getOpenItems(participantIds, entityId),
    ]);

    const calEvent: CalendarEvent = {
      id: event.id,
      title: event.title,
      entityId: event.entityId,
      participantIds: event.participantIds,
      startTime: event.startTime,
      endTime: event.endTime,
      bufferBefore: event.bufferBefore ?? undefined,
      bufferAfter: event.bufferAfter ?? undefined,
      prepPacket: event.prepPacket as PrepPacket | undefined,
      meetingNotes: event.meetingNotes ?? undefined,
      recurrence: event.recurrence ?? undefined,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };

    const agenda = this.generateAgendaItems(calEvent, openItems, lastInteractions);
    const talkingPoints = this.generateTalkingPoints(calEvent, attendeeProfiles, openItems);
    const suggestions = this.generateSuggestions(request.depth, openItems, attendeeProfiles);
    const riskFlags = this.identifyRisks(openItems, lastInteractions);

    const prepPacket: GeneratedPrepPacket = {
      eventId: request.eventId,
      generatedAt: new Date(),
      attendeeProfiles,
      lastInteractions,
      openItems,
      agenda,
      talkingPoints,
      documents: [],
      suggestions,
      riskFlags,
    };

    // Save to event
    await prisma.calendarEvent.update({
      where: { id: request.eventId },
      data: { prepPacket: prepPacket as unknown as Record<string, unknown> },
    });

    return prepPacket;
  }

  private async getAttendeeProfiles(
    participantIds: string[],
    entityId: string
  ): Promise<string[]> {
    if (participantIds.length === 0) return [];

    const contacts = await prisma.contact.findMany({
      where: {
        id: { in: participantIds },
        entityId,
      },
      select: { name: true, email: true, tags: true, relationshipScore: true },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return contacts.map((c: any) => {
      const tags = c.tags.length > 0 ? ` [${c.tags.join(', ')}]` : '';
      return `${c.name} (${c.email ?? 'no email'}) - Relationship: ${c.relationshipScore}/100${tags}`;
    });
  }

  private async getLastInteractions(
    participantIds: string[],
    entityId: string
  ): Promise<string[]> {
    if (participantIds.length === 0) return [];

    // Get recent messages involving these contacts
    const messages = await prisma.message.findMany({
      where: {
        entityId,
        OR: [
          { senderId: { in: participantIds } },
          { recipientId: { in: participantIds } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { subject: true, body: true, createdAt: true, channel: true },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return messages.map((m: any) => {
      const subject = m.subject ? `"${m.subject}"` : 'No subject';
      const date = m.createdAt.toLocaleDateString();
      return `${date} via ${m.channel}: ${subject} - ${m.body.substring(0, 100)}`;
    });
  }

  private async getOpenItems(
    participantIds: string[],
    entityId: string
  ): Promise<string[]> {
    if (participantIds.length === 0) return [];

    const tasks = await prisma.task.findMany({
      where: {
        entityId,
        status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED'] },
        assigneeId: { in: participantIds },
      },
      orderBy: { priority: 'asc' },
      take: 10,
      select: { title: true, priority: true, status: true, dueDate: true },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return tasks.map((t: any) => {
      const due = t.dueDate ? ` (due: ${t.dueDate.toLocaleDateString()})` : '';
      return `[${t.priority}] ${t.title} - ${t.status}${due}`;
    });
  }

  private generateAgendaItems(
    event: CalendarEvent,
    openItems: string[],
    lastInteractions: string[]
  ): string[] {
    const agenda: string[] = [];

    agenda.push(`Review: ${event.title}`);

    if (openItems.length > 0) {
      agenda.push('Review open action items');
    }

    if (lastInteractions.length > 0) {
      agenda.push('Follow up on recent communications');
    }

    agenda.push('Discuss next steps');
    agenda.push('Assign action items');

    return agenda;
  }

  private generateTalkingPoints(
    event: CalendarEvent,
    attendeeProfiles: string[],
    openItems: string[]
  ): string[] {
    const points: string[] = [];

    if (attendeeProfiles.length > 0) {
      points.push(`Meeting with ${attendeeProfiles.length} participant(s)`);
    }

    if (openItems.length > 0) {
      points.push(`${openItems.length} open item(s) to address`);
      // Add top priority items as talking points
      const highPriority = openItems.filter((item) => item.startsWith('[P0]'));
      for (const item of highPriority.slice(0, 3)) {
        points.push(`Priority: ${item}`);
      }
    }

    points.push(`Topic: ${event.title}`);

    return points;
  }

  private generateSuggestions(
    depth: string,
    openItems: string[],
    attendeeProfiles: string[]
  ): string[] {
    const suggestions: string[] = [];

    if (openItems.length > 0) {
      suggestions.push('Start with reviewing overdue items');
    }

    if (attendeeProfiles.length > 3) {
      suggestions.push('Consider a structured round-table format');
    }

    if (depth === 'DETAILED') {
      suggestions.push('Prepare visual aids or documents');
      suggestions.push('Send agenda to attendees before the meeting');
    }

    return suggestions;
  }

  private identifyRisks(
    openItems: string[],
    lastInteractions: string[]
  ): string[] {
    const risks: string[] = [];

    const blockedItems = openItems.filter((item) => item.includes('BLOCKED'));
    if (blockedItems.length > 0) {
      risks.push(`${blockedItems.length} blocked item(s) may need escalation`);
    }

    if (lastInteractions.length === 0) {
      risks.push('No recent interactions with attendees — may need rapport building');
    }

    const overdueItems = openItems.filter((item) => {
      const dueMatch = item.match(/due:\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
      if (dueMatch) {
        return new Date(dueMatch[1]) < new Date();
      }
      return false;
    });

    if (overdueItems.length > 0) {
      risks.push(`${overdueItems.length} overdue item(s) to address`);
    }

    return risks;
  }
}
