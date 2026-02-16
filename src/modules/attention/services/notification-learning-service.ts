import { generateJSON } from '@/lib/ai';
import type { NotificationLearning } from '../types';
import { notificationStore } from './priority-router';

function getPrisma() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/lib/db').prisma;
}

export async function analyzePatterns(userId: string): Promise<NotificationLearning> {
  const items = Array.from(notificationStore.values()).filter((i) => i.userId === userId);

  const sourceMap = new Map<string, { total: number; read: number; totalResponseMs: number }>();
  for (const item of items) {
    const existing = sourceMap.get(item.source) || { total: 0, read: 0, totalResponseMs: 0 };
    existing.total++;
    if (item.isRead) {
      existing.read++;
      existing.totalResponseMs += 30 * 60 * 1000; // placeholder 30min avg
    }
    sourceMap.set(item.source, existing);
  }

  const patterns = Array.from(sourceMap.entries()).map(([source, stats]) => ({
    source,
    averageOpenRate: stats.total > 0 ? stats.read / stats.total : 0,
    averageResponseTime: stats.read > 0 ? stats.totalResponseMs / stats.read / 60000 : 0,
    preferredTime: '09:00',
  }));

  const suggestions = await getSuggestions(userId);

  return { userId, patterns, suggestions };
}

export async function getSuggestions(userId: string): Promise<string[]> {
  const items = Array.from(notificationStore.values()).filter((i) => i.userId === userId);
  const fallbackSuggestions: string[] = [];

  const sourceMap = new Map<string, { total: number; read: number }>();
  for (const item of items) {
    const existing = sourceMap.get(item.source) || { total: 0, read: 0 };
    existing.total++;
    if (item.isRead) existing.read++;
    sourceMap.set(item.source, existing);
  }

  for (const [source, stats] of sourceMap.entries()) {
    const openRate = stats.total > 0 ? stats.read / stats.total : 0;
    if (openRate < 0.2 && stats.total >= 3) {
      fallbackSuggestions.push(`You rarely open ${source} notifications. Consider muting them.`);
    }
    if (openRate > 0.9 && stats.total >= 3) {
      fallbackSuggestions.push(`${source} notifications have ${Math.round(openRate * 100)}% open rate. Keep as P1.`);
    }
  }

  if (sourceMap.size === 0) {
    return ['Keep monitoring your notification patterns for better suggestions.'];
  }

  try {
    const patternData = Array.from(sourceMap.entries()).map(([source, stats]) => ({
      source,
      total: stats.total,
      read: stats.read,
      openRate: stats.total > 0 ? (stats.read / stats.total * 100).toFixed(0) + '%' : '0%',
    }));

    const aiResult = await generateJSON<{ suggestions: string[] }>(
      `Based on this user's notification patterns, provide actionable suggestions for managing notifications better.

Patterns:
${JSON.stringify(patternData, null, 2)}

Provide 2-4 specific, personalized suggestions. Return JSON: { "suggestions": ["...", "..."] }`,
      { temperature: 0.5, maxTokens: 256 }
    );

    if (aiResult.suggestions && Array.isArray(aiResult.suggestions) && aiResult.suggestions.length > 0) {
      return aiResult.suggestions;
    }
  } catch {
    // Fall back to rule-based suggestions
  }

  if (fallbackSuggestions.length === 0) {
    fallbackSuggestions.push('Keep monitoring your notification patterns for better suggestions.');
  }

  return fallbackSuggestions;
}

export async function recordAction(
  userId: string,
  notificationId: string,
  action: 'read' | 'dismiss' | 'act' | 'snooze'
): Promise<void> {
  // Update the notification in the store
  const notification = notificationStore.get(notificationId);
  if (notification && action === 'read') {
    notification.isRead = true;
  }

  // Log to ActionLog for learning
  try {
    await getPrisma().actionLog.create({
      data: {
        actor: userId,
        actorId: userId,
        actionType: 'NOTIFICATION_ACTION',
        target: notificationId,
        reason: `User ${action} notification${notification ? ` from ${notification.source}` : ''}`,
        blastRadius: 'LOW',
        reversible: false,
        status: 'COMPLETED',
      },
    });
  } catch {
    // Best-effort logging
  }
}

export async function getPreferences(userId: string): Promise<{
  actionRates: Record<string, { actRate: number; dismissRate: number; total: number }>;
  preferredTimes: string[];
  priorityAccuracy: number;
}> {
  const actionRates: Record<string, { actRate: number; dismissRate: number; total: number }> = {};

  try {
    const logs = await getPrisma().actionLog.findMany({
      where: {
        actorId: userId,
        actionType: 'NOTIFICATION_ACTION',
      },
      orderBy: { timestamp: 'desc' },
      take: 200,
    });

    const sourceActions = new Map<string, { act: number; dismiss: number; read: number; snooze: number }>();
    const hours: number[] = [];

    for (const log of logs) {
      const reason = log.reason;
      const sourceMatch = reason.match(/from (\S+)/);
      const source = sourceMatch ? sourceMatch[1] : 'unknown';
      const actionMatch = reason.match(/User (\w+)/);
      const action = actionMatch ? actionMatch[1] : 'unknown';

      const existing = sourceActions.get(source) || { act: 0, dismiss: 0, read: 0, snooze: 0 };
      if (action === 'act') existing.act++;
      else if (action === 'dismiss') existing.dismiss++;
      else if (action === 'read') existing.read++;
      else if (action === 'snooze') existing.snooze++;
      sourceActions.set(source, existing);

      hours.push(log.timestamp.getHours());
    }

    for (const [source, actions] of sourceActions.entries()) {
      const total = actions.act + actions.dismiss + actions.read + actions.snooze;
      actionRates[source] = {
        actRate: total > 0 ? actions.act / total : 0,
        dismissRate: total > 0 ? actions.dismiss / total : 0,
        total,
      };
    }

    // Find preferred hours (most active)
    const hourCounts = new Map<number, number>();
    for (const h of hours) {
      hourCounts.set(h, (hourCounts.get(h) || 0) + 1);
    }
    const sortedHours = Array.from(hourCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([h]) => `${String(h).padStart(2, '0')}:00`);

    return {
      actionRates,
      preferredTimes: sortedHours.length > 0 ? sortedHours : ['09:00'],
      priorityAccuracy: 0.75, // Default until enough data
    };
  } catch {
    return {
      actionRates,
      preferredTimes: ['09:00'],
      priorityAccuracy: 0.75,
    };
  }
}

export async function suggestPriority(
  userId: string,
  notification: { source: string; title: string; body: string; priority: string }
): Promise<{ suggestedPriority: string; confidence: number; reason: string }> {
  const prefs = await getPreferences(userId);
  const sourceRate = prefs.actionRates[notification.source];

  // Rule-based suggestion
  if (sourceRate) {
    if (sourceRate.dismissRate > 0.8 && sourceRate.total >= 5) {
      return {
        suggestedPriority: 'P2',
        confidence: 0.85,
        reason: `You dismiss ${Math.round(sourceRate.dismissRate * 100)}% of ${notification.source} notifications`,
      };
    }
    if (sourceRate.actRate > 0.7 && sourceRate.total >= 5) {
      return {
        suggestedPriority: 'P0',
        confidence: 0.8,
        reason: `You act on ${Math.round(sourceRate.actRate * 100)}% of ${notification.source} notifications`,
      };
    }
  }

  // AI-powered suggestion
  try {
    const aiResult = await generateJSON<{ priority: string; confidence: number; reason: string }>(
      `Based on user notification patterns, suggest a priority for this notification.

Notification: "${notification.title}" from ${notification.source}
Current priority: ${notification.priority}
User patterns: ${JSON.stringify(prefs.actionRates)}

Return JSON: { "priority": "P0"|"P1"|"P2", "confidence": 0.0-1.0, "reason": "..." }`,
      { temperature: 0.3, maxTokens: 128 }
    );

    return {
      suggestedPriority: aiResult.priority || notification.priority,
      confidence: aiResult.confidence || 0.5,
      reason: aiResult.reason || 'AI-based suggestion',
    };
  } catch {
    return {
      suggestedPriority: notification.priority,
      confidence: 0.5,
      reason: 'Default priority maintained',
    };
  }
}

export async function getInsights(userId: string): Promise<string[]> {
  const prefs = await getPreferences(userId);
  const insights: string[] = [];

  for (const [source, rates] of Object.entries(prefs.actionRates)) {
    if (rates.dismissRate > 0.7 && rates.total >= 3) {
      insights.push(`You dismiss most ${source} notifications - consider downgrading their priority.`);
    }
    if (rates.actRate > 0.8 && rates.total >= 3) {
      insights.push(`${source} notifications drive high engagement (${Math.round(rates.actRate * 100)}% action rate).`);
    }
  }

  if (prefs.preferredTimes.length > 0) {
    insights.push(`Your most active notification times are around ${prefs.preferredTimes.join(', ')}.`);
  }

  if (insights.length === 0) {
    insights.push('Continue using notifications to build better personalization data.');
  }

  return insights;
}
