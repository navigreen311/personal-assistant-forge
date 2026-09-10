// ============================================================================
// Knowledge search: keyword scoring, hashed term-frequency similarity, and
// optional AI re-ranking.
//
// T-017 -- WHAT THIS FILE IS, HONESTLY.
//
// The header used to read "Embedding-based semantic search". It is not. There
// is no embedding model, no vector store, and no index. `embedText()` below is
// the hashing trick: it tokenises, hashes each token into one of 256 buckets,
// takes log(1 + tf), and L2-normalises. Two documents about the same subject in
// different words score near zero, because nothing here knows that two
// different tokens can mean the same thing -- which is the entire point of a
// semantic search. It is a cheap lexical similarity with collisions, and it is
// named accurately now.
//
// It is still useful (it is fast, needs no model, and beats nothing at all),
// so it stays; what has changed is that it no longer claims to be something
// else, and the silent failure below is gone.
//
// WHAT WAS SILENTLY BROKEN: cosineSimilarity() returned 0 for any two vectors
// of different lengths. Zero is a legitimate similarity value, so a caller
// mixing vector spaces got "these are unrelated" rather than an error --
// results quietly missing, nothing in a log, no test failing. It now throws.
// See the comment on that function.
//
// WHAT A REAL SEMANTIC SEARCH WOULD NEED, and why it is not in this PR:
// a real embedding model (an API call per entry, plus a cache), somewhere to
// PUT the vectors, and an index to search them. The frozen schema has no model
// for a vector -- no pgvector column, no embeddings table, not even a Json blob
// on KnowledgeEntry to hang one off. Adding one is a migration, and a migration
// is an automatic hand-back for this package. Bolting a per-request embedding
// call onto the existing full-scan loop would be worse than what is here: it
// would be slower, cost money per search, and STILL have no index. So the
// scope judgement is: fix the silent failure, tell the truth in the name and
// the docs, and escalate the vector store as a schema decision.
// ============================================================================

import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
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
 * A hashed term-frequency vector for `text`. NOT an embedding.
 *
 * Tokenises, hashes each token into one of EMBED_DIMENSIONS buckets, applies
 * log(1 + tf), and L2-normalises. Purely lexical: it has no notion that two
 * different words can mean the same thing, and distinct tokens that hash to the
 * same bucket are indistinguishable afterwards.
 *
 * Always returns either exactly EMBED_DIMENSIONS numbers, or an empty array for
 * text with no usable tokens. Callers may rely on that: two non-empty results
 * from this function are always the same length and always comparable.
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
 * Cosine similarity between two vectors of the same length.
 *
 * An empty vector means "no usable tokens", which is a real, expected input
 * (embedText returns [] for e.g. pure punctuation), so it scores 0.
 *
 * T-017: two NON-EMPTY vectors of DIFFERENT lengths used to score 0 as well.
 * That is not a similarity, it is a bug report -- the two vectors are in
 * incompatible spaces and no comparison is meaningful. Returning 0 made that
 * indistinguishable from a genuine "these are unrelated", so a caller mixing
 * vector spaces saw results silently disappear rather than an error. It throws
 * now. Within this module it cannot fire: embedText always returns
 * EMBED_DIMENSIONS numbers or none at all.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;

  if (a.length !== b.length) {
    throw new RangeError(
      `cosineSimilarity: vectors are in incompatible spaces (${a.length} vs ${b.length}). ` +
        'A similarity of 0 would be indistinguishable from "unrelated"; see T-017.'
    );
  }

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

/**
 * The filter bag is parsed wholesale off the query string, so per
 * tenancy-pattern.md sec.2 the scope must NOT be a field on it: it is its own
 * leading argument, and `entityId` is Omit-ed from the request type so a
 * caller cannot supply their own.
 */
export async function search(
  request: Omit<SearchRequest, 'entityId'> & { mode?: 'fulltext' | 'semantic' | 'hybrid' },
  entityId: VerifiedEntityId
): Promise<SearchResponse> {
  const page = request.page || 1;
  const pageSize = request.pageSize || 20;
  const mode = request.mode || 'fulltext';

  // For semantic or hybrid mode, delegate to embedding-based search
  if (mode === 'semantic') {
    try {
      const semanticResult = await termSimilaritySearch(entityId, request.query, {
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
      return search({ ...request, mode: 'fulltext' }, entityId);
    }
  }

  if (mode === 'hybrid') {
    try {
      // Run both fulltext and semantic in parallel
      const [fulltextResponse, semanticResults] = await Promise.all([
        search({ ...request, mode: 'fulltext' }, entityId),
        termSimilaritySearch(entityId, request.query, {
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
      return search({ ...request, mode: 'fulltext' }, entityId);
    }
  }

  // Default: fulltext mode (original behavior)
  // Use AI to expand the search query with synonyms and related terms
  const effectiveQuery = request.query.trim()
    ? await expandQueryWithAI(request.query)
    : request.query;

  const entries = await prisma.knowledgeEntry.findMany({
    where: { entityId },
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

// --- Hashed term-frequency similarity search ---

export interface SemanticSearchResult {
  entry: KnowledgeEntry;
  similarity: number;
}

/**
 * Rank an entity's knowledge entries by hashed term-frequency similarity.
 *
 * T-017 note on the name: this is what used to be called `semanticSearch(userId,
 * ...)`. It was neither. It is lexical, not semantic (see the file header), and
 * its first parameter was named `userId` while being used verbatim as
 * `where: { entityId: userId }` -- so the name told a reader the wrong thing
 * about which id space it was in, on the one parameter that decides which
 * tenant's data is read. It is now `entityId`, and it is a VerifiedEntityId, so
 * a raw value off a request will not compile here.
 */
export async function termSimilaritySearch(
  entityId: VerifiedEntityId,
  query: string,
  options?: { limit?: number; threshold?: number }
): Promise<Array<{ entry: KnowledgeEntry; similarity: number }>> {
  const searchQuery = query || '';
  const limit = options?.limit ?? 10;
  const threshold = options?.threshold ?? 0.1;

  if (!searchQuery.trim()) return [];

  try {
    const queryEmbedding = embedText(searchQuery);
    if (queryEmbedding.length === 0) return [];

    const entries = await prisma.knowledgeEntry.findMany({
      where: { entityId },
    });

    if (entries.length === 0) return [];

    const results: Array<{ entry: KnowledgeEntry; similarity: number }> = [];

    for (const entry of entries) {
      const ke = entry as unknown as KnowledgeEntry;
      const stored = parseStoredData(ke.content);

      const entryText = [stored.title, stored.body].join(' ');
      const entryEmbedding = embedText(entryText);

      if (entryEmbedding.length === 0) continue;

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
 * Keyword search followed by AI re-ranking.
 *
 * This is the only path here that is genuinely semantic, because the model
 * doing the re-ranking is. It can only reorder what the keyword pass already
 * found, so it improves precision and never recall.
 */
export async function aiRerankedSearch(
  request: Omit<SearchRequest, 'entityId'>,
  entityId: VerifiedEntityId
): Promise<SearchResponse> {
  const keywordResults = await search(request, entityId);

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
