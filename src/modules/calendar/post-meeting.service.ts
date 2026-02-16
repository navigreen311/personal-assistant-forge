import { v4 as uuid } from 'uuid';
import { prisma } from '@/lib/db';
import type { CalendarEvent } from '@/shared/types';
import type { PostMeetingCapture, ActionItemFromMeeting } from './calendar.types';

export class PostMeetingService {
  async capturePostMeeting(capture: PostMeetingCapture): Promise<{
    event: CalendarEvent;
    tasksCreated: string[];
    followUpScheduled?: string;
  }> {
    // Update event with meeting notes
    const notesContent = this.buildNotesContent(capture);

    const event = await prisma.calendarEvent.update({
      where: { id: capture.eventId },
      data: {
        meetingNotes: notesContent,
      },
    });

    // Create tasks from action items
    const tasksCreated = await this.createTasksFromActionItems(
      capture.actionItems,
      capture.entityId,
      capture.eventId
    );

    // Schedule follow-up if needed
    let followUpScheduled: string | undefined;
    if (capture.followUpDate) {
      followUpScheduled = await this.scheduleFollowUp(
        capture.eventId,
        capture.followUpDate,
        capture.entityId,
        event.participantIds
      );
    }

    return {
      event: {
        id: event.id,
        title: event.title,
        entityId: event.entityId,
        participantIds: event.participantIds,
        startTime: event.startTime,
        endTime: event.endTime,
        bufferBefore: event.bufferBefore ?? undefined,
        bufferAfter: event.bufferAfter ?? undefined,
        prepPacket: event.prepPacket as CalendarEvent['prepPacket'],
        meetingNotes: event.meetingNotes ?? undefined,
        recurrence: event.recurrence ?? undefined,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      },
      tasksCreated,
      followUpScheduled,
    };
  }

  private async createTasksFromActionItems(
    actionItems: ActionItemFromMeeting[],
    entityId: string,
    eventId: string
  ): Promise<string[]> {
    const taskIds: string[] = [];

    for (const item of actionItems) {
      const task = await prisma.task.create({
        data: {
          id: uuid(),
          title: item.title,
          description: item.description,
          entityId,
          priority: item.priority,
          status: 'TODO',
          dueDate: item.dueDate,
          assigneeId: item.assigneeId,
          createdFrom: { type: 'MANUAL', sourceId: eventId },
        },
      });
      taskIds.push(task.id);
    }

    return taskIds;
  }

  private async scheduleFollowUp(
    eventId: string,
    followUpDate: Date,
    entityId: string,
    participantIds: string[]
  ): Promise<string> {
    const originalEvent = await prisma.calendarEvent.findUniqueOrThrow({
      where: { id: eventId },
    });

    const followUpEvent = await prisma.calendarEvent.create({
      data: {
        id: uuid(),
        title: `Follow-up: ${originalEvent.title}`,
        entityId,
        participantIds,
        startTime: followUpDate,
        endTime: new Date(followUpDate.getTime() + 30 * 60 * 1000), // 30 min
        bufferBefore: 5,
        bufferAfter: 5,
      },
    });

    return followUpEvent.id;
  }

  private buildNotesContent(capture: PostMeetingCapture): string {
    const parts: string[] = [];

    parts.push(`## Meeting Notes\n${capture.notes}`);

    if (capture.decisions.length > 0) {
      parts.push(`\n## Decisions\n${capture.decisions.map((d) => `- ${d}`).join('\n')}`);
    }

    if (capture.keyTakeaways.length > 0) {
      parts.push(`\n## Key Takeaways\n${capture.keyTakeaways.map((t) => `- ${t}`).join('\n')}`);
    }

    parts.push(`\n## Sentiment: ${capture.sentiment}`);

    if (capture.actionItems.length > 0) {
      parts.push(
        `\n## Action Items\n${capture.actionItems
          .map((a) => `- [${a.priority}] ${a.title}${a.assigneeId ? ` (assigned: ${a.assigneeId})` : ''}`)
          .join('\n')}`
      );
    }

    return parts.join('\n');
  }
}
