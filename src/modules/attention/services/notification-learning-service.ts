import { generateJSON } from '@/lib/ai';
import type { NotificationLearning } from '../types';
import { notificationStore } from './priority-router';

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
