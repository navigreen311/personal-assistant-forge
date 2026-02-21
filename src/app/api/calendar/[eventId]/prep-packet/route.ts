import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';
import { PrepPacketService } from '@/modules/calendar/prep.service';
import { prepPacketSchema } from '@/modules/calendar/calendar.validation';
import type { GeneratedPrepPacket } from '@/modules/calendar/calendar.types';

const prepService = new PrepPacketService();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  return withAuth(request, async (_req, _session) => {
    try {
      const { eventId } = await params;
      const event = await prisma.calendarEvent.findUnique({
        where: { id: eventId },
      });

      if (!event) {
        return error('NOT_FOUND', 'Event not found', 404);
      }

      if (!event.prepPacket) {
        return error('NOT_FOUND', 'No prep packet generated yet', 404);
      }

      return success(event.prepPacket as unknown as GeneratedPrepPacket);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to fetch prep packet', 500);
    }
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  return withAuth(request, async (req, _session) => {
    try {
      const { eventId } = await params;
      const body = await req.json();

      const parsed = prepPacketSchema.safeParse({ ...body, eventId });
      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid prep packet request', 400, {
          issues: parsed.error.issues,
        });
      }

      const packet = await prepService.generatePrepPacket(parsed.data);
      return success(packet, 201);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to generate prep packet', 500);
    }
  });
}
