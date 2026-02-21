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

  // Search all models in parallel via full-text search
  let allResults: SearchResult[] = [];
  let totalCount = 0;

  try {
    const modelResults = await Promise.all(
      SEARCHABLE_MODELS.map((model) =>
        searchModel({ model, query, filters, limit, offset }),
      ),
    );

    for (const { results, total } of modelResults) {
      allResults = allResults.concat(results);
      totalCount += total;
    }
  } catch {
    // Full-text search failed (e.g. tsquery not configured) — fall back to
    // Prisma-based `contains` search across core tables.
    const fallback = await prismaFallbackSearch(query, filters, limit);
    allResults = fallback.results;
    totalCount = fallback.total;
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

// ---------------------------------------------------------------------------
// Prisma Fallback Search — used when full-text search engine is unavailable
// ---------------------------------------------------------------------------

async function prismaFallbackSearch(
  query: string,
  filters: SearchFilter,
  limit: number,
): Promise<{ results: SearchResult[]; total: number }> {
  const results: SearchResult[] = [];
  const trimmedQuery = query.trim();

  const entityFilter = filters.entityId ? { entityId: filters.entityId } : {};
  const dateFilter: Record<string, unknown> = {};
  if (filters.dateFrom) dateFilter.gte = filters.dateFrom;
  if (filters.dateTo) dateFilter.lte = filters.dateTo;
  const createdAtFilter = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

  // Search tasks
  const [tasks, messages, documents, contacts] = await Promise.all([
    prisma.task.findMany({
      where: {
        ...entityFilter,
        ...createdAtFilter,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.priority ? { priority: filters.priority } : {}),
        OR: [
          { title: { contains: trimmedQuery, mode: 'insensitive' as const } },
          { description: { contains: trimmedQuery, mode: 'insensitive' as const } },
        ],
      },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.message.findMany({
      where: {
        ...entityFilter,
        ...createdAtFilter,
        OR: [
          { subject: { contains: trimmedQuery, mode: 'insensitive' as const } },
          { body: { contains: trimmedQuery, mode: 'insensitive' as const } },
        ],
      },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.document.findMany({
      where: {
        ...entityFilter,
        ...createdAtFilter,
        ...(filters.status ? { status: filters.status } : {}),
        OR: [
          { title: { contains: trimmedQuery, mode: 'insensitive' as const } },
          { content: { contains: trimmedQuery, mode: 'insensitive' as const } },
        ],
      },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.contact.findMany({
      where: {
        ...entityFilter,
        ...createdAtFilter,
        OR: [
          { name: { contains: trimmedQuery, mode: 'insensitive' as const } },
          { email: { contains: trimmedQuery, mode: 'insensitive' as const } },
        ],
      },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  // Map tasks to search results
  for (const task of tasks) {
    const text = `${task.title} ${task.description ?? ''}`;
    const titleMatch = task.title.toLowerCase().includes(trimmedQuery.toLowerCase());
    results.push({
      id: task.id,
      model: 'task',
      title: task.title,
      snippet: text.slice(0, 150),
      rank: titleMatch ? 1.0 : 0.5,
      entityId: task.entityId,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      url: `/entities/${task.entityId}/tasks/${task.id}`,
    });
  }

  // Map messages to search results
  for (const msg of messages) {
    const text = `${msg.subject ?? ''} ${msg.body ?? ''}`;
    const titleMatch = (msg.subject ?? '').toLowerCase().includes(trimmedQuery.toLowerCase());
    results.push({
      id: msg.id,
      model: 'message',
      title: msg.subject ?? 'Message',
      snippet: text.slice(0, 150),
      rank: titleMatch ? 1.0 : 0.5,
      entityId: msg.entityId,
      createdAt: msg.createdAt,
      updatedAt: msg.updatedAt,
      url: `/entities/${msg.entityId}/messages/${msg.id}`,
    });
  }

  // Map documents to search results
  for (const doc of documents) {
    const text = `${doc.title} ${doc.content ?? ''}`;
    const titleMatch = doc.title.toLowerCase().includes(trimmedQuery.toLowerCase());
    results.push({
      id: doc.id,
      model: 'document',
      title: doc.title,
      snippet: text.slice(0, 150),
      rank: titleMatch ? 1.0 : 0.5,
      entityId: doc.entityId,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      url: `/entities/${doc.entityId}/documents/${doc.id}`,
    });
  }

  // Map contacts to search results
  for (const contact of contacts) {
    const text = `${contact.name} ${contact.email ?? ''}`;
    const titleMatch = contact.name.toLowerCase().includes(trimmedQuery.toLowerCase());
    results.push({
      id: contact.id,
      model: 'contact',
      title: contact.name,
      snippet: text.slice(0, 150),
      rank: titleMatch ? 1.0 : 0.5,
      entityId: contact.entityId,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
      url: `/entities/${contact.entityId}/contacts/${contact.id}`,
    });
  }

  return { results, total: results.length };
}
