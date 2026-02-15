import { prisma } from '@/lib/db';
import type { MemoryEntry, MemoryType } from '@/shared/types';
import type { MemorySearchQuery, MemorySearchResult, MemoryStats } from './types';
import { getDecayConfig } from './decay-service';

export async function createMemory(
  userId: string,
  type: MemoryType,
  content: string,
  context: string
): Promise<MemoryEntry> {
  const entry = await prisma.memoryEntry.create({
    data: {
      userId,
      type,
      content,
      context,
      strength: 1.0,
      lastAccessed: new Date(),
    },
  });

  return mapPrismaMemory(entry);
}

export async function recallMemory(id: string): Promise<MemoryEntry | null> {
  const entry = await prisma.memoryEntry.findUnique({ where: { id } });
  if (!entry) return null;

  const config = getDecayConfig();

  // Reinforce on access
  const newStrength = Math.min(entry.strength + config.reinforcementBoost, 1.0);

  const updated = await prisma.memoryEntry.update({
    where: { id },
    data: {
      strength: newStrength,
      lastAccessed: new Date(),
    },
  });

  return mapPrismaMemory(updated);
}

export async function searchMemories(
  query: MemorySearchQuery
): Promise<MemorySearchResult[]> {
  const where: Record<string, unknown> = { userId: query.userId };

  if (query.types && query.types.length > 0) {
    where.type = { in: query.types };
  }
  if (query.minStrength !== undefined) {
    where.strength = { gte: query.minStrength };
  }

  const entries = await prisma.memoryEntry.findMany({
    where,
    orderBy: { strength: 'desc' },
  });

  // Text-based relevance scoring
  const queryTerms = query.query.toLowerCase().split(/\s+/).filter(Boolean);

  const results: MemorySearchResult[] = entries
    .map((entry) => {
      const contentLower = entry.content.toLowerCase();
      const contextLower = entry.context.toLowerCase();
      const matchedTerms: string[] = [];
      let matchCount = 0;

      for (const term of queryTerms) {
        const inContent = contentLower.includes(term);
        const inContext = contextLower.includes(term);
        if (inContent || inContext) {
          matchedTerms.push(term);
          matchCount += (inContent ? 1 : 0) + (inContext ? 0.5 : 0);
        }
      }

      if (matchedTerms.length === 0) return null;

      const relevanceScore = matchCount * entry.strength;

      return {
        entry: mapPrismaMemory(entry),
        relevanceScore,
        matchedTerms,
      };
    })
    .filter((r): r is MemorySearchResult => r !== null)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);

  return query.limit ? results.slice(0, query.limit) : results;
}

export async function getMemoriesByType(
  userId: string,
  type: MemoryType,
  limit = 50
): Promise<MemoryEntry[]> {
  const entries = await prisma.memoryEntry.findMany({
    where: { userId, type },
    orderBy: { strength: 'desc' },
    take: limit,
  });

  return entries.map(mapPrismaMemory);
}

export async function updateMemory(
  id: string,
  updates: { content?: string; context?: string; type?: MemoryType }
): Promise<MemoryEntry> {
  const entry = await prisma.memoryEntry.update({
    where: { id },
    data: {
      ...(updates.content !== undefined && { content: updates.content }),
      ...(updates.context !== undefined && { context: updates.context }),
      ...(updates.type !== undefined && { type: updates.type }),
    },
  });

  return mapPrismaMemory(entry);
}

export async function deleteMemory(id: string): Promise<void> {
  await prisma.memoryEntry.delete({ where: { id } });
}

export async function getMemoryStats(userId: string): Promise<MemoryStats> {
  const entries = await prisma.memoryEntry.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });

  const config = getDecayConfig();

  const byType: Record<MemoryType, number> = {
    SHORT_TERM: 0,
    WORKING: 0,
    LONG_TERM: 0,
    EPISODIC: 0,
  };

  let totalStrength = 0;
  let decayedCount = 0;

  for (const entry of entries) {
    byType[entry.type as MemoryType] = (byType[entry.type as MemoryType] ?? 0) + 1;
    totalStrength += entry.strength;
    if (entry.strength < config.minimumStrength) {
      decayedCount++;
    }
  }

  return {
    userId,
    totalEntries: entries.length,
    byType,
    averageStrength: entries.length > 0 ? totalStrength / entries.length : 0,
    oldestEntry: entries.length > 0 ? entries[0].createdAt : new Date(),
    newestEntry: entries.length > 0 ? entries[entries.length - 1].createdAt : new Date(),
    decayedCount,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPrismaMemory(raw: any): MemoryEntry {
  return {
    id: raw.id,
    userId: raw.userId,
    type: raw.type as MemoryType,
    content: raw.content,
    context: raw.context,
    strength: raw.strength,
    lastAccessed: raw.lastAccessed,
    createdAt: raw.createdAt,
  };
}
