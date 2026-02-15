import { prisma } from '@/lib/db';
import type { TimeAuditReport, TimeAuditEntry, DriftAlert } from '../types';

const DEFAULT_ALLOCATION: Record<string, number> = {
  deep_work: 240,
  meetings: 120,
  email: 60,
  admin: 60,
  personal: 0,
};

export async function getIntendedAllocation(
  userId: string
): Promise<Record<string, number>> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ...DEFAULT_ALLOCATION };

  const prefs = user.preferences as Record<string, unknown> | null;
  if (!prefs || !prefs.timeAllocation) return { ...DEFAULT_ALLOCATION };

  return prefs.timeAllocation as Record<string, number>;
}

export async function generateTimeAudit(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<TimeAuditReport> {
  const intended = await getIntendedAllocation(userId);

  // Get user's entities to query events
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { entities: { select: { id: true } } },
  });
  const entityIds = user?.entities.map((e) => e.id) ?? [];

  // Fetch calendar events in range
  const events = await prisma.calendarEvent.findMany({
    where: {
      entityId: { in: entityIds },
      startTime: { gte: startDate },
      endTime: { lte: endDate },
    },
  });

  // Fetch completed tasks in range
  const tasks = await prisma.task.findMany({
    where: {
      entityId: { in: entityIds },
      status: 'DONE',
      updatedAt: { gte: startDate, lte: endDate },
    },
  });

  // Calculate actual time per category
  const actual: Record<string, number> = {};

  // Meetings: sum event durations
  let meetingMinutes = 0;
  for (const event of events) {
    const duration =
      (event.endTime.getTime() - event.startTime.getTime()) / 60000;
    meetingMinutes += duration;
  }
  actual.meetings = meetingMinutes;

  // Deep work: estimate from completed high-priority tasks
  const deepWorkTasks = tasks.filter(
    (t) => t.priority === 'P0' || t.priority === 'P1'
  );
  actual.deep_work = deepWorkTasks.length * 45; // estimate 45 min per high-pri task

  // Admin: estimate from low-priority tasks
  const adminTasks = tasks.filter((t) => t.priority === 'P2');
  actual.admin = adminTasks.length * 20; // estimate 20 min per admin task

  // Email/communication: fetch messages count
  const messageCount = await prisma.message.count({
    where: {
      entityId: { in: entityIds },
      createdAt: { gte: startDate, lte: endDate },
    },
  });
  actual.email = messageCount * 3; // estimate 3 min per message handled

  // Personal: remainder or 0
  actual.personal = 0;

  // Build entries for each category
  const dateStr = startDate.toISOString().split('T')[0];
  const entries: TimeAuditEntry[] = Object.keys(intended).map((category) => {
    const intendedMinutes = intended[category] ?? 0;
    const actualMinutes = actual[category] ?? 0;
    const driftMinutes = actualMinutes - intendedMinutes;
    const driftPercent =
      intendedMinutes === 0
        ? actualMinutes > 0
          ? 100
          : 0
        : Math.round((Math.abs(driftMinutes) / intendedMinutes) * 100);

    return {
      date: dateStr,
      category,
      intendedMinutes,
      actualMinutes,
      driftMinutes,
      driftPercent,
    };
  });

  const alerts = detectDriftAlerts(entries);
  const totalDriftMinutes = entries.reduce(
    (sum, e) => sum + Math.abs(e.driftMinutes),
    0
  );
  const worstEntry = entries.reduce(
    (worst, e) => (e.driftPercent > worst.driftPercent ? e : worst),
    entries[0]
  );

  return {
    userId,
    periodStart: startDate,
    periodEnd: endDate,
    entries,
    totalDriftMinutes,
    worstDriftCategory: worstEntry?.category ?? 'unknown',
    alerts,
  };
}

export function detectDriftAlerts(
  entries: TimeAuditEntry[],
  threshold = 20
): DriftAlert[] {
  const alerts: DriftAlert[] = [];

  for (const entry of entries) {
    if (entry.driftPercent > 50) {
      alerts.push({
        category: entry.category,
        message: `Critical drift in ${entry.category}: ${entry.driftPercent}% deviation from plan`,
        severity: 'CRITICAL',
        suggestedAction: `Review and restructure ${entry.category} time allocation. Consider blocking calendar or delegating.`,
      });
    } else if (entry.driftPercent > threshold) {
      alerts.push({
        category: entry.category,
        message: `Warning: ${entry.category} drifted ${entry.driftPercent}% from intended allocation`,
        severity: 'WARNING',
        suggestedAction: `Monitor ${entry.category} time more closely and set reminders for time boundaries.`,
      });
    }
  }

  return alerts;
}
