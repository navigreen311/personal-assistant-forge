import { prisma } from '@/lib/db';
import {
  SEARCHABLE_MODELS,
  searchModel,
  type SearchFilter,
  type SearchResponse,
  type SearchResult,
} from './full-text';

export type { SearchResult, SearchResponse, SearchFilter } from './full-text';

// ---------------------------------------------------------------------------
// Unified Search — searches all models in parallel, merges by rank
// ---------------------------------------------------------------------------

export async function search(params: {
  query: string;
  filters?: SearchFilter;
  limit?: number;
  offset?: number;
}): Promise<SearchResponse> {
  const { query, filters = {}, limit = 20, offset = 0 } = params;
  const startTime = Date.now();

  if (!query || query.trim().length < 2) {
    return {
      results: [],
      total: 0,
      query,
      filters,
      searchTimeMs: Date.now() - startTime,
    };
  }

  // If a specific model filter is provided, delegate to searchByType
  if (filters.model) {
    return searchByType({
      query,
      type: filters.model as 'task' | 'message' | 'document' | 'knowledgeEntry' | 'contact',
      filters,
      limit,
      offset,
    });
  }

  // Search all models in parallel
  const modelResults = await Promise.all(
    SEARCHABLE_MODELS.map((model) =>
      searchModel({ model, query, filters, limit, offset }),
    ),
  );

  // Merge all results and re-rank
  let allResults: SearchResult[] = [];
  let totalCount = 0;

  for (const { results, total } of modelResults) {
    allResults = allResults.concat(results);
    totalCount += total;
  }

  // Sort by rank descending (interleave by relevance, not by model)
  allResults.sort((a, b) => b.rank - a.rank);

  // Apply unified pagination on the merged set
  const paginatedResults = allResults.slice(0, limit);

  return {
    results: paginatedResults,
    total: totalCount,
    query,
    filters,
    searchTimeMs: Date.now() - startTime,
  };
}

// ---------------------------------------------------------------------------
// Search by Type — single model
// ---------------------------------------------------------------------------

export async function searchByType(params: {
  query: string;
  type: 'task' | 'message' | 'document' | 'knowledgeEntry' | 'contact';
  filters?: SearchFilter;
  limit?: number;
  offset?: number;
}): Promise<SearchResponse> {
  const { query, type, filters = {}, limit = 20, offset = 0 } = params;
  const startTime = Date.now();

  if (!query || query.trim().length < 2) {
    return {
      results: [],
      total: 0,
      query,
      filters,
      searchTimeMs: Date.now() - startTime,
    };
  }

  const model = SEARCHABLE_MODELS.find((m) => m.model === type);
  if (!model) {
    return {
      results: [],
      total: 0,
      query,
      filters,
      searchTimeMs: Date.now() - startTime,
    };
  }

  const { results, total } = await searchModel({
    model,
    query,
    filters,
    limit,
    offset,
  });

  return {
    results,
    total,
    query,
    filters,
    searchTimeMs: Date.now() - startTime,
  };
}

// ---------------------------------------------------------------------------
// Search Suggestions (autocomplete)
// ---------------------------------------------------------------------------

export async function getSearchSuggestions(params: {
  query: string;
  entityId: string;
  limit?: number;
}): Promise<string[]> {
  const { query, entityId, limit = 5 } = params;

  if (!query || query.trim().length < 2) {
    return [];
  }

  const pattern = `%${query.trim()}%`;

  // Query titles from the most common models for fast autocomplete via ILIKE
  const [tasks, documents, contacts] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT DISTINCT title FROM "Task"
       WHERE "entityId" = $1 AND title ILIKE $2
       ORDER BY "updatedAt" DESC LIMIT $3`,
      entityId,
      pattern,
      limit,
    ) as Promise<{ title: string }[]>,
    prisma.$queryRawUnsafe(
      `SELECT DISTINCT title FROM "Document"
       WHERE "entityId" = $1 AND title ILIKE $2
       ORDER BY "updatedAt" DESC LIMIT $3`,
      entityId,
      pattern,
      limit,
    ) as Promise<{ title: string }[]>,
    prisma.$queryRawUnsafe(
      `SELECT DISTINCT name FROM "Contact"
       WHERE "entityId" = $1 AND name ILIKE $2
       ORDER BY "updatedAt" DESC LIMIT $3`,
      entityId,
      pattern,
      limit,
    ) as Promise<{ name: string }[]>,
  ]);

  const suggestions = new Set<string>();
  for (const row of tasks) suggestions.add(row.title);
  for (const row of documents) suggestions.add(row.title);
  for (const row of contacts) suggestions.add(row.name);

  return Array.from(suggestions).slice(0, limit);
}
