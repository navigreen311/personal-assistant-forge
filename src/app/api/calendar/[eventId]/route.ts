import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import { SchedulingService } from '@/modules/calendar/scheduling.service';
import type { CalendarEvent } from '@/shared/types';

const schedulingService = new SchedulingService();

function getCurrentUserId(): string {
  return 'stub-user-id';
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const event = await prisma.calendarEvent.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return error('NOT_FOUND', 'Event not found', 404);
    }

    const result: CalendarEvent = {
      id: event.id,
      title: event.title,
      entityId: event.entityId,
      participantIds: event.participantIds,
      startTime: event.startTime,
      endTime: event.endTime,
      bufferBefore: event.bufferBefore ?? undefined,
      bufferAfter: event.bufferAfter ?? undefined,
      prepPacket: event.prepPacket as unknown as CalendarEvent['prepPacket'],
      meetingNotes: event.meetingNotes ?? undefined,
      recurrence: event.recurrence ?? undefined,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };

    return success(result);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to fetch event', 500);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const body = await req.json();
    const userId = getCurrentUserId();

    const event = await schedulingService.updateEvent(eventId, body, userId);
    return success(event);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to update event', 500);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const userId = getCurrentUserId();

    await schedulingService.deleteEvent(eventId, userId);
    return success({ deleted: true });
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to delete event', 500);
  }
}
