// TODO: Replace with embedding-based semantic search
import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';
import type { KnowledgeEntry } from '@/shared/types';
import type {
  SearchRequest,
  SearchResponse,
  SearchResult,
  SearchFilters,
  CapturedEntry,
} from '@/modules/knowledge/types';
import { knowledgeEntryToCaptured, parseStoredData } from './capture-service';

const TITLE_WEIGHT = 3;
const TAGS_WEIGHT = 2;
const CONTENT_WEIGHT = 1;
const RECENCY_BOOST_DAYS = 30;

export function calculateRelevance(query: string, entry: KnowledgeEntry): number {
  if (!query.trim()) return 0;

  const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (keywords.length === 0) return 0;

  const stored = parseStoredData(entry.content);
  const titleLower = stored.title.toLowerCase();
  const contentLower = stored.body.toLowerCase();
  const tagsLower = entry.tags.map((t) => t.toLowerCase());

  let score = 0;
  let maxScore = 0;

  for (const kw of keywords) {
    maxScore += TITLE_WEIGHT + TAGS_WEIGHT + CONTENT_WEIGHT;

    if (titleLower.includes(kw)) score += TITLE_WEIGHT;
    if (tagsLower.some((t) => t.includes(kw))) score += TAGS_WEIGHT;
    if (contentLower.includes(kw)) score += CONTENT_WEIGHT;
  }

  let relevance = maxScore > 0 ? score / maxScore : 0;

  // Recency boost: entries from last 30 days get up to 10% boost
  const daysSinceUpdate = (Date.now() - new Date(entry.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceUpdate < RECENCY_BOOST_DAYS) {
    relevance = Math.min(1, relevance + 0.1 * (1 - daysSinceUpdate / RECENCY_BOOST_DAYS));
  }

  return Math.min(1, Math.max(0, relevance));
}

export function highlightExcerpt(content: string, query: string, contextChars: number = 100): string {
  if (!content || !query.trim()) return content.substring(0, contextChars * 2);

  const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
  const contentLower = content.toLowerCase();

  let firstMatchIndex = -1;
  let matchedKeyword = '';
  for (const kw of keywords) {
    const idx = contentLower.indexOf(kw);
    if (idx !== -1 && (firstMatchIndex === -1 || idx < firstMatchIndex)) {
      firstMatchIndex = idx;
      matchedKeyword = kw;
    }
  }

  if (firstMatchIndex === -1) {
    return content.substring(0, contextChars * 2);
  }

  const start = Math.max(0, firstMatchIndex - contextChars);
  const end = Math.min(content.length, firstMatchIndex + matchedKeyword.length + contextChars);
  let excerpt = content.substring(start, end);

  if (start > 0) excerpt = '...' + excerpt;
  if (end < content.length) excerpt = excerpt + '...';

  return excerpt;
}

export function suggestRelatedQueries(query: string, results: SearchResult[]): string[] {
  const topResults = results.slice(0, 5);
  const tagSet = new Set<string>();
  const titleWords = new Set<string>();

  for (const result of topResults) {
    for (const tag of result.entry.tags) {
      if (!query.toLowerCase().includes(tag.toLowerCase())) {
        tagSet.add(tag);
      }
    }
    const words = result.entry.title.split(/\s+/).filter((w) => w.length > 3);
    for (const word of words) {
      if (!query.toLowerCase().includes(word.toLowerCase())) {
        titleWords.add(word.toLowerCase());
      }
    }
  }

  const suggestions: string[] = [];
  for (const tag of tagSet) {
    suggestions.push(`${query} ${tag}`);
    if (suggestions.length >= 3) break;
  }
  for (const word of titleWords) {
    if (suggestions.length >= 5) break;
    suggestions.push(`${query} ${word}`);
  }

  return suggestions.slice(0, 5);
}

function getMatchedFields(query: string, entry: KnowledgeEntry): string[] {
  const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
  const stored = parseStoredData(entry.content);
  const fields: string[] = [];

  for (const kw of keywords) {
    if (stored.title.toLowerCase().includes(kw) && !fields.includes('title')) fields.push('title');
    if (entry.tags.some((t) => t.toLowerCase().includes(kw)) && !fields.includes('tags')) fields.push('tags');
    if (stored.body.toLowerCase().includes(kw) && !fields.includes('content')) fields.push('content');
  }

  return fields;
}

function matchesFilters(entry: KnowledgeEntry, captured: CapturedEntry, filters?: SearchFilters): boolean {
  if (!filters) return true;

  if (filters.types && filters.types.length > 0) {
    if (!filters.types.includes(captured.type)) return false;
  }

  if (filters.tags && filters.tags.length > 0) {
    const hasTag = filters.tags.some((t) => entry.tags.includes(t));
    if (!hasTag) return false;
  }

  if (filters.dateRange) {
    const entryDate = new Date(entry.createdAt);
    if (entryDate < filters.dateRange.start || entryDate > filters.dateRange.end) return false;
  }

  if (filters.source) {
    if (entry.source !== filters.source) return false;
  }

  return true;
}

async function expandQueryWithAI(query: string): Promise<string> {
  try {
    const result = await generateJSON<{ expandedQuery: string }>(`Expand this search query with synonyms and related terms to improve search recall.

Original query: "${query}"

Return a single expanded query string that includes the original terms plus 2-4 relevant synonyms or related terms, separated by spaces. Do not add unrelated terms.`, {
      maxTokens: 128,
      temperature: 0.3,
      system: 'You are a search query optimizer. Expand queries with relevant synonyms only.',
    });
    return result.expandedQuery || query;
  } catch {
    return query;
  }
}

export async function search(request: SearchRequest): Promise<SearchResponse> {
  const page = request.page || 1;
  const pageSize = request.pageSize || 20;

  // Use AI to expand the search query with synonyms and related terms
  const effectiveQuery = request.query.trim()
    ? await expandQueryWithAI(request.query)
    : request.query;

  const entries = await prisma.knowledgeEntry.findMany({
    where: { entityId: request.entityId },
  });

  const scored: SearchResult[] = [];

  for (const entry of entries) {
    const ke = entry as unknown as KnowledgeEntry;
    const captured = knowledgeEntryToCaptured(ke);

    if (!matchesFilters(ke, captured, request.filters)) continue;

    // Score using both original query and expanded query, take the higher score
    const originalScore = request.query.trim()
      ? calculateRelevance(request.query, ke)
      : 0.5;
    const expandedScore = effectiveQuery !== request.query && effectiveQuery.trim()
      ? calculateRelevance(effectiveQuery, ke)
      : 0;
    const relevanceScore = Math.max(originalScore, expandedScore);

    if (relevanceScore > 0 || !request.query.trim()) {
      const stored = parseStoredData(ke.content);
      scored.push({
        entry: captured,
        relevanceScore,
        matchedFields: request.query.trim() ? getMatchedFields(request.query, ke) : [],
        highlightedExcerpt: highlightExcerpt(stored.body, request.query),
      });
    }
  }

  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

  const total = scored.length;
  const start = (page - 1) * pageSize;
  const paginatedResults = scored.slice(start, start + pageSize);

  return {
    results: paginatedResults,
    total,
    page,
    pageSize,
    suggestedQueries: suggestRelatedQueries(request.query, scored),
  };
}

export async function semanticSearch(request: SearchRequest): Promise<SearchResponse> {
  // 1. Run existing keyword search
  const keywordResults = await search(request);

  // If no query or no results, return keyword results as-is
  if (!request.query.trim() || keywordResults.results.length === 0) {
    return keywordResults;
  }

  // 2. Take top 20 results for AI re-ranking
  const topResults = keywordResults.results.slice(0, 20);

  try {
    const reRankInput = topResults.map((r, idx) => ({
      id: idx,
      title: r.entry.title,
      excerpt: r.highlightedExcerpt.substring(0, 200),
    }));

    const aiResult = await generateJSON<{ rankedIds: number[] }>(
      `Re-rank these search results by semantic relevance to the query.

Query: "${request.query}"

Results:
${reRankInput.map((r) => `[${r.id}] "${r.title}" — ${r.excerpt}`).join('\n')}

Return a JSON object with "rankedIds": an array of the result IDs (numbers) ordered from most to least semantically relevant to the query. Include all IDs.`,
      {
        maxTokens: 256,
        temperature: 0.1,
        system: 'You are a search relevance ranker. Re-order results by semantic relevance to the query.',
      }
    );

    if (aiResult.rankedIds && Array.isArray(aiResult.rankedIds)) {
      // Build re-ranked results from AI ordering
      const reRanked: SearchResult[] = [];
      for (const id of aiResult.rankedIds) {
        if (id >= 0 && id < topResults.length) {
          reRanked.push(topResults[id]);
        }
      }
      // Add any results the AI missed
      for (let i = 0; i < topResults.length; i++) {
        if (!aiResult.rankedIds.includes(i)) {
          reRanked.push(topResults[i]);
        }
      }
      // Append remaining results beyond top 20
      const remaining = keywordResults.results.slice(20);

      return {
        ...keywordResults,
        results: [...reRanked, ...remaining],
      };
    }
  } catch {
    // Fall back to keyword results on AI failure
  }

  return keywordResults;
}
