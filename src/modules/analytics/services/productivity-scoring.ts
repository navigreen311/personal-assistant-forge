import { prisma } from '@/lib/db';
import type { ProductivityScore } from '../types';

const WEIGHTS = {
  highPriorityCompletion: 0.3,
  focusTimeAchieved: 0.25,
  goalProgress: 0.2,
  meetingEfficiency: 0.15,
  communicationSpeed: 0.1,
};

export async function calculateProductivityScore(
  userId: string,
  date: string
): Promise<ProductivityScore> {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { entities: { select: { id: true } } },
  });
  const entityIds = user?.entities.map((e: any) => e.id) ?? [];

  // Dimension 1: High Priority Completion (P0/P1 tasks completed on time)
  const highPriTasks = await prisma.task.findMany({
    where: {
      entityId: { in: entityIds },
      priority: { in: ['P0', 'P1'] },
      dueDate: { lte: dayEnd },
    },
  });
  const completedOnTime = highPriTasks.filter(
    (t: any) =>
      t.status === 'DONE' &&
      (!t.dueDate || t.updatedAt <= t.dueDate)
  ).length;
  const highPriorityCompletion =
    highPriTasks.length > 0
      ? Math.round((completedOnTime / highPriTasks.length) * 100)
      : 100;

  // Dimension 2: Focus Time Achieved
  const prefs = (user?.preferences as Record<string, unknown>) ?? {};
  const focusHours = (prefs.focusHours as { start: string; end: string }[]) ?? [];
  let intendedFocusMinutes = 0;
  for (const block of focusHours) {
    const [sh, sm] = block.start.split(':').map(Number);
    const [eh, em] = block.end.split(':').map(Number);
    intendedFocusMinutes += (eh * 60 + em) - (sh * 60 + sm);
  }
  // Count meetings during focus time as disruption
  const events = await prisma.calendarEvent.findMany({
    where: {
      entityId: { in: entityIds },
      startTime: { gte: dayStart },
      endTime: { lte: dayEnd },
    },
  });
  let meetingMinutes = 0;
  for (const event of events) {
    meetingMinutes += (event.endTime.getTime() - event.startTime.getTime()) / 60000;
  }
  const actualFocusMinutes = Math.max(0, intendedFocusMinutes - meetingMinutes);
  const focusTimeAchieved =
    intendedFocusMinutes > 0
      ? Math.min(100, Math.round((actualFocusMinutes / intendedFocusMinutes) * 100))
      : 100;

  // Dimension 3: Goal Progress (weekly goal completion rate)
  // Simplified: ratio of completed tasks to total tasks this week
  const weekStart = new Date(dayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const allWeekTasks = await prisma.task.findMany({
    where: {
      entityId: { in: entityIds },
      createdAt: { gte: weekStart, lte: dayEnd },
    },
  });
  const doneWeekTasks = allWeekTasks.filter((t: any) => t.status === 'DONE').length;
  const goalProgress =
    allWeekTasks.length > 0
      ? Math.round((doneWeekTasks / allWeekTasks.length) * 100)
      : 100;

  // Dimension 4: Meeting Efficiency (prep-to-meeting ratio, higher = better)
  const eventsWithPrep = events.filter((e: any) => e.prepPacket !== null);
  const meetingEfficiency =
    events.length > 0
      ? Math.min(100, Math.round((eventsWithPrep.length / events.length) * 100))
      : 100;

  // Dimension 5: Communication Speed (P0 message response time)
  const p0Messages = await prisma.message.findMany({
    where: {
      entityId: { in: entityIds },
      triageScore: { gte: 8 },
      createdAt: { gte: dayStart, lte: dayEnd },
    },
  });
  // Simplified: score based on count handled vs total
  const communicationSpeed =
    p0Messages.length > 0
      ? Math.min(100, Math.round(100 - p0Messages.length * 5))
      : 100;

  const dimensions = {
    highPriorityCompletion,
    focusTimeAchieved,
    goalProgress,
    meetingEfficiency,
    communicationSpeed: Math.max(0, communicationSpeed),
  };

  const overallScore = Math.round(
    dimensions.highPriorityCompletion * WEIGHTS.highPriorityCompletion +
    dimensions.focusTimeAchieved * WEIGHTS.focusTimeAchieved +
    dimensions.goalProgress * WEIGHTS.goalProgress +
    dimensions.meetingEfficiency * WEIGHTS.meetingEfficiency +
    dimensions.communicationSpeed * WEIGHTS.communicationSpeed
  );

  return {
    userId,
    date,
    overallScore,
    dimensions,
    trend: 'STABLE', // Trend calculated separately with historical data
  };
}

export async function getProductivityTrend(
  userId: string,
  days: number
): Promise<ProductivityScore[]> {
  const scores: ProductivityScore[] = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const score = await calculateProductivityScore(userId, dateStr);
    scores.push(score);
  }

  // Calculate trend for each score
  if (scores.length >= 2) {
    const trend = calculateTrend(scores);
    for (const score of scores) {
      score.trend = trend;
    }
  }

  return scores;
}

export function calculateTrend(
  scores: ProductivityScore[]
): 'IMPROVING' | 'STABLE' | 'DECLINING' {
  if (scores.length < 2) return 'STABLE';

  const midpoint = Math.min(7, Math.floor(scores.length / 2));
  const recent = scores.slice(-midpoint);
  const previous = scores.slice(
    Math.max(0, scores.length - midpoint * 2),
    scores.length - midpoint
  );

  if (recent.length === 0 || previous.length === 0) return 'STABLE';

  const recentAvg =
    recent.reduce((sum, s) => sum + s.overallScore, 0) / recent.length;
  const previousAvg =
    previous.reduce((sum, s) => sum + s.overallScore, 0) / previous.length;

  const changePercent =
    previousAvg === 0 ? 0 : ((recentAvg - previousAvg) / previousAvg) * 100;

  if (changePercent > 5) return 'IMPROVING';
  if (changePercent < -5) return 'DECLINING';
  return 'STABLE';
}
