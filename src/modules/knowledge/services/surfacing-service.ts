import { prisma } from '@/lib/db';
import type { KnowledgeEntry } from '@/shared/types';
import type { SurfacingContext, SurfacedKnowledge } from '@/modules/knowledge/types';
import { knowledgeEntryToCaptured, parseStoredData } from './capture-service';

// In-memory dismissal tracking (would be DB-backed in production)
const dismissals = new Map<string, Set<string>>();

function generateContextHash(context: SurfacingContext): string {
  return `${context.entityId}:${context.currentActivity}:${(context.currentTags || []).join(',')}`;
}

function scoreForContext(entry: KnowledgeEntry, context: SurfacingContext): number {
  let score = 0;

  // Match tags from current activity
  const activityKeywords = context.currentActivity
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  const entryTags = entry.tags.map((t) => t.toLowerCase());
  const stored = parseStoredData(entry.content);
  const contentLower = stored.body.toLowerCase();

  for (const keyword of activityKeywords) {
    if (entryTags.some((t) => t.includes(keyword))) score += 2;
    if (contentLower.includes(keyword)) score += 1;
  }

  // Match current tags
  if (context.currentTags) {
    for (const tag of context.currentTags) {
      if (entryTags.includes(tag.toLowerCase())) score += 3;
    }
  }

  // Match linked contacts/projects
  if (context.activeContactIds) {
    for (const contactId of context.activeContactIds) {
      if (entry.linkedEntities.includes(contactId)) score += 4;
    }
  }

  if (context.activeProjectId) {
    if (entry.linkedEntities.includes(context.activeProjectId)) score += 4;
  }

  // Normalize to 0-1 range (max realistic score ~20)
  return Math.min(1, score / 20);
}

export async function surfaceRelevant(context: SurfacingContext): Promise<SurfacedKnowledge[]> {
  const entries = await prisma.knowledgeEntry.findMany({
    where: { entityId: context.entityId },
  });

  const contextHash = generateContextHash(context);
  const dismissed = dismissals.get(contextHash) || new Set();

  const scored: SurfacedKnowledge[] = [];

  for (const entry of entries) {
    const ke = entry as unknown as KnowledgeEntry;
    if (dismissed.has(ke.id)) continue;

    const relevanceScore = scoreForContext(ke, context);
    if (relevanceScore > 0) {
      const captured = knowledgeEntryToCaptured(ke);
      const reasons: string[] = [];

      const activityKeywords = context.currentActivity.toLowerCase().split(/\s+/);
      const matchedTags = ke.tags.filter((t) =>
        activityKeywords.some((kw) => t.toLowerCase().includes(kw))
      );
      if (matchedTags.length > 0) reasons.push(`matches activity tags: ${matchedTags.join(', ')}`);
      if (context.currentTags?.some((ct) => ke.tags.map((t) => t.toLowerCase()).includes(ct.toLowerCase()))) {
        reasons.push('matches current context tags');
      }
      if (context.activeContactIds?.some((c) => ke.linkedEntities.includes(c))) {
        reasons.push('linked to active contact');
      }
      if (context.activeProjectId && ke.linkedEntities.includes(context.activeProjectId)) {
        reasons.push('linked to active project');
      }

      scored.push({
        entry: captured,
        reason: reasons.join('; ') || 'related to current activity',
        relevanceScore,
        surfacedAt: new Date(),
      });
    }
  }

  return scored
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 5);
}

export async function dismissSuggestion(entryId: string, contextHash: string): Promise<void> {
  if (!dismissals.has(contextHash)) {
    dismissals.set(contextHash, new Set());
  }
  dismissals.get(contextHash)!.add(entryId);
}

export async function trackAccess(entryId: string): Promise<void> {
  // Update the memory entry's lastAccessed and boost strength
  const memories = await prisma.memoryEntry.findMany({
    where: { content: { contains: entryId } },
  });

  if (memories.length > 0) {
    for (const memory of memories) {
      const currentStrength = (memory as unknown as { strength: number }).strength;
      await prisma.memoryEntry.update({
        where: { id: memory.id },
        data: {
          lastAccessed: new Date(),
          strength: Math.min(1, currentStrength + 0.1),
        },
      });
    }
  }
}
