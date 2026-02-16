import { prisma } from '@/lib/db';

// ---------------------------------------------------------------------------
// Searchable Model Registry
// ---------------------------------------------------------------------------

export interface SearchableModel {
  model: 'task' | 'message' | 'document' | 'knowledgeEntry' | 'contact';
  table: string;
  searchFields: string[];
  titleField: string;
  weights: Record<string, 'A' | 'B' | 'C' | 'D'>;
}

export const SEARCHABLE_MODELS: SearchableModel[] = [
  {
    model: 'task',
    table: '"Task"',
    searchFields: ['title', 'description'],
    titleField: 'title',
    weights: { title: 'A', description: 'B' },
  },
  {
    model: 'message',
    table: '"Message"',
    searchFields: ['subject', 'body'],
    titleField: 'subject',
    weights: { subject: 'A', body: 'B' },
  },
  {
    model: 'document',
    table: '"Document"',
    searchFields: ['title', 'content'],
    titleField: 'title',
    weights: { title: 'A', content: 'C' },
  },
  {
    model: 'knowledgeEntry',
    table: '"KnowledgeEntry"',
    searchFields: ['content'],
    titleField: 'content',
    weights: { content: 'B' },
  },
  {
    model: 'contact',
    table: '"Contact"',
    searchFields: ['name', 'email'],
    titleField: 'name',
    weights: { name: 'A', email: 'C' },
  },
];

// ---------------------------------------------------------------------------
// Search Types
// ---------------------------------------------------------------------------

export interface SearchFilter {
  entityId?: string;
  model?: string;
  dateFrom?: Date;
  dateTo?: Date;
  status?: string;
  priority?: string;
}

export interface SearchResult {
  id: string;
  model: string;
  title: string;
  snippet: string;
  rank: number;
  entityId: string;
  createdAt: Date;
  updatedAt: Date;
  url: string;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  filters: SearchFilter;
  searchTimeMs: number;
}

// ---------------------------------------------------------------------------
// Query Parsing
// ---------------------------------------------------------------------------

const WEIGHT_MAP: Record<string, string> = { A: 'A', B: 'B', C: 'C', D: 'D' };
const MAX_TERMS = 10;

/**
 * Convert user-friendly search syntax into a PostgreSQL tsquery string.
 *
 * - `"exact phrase"` → `'exact <-> phrase'`
 * - `word1 word2`    → `'word1 & word2'` (AND default)
 * - `word1 OR word2` → `'word1 | word2'`
 * - `word*`          → `'word:*'` (prefix)
 */
export function parseSearchQuery(query: string): string {
  if (!query || !query.trim()) return '';

  const trimmed = query.trim();
  // Collect term tokens and OR markers in order
  const tokens: string[] = [];
  let remaining = trimmed;

  // Extract quoted phrases first
  const phraseRegex = /"([^"]+)"/g;
  let match: RegExpExecArray | null;

  while ((match = phraseRegex.exec(remaining)) !== null) {
    const words = match[1]
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(sanitizeTerm)
      .filter(Boolean);
    if (words.length > 0) {
      tokens.push(words.join(' <-> '));
    }
  }

  // Remove quoted phrases from remaining text
  remaining = remaining.replace(phraseRegex, ' ').trim();

  // Tokenize the rest
  const parts = remaining.split(/\s+/).filter(Boolean);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (part.toUpperCase() === 'OR') {
      // Mark that the next connector should be OR
      if (tokens.length > 0) {
        tokens.push('|');
      }
      continue;
    }

    // Prefix matching
    if (part.endsWith('*')) {
      const term = sanitizeTerm(part.slice(0, -1));
      if (term) tokens.push(`${term}:*`);
      continue;
    }

    const term = sanitizeTerm(part);
    if (term) tokens.push(term);
  }

  // Truncate to MAX_TERMS (only counting actual term tokens, not operators)
  const limited: string[] = [];
  let termCount = 0;
  for (const token of tokens) {
    if (token === '|') {
      limited.push(token);
    } else {
      if (termCount >= MAX_TERMS) break;
      limited.push(token);
      termCount++;
    }
  }

  // Join with & (AND) by default, but use | when an OR marker is present
  const result: string[] = [];
  let pendingOr = false;

  for (const token of limited) {
    if (token === '|') {
      pendingOr = true;
      continue;
    }
    if (result.length > 0) {
      result.push(pendingOr ? '|' : '&');
    }
    pendingOr = false;
    result.push(token);
  }

  return result.join(' ');
}

/** Strip characters that are not valid in tsquery terms. */
function sanitizeTerm(term: string): string {
  return term.replace(/[^a-zA-Z0-9_]/g, '').trim();
}

// ---------------------------------------------------------------------------
// Snippet Generation
// ---------------------------------------------------------------------------

const DEFAULT_SNIPPET_LENGTH = 150;

/**
 * Generate a text snippet with `<mark>` tags around matching terms.
 */
export function generateSnippet(
  text: string,
  query: string,
  maxLength: number = DEFAULT_SNIPPET_LENGTH,
): string {
  if (!text || !query) return text?.slice(0, maxLength) ?? '';

  // Extract plain words from the query (no operators)
  const words = query
    .replace(/["*]/g, '')
    .split(/\s+/)
    .filter((w) => w && !['OR', 'AND', '|', '&'].includes(w.toUpperCase()))
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean);

  if (words.length === 0) return text.slice(0, maxLength);

  const pattern = new RegExp(`(${words.map(escapeRegex).join('|')})`, 'gi');

  // Find the first match position to center the snippet
  const firstMatch = text.search(pattern);
  let start = 0;
  if (firstMatch > -1) {
    start = Math.max(0, firstMatch - Math.floor(maxLength / 3));
  }

  let snippet = text.slice(start, start + maxLength);

  // Add ellipsis if we trimmed
  if (start > 0) snippet = '...' + snippet;
  if (start + maxLength < text.length) snippet = snippet + '...';

  // Highlight matches
  snippet = snippet.replace(pattern, '<mark>$1</mark>');

  return snippet;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// URL Builder
// ---------------------------------------------------------------------------

const MODEL_URL_MAP: Record<string, string> = {
  task: '/tasks',
  message: '/messages',
  document: '/documents',
  knowledgeEntry: '/knowledge',
  contact: '/contacts',
};

export function buildResultUrl(model: string, id: string, entityId: string): string {
  const base = MODEL_URL_MAP[model] ?? `/${model}s`;
  return `/entities/${entityId}${base}/${id}`;
}

// ---------------------------------------------------------------------------
// SQL Query Builder
// ---------------------------------------------------------------------------

export function buildSearchQuery(params: {
  model: SearchableModel;
  query: string;
  filters: SearchFilter;
  limit: number;
  offset: number;
}): { sql: string; params: unknown[] } {
  const { model, query, filters, limit, offset } = params;
  const tsquery = parseSearchQuery(query);

  if (!tsquery) {
    return { sql: '', params: [] };
  }

  // Build the tsvector expression with weights
  const tsvectorParts = model.searchFields.map((field) => {
    const weight = WEIGHT_MAP[model.weights[field]] ?? 'D';
    return `setweight(to_tsvector('english', COALESCE(${field}, '')), '${weight}')`;
  });
  const tsvector = tsvectorParts.join(' || ');

  const conditions: string[] = [];
  const sqlParams: unknown[] = [];
  let paramIndex = 1;

  // tsquery condition
  conditions.push(`(${tsvector}) @@ to_tsquery('english', $${paramIndex})`);
  sqlParams.push(tsquery);
  paramIndex++;

  // Entity filter
  if (filters.entityId) {
    conditions.push(`"entityId" = $${paramIndex}`);
    sqlParams.push(filters.entityId);
    paramIndex++;
  }

  // Date range
  if (filters.dateFrom) {
    conditions.push(`"createdAt" >= $${paramIndex}`);
    sqlParams.push(filters.dateFrom);
    paramIndex++;
  }
  if (filters.dateTo) {
    conditions.push(`"createdAt" <= $${paramIndex}`);
    sqlParams.push(filters.dateTo);
    paramIndex++;
  }

  // Status (for models that have it)
  if (filters.status && ['task', 'document'].includes(model.model)) {
    conditions.push(`"status" = $${paramIndex}`);
    sqlParams.push(filters.status);
    paramIndex++;
  }

  // Priority (tasks only)
  if (filters.priority && model.model === 'task') {
    conditions.push(`"priority" = $${paramIndex}`);
    sqlParams.push(filters.priority);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');

  // Title field for display
  const titleExpr =
    model.titleField === 'content'
      ? `LEFT(content, 100)`
      : `COALESCE(${model.titleField}, '')`;

  const sql = `
    SELECT
      id,
      '${model.model}' AS model,
      ${titleExpr} AS title,
      ts_rank_cd(
        ${tsvector},
        to_tsquery('english', $1),
        32
      ) AS rank,
      "entityId",
      "createdAt",
      "updatedAt",
      ${model.searchFields.map((f) => `COALESCE(${f}, '') AS "${f}"`).join(', ')}
    FROM ${model.table}
    WHERE ${whereClause}
    ORDER BY rank DESC, "updatedAt" DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  sqlParams.push(limit, offset);

  return { sql, params: sqlParams };
}

function buildCountQuery(params: {
  model: SearchableModel;
  query: string;
  filters: SearchFilter;
}): { sql: string; params: unknown[] } {
  const { model, query, filters } = params;
  const tsquery = parseSearchQuery(query);

  if (!tsquery) {
    return { sql: '', params: [] };
  }

  const tsvectorParts = model.searchFields.map((field) => {
    const weight = WEIGHT_MAP[model.weights[field]] ?? 'D';
    return `setweight(to_tsvector('english', COALESCE(${field}, '')), '${weight}')`;
  });
  const tsvector = tsvectorParts.join(' || ');

  const conditions: string[] = [];
  const sqlParams: unknown[] = [];
  let paramIndex = 1;

  conditions.push(`(${tsvector}) @@ to_tsquery('english', $${paramIndex})`);
  sqlParams.push(tsquery);
  paramIndex++;

  if (filters.entityId) {
    conditions.push(`"entityId" = $${paramIndex}`);
    sqlParams.push(filters.entityId);
    paramIndex++;
  }
  if (filters.dateFrom) {
    conditions.push(`"createdAt" >= $${paramIndex}`);
    sqlParams.push(filters.dateFrom);
    paramIndex++;
  }
  if (filters.dateTo) {
    conditions.push(`"createdAt" <= $${paramIndex}`);
    sqlParams.push(filters.dateTo);
    paramIndex++;
  }
  if (filters.status && ['task', 'document'].includes(model.model)) {
    conditions.push(`"status" = $${paramIndex}`);
    sqlParams.push(filters.status);
    paramIndex++;
  }
  if (filters.priority && model.model === 'task') {
    conditions.push(`"priority" = $${paramIndex}`);
    sqlParams.push(filters.priority);
    paramIndex++;
  }

  const sql = `SELECT COUNT(*)::int AS count FROM ${model.table} WHERE ${conditions.join(' AND ')}`;
  return { sql, params: sqlParams };
}

// ---------------------------------------------------------------------------
// Single-Model Search
// ---------------------------------------------------------------------------

export async function searchModel(params: {
  model: SearchableModel;
  query: string;
  filters: SearchFilter;
  limit?: number;
  offset?: number;
}): Promise<{ results: SearchResult[]; total: number }> {
  const { model, query, filters, limit = 20, offset = 0 } = params;

  const built = buildSearchQuery({ model, query, filters, limit, offset });
  if (!built.sql) {
    return { results: [], total: 0 };
  }

  const countBuilt = buildCountQuery({ model, query, filters });

  const [rows, countRows] = await Promise.all([
    prisma.$queryRawUnsafe(built.sql, ...built.params) as Promise<Record<string, unknown>[]>,
    prisma.$queryRawUnsafe(countBuilt.sql, ...countBuilt.params) as Promise<{ count: number }[]>,
  ]);

  const total = countRows[0]?.count ?? 0;

  // Combine all text fields for snippet generation
  const results: SearchResult[] = rows.map((row: Record<string, unknown>) => {
    const combinedText = model.searchFields
      .map((f) => (row[f] as string) ?? '')
      .join(' ');

    return {
      id: row.id as string,
      model: model.model,
      title: (row.title as string) || model.model,
      snippet: generateSnippet(combinedText, query),
      rank: Number(row.rank) || 0,
      entityId: row.entityId as string,
      createdAt: new Date(row.createdAt as string),
      updatedAt: new Date(row.updatedAt as string),
      url: buildResultUrl(model.model, row.id as string, row.entityId as string),
    };
  });

  return { results, total };
}
