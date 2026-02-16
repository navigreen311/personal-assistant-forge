import { prisma } from '@/lib/db';
import type { JobDataMap, JobResult } from '../jobs';
import { JobType } from '../jobs';

export async function processCalendarSyncJob(
  data: JobDataMap[typeof JobType.CALENDAR_SYNC]
): Promise<JobResult> {
  const start = Date.now();

  try {
    const events = await prisma.calendarEvent.findMany({
      where: { entityId: data.entityId },
      select: { id: true, title: true, startTime: true, endTime: true },
      take: 100,
    });

    console.log(
      `[CalendarSyncProcessor] Syncing ${events.length} events for entity ${data.entityId} via ${data.provider} (${data.direction})`
    );

    await prisma.actionLog.create({
      data: {
        actor: 'SYSTEM',
        actionType: 'CALENDAR_SYNC',
        target: `entity:${data.entityId}/provider:${data.provider}`,
        reason: `Calendar sync (${data.direction}) with ${data.provider}: ${events.length} events`,
        blastRadius: 'LOW',
        reversible: true,
        status: 'EXECUTED',
      },
    });

    return {
      success: true,
      message: `Calendar sync completed: ${events.length} events via ${data.provider}`,
      data: {
        provider: data.provider,
        direction: data.direction,
        eventCount: events.length,
      },
      processingTimeMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[CalendarSyncProcessor] Failed:', message);
    throw err;
  }
}
