# Worker 09: Knowledge Management System (M7)

## Branch: ai-feature/w09-knowledge

## Owned Paths (ONLY modify these)

You MUST only create or modify files within these directories. Do NOT touch anything outside them.

```
src/modules/knowledge/services/            # Business logic services
src/modules/knowledge/types/               # Module-specific TypeScript types
src/modules/knowledge/components/          # React components for knowledge UI
src/modules/knowledge/api/                 # Module-internal API helpers / validation
src/app/api/knowledge/                     # Next.js API routes for knowledge
src/app/(dashboard)/knowledge/             # Dashboard pages for knowledge management
tests/unit/knowledge/                      # All unit tests for this worker
```

## Context (read these first, do NOT modify)

Read and internalize these files before writing any code. They define the shared contracts.

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project-wide dev process, commit conventions, done criteria |
| `src/shared/types/index.ts` | Immutable shared types: `KnowledgeEntry`, `Document`, `DocumentType`, `Citation`, `MemoryEntry`, `MemoryType`, `ApiResponse`, `ApiError`, `ApiMeta` |
| `prisma/schema.prisma` | Database schema: `KnowledgeEntry` model (id, content, tags, entityId, source, linkedEntities), `Document` model, `MemoryEntry` model |
| `src/shared/utils/api-response.ts` | API helpers: `success<T>()`, `error()`, `paginated<T>()` |
| `src/lib/db/index.ts` | Prisma client singleton: `import { prisma } from '@/lib/db'` |
| `package.json` | Stack: Next.js 16, React 19, Prisma 7, Zod 4, date-fns 4, Jest 30, ts-jest |
| `tsconfig.json` | Path aliases: `@/` maps to `src/` |

## Requirements

### 1. Universal Capture Service

**Service file:** `src/modules/knowledge/services/capture-service.ts`

Build a service that ingests various content types into a unified knowledge store.

```typescript
export interface CaptureRequest {
  entityId: string;
  type: CaptureType;
  content: string;
  title?: string;
  source: string;                // Where this came from: "manual", "email", "voice-memo", "web-clip", etc.
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export type CaptureType = 'NOTE' | 'BOOKMARK' | 'VOICE_MEMO' | 'CODE_SNIPPET' | 'QUOTE' | 'ARTICLE' | 'IMAGE_NOTE';

export interface CapturedEntry {
  id: string;
  entityId: string;
  type: CaptureType;
  title: string;
  content: string;
  source: string;
  tags: string[];
  autoTags: string[];            // AI-suggested tags
  linkedEntries: string[];       // Auto-linked related entries
  createdAt: Date;
  updatedAt: Date;
}
```

Implement:
- `capture(request: CaptureRequest): Promise<CapturedEntry>` -- Ingest content, auto-generate title if missing, auto-tag, auto-link
- `batchCapture(requests: CaptureRequest[]): Promise<CapturedEntry[]>` -- Bulk ingestion
- `generateAutoTags(content: string): string[]` -- Extract key topics/entities from content (keyword extraction: split by common delimiters, filter stop words, return top N unique terms)
- `generateTitle(content: string, type: CaptureType): string` -- Create concise title from content (first 60 chars of first sentence or meaningful snippet)

### 2. Semantic Search Service

**Service file:** `src/modules/knowledge/services/search-service.ts`

```typescript
export interface SearchRequest {
  entityId: string;
  query: string;
  filters?: SearchFilters;
  page?: number;
  pageSize?: number;
}

export interface SearchFilters {
  types?: CaptureType[];
  tags?: string[];
  dateRange?: { start: Date; end: Date };
  source?: string;
}

export interface SearchResult {
  entry: CapturedEntry;
  relevanceScore: number;        // 0-1
  matchedFields: string[];       // Which fields matched: "content", "title", "tags"
  highlightedExcerpt: string;    // Content snippet with match context
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  pageSize: number;
  suggestedQueries: string[];    // Related queries the user might try
}
```

Implement:
- `search(request: SearchRequest): Promise<SearchResponse>` -- Full-text search with relevance scoring. Implementation: keyword matching against title, content, tags fields. Score based on match count, field weight (title 3x, tags 2x, content 1x), recency boost.
- `calculateRelevance(query: string, entry: KnowledgeEntry): number` -- Score 0-1 based on keyword overlap, field weights, recency
- `highlightExcerpt(content: string, query: string, contextChars: number): string` -- Extract snippet around first match with `contextChars` characters of surrounding context
- `suggestRelatedQueries(query: string, results: SearchResult[]): string[]` -- Based on tags and titles from top results

NOTE: This is a keyword-based search implementation. Leave a clear `// TODO: Replace with embedding-based semantic search` comment at the top of the search function. The interface is designed to be a drop-in replacement when embeddings are integrated later.

### 3. Knowledge Graph Service

**Service file:** `src/modules/knowledge/services/graph-service.ts`

```typescript
export interface GraphNode {
  id: string;
  label: string;
  type: 'KNOWLEDGE' | 'CONTACT' | 'TASK' | 'PROJECT' | 'DOCUMENT' | 'TAG';
  metadata: Record<string, unknown>;
  connectionCount: number;
}

export interface GraphEdge {
  sourceId: string;
  targetId: string;
  relationship: string;          // "related_to", "tagged_with", "authored_by", "references", "derived_from"
  strength: number;              // 0-1
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: GraphCluster[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    avgConnections: number;
    isolatedNodes: number;       // Nodes with 0 connections
  };
}

export interface GraphCluster {
  id: string;
  label: string;                 // Auto-generated from common tags
  nodeIds: string[];
  dominantTags: string[];
}
```

Implement:
- `buildGraph(entityId: string): Promise<KnowledgeGraph>` -- Builds node/edge graph from knowledge entries, contacts, tags
- `findConnections(entryId: string, depth: number): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>` -- BFS traversal to find connected nodes up to N depth
- `detectClusters(graph: KnowledgeGraph): GraphCluster[]` -- Group nodes by shared tags (entries sharing 2+ tags belong to same cluster)
- `getIsolatedNodes(entityId: string): Promise<GraphNode[]>` -- Find knowledge entries with no connections

### 4. Auto-Linking Service

**Service file:** `src/modules/knowledge/services/auto-linker.ts`

```typescript
export interface LinkSuggestion {
  sourceId: string;
  targetId: string;
  targetType: 'KNOWLEDGE' | 'CONTACT' | 'TASK' | 'DOCUMENT';
  reason: string;                // Why this link is suggested
  confidence: number;            // 0-1
  sharedTags: string[];
  sharedKeywords: string[];
}
```

Implement:
- `suggestLinks(entryId: string): Promise<LinkSuggestion[]>` -- Find potential connections based on shared tags, keyword overlap, entity relationships
- `applyLink(sourceId: string, targetId: string): Promise<void>` -- Add link by updating `linkedEntities` array
- `removeLink(sourceId: string, targetId: string): Promise<void>` -- Remove a link
- `calculateLinkConfidence(source: KnowledgeEntry, target: KnowledgeEntry): number` -- Score based on: shared tags (0.3 weight), keyword overlap in content (0.5 weight), same entity (0.2 weight)

### 5. Contextual Surfacing Service

**Service file:** `src/modules/knowledge/services/surfacing-service.ts`

```typescript
export interface SurfacingContext {
  entityId: string;
  currentActivity: string;       // What the user is currently doing
  activeContactIds?: string[];
  activeProjectId?: string;
  currentTags?: string[];
}

export interface SurfacedKnowledge {
  entry: CapturedEntry;
  reason: string;                // Why this was surfaced
  relevanceScore: number;
  surfacedAt: Date;
}
```

Implement:
- `surfaceRelevant(context: SurfacingContext): Promise<SurfacedKnowledge[]>` -- Proactively find relevant past knowledge. Logic: match tags from current activity, find entries linked to active contacts/projects, sort by relevance score, limit to top 5
- `dismissSuggestion(entryId: string, contextHash: string): Promise<void>` -- Record dismissal to avoid re-surfacing
- `trackAccess(entryId: string): Promise<void>` -- Update `lastAccessed` and boost `strength` for spaced repetition

### 6. SOP Library

**Service file:** `src/modules/knowledge/services/sop-service.ts`

```typescript
export interface SOP {
  id: string;
  entityId: string;
  title: string;
  description: string;
  steps: SOPStep[];
  triggerConditions: string[];   // When this SOP should be activated
  tags: string[];
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  lastUsed?: Date;
  useCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SOPStep {
  order: number;
  instruction: string;
  notes?: string;
  estimatedMinutes?: number;
  isOptional: boolean;
}
```

Implement:
- `createSOP(data: Omit<SOP, 'id' | 'version' | 'useCount' | 'createdAt' | 'updatedAt'>): Promise<SOP>`
- `getSOP(id: string): Promise<SOP | null>`
- `listSOPs(entityId: string, filters: { status?: string; tags?: string[] }): Promise<SOP[]>`
- `updateSOP(id: string, data: Partial<SOP>): Promise<SOP>` -- Increment version on update
- `matchSOPToContext(context: string, entityId: string): Promise<SOP[]>` -- Find SOPs whose trigger conditions match the given context (keyword match against triggerConditions array)
- `recordUsage(id: string): Promise<void>` -- Increment useCount, update lastUsed

### 7. Document Ingestion Pipeline

**Service file:** `src/modules/knowledge/services/ingestion-service.ts`

```typescript
export interface IngestionRequest {
  entityId: string;
  filename: string;
  mimeType: string;
  content: string;               // Raw text content (extracted upstream)
  source: string;
}

export interface IngestionResult {
  entries: CapturedEntry[];      // Knowledge entries created from the document
  summary: string;
  extractedKeywords: string[];
  pageCount?: number;
  wordCount: number;
}
```

Implement:
- `ingestDocument(request: IngestionRequest): Promise<IngestionResult>` -- Parse content, chunk into sections, create knowledge entries per section
- `chunkContent(content: string, maxChunkSize: number): string[]` -- Split content by paragraphs, respecting maxChunkSize (default 2000 chars). Split on double newlines first, then single newlines if chunks are too large.
- `extractKeywords(content: string): string[]` -- Top 10 keywords by frequency (filter stop words, min 4 chars, sort by count)
- `generateSummary(content: string): string` -- First 3 sentences as summary placeholder

### 8. Personal Learning Tracker

**Service file:** `src/modules/knowledge/services/learning-tracker.ts`

```typescript
export interface LearningItem {
  id: string;
  entityId: string;
  title: string;
  type: 'BOOK' | 'COURSE' | 'ARTICLE' | 'PODCAST' | 'VIDEO' | 'PAPER';
  status: 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  progress: number;              // 0-100
  notes: string[];
  keyTakeaways: string[];
  startedAt?: Date;
  completedAt?: Date;
  nextReviewDate?: Date;         // Spaced repetition
  reviewCount: number;
  tags: string[];
  url?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SpacedRepetitionSchedule {
  itemId: string;
  nextReviewDate: Date;
  interval: number;              // Days until next review
  easeFactor: number;            // SM-2 algorithm ease factor (default 2.5)
}
```

Implement:
- `addLearningItem(data: Omit<LearningItem, 'id' | 'reviewCount' | 'createdAt' | 'updatedAt'>): Promise<LearningItem>`
- `updateProgress(id: string, progress: number): Promise<LearningItem>` -- Auto-set status to COMPLETED if progress = 100
- `getDueForReview(entityId: string): Promise<LearningItem[]>` -- Items where nextReviewDate <= now
- `recordReview(id: string, quality: number): Promise<SpacedRepetitionSchedule>` -- SM-2 algorithm: quality 0-5, updates ease factor and interval
- `calculateNextReview(reviewCount: number, easeFactor: number, quality: number): SpacedRepetitionSchedule` -- Pure function implementing SM-2 spaced repetition algorithm:
  - If quality < 3: reset interval to 1 day
  - If quality >= 3: interval = previous interval * easeFactor
  - easeFactor = max(1.3, easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))

### 9. API Routes

Create these Next.js API route handlers:

| Route File | Method | Path | Purpose |
|------------|--------|------|---------|
| `src/app/api/knowledge/route.ts` | GET | `/api/knowledge` | List knowledge entries with pagination, filter by entityId, type, tags |
| `src/app/api/knowledge/route.ts` | POST | `/api/knowledge` | Capture new knowledge entry |
| `src/app/api/knowledge/[id]/route.ts` | GET | `/api/knowledge/:id` | Get single entry with linked entries |
| `src/app/api/knowledge/[id]/route.ts` | PUT | `/api/knowledge/:id` | Update entry |
| `src/app/api/knowledge/[id]/route.ts` | DELETE | `/api/knowledge/:id` | Delete entry |
| `src/app/api/knowledge/[id]/links/route.ts` | GET | `/api/knowledge/:id/links` | Get link suggestions |
| `src/app/api/knowledge/[id]/links/route.ts` | POST | `/api/knowledge/:id/links` | Apply a link |
| `src/app/api/knowledge/search/route.ts` | GET | `/api/knowledge/search` | Search with query, filters |
| `src/app/api/knowledge/graph/route.ts` | GET | `/api/knowledge/graph` | Get knowledge graph (query: entityId) |
| `src/app/api/knowledge/ingest/route.ts` | POST | `/api/knowledge/ingest` | Ingest document |
| `src/app/api/knowledge/surface/route.ts` | POST | `/api/knowledge/surface` | Get contextually surfaced entries |
| `src/app/api/knowledge/sops/route.ts` | GET | `/api/knowledge/sops` | List SOPs |
| `src/app/api/knowledge/sops/route.ts` | POST | `/api/knowledge/sops` | Create SOP |
| `src/app/api/knowledge/sops/[id]/route.ts` | GET | `/api/knowledge/sops/:id` | Get single SOP |
| `src/app/api/knowledge/sops/[id]/route.ts` | PUT | `/api/knowledge/sops/:id` | Update SOP |
| `src/app/api/knowledge/learning/route.ts` | GET | `/api/knowledge/learning` | List learning items |
| `src/app/api/knowledge/learning/route.ts` | POST | `/api/knowledge/learning` | Add learning item |
| `src/app/api/knowledge/learning/[id]/route.ts` | PUT | `/api/knowledge/learning/:id` | Update learning progress |
| `src/app/api/knowledge/learning/review/route.ts` | GET | `/api/knowledge/learning/review` | Get items due for review |

All routes MUST:
- Use Zod for request body / query parameter validation
- Use `success()`, `error()`, `paginated()` from `@/shared/utils/api-response`
- Use `prisma` from `@/lib/db`
- Wrap in try/catch returning `error('INTERNAL_ERROR', ...)` on failure
- Return proper HTTP status codes (200, 201, 400, 404, 500)

Store captured entries in the `KnowledgeEntry` table. Use the `content` field for the main text and `source` field for origin. Store `CaptureType`, title, autoTags, and other metadata as part of a JSON structure in `content` or as a prefix convention. SOPs and learning items can be stored in the `Document` table with `type = 'SOP'` and structured `content` JSON, or in `KnowledgeEntry` with a source prefix convention (e.g., source: `sop://...`, `learning://...`).

### 10. Dashboard Pages

**Knowledge hub page:** `src/app/(dashboard)/knowledge/page.tsx`
- Quick capture bar at top (text input + type selector + capture button)
- Recent entries list
- Tag cloud showing most-used tags
- Search bar with filters
- "Surfaced for You" section showing contextual suggestions

**Knowledge graph page:** `src/app/(dashboard)/knowledge/graph/page.tsx`
- Interactive graph visualization (use nested div layout with connection lines as a placeholder -- no external graph library)
- Cluster list sidebar
- Node detail panel on click
- Stats bar: total nodes, edges, isolated nodes

**SOP library page:** `src/app/(dashboard)/knowledge/sops/page.tsx`
- SOP list with status badges
- Search and filter by tags
- "Create SOP" multi-step form
- SOP detail view with numbered steps

**Learning tracker page:** `src/app/(dashboard)/knowledge/learning/page.tsx`
- Learning items by status (Queued, In Progress, Completed)
- Progress bars for in-progress items
- "Due for Review" section with review buttons
- Reading/learning stats

**Components to create in `src/modules/knowledge/components/`:**
- `QuickCaptureBar.tsx` -- Inline capture form
- `CaptureTypeSelector.tsx` -- Type dropdown (NOTE, BOOKMARK, etc.)
- `KnowledgeEntryCard.tsx` -- Entry display card
- `SearchBar.tsx` -- Search input with filter dropdowns
- `SearchResultItem.tsx` -- Single search result with highlighted excerpt
- `TagCloud.tsx` -- Visual tag frequency display
- `GraphCanvas.tsx` -- Graph visualization placeholder
- `GraphNodeDetail.tsx` -- Node detail panel
- `ClusterList.tsx` -- Cluster sidebar
- `SOPCard.tsx` -- SOP summary card
- `SOPDetailView.tsx` -- Full SOP with numbered steps
- `SOPForm.tsx` -- Create/edit SOP form
- `LearningItemCard.tsx` -- Learning item with progress
- `LearningProgressBar.tsx` -- Visual progress indicator
- `ReviewCard.tsx` -- Spaced repetition review card
- `SurfacedSuggestion.tsx` -- Contextual suggestion card
- `IngestionUploadForm.tsx` -- Document upload form

All components must be client components (`'use client'`) using Tailwind CSS. No external UI libraries.

## Acceptance Criteria

- [ ] Capture service creates entries with auto-generated titles and tags
- [ ] Search returns results sorted by relevance score with highlighted excerpts
- [ ] Knowledge graph builds correct node/edge relationships from tags and linkedEntities
- [ ] Cluster detection groups entries sharing 2+ tags
- [ ] Auto-linker confidence score uses correct weights (tags 0.3, keywords 0.5, entity 0.2)
- [ ] Contextual surfacing returns top 5 entries matching current activity context
- [ ] SOP trigger matching finds SOPs whose conditions overlap with given context
- [ ] Document ingestion chunks content at paragraph boundaries respecting max size
- [ ] SM-2 spaced repetition algorithm produces correct intervals and ease factors
- [ ] All 19 API routes return correct `ApiResponse<T>` shapes
- [ ] Zod validation rejects malformed requests
- [ ] Dashboard pages render without errors
- [ ] All unit tests pass with `npx jest tests/unit/knowledge/`
- [ ] No imports from other worker-owned paths

## Implementation Steps

1. **Read context files** -- `src/shared/types/index.ts`, `prisma/schema.prisma`, `src/shared/utils/api-response.ts`, `src/lib/db/index.ts`
2. **Create types** -- `src/modules/knowledge/types/index.ts` with all module-specific interfaces
3. **Build core services** (in order, starting with zero-dependency utilities):
   a. `capture-service.ts` (auto-tagging, title generation)
   b. `search-service.ts` (keyword search with relevance scoring)
   c. `auto-linker.ts` (link suggestions, confidence scoring)
   d. `graph-service.ts` (depends on auto-linker)
   e. `surfacing-service.ts` (depends on search-service)
   f. `sop-service.ts` (depends on prisma)
   g. `ingestion-service.ts` (depends on capture-service)
   h. `learning-tracker.ts` (SM-2 algorithm, depends on prisma)
4. **Build API routes** -- All 19 route files with Zod schemas
5. **Build components** -- All 17 React components
6. **Build dashboard pages** -- Hub, graph, SOPs, learning pages
7. **Write tests** -- Unit tests for all services
8. **Verify** -- `npx tsc --noEmit`, `npx jest tests/unit/knowledge/`, `npx next build`

## Tests

Create these test files in `tests/unit/knowledge/`:

| Test File | What It Tests |
|-----------|---------------|
| `capture-service.test.ts` | Auto-title generation, auto-tag extraction, batch capture, handles missing fields |
| `search-service.test.ts` | Keyword matching, relevance scoring (title weight 3x, tags 2x, content 1x), highlight excerpt extraction, empty query handling |
| `auto-linker.test.ts` | Confidence score calculation with correct weights, link suggestion ranking, apply/remove link |
| `graph-service.test.ts` | Graph building from entries, BFS traversal at depth 1/2/3, cluster detection, isolated node identification |
| `surfacing-service.test.ts` | Context matching, result limiting to top 5, dismissal tracking |
| `sop-service.test.ts` | CRUD operations, version incrementing on update, trigger condition matching, usage tracking |
| `ingestion-service.test.ts` | Content chunking at paragraph boundaries, max chunk size enforcement, keyword extraction with stop word filtering |
| `learning-tracker.test.ts` | SM-2 algorithm: quality < 3 resets interval, quality >= 3 multiplies by ease factor, ease factor floor at 1.3, progress 100 auto-completes |

SM-2 test cases to include:
- First review quality=5: interval=1, easeFactor=2.6
- Second review quality=5: interval=6, easeFactor=2.7 (6 * 1 = 6? No: SM-2 standard: review 1 = 1 day, review 2 = 6 days, review 3+ = prev * EF)
- Review quality=2: interval resets to 1, easeFactor decreases
- Ease factor never drops below 1.3

Each test file must:
- Mock `prisma` using `jest.mock('@/lib/db')`
- Use `describe/it` blocks with descriptive names
- Test both success and error paths
- Test edge cases (empty content, no tags, very long content)
- Import types from `@/shared/types` and `@/modules/knowledge/types`

## Commit Strategy

Use Conventional Commits. Commit after each logical unit is complete and compiling.

```
feat(knowledge): add module-specific types and interfaces
feat(knowledge): implement capture service with auto-tagging
feat(knowledge): implement keyword search service with relevance scoring
feat(knowledge): implement auto-linker with confidence scoring
feat(knowledge): implement knowledge graph builder with clustering
feat(knowledge): implement contextual surfacing service
feat(knowledge): implement SOP library service
feat(knowledge): implement document ingestion pipeline
feat(knowledge): implement learning tracker with SM-2 spaced repetition
feat(knowledge): add knowledge CRUD and search API routes
feat(knowledge): add graph, ingest, surface API routes
feat(knowledge): add SOP and learning API routes
feat(knowledge): add knowledge dashboard components
feat(knowledge): add knowledge hub, graph, SOP, and learning pages
test(knowledge): add unit tests for all services
chore(knowledge): verify build and final cleanup
```
