import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';
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
      const contentLower = (entry.content as string).toLowerCase();
      const contextLower = (entry.context as string).toLowerCase();
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

      const relevanceScore = matchCount * (entry.strength as number);

      return {
        entry: mapPrismaMemory(entry),
        relevanceScore,
        matchedTerms,
      };
    })
    .filter((r: MemorySearchResult | null): r is MemorySearchResult => r !== null)
    .sort((a: MemorySearchResult, b: MemorySearchResult) => b.relevanceScore - a.relevanceScore);

  const keywordResults = query.limit ? results.slice(0, query.limit) : results;

  // Use AI for semantic re-ranking of top results
  if (keywordResults.length > 1) {
    try {
      const topResults = keywordResults.slice(0, 10);
      const aiRanking = await generateJSON<{ rankedIds: string[] }>(
        `Re-rank these memory search results by semantic relevance to the query.

Query: "${query.query}"

Results (id -> content):
${topResults.map((r, i) => `${i}. [${r.entry.id}] ${r.entry.content} (context: ${r.entry.context})`).join('\n')}

Return a JSON object with a "rankedIds" array containing the ids in order of true semantic relevance to the query (most relevant first).`,
        { temperature: 0.2 }
      );

      if (aiRanking.rankedIds && Array.isArray(aiRanking.rankedIds)) {
        const resultMap = new Map(topResults.map((r) => [r.entry.id, r]));
        const reranked: MemorySearchResult[] = [];

        for (const id of aiRanking.rankedIds) {
          const result = resultMap.get(id);
          if (result) {
            reranked.push(result);
            resultMap.delete(id);
          }
        }
        // Append any results not in the AI ranking
        for (const remaining of resultMap.values()) {
          reranked.push(remaining);
        }
        // Append any results beyond the top 10 that weren't re-ranked
        reranked.push(...keywordResults.slice(10));
        return reranked;
      }
    } catch {
      // Fall back to keyword ranking on AI failure
    }
  }

  return keywordResults;
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

interface PrismaMemoryRecord {
  id: string;
  userId: string;
  type: string;
  content: string;
  context: string;
  strength: number;
  lastAccessed: Date;
  createdAt: Date;
}

function mapPrismaMemory(raw: PrismaMemoryRecord): MemoryEntry {
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
