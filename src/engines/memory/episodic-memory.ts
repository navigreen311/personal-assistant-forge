import { prisma } from '@/lib/db';
import { generateText, generateJSON } from '@/lib/ai';
import type { MemoryEntry } from '@/shared/types';
import type { MemorySearchResult } from './types';

export async function storeEpisode(
  userId: string,
  content: string,
  context: string,
  tags?: string[]
): Promise<MemoryEntry> {
  let enrichedContext = tags
    ? `${context} [tags: ${tags.join(', ')}]`
    : context;

  // Use AI to enrich episode with structured who/what/when/where/why
  try {
    const enrichment = await generateJSON<{
      who: string[];
      what: string;
      when: string;
      where: string;
      why: string;
    }>(
      `Extract structured episodic context from this content.

Content: ${content}
Context: ${context}

Return a JSON object with:
- who: array of people/entities involved
- what: brief description of what happened
- when: time reference if available, otherwise "unspecified"
- where: location/channel if available, otherwise "unspecified"
- why: purpose or reason if available, otherwise "unspecified"`,
      { temperature: 0.2 }
    );

    const parts = [enrichedContext];
    if (enrichment.who?.length) parts.push(`[who: ${enrichment.who.join(', ')}]`);
    if (enrichment.what) parts.push(`[what: ${enrichment.what}]`);
    if (enrichment.when && enrichment.when !== 'unspecified') parts.push(`[when: ${enrichment.when}]`);
    if (enrichment.where && enrichment.where !== 'unspecified') parts.push(`[where: ${enrichment.where}]`);
    if (enrichment.why && enrichment.why !== 'unspecified') parts.push(`[why: ${enrichment.why}]`);
    enrichedContext = parts.join(' ');
  } catch {
    // Keep basic context on AI failure
  }

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

  // Use AI for semantic matching and summarization of why each result matches
  if (results.length > 0) {
    try {
      const aiResult = await generateText(
        `Given this natural language query and search results, explain why each result is relevant.

Query: "${naturalLanguageQuery}"

Results:
${results.slice(0, 5).map((r, i) => `${i + 1}. ${r.entry.content} (context: ${r.entry.context})`).join('\n')}

For each result, provide a brief explanation of semantic relevance. Format as numbered lines matching the results.`,
        { temperature: 0.3 }
      );

      // Append AI explanations to matched terms
      const explanations = aiResult.split('\n').filter((l) => l.trim());
      for (let i = 0; i < Math.min(explanations.length, results.length); i++) {
        const cleaned = explanations[i].replace(/^\d+\.\s*/, '').trim();
        if (cleaned) {
          results[i].matchedTerms.push(`ai: ${cleaned}`);
        }
      }
    } catch {
      // Continue with keyword-only results on AI failure
    }
  }

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
