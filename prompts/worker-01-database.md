# Worker 01: Database Layer & Seed Data

## Branch: ai-feature/w01-database

Create and check out the branch `ai-feature/w01-database` from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside these directories:

- `prisma/seed.ts`
- `src/lib/db/` (all files within, except `src/lib/db/index.ts` which already exists and must NOT be modified)
- `tests/unit/db/`
- `package.json` (ONLY to add the `prisma.seed` config and `db:seed` script -- do not change any other fields)

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files. They define the project contracts:

1. **`prisma/schema.prisma`** -- The complete Prisma schema with 16 models (User, Entity, Contact, Task, Project, CalendarEvent, Message, Document, KnowledgeEntry, Workflow, Call, Rule, ActionLog, FinancialRecord, ConsentReceipt, MemoryEntry). Understand every field, relation, index, and default.
2. **`src/shared/types/index.ts`** -- All TypeScript type definitions and enums. Your code must align with these types precisely.
3. **`src/shared/utils/api-response.ts`** -- The API response helpers (`success`, `error`, `paginated`). Understand the `ApiResponse<T>`, `ApiMeta` shapes.
4. **`src/lib/db/index.ts`** -- The existing Prisma client singleton. Import from here, do not create a second client.
5. **`package.json`** -- Current scripts and dependencies. Note that `@prisma/client` and `prisma` are already installed.
6. **`tsconfig.json`** -- Path aliases use `@/*` mapping to `./src/*`.

## Requirements

### 1. Generate Prisma Client

- Run `npx prisma generate` to ensure the Prisma client is generated from the existing schema.
- Verify generation succeeds without errors.

### 2. Database Utility Helpers (`src/lib/db/helpers.ts`)

Create a comprehensive set of database utility functions:

```typescript
// src/lib/db/helpers.ts

// Pagination helper
export interface PaginationParams {
  page?: number;      // defaults to 1
  pageSize?: number;  // defaults to 20, max 100
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function buildPaginationArgs(params: PaginationParams): { skip: number; take: number };
export function paginateQuery<T>(data: T[], total: number, params: PaginationParams): PaginatedResult<T>;

// Soft delete helper (uses a deletedAt pattern if needed, or filters by status)
export function softDeleteFilter(): { deletedAt: null } | {};

// Transaction wrapper with automatic retry on serialization failures
export async function withTransaction<T>(
  fn: (tx: PrismaTransactionClient) => Promise<T>,
  maxRetries?: number
): Promise<T>;

// Bulk upsert helper
export async function bulkUpsert<T>(
  model: string,
  records: T[],
  uniqueField: string
): Promise<number>;

// Order-by builder from query string (e.g., "createdAt:desc,name:asc")
export function buildOrderBy(sortString?: string, allowedFields?: string[]): Record<string, 'asc' | 'desc'>[];

// Where-clause builder for common filter patterns
export function buildWhereClause(filters: Record<string, unknown>): Record<string, unknown>;
```

### 3. Database Query Helpers (`src/lib/db/queries.ts`)

Create reusable query patterns for common operations:

```typescript
// src/lib/db/queries.ts

// Find entity with ownership verification
export async function findEntityForUser(entityId: string, userId: string): Promise<Entity | null>;

// Find records scoped to an entity
export async function findByEntity<T>(model: string, entityId: string, params?: PaginationParams): Promise<PaginatedResult<T>>;

// Count records by status within an entity
export async function countByStatus(model: string, entityId: string): Promise<Record<string, number>>;

// Search across text fields
export async function textSearch(model: string, query: string, fields: string[], entityId?: string): Promise<unknown[]>;
```

### 4. Export Barrel (`src/lib/db/index.ts` is off-limits)

Create `src/lib/db/helpers.ts` and `src/lib/db/queries.ts` as standalone modules. Other workers will import from them directly:
```typescript
import { buildPaginationArgs } from '@/lib/db/helpers';
import { findEntityForUser } from '@/lib/db/queries';
```

### 5. Seed Script (`prisma/seed.ts`)

Create a comprehensive seed script that populates the database with realistic demo data. This is critical for all other workers to have data to work with during development.

#### Required Seed Data:

**Users (2):**
- User 1: "Marcus Thompson" -- email: marcus@example.com, timezone: America/Chicago, chronotype: EARLY_BIRD. Preferences: defaultTone DIRECT, attentionBudget 8, focusHours 06:00-10:00, meetingFreedays [0, 6], autonomyLevel EXECUTE_WITH_APPROVAL
- User 2: "Sarah Chen" -- email: sarah@example.com, timezone: America/New_York, chronotype: NIGHT_OWL. Preferences: defaultTone DIPLOMATIC, attentionBudget 12, focusHours 20:00-23:00, meetingFreedays [0], autonomyLevel SUGGEST

**Entities (3, all belong to Marcus):**
- "MedLink Pro" -- type: LLC, complianceProfile: [HIPAA, GDPR], brandKit with healthcare colors (#0077B6, #00B4D8), voicePersonaId: "medlink-professional"
- "CRE Forge" -- type: LLC, complianceProfile: [REAL_ESTATE, SOX], brandKit with real estate colors (#2D6A4F, #95D5B2), phoneNumbers: ["+15551234567"]
- "Personal" -- type: Personal, complianceProfile: [GENERAL]

**Contacts (20+, distributed across entities):**
MedLink Pro contacts (8+):
- Dr. Elena Martinez (physician partner, email/phone, relationshipScore: 85, tags: [VIP, physician])
- James Wu (medical device rep, email, relationshipScore: 60, tags: [vendor])
- Nurse Patricia Owens (clinic manager, email/phone, relationshipScore: 75)
- Dr. Raj Patel (specialist referral, email, relationshipScore: 45)
- Linda Hoffman (insurance coordinator, email, relationshipScore: 55)
- Tom Baker (IT consultant, email/phone, relationshipScore: 70, tags: [vendor, tech])
- Maria Santos (patient advocate, email, relationshipScore: 65)
- Dr. Kevin O'Brien (board advisor, email/phone, relationshipScore: 90, tags: [VIP, advisor])

CRE Forge contacts (8+):
- Robert "Bobby" Castellano (commercial broker, email/phone, relationshipScore: 80, tags: [VIP, broker])
- Diane Foster (property inspector, email, relationshipScore: 55)
- Michael Tran (zoning attorney, email/phone, relationshipScore: 70, tags: [legal])
- Jennifer Wright (lender contact, email, relationshipScore: 65)
- Carlos Mendez (general contractor, email/phone, relationshipScore: 75, tags: [contractor])
- Amy Liu (title company rep, email, relationshipScore: 50)
- David Park (environmental assessor, email, relationshipScore: 40)
- Susan Miller (property manager, email/phone, relationshipScore: 85, tags: [VIP])

Personal contacts (4+):
- Alex Thompson (sibling, phone, relationshipScore: 95, tags: [family])
- Jordan Kim (personal trainer, phone, relationshipScore: 60)
- Rebecca Hall (accountant, email, relationshipScore: 70, tags: [finance])
- Coach Mike Davis (life coach, email/phone, relationshipScore: 55)

Each contact should have realistic `channels` JSON, `commitments`, and `preferences` filled in.

**Tasks (50+, distributed across entities and projects):**
Spread across all statuses (TODO, IN_PROGRESS, BLOCKED, DONE, CANCELLED), all priorities (P0, P1, P2), with realistic titles related to each entity's domain. Some should have dependencies on other tasks. Some should have dueDate set (past, today, future). Assign some to Marcus.

**Projects (10+):**
- MedLink Pro: "EHR Integration Phase 2", "Telehealth Platform Launch", "HIPAA Compliance Audit", "Patient Portal Redesign"
- CRE Forge: "Downtown Mixed-Use Development", "Industrial Park Acquisition", "Property Management SaaS MVP"
- Personal: "Home Renovation", "Investment Portfolio Review", "Marathon Training Plan"

Each project should have 2-4 milestones with varying statuses and health indicators.

**Messages (30+):**
Across EMAIL, SMS, SLACK channels. Mix of triageScores (1-10). Include thread groupings (shared threadId). Various intents (INQUIRY, REQUEST, UPDATE, URGENT, FYI). Different sensitivity levels.

**Calls (10+):**
Both INBOUND and OUTBOUND. Various outcomes. Some with transcripts and action items. Different durations and sentiments.

**Workflows (5+):**
- "Morning Briefing Generator" (ACTIVE, TIME trigger)
- "Urgent Message Escalation" (ACTIVE, EVENT trigger)
- "Weekly Entity Health Report" (ACTIVE, TIME trigger)
- "New Contact Onboarding" (DRAFT, EVENT trigger)
- "Invoice Payment Reminder" (ACTIVE, CONDITION trigger)

**Financial Records (15+):**
Mix of INVOICE, EXPENSE, BILL, PAYMENT types. Various statuses (PENDING, PAID, OVERDUE). Realistic amounts, categories, and vendors.

**Rules (8+):**
- "Auto-escalate P0 tasks" (GLOBAL scope)
- "HIPAA message screening" (ENTITY scope, MedLink)
- "After-hours call routing" (ENTITY scope, CRE Forge)
- "VIP contact priority boost" (GLOBAL)
- "Focus hours protection" (GLOBAL)
- "Meeting-free day enforcement" (GLOBAL)
- "Auto-archive completed tasks" (GLOBAL)
- "Financial approval threshold" (ENTITY scope)

**Action Logs (10+):**
Mix of AI and HUMAN actors. Various action types and blast radii.

**Consent Receipts (5+):**
Linked to action logs with realistic descriptions.

**Memory Entries (10+):**
Mix of SHORT_TERM, WORKING, LONG_TERM, EPISODIC types with realistic content.

#### Seed Script Requirements:
- Use `prisma` client from `@/lib/db` (or import PrismaClient directly since this is a script).
- Make the script **idempotent** -- clear existing data before seeding (use deleteMany in reverse dependency order or use a transaction).
- Use `cuid()` or let Prisma auto-generate IDs.
- Print progress messages during seeding (e.g., "Seeding users... done (2 created)").
- Handle errors gracefully with try/catch and process.exit(1) on failure.
- Export nothing -- this is a runnable script.

### 6. Package.json Updates

Add the following to `package.json`:

```json
{
  "prisma": {
    "seed": "npx tsx prisma/seed.ts"
  },
  "scripts": {
    "db:seed": "npx prisma db seed",
    "db:reset": "npx prisma migrate reset --force",
    "db:generate": "npx prisma generate"
  }
}
```

Only add these entries. Do not modify existing scripts or dependencies.

## Acceptance Criteria

1. `npx prisma generate` succeeds without errors.
2. `prisma/seed.ts` compiles without TypeScript errors.
3. `src/lib/db/helpers.ts` exports all pagination, transaction, and query-building utilities.
4. `src/lib/db/queries.ts` exports entity-scoped query helpers.
5. All helper functions have proper TypeScript types -- no `any` types.
6. Seed script creates at minimum: 2 users, 3 entities, 20 contacts, 50 tasks, 10 projects, 30 messages, 10 calls, 5 workflows, 15 financial records, 8 rules, 10 action logs, 5 consent receipts, 10 memory entries.
7. Seed script is idempotent (safe to run multiple times).
8. `npm run db:seed` script is defined and points to the seed file.
9. All unit tests pass.
10. No modifications to `src/lib/db/index.ts`, `src/shared/types/index.ts`, `src/shared/utils/api-response.ts`, or `prisma/schema.prisma`.

## Implementation Steps

1. **Read context files**: Read `prisma/schema.prisma`, `src/shared/types/index.ts`, `src/shared/utils/api-response.ts`, `src/lib/db/index.ts`, `package.json`, and `tsconfig.json`.
2. **Create branch**: `git checkout -b ai-feature/w01-database`
3. **Generate Prisma client**: `npx prisma generate`
4. **Create `src/lib/db/helpers.ts`**: Implement all pagination, transaction, sort, and filter utilities.
5. **Create `src/lib/db/queries.ts`**: Implement entity-scoped query helpers using the Prisma client from `src/lib/db/index.ts`.
6. **Create `prisma/seed.ts`**: Build the full seed script with all demo data described above.
7. **Update `package.json`**: Add the `prisma.seed` config and `db:seed`/`db:reset`/`db:generate` scripts.
8. **Create tests**: Write unit tests for helpers and queries.
9. **Run tests**: Execute `npx jest tests/unit/db/` and verify all pass.
10. **Type-check**: Run `npx tsc --noEmit` to verify no TypeScript errors in your files.
11. **Commit**: Use conventional commits, e.g.:
    - `feat(db): add pagination, transaction, and query helper utilities`
    - `feat(db): add comprehensive seed script with demo data`
    - `test(db): add unit tests for database helpers`
    - `chore(db): add db:seed and db:generate npm scripts`

## Tests

Create the following test files in `tests/unit/db/`:

### `tests/unit/db/helpers.test.ts`
```typescript
// Test cases to implement:

describe('buildPaginationArgs', () => {
  it('should return defaults when no params provided');
  it('should calculate correct skip/take for page 1');
  it('should calculate correct skip/take for page 3 with pageSize 10');
  it('should cap pageSize at 100');
  it('should treat page < 1 as page 1');
});

describe('paginateQuery', () => {
  it('should return correct pagination metadata');
  it('should calculate totalPages correctly');
  it('should handle empty results');
  it('should handle last page with fewer items');
});

describe('buildOrderBy', () => {
  it('should parse "createdAt:desc" correctly');
  it('should parse multiple sort fields "name:asc,createdAt:desc"');
  it('should return empty array for undefined input');
  it('should filter out disallowed fields when allowedFields provided');
  it('should default to asc when direction not specified');
});

describe('buildWhereClause', () => {
  it('should handle string equality filters');
  it('should handle array "in" filters');
  it('should ignore undefined/null filter values');
  it('should handle nested object filters');
});

describe('withTransaction', () => {
  it('should execute function within a transaction');
  it('should retry on serialization failure up to maxRetries');
  it('should throw after exhausting retries');
});
```

### `tests/unit/db/queries.test.ts`
```typescript
// Test cases to implement (mock Prisma client):

describe('findEntityForUser', () => {
  it('should return entity when user owns it');
  it('should return null when user does not own entity');
  it('should return null for non-existent entity');
});

describe('findByEntity', () => {
  it('should return paginated results for an entity');
  it('should apply pagination parameters');
  it('should return empty results for entity with no records');
});

describe('countByStatus', () => {
  it('should return status counts for entity');
  it('should return zero counts for empty entity');
});
```

Mock the Prisma client in tests. Do NOT require a live database connection for unit tests. Use `jest.mock` or manual mocks.

## Commit Strategy

Make atomic commits in this order:

1. `feat(db): add database helper utilities for pagination, transactions, and queries`
   - Files: `src/lib/db/helpers.ts`, `src/lib/db/queries.ts`
2. `feat(db): add comprehensive seed script with realistic demo data`
   - Files: `prisma/seed.ts`
3. `chore(db): add db:seed, db:reset, and db:generate npm scripts`
   - Files: `package.json` (only the added fields)
4. `test(db): add unit tests for database helpers and queries`
   - Files: `tests/unit/db/helpers.test.ts`, `tests/unit/db/queries.test.ts`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
