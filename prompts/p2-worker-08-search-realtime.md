# Worker 08: Search Infrastructure & Real-time Updates

## Branch: ai-feature/p2-w08-search-realtime

Create and check out the branch `ai-feature/p2-w08-search-realtime` from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside these directories:

- `src/lib/search/` (all files -- create this directory)
- `src/lib/realtime/` (all files -- create this directory)
- `src/app/api/search/route.ts`
- `src/app/api/events/stream/route.ts`
- `tests/unit/search/` (all test files within)

**DO NOT modify these files:**
- `prisma/schema.prisma` -- schema is owned by another worker
- `jest.config.ts` -- shared config, do not modify
- `package.json` -- shared config, do not modify

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

1. **`prisma/schema.prisma`** -- Understand all models that will be searched: Task (title, description), Message (subject, body), Document (title, description), KnowledgeEntry (title, content), Contact (firstName, lastName, company). Note existing indexes.
2. **`src/shared/types/index.ts`** -- All TypeScript type definitions. Search results must reference these types.
3. **`src/shared/utils/api-response.ts`** -- Use `success()`, `error()`, `paginated()` helpers for API responses.
4. **`src/lib/db/index.ts`** -- Import `prisma` from here for all database operations.
5. **`src/lib/db/helpers.ts`** -- Use `buildPaginationArgs` and `paginateQuery` for paginated search results.
6. **`src/shared/middleware/auth.ts`** -- Import `withAuth` for protecting API routes.
7. **`package.json`** -- Check available dependencies. Do NOT add new dependencies.
8. **`tsconfig.json`** -- Path alias `@/*` maps to `./src/*`.

## Requirements

### 1. Full-Text Search (`src/lib/search/full-text.ts`)

Create a PostgreSQL full-text search implementation using Prisma raw queries with `tsvector`:

```typescript
// src/lib/search/full-text.ts

export interface SearchableModel {
  model: 'task' | 'message' | 'document' | 'knowledgeEntry' | 'contact';
  table: string;         // PostgreSQL table name (e.g., "Task", "Message")
  searchFields: string[]; // columns to search (e.g., ["title", "description"])
  titleField: string;     // field to use as result title
  weights: Record<string, 'A' | 'B' | 'C' | 'D'>; // tsvector weight per field
}

// Registry of searchable models with their configuration
export const SEARCHABLE_MODELS: SearchableModel[];

export interface SearchFilter {
  entityId?: string;
  model?: string;          // filter to a specific model
  dateFrom?: Date;
  dateTo?: Date;
  status?: string;
  priority?: string;
}

export interface SearchResult {
  id: string;
  model: string;           // which model the result came from
  title: string;           // display title
  snippet: string;         // highlighted text snippet with match context
  rank: number;            // relevance score from ts_rank
  entityId: string;
  createdAt: Date;
  updatedAt: Date;
  url: string;             // constructed URL path for the result
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  filters: SearchFilter;
  searchTimeMs: number;
}

// Build a PostgreSQL tsvector search query for a single model
export function buildSearchQuery(params: {
  model: SearchableModel;
  query: string;
  filters: SearchFilter;
  limit: number;
  offset: number;
}): { sql: string; params: unknown[] };

// Parse a user search query into a tsquery-compatible string
// Handles: quoted phrases, OR/AND operators, prefix matching (word*)
export function parseSearchQuery(query: string): string;

// Generate a text snippet with highlighted matches
// Returns surrounding context with <mark> tags around matches
export function generateSnippet(text: string, query: string, maxLength?: number): string;

// Build a URL path for a search result based on its model and ID
export function buildResultUrl(model: string, id: string, entityId: string): string;

// Execute full-text search against a single model
export async function searchModel(params: {
  model: SearchableModel;
  query: string;
  filters: SearchFilter;
  limit?: number;
  offset?: number;
}): Promise<{ results: SearchResult[]; total: number }>;
```

**Full-Text Search Implementation Guidelines:**
- Use PostgreSQL's `to_tsvector('english', ...)` and `to_tsquery('english', ...)` for search.
- Use `ts_rank_cd()` for relevance scoring with weights: A=1.0, B=0.4, C=0.2, D=0.1.
- Concatenate multiple search fields using `||` with appropriate weights via `setweight()`.
- Use `Prisma.$queryRawUnsafe()` or `Prisma.$queryRaw` for raw SQL queries.
- Sanitize the search query to prevent SQL injection -- parameterize all user input.
- `parseSearchQuery` should convert user-friendly search syntax to PostgreSQL tsquery format:
  - `"exact phrase"` becomes `'exact <-> phrase'`
  - `word1 word2` becomes `'word1 & word2'` (AND by default)
  - `word1 OR word2` becomes `'word1 | word2'`
  - `word*` becomes `'word:*'` (prefix matching)
- `generateSnippet` should extract ~150 characters of context around the first match and wrap matching terms in `<mark>` tags.
- Handle edge cases: empty query (return empty results), very long queries (truncate to first 10 terms), special characters in query.

### 2. Unified Search (`src/lib/search/index.ts`)

Create a unified search function that searches across all models and merges results:

```typescript
// src/lib/search/index.ts

// Search across all searchable models and return unified, ranked results
export async function search(params: {
  query: string;
  filters?: SearchFilter;
  limit?: number;     // default 20
  offset?: number;    // default 0
}): Promise<SearchResponse>;

// Search a specific model only
export async function searchByType(params: {
  query: string;
  type: 'task' | 'message' | 'document' | 'knowledgeEntry' | 'contact';
  filters?: SearchFilter;
  limit?: number;
  offset?: number;
}): Promise<SearchResponse>;

// Get search suggestions (autocomplete) based on partial query
export async function getSearchSuggestions(params: {
  query: string;       // partial query (at least 2 characters)
  entityId: string;
  limit?: number;      // default 5
}): Promise<string[]>;

// Re-export types for convenience
export type { SearchResult, SearchResponse, SearchFilter } from './full-text';
```

**Unified Search Guidelines:**
- `search` should query all models in parallel using `Promise.all`, then merge and re-rank results by relevance score.
- Results from different models should be interleaved by rank, not grouped by model.
- Apply a small boost to results matching in the title field (weight A) vs body/content fields.
- If `filters.model` is specified, only search that specific model.
- `getSearchSuggestions` should query the most recently accessed/created items matching the partial query and return their titles as suggestions. Use a simple LIKE/ILIKE query rather than full-text search for speed.
- Total count should be the sum of totals across all models (when doing unified search).
- Track search execution time using `performance.now()` or `Date.now()` and include in response.

### 3. Server-Sent Events Helper (`src/lib/realtime/sse.ts`)

Create a Server-Sent Events infrastructure:

```typescript
// src/lib/realtime/sse.ts

export interface SSEClient {
  id: string;
  userId: string;
  entityId: string;
  controller: ReadableStreamDefaultController;
  connectedAt: Date;
  lastEventId?: string;
}

export interface SSEMessage {
  id?: string;
  event?: string;     // event type (e.g., "task.updated")
  data: string;       // JSON string
  retry?: number;     // reconnection time in ms
}

// Encode a message into SSE format (id: ...\nevent: ...\ndata: ...\n\n)
export function encodeSSEMessage(message: SSEMessage): string;

// Create a new SSE stream for a client connection
export function createSSEStream(params: {
  userId: string;
  entityId: string;
  lastEventId?: string;
}): { stream: ReadableStream; clientId: string };

// Connection manager -- singleton that tracks all active connections
export class ConnectionManager {
  // Add a new client connection
  addClient(client: SSEClient): void;

  // Remove a client connection (on disconnect)
  removeClient(clientId: string): void;

  // Get all connected clients for a specific entity
  getEntityClients(entityId: string): SSEClient[];

  // Get all connected clients for a specific user
  getUserClients(userId: string): SSEClient[];

  // Send a message to a specific client
  sendToClient(clientId: string, message: SSEMessage): boolean;

  // Broadcast a message to all clients watching a specific entity
  broadcastToEntity(entityId: string, message: SSEMessage): number;

  // Broadcast a message to a specific user (all their connections)
  broadcastToUser(userId: string, message: SSEMessage): number;

  // Broadcast to all connected clients
  broadcastToAll(message: SSEMessage): number;

  // Get current connection count
  getConnectionCount(): number;

  // Send a heartbeat (keep-alive) to all clients
  sendHeartbeat(): void;

  // Clean up stale connections
  cleanup(): void;
}

// Singleton instance
export const connectionManager: ConnectionManager;
```

**SSE Implementation Guidelines:**
- Use the Web Streams API (`ReadableStream`) for SSE streams, compatible with Next.js App Router.
- `encodeSSEMessage` must produce spec-compliant SSE format: each field on its own line, terminated by a blank line (`\n\n`).
- Multi-line data values must be split with `data: ` prefix on each line.
- The `ConnectionManager` should use a Map to store clients by ID.
- `createSSEStream` should register the client with the `ConnectionManager` and set up cleanup on stream cancellation.
- Include a heartbeat mechanism that sends a comment line (`: heartbeat\n\n`) every 30 seconds to keep connections alive.
- `cleanup` should remove clients whose controllers have been closed.
- Handle the case where sending to a closed controller throws -- catch the error and remove the client.

### 4. Event Types (`src/lib/realtime/events.ts`)

Define all real-time event types and helper functions:

```typescript
// src/lib/realtime/events.ts

export type RealtimeEventType =
  // Task events
  | 'task.created'
  | 'task.updated'
  | 'task.deleted'
  | 'task.status_changed'
  | 'task.assigned'
  // Message events
  | 'message.received'
  | 'message.sent'
  | 'message.read'
  // Calendar events
  | 'calendar.reminder'
  | 'calendar.event_starting'
  | 'calendar.event_created'
  | 'calendar.event_updated'
  // Workflow events
  | 'workflow.started'
  | 'workflow.completed'
  | 'workflow.failed'
  | 'workflow.step_completed'
  // Alert events
  | 'alert.triggered'
  | 'alert.resolved'
  // System events
  | 'system.notification'
  | 'system.maintenance';

export interface RealtimeEvent<TPayload = Record<string, unknown>> {
  id: string;           // unique event ID (UUID)
  type: RealtimeEventType;
  entityId: string;
  userId?: string;      // target user (if user-specific)
  payload: TPayload;
  timestamp: Date;
  source: string;       // which module emitted the event
}

// Event payload types for type safety
export interface TaskEventPayload {
  taskId: string;
  title: string;
  status?: string;
  priority?: string;
  assigneeId?: string;
  previousStatus?: string;
}

export interface MessageEventPayload {
  messageId: string;
  threadId?: string;
  from: string;
  subject?: string;
  channel: string;
  triageScore?: number;
}

export interface CalendarEventPayload {
  eventId: string;
  title: string;
  startTime: string;
  endTime?: string;
  minutesUntil?: number;
  location?: string;
}

export interface WorkflowEventPayload {
  workflowId: string;
  workflowName: string;
  stepIndex?: number;
  stepName?: string;
  error?: string;
}

export interface AlertEventPayload {
  alertId: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  actionUrl?: string;
}

// Create a typed event
export function createEvent<TPayload>(params: {
  type: RealtimeEventType;
  entityId: string;
  userId?: string;
  payload: TPayload;
  source: string;
}): RealtimeEvent<TPayload>;

// Emit an event to all relevant clients via the ConnectionManager
export async function emitEvent(event: RealtimeEvent): Promise<number>;

// Emit an event to a specific user
export async function emitToUser(userId: string, event: RealtimeEvent): Promise<number>;

// Emit an event to all clients watching a specific entity
export async function emitToEntity(entityId: string, event: RealtimeEvent): Promise<number>;

// Event history buffer (in-memory, last N events per entity)
export function getRecentEvents(entityId: string, limit?: number): RealtimeEvent[];

// Register an event listener (for server-side consumers)
export type EventListener = (event: RealtimeEvent) => void | Promise<void>;
export function addEventListener(type: RealtimeEventType | '*', listener: EventListener): () => void;

// Remove all listeners (for cleanup/testing)
export function removeAllListeners(): void;
```

**Event Implementation Guidelines:**
- Use `crypto.randomUUID()` (or a UUID library if available) for event IDs.
- `emitEvent` should serialize the event payload to JSON and send it via `connectionManager.broadcastToEntity`.
- If the event has a `userId`, also send via `broadcastToUser` for targeted delivery.
- Maintain an in-memory circular buffer (last 100 events per entity) for `getRecentEvents` -- this allows clients to catch up after reconnection using `lastEventId`.
- `addEventListener` provides a pub/sub mechanism for server-side modules to react to events (e.g., a workflow engine listening for `task.status_changed`).
- Return a cleanup function from `addEventListener` for easy unsubscription.

### 5. Search API Route (`src/app/api/search/route.ts`)

```typescript
// GET /api/search?q=search+terms&type=task&entityId=xxx&limit=20&offset=0&dateFrom=2024-01-01&dateTo=2024-12-31
// Protected: requires auth
//
// Query Parameters:
//   q (required): search query string, minimum 2 characters
//   type (optional): filter to specific model type (task, message, document, knowledgeEntry, contact)
//   entityId (optional): filter to specific entity (defaults to user's active entity)
//   limit (optional): max results, default 20, max 100
//   offset (optional): pagination offset, default 0
//   dateFrom (optional): ISO date string for date range filter
//   dateTo (optional): ISO date string for date range filter
//
// Response: ApiResponse<SearchResponse> with paginated results
//
// Steps:
// 1. Authenticate with withAuth
// 2. Parse and validate query parameters
// 3. Default entityId to session's activeEntityId if not provided
// 4. Execute search (unified or by type based on 'type' param)
// 5. Return paginated results with search metadata

// GET /api/search/suggestions?q=par&entityId=xxx
// Protected: requires auth
// Returns: ApiResponse<{ suggestions: string[] }>
// For autocomplete functionality
```

### 6. SSE Stream Route (`src/app/api/events/stream/route.ts`)

```typescript
// GET /api/events/stream
// Protected: requires auth
// Headers: Accept: text/event-stream
// Query Parameters:
//   entityId (optional): which entity to watch (defaults to active entity)
//
// Response: SSE stream (Content-Type: text/event-stream)
//
// Steps:
// 1. Authenticate with withAuth (extract userId, entityId from session)
// 2. Check for Last-Event-ID header (for reconnection)
// 3. Create SSE stream via createSSEStream
// 4. If Last-Event-ID provided, replay missed events from getRecentEvents
// 5. Set response headers: Content-Type: text/event-stream, Cache-Control: no-cache, Connection: keep-alive
// 6. Return the stream as the response
//
// Important: This route must use Next.js streaming response pattern:
// return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', ... } })
```

## Acceptance Criteria

1. Full-text search works across tasks, messages, documents, knowledge entries, and contacts.
2. Search queries support quoted phrases, AND/OR operators, and prefix matching.
3. Results are ranked by relevance using PostgreSQL `ts_rank_cd` with weighted fields.
4. Search snippets highlight matching terms with `<mark>` tags.
5. Unified search merges results from all models and re-ranks by relevance.
6. Search suggestions return relevant autocomplete results for partial queries.
7. Search API correctly handles all query parameters with proper validation.
8. SSE stream produces spec-compliant Server-Sent Events format.
9. `ConnectionManager` correctly tracks, broadcasts to, and cleans up client connections.
10. All event types are defined and `createEvent` produces properly structured events.
11. `emitEvent` delivers events to the correct entity and user clients.
12. Event history buffer supports reconnection catch-up via `lastEventId`.
13. SSE API route returns a streaming response with correct headers.
14. All files compile without TypeScript errors (`npx tsc --noEmit`).
15. All unit tests pass (`npx jest tests/unit/search/`).
16. No modifications to `prisma/schema.prisma`, `jest.config.ts`, or `package.json`.

## Implementation Steps

1. **Read context files**: Read `prisma/schema.prisma`, `src/shared/types/index.ts`, `src/shared/utils/api-response.ts`, `src/lib/db/index.ts`, `src/lib/db/helpers.ts`, `src/shared/middleware/auth.ts`, `package.json`, `tsconfig.json`.
2. **Create branch**: `git checkout -b ai-feature/p2-w08-search-realtime`
3. **Create `src/lib/search/full-text.ts`**: Implement searchable model registry, query builder, query parser, snippet generator, and single-model search.
4. **Create `src/lib/search/index.ts`**: Implement unified search, search-by-type, and search suggestions.
5. **Create `src/lib/realtime/sse.ts`**: Implement SSE encoder, stream creator, and ConnectionManager.
6. **Create `src/lib/realtime/events.ts`**: Implement event types, event creation, emission, history buffer, and pub/sub listeners.
7. **Create `src/app/api/search/route.ts`**: Implement search API with query parameter parsing and validation.
8. **Create `src/app/api/events/stream/route.ts`**: Implement SSE streaming endpoint with auth and reconnection support.
9. **Create tests**: Write unit tests for search query building, result ranking, SSE encoding, and event handling.
10. **Type-check**: Run `npx tsc --noEmit` to verify no TypeScript errors.
11. **Run tests**: Execute `npx jest tests/unit/search/` and verify all pass.
12. **Commit** with conventional commit messages.

## Tests Required

Create the following test files in `tests/unit/search/`:

### `tests/unit/search/full-text.test.ts`
```typescript
describe('Full-Text Search', () => {
  describe('parseSearchQuery', () => {
    it('should convert simple words to AND query');
    it('should handle quoted phrases with proximity operator');
    it('should handle OR operator');
    it('should handle prefix matching with asterisk');
    it('should handle mixed operators');
    it('should sanitize special characters');
    it('should handle empty query');
    it('should truncate very long queries to 10 terms');
  });

  describe('buildSearchQuery', () => {
    it('should build valid SQL for task model');
    it('should include entity filter when provided');
    it('should include date range filters');
    it('should apply limit and offset');
    it('should parameterize user input (no SQL injection)');
  });

  describe('generateSnippet', () => {
    it('should highlight matching terms with <mark> tags');
    it('should extract context around first match');
    it('should handle multiple matches');
    it('should respect maxLength');
    it('should handle no matches gracefully');
  });

  describe('buildResultUrl', () => {
    it('should build correct URL for task results');
    it('should build correct URL for message results');
    it('should build correct URL for document results');
    it('should build correct URL for contact results');
  });
});
```

### `tests/unit/search/unified.test.ts`
```typescript
describe('Unified Search', () => {
  // Mock prisma.$queryRaw for all search tests

  describe('search', () => {
    it('should search across all models when no type filter');
    it('should filter to specific model when type is provided');
    it('should merge and rank results by relevance score');
    it('should apply entity filter from session');
    it('should return search timing metadata');
    it('should handle empty results');
  });

  describe('searchByType', () => {
    it('should search only the specified model');
    it('should apply all filters');
  });

  describe('getSearchSuggestions', () => {
    it('should return suggestions for partial query');
    it('should limit results to specified count');
    it('should require minimum 2 character query');
  });
});
```

### `tests/unit/search/sse.test.ts`
```typescript
describe('Server-Sent Events', () => {
  describe('encodeSSEMessage', () => {
    it('should encode message with all fields');
    it('should encode message with data only');
    it('should handle multi-line data');
    it('should include retry field when specified');
    it('should terminate with double newline');
  });

  describe('ConnectionManager', () => {
    it('should add and track client connections');
    it('should remove client on disconnect');
    it('should broadcast to all entity clients');
    it('should broadcast to specific user clients');
    it('should return correct connection count');
    it('should handle sending to closed controllers gracefully');
    it('should clean up stale connections');
  });
});
```

### `tests/unit/search/events.test.ts`
```typescript
describe('Realtime Events', () => {
  describe('createEvent', () => {
    it('should create event with unique ID');
    it('should include timestamp');
    it('should include all provided fields');
  });

  describe('emitEvent', () => {
    it('should broadcast to entity clients');
    it('should also send to user if userId specified');
    it('should store event in history buffer');
  });

  describe('getRecentEvents', () => {
    it('should return recent events for entity');
    it('should respect limit parameter');
    it('should return events in chronological order');
  });

  describe('addEventListener / removeAllListeners', () => {
    it('should call listener when matching event is emitted');
    it('should not call listener for non-matching event types');
    it('should support wildcard listener');
    it('should unsubscribe when cleanup function is called');
    it('should remove all listeners on removeAllListeners');
  });
});
```

Mock the Prisma client and ConnectionManager internals in tests. Do NOT require a live database or active SSE connections.

## Commit Strategy

Make atomic commits in this order:

1. `feat(search): add PostgreSQL full-text search with tsvector, query parsing, and snippet generation`
   - Files: `src/lib/search/full-text.ts`
2. `feat(search): add unified cross-model search with suggestions and ranking`
   - Files: `src/lib/search/index.ts`
3. `feat(realtime): add SSE encoder, stream creator, and connection manager`
   - Files: `src/lib/realtime/sse.ts`
4. `feat(realtime): add event types, emission, history buffer, and pub/sub listeners`
   - Files: `src/lib/realtime/events.ts`
5. `feat(api): add search API route with query params and suggestions endpoint`
   - Files: `src/app/api/search/route.ts`
6. `feat(api): add SSE event stream route with auth and reconnection support`
   - Files: `src/app/api/events/stream/route.ts`
7. `test(search): add unit tests for full-text search, unified search, SSE, and events`
   - Files: `tests/unit/search/*.test.ts`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
