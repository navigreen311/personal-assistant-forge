import { prisma } from '@/lib/db';
import type { MemoryEntry } from '@/shared/types';
import type { MemorySearchResult } from './types';

export async function storeEpisode(
  userId: string,
  content: string,
  context: string,
  tags?: string[]
): Promise<MemoryEntry> {
  const enrichedContext = tags
    ? `${context} [tags: ${tags.join(', ')}]`
    : context;

  const entry = await prisma.memoryEntry.create({
    data: {
      userId,
      type: 'EPISODIC',
      content,
      context: enrichedContext,
      strength: 1.0,
      lastAccessed: new Date(),
    },
  });

  return mapPrismaMemory(entry);
}

export async function recallEpisode(
  userId: string,
  naturalLanguageQuery: string
): Promise<MemorySearchResult[]> {
  const episodes = await prisma.memoryEntry.findMany({
    where: { userId, type: 'EPISODIC' },
    orderBy: { createdAt: 'desc' },
  });

  // Fuzzy matching: tokenize query and match against content + context
  const queryTokens = naturalLanguageQuery
    .toLowerCase()
    .replace(/[?!.,;:'"]/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 2); // Skip very short words

  // Also extract quarter references (Q1, Q2, Q3, Q4)
  const quarterMatch = naturalLanguageQuery.match(/Q([1-4])/i);
  const quarterMonths = quarterMatch
    ? getQuarterMonths(parseInt(quarterMatch[1]))
    : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: MemorySearchResult[] = episodes
    .map((entry: any) => {
      const contentLower = (entry.content as string).toLowerCase();
      const contextLower = (entry.context as string).toLowerCase();
      const matchedTerms: string[] = [];
      let score = 0;

      for (const token of queryTokens) {
        if (contentLower.includes(token)) {
          matchedTerms.push(token);
          score += 2;
        }
        if (contextLower.includes(token)) {
          if (!matchedTerms.includes(token)) matchedTerms.push(token);
          score += 1;
        }
      }

      // Boost score for date-range matches
      if (quarterMonths) {
        const month = (entry.createdAt as Date).getMonth();
        if (quarterMonths.includes(month)) {
          score += 3;
          matchedTerms.push(`Q${quarterMatch![1]}`);
        }
      }

      if (score === 0) return null;

      return {
        entry: mapPrismaMemory(entry),
        relevanceScore: score * (entry.strength as number),
        matchedTerms,
      };
    })
    .filter((r: MemorySearchResult | null): r is MemorySearchResult => r !== null)
    .sort((a: MemorySearchResult, b: MemorySearchResult) => b.relevanceScore - a.relevanceScore);

  return results;
}

export async function getTimeline(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<MemoryEntry[]> {
  const entries = await prisma.memoryEntry.findMany({
    where: {
      userId,
      type: 'EPISODIC',
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return entries.map(mapPrismaMemory);
}

function getQuarterMonths(quarter: number): number[] {
  switch (quarter) {
    case 1: return [0, 1, 2];    // Jan, Feb, Mar
    case 2: return [3, 4, 5];    // Apr, May, Jun
    case 3: return [6, 7, 8];    // Jul, Aug, Sep
    case 4: return [9, 10, 11];  // Oct, Nov, Dec
    default: return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPrismaMemory(raw: any): MemoryEntry {
  return {
    id: raw.id,
    userId: raw.userId,
    type: raw.type,
    content: raw.content,
    context: raw.context,
    strength: raw.strength,
    lastAccessed: raw.lastAccessed,
    createdAt: raw.createdAt,
  };
}
