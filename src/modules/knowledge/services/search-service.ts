// Embedding-based semantic search with full-text fallback
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

// --- Embedding utilities ---

const STOP_WORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
  'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
  'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
  'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
  'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
  'is', 'are', 'was', 'were', 'been', 'has', 'had', 'did', 'does',
]);

const EMBED_DIMENSIONS = 256;

/**
 * Simple hash function to map a token string to a bucket index (0 to EMBED_DIMENSIONS-1).
 */
function hashToken(token: string): number {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    hash = ((hash << 5) - hash + token.charCodeAt(i)) | 0;
  }
  return ((hash % EMBED_DIMENSIONS) + EMBED_DIMENSIONS) % EMBED_DIMENSIONS;
}

/**
 * Generate a TF-IDF-like embedding vector for the given text.
 * Tokenizes text into words, hashes each token to a fixed-dimension bucket (0-255),
 * builds a frequency vector, and normalizes it to unit length.
 * Returns a fixed-length number[] representing the embedding.
 */
export function embedText(text: string): number[] {
  if (!text || !text.trim()) return [];

  const tokens = text
    .toLowerCase()
    .split(/[\s,.;:!?()\[\]{}"'`\-_/\\|@#$%^&*+=<>~]+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));

  if (tokens.length === 0) return [];

  // Build frequency map of tokens
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) || 0) + 1);
  }

  // Create a fixed-dimension vector by hashing each token to a bucket 0-255
  const vector = new Array<number>(EMBED_DIMENSIONS).fill(0);
  for (const [token, count] of freq.entries()) {
    const bucket = hashToken(token);
    vector[bucket] += count;
  }

  // Apply log-TF normalization: log(1 + tf)
  for (let i = 0; i < vector.length; i++) {
    if (vector[i] > 0) {
      vector[i] = Math.log(1 + vector[i]);
    }
  }

  // L2 normalize to unit length
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return [];
  for (let i = 0; i < vector.length; i++) {
    vector[i] /= magnitude;
  }

  return vector;
}

/**
 * Compute cosine similarity between two vectors.
 * Handles vectors of different lengths by using shared vocabulary approach.
 * Returns a value between -1 and 1 (typically 0-1 for TF vectors).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;

  // If vectors are the same length, compute directly
  if (a.length === b.length) {
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  // For different-length vectors (from TF-IDF with different vocabs),
  // return 0 since they're in incompatible vector spaces
  return 0;
}


// --- Existing full-text search functions ---

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

export async function search(
  request: SearchRequest & { mode?: 'fulltext' | 'semantic' | 'hybrid' }
): Promise<SearchResponse> {
  const page = request.page || 1;
  const pageSize = request.pageSize || 20;
  const mode = request.mode || 'fulltext';

  // For semantic or hybrid mode, delegate to embedding-based search
  if (mode === 'semantic') {
    try {
      const semanticResult = await semanticSearch(request.entityId, request.query, {
        limit: pageSize,
        threshold: 0.1,
      });

      // Apply filters and pagination to semantic results
      const filteredResults: SearchResult[] = [];

      for (const sr of semanticResult) {
        const ke = sr.entry as KnowledgeEntry;
        const captured = knowledgeEntryToCaptured(ke);
        if (!matchesFilters(ke, captured, request.filters)) continue;

        const stored = parseStoredData(ke.content);
        filteredResults.push({
          entry: captured,
          relevanceScore: sr.similarity,
          matchedFields: request.query.trim() ? getMatchedFields(request.query, ke) : [],
          highlightedExcerpt: highlightExcerpt(stored.body, request.query),
        });
      }

      const total = filteredResults.length;
      const start = (page - 1) * pageSize;
      const paginatedResults = filteredResults.slice(start, start + pageSize);

      return {
        results: paginatedResults,
        total,
        page,
        pageSize,
        suggestedQueries: suggestRelatedQueries(request.query, filteredResults),
      };
    } catch {
      // Fall back to fulltext on error
      return search({ ...request, mode: 'fulltext' });
    }
  }

  if (mode === 'hybrid') {
    try {
      // Run both fulltext and semantic in parallel
      const [fulltextResponse, semanticResults] = await Promise.all([
        search({ ...request, mode: 'fulltext' }),
        semanticSearch(request.entityId, request.query, {
          limit: (request.pageSize || 20) * 2,
          threshold: 0.1,
        }),
      ]);

      // Build a map of fulltext results by ID
      const resultMap = new Map<string, SearchResult>();
      for (const r of fulltextResponse.results) {
        resultMap.set(r.entry.id, r);
      }

      // Merge semantic results - boost existing, add new
      for (const sr of semanticResults) {
        const ke = sr.entry as KnowledgeEntry;
        const existing = resultMap.get(ke.id);
        if (existing) {
          // Boost score by combining fulltext and semantic
          existing.relevanceScore = Math.min(1, (existing.relevanceScore + sr.similarity) / 2 + 0.1);
        } else {
          const captured = knowledgeEntryToCaptured(ke);
          if (!matchesFilters(ke, captured, request.filters)) continue;

          const stored = parseStoredData(ke.content);
          resultMap.set(ke.id, {
            entry: captured,
            relevanceScore: sr.similarity,
            matchedFields: request.query.trim() ? getMatchedFields(request.query, ke) : [],
            highlightedExcerpt: highlightExcerpt(stored.body, request.query),
          });
        }
      }

      const merged = Array.from(resultMap.values()).sort((a, b) => b.relevanceScore - a.relevanceScore);
      const total = merged.length;
      const start = (page - 1) * pageSize;
      const paginatedResults = merged.slice(start, start + pageSize);

      return {
        results: paginatedResults,
        total,
        page,
        pageSize,
        suggestedQueries: suggestRelatedQueries(request.query, merged),
      };
    } catch {
      // Fall back to fulltext on error
      return search({ ...request, mode: 'fulltext' });
    }
  }

  // Default: fulltext mode (original behavior)
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

// --- Embedding-based semantic search ---

export interface SemanticSearchResult {
  entry: KnowledgeEntry;
  similarity: number;
}

/**
 * Perform embedding-based semantic search over a user's knowledge entries.
 * Generates TF-IDF embeddings for query and entries via embedText(),
 * computes cosine similarity, filters by threshold (default 0.1),
 * and returns top N results sorted by similarity descending.
 */
export async function semanticSearch(
  userId: string,
  query: string,
  options?: { limit?: number; threshold?: number }
): Promise<Array<{ entry: KnowledgeEntry; similarity: number }>>;

/**
 * AI-powered re-ranking of keyword search results (legacy signature).
 */
export async function semanticSearch(
  request: SearchRequest
): Promise<SearchResponse>;

export async function semanticSearch(
  userIdOrRequest: string | SearchRequest,
  query?: string,
  options?: { limit?: number; threshold?: number }
): Promise<Array<{ entry: KnowledgeEntry; similarity: number }> | SearchResponse> {
  // Legacy signature: semanticSearch(request: SearchRequest)
  if (typeof userIdOrRequest !== 'string') {
    return semanticSearchLegacy(userIdOrRequest);
  }

  // New signature: semanticSearch(userId, query, options)
  const userId = userIdOrRequest;
  const searchQuery = query || '';
  const limit = options?.limit ?? 10;
  const threshold = options?.threshold ?? 0.1;

  if (!searchQuery.trim()) return [];

  try {
    // Generate embedding for the query
    const queryEmbedding = embedText(searchQuery);
    if (queryEmbedding.length === 0) return [];

    // Fetch all knowledge entries for the user
    const entries = await prisma.knowledgeEntry.findMany({
      where: { entityId: userId },
    });

    if (entries.length === 0) return [];

    const results: Array<{ entry: KnowledgeEntry; similarity: number }> = [];

    for (const entry of entries) {
      const ke = entry as unknown as KnowledgeEntry;
      const stored = parseStoredData(ke.content);

      // Generate embedding from title + content
      const entryText = [stored.title, stored.body].join(' ');
      const entryEmbedding = embedText(entryText);

      if (entryEmbedding.length === 0) continue;

      // Compute cosine similarity between query and entry embeddings
      const similarity = cosineSimilarity(queryEmbedding, entryEmbedding);

      if (similarity >= threshold) {
        results.push({
          entry: ke,
          similarity,
        });
      }
    }

    // Sort by similarity descending
    results.sort((a, b) => b.similarity - a.similarity);

    // Return top N results
    return results.slice(0, limit);
  } catch {
    // Fall back: return empty results on failure
    return [];
  }
}

/**
 * Legacy semanticSearch: keyword search + AI re-ranking.
 */
async function semanticSearchLegacy(request: SearchRequest): Promise<SearchResponse> {
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
