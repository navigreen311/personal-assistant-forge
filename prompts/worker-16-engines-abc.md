# Worker 16: Cross-Cutting Engines A-C (Policy Engine, Trust UI, Memory)

## Branch: ai-feature/w16-engines-abc

Create and check out the branch `ai-feature/w16-engines-abc` from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside these directories:

```
src/engines/policy/                    # Policy/Rule engine business logic
src/engines/trust-ui/                  # Trust UI components and consent receipt system
src/engines/memory/                    # Contextual memory architecture services
src/app/api/rules/                     # API routes for rule CRUD + conflict resolution
src/app/api/memory/                    # API routes for memory CRUD + search
src/app/(dashboard)/trust/             # Dashboard pages for trust/permissions/consent
tests/unit/engines/                    # All unit tests for this worker
```

## Context (read these first, do NOT modify)

Read and internalize these files before writing any code. They define the shared contracts.

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project-wide dev process, commit conventions, done criteria |
| `src/shared/types/index.ts` | Immutable shared types: `Rule`, `ConsentReceipt`, `MemoryEntry`, `MemoryType`, `ActionLog`, `BlastRadius`, `ActionActor`, `Priority`, `Sensitivity`, `AutonomyLevel`, `ApiResponse`, `ApiError`, `ApiMeta` |
| `prisma/schema.prisma` | Database schema: `Rule`, `ConsentReceipt`, `MemoryEntry`, `ActionLog`, `Entity` models with fields and relations |
| `src/shared/utils/api-response.ts` | API helpers: `success<T>()`, `error()`, `paginated<T>()` -- use these in every route handler |
| `src/lib/db/index.ts` | Prisma client singleton: `import { prisma } from '@/lib/db'` |
| `package.json` | Stack: Next.js 16, React 19, Prisma 7, Zod 4, date-fns 4, Jest 30, ts-jest |
| `tsconfig.json` | Path aliases: `@/` maps to `src/` |

## Requirements

### 1. Policy/Rule Engine (CC-A)

Build a comprehensive rule engine where rules are first-class objects with IF/THEN semantics, scoped to Entity, Contact, Project, Doc-type, or Channel.

**Types file:** `src/engines/policy/types.ts`

```typescript
export type RuleScope = 'GLOBAL' | 'ENTITY' | 'PROJECT' | 'CONTACT' | 'CHANNEL';

export interface RuleCondition {
  field: string;            // e.g., "message.triageScore", "task.priority"
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'matches';
  value: unknown;
  logicalGroup?: 'AND' | 'OR';
}

export interface RuleAction {
  type: 'ESCALATE' | 'AUTO_ASSIGN' | 'NOTIFY' | 'BLOCK' | 'TAG' | 'REDIRECT' | 'LOG' | 'APPROVE' | 'REJECT';
  config: Record<string, unknown>;
}

export interface EvaluatedRule {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  conditionResults: { condition: RuleCondition; passed: boolean }[];
  action: RuleAction | null;
  precedence: number;
  scope: RuleScope;
}

export interface ConflictReport {
  ruleA: string;          // Rule ID
  ruleB: string;
  conflictType: 'CONTRADICTORY_ACTIONS' | 'OVERLAPPING_SCOPE' | 'PRECEDENCE_TIE';
  resolution: 'HIGHER_PRECEDENCE' | 'NARROWER_SCOPE' | 'NEWER_VERSION' | 'MANUAL_REQUIRED';
  resolvedWinnerId?: string;
  explanation: string;
}

export interface AuditTrail {
  actionId: string;
  timestamp: Date;
  rulesEvaluated: EvaluatedRule[];
  ruleApplied: string;     // The winning rule ID
  dataSources: string[];
  confidence: number;
  explanation: string;       // Human-readable "Why did you do that?" answer
}

export interface RuleSuggestion {
  suggestedName: string;
  suggestedCondition: RuleCondition[];
  suggestedAction: RuleAction;
  suggestedScope: RuleScope;
  evidence: string;         // "You corrected this 3 times in 7 days"
  correctionCount: number;
  correctionPattern: string;
}
```

**Service file:** `src/engines/policy/rule-engine.ts`

Implement these functions:
- `evaluateRules(context: Record<string, unknown>, entityId?: string): Promise<EvaluatedRule[]>` -- Loads all active rules, evaluates each condition against the context, returns sorted by precedence.
- `resolveConflicts(evaluatedRules: EvaluatedRule[]): ConflictReport[]` -- Detects contradicting rules (e.g., one says BLOCK, another says APPROVE for the same target). Resolves by: (1) higher precedence wins, (2) narrower scope wins (CONTACT > PROJECT > ENTITY > GLOBAL), (3) newer version wins, (4) flag for manual resolution.
- `getWinningAction(evaluatedRules: EvaluatedRule[]): EvaluatedRule | null` -- After conflict resolution, returns the single rule whose action should execute.
- `buildAuditTrail(actionId: string, evaluatedRules: EvaluatedRule[], dataSources: string[]): AuditTrail` -- Constructs a full audit record explaining why an action was taken.
- `getInheritedRules(entityId: string, projectId?: string, contactId?: string): Promise<Rule[]>` -- Returns rules in inheritance order: Global -> entity -> project -> contact, with override capability (a narrower-scope rule with the same condition overrides the broader one).

**Service file:** `src/engines/policy/rule-suggestion.ts`

Implement:
- `detectCorrectionPattern(userId: string, lookbackDays?: number): Promise<RuleSuggestion[]>` -- Analyzes ActionLog for repeated user overrides/corrections. If the user has corrected the same type of AI action 3+ times, generate a rule suggestion.
- `createRuleFromSuggestion(suggestion: RuleSuggestion, userId: string): Promise<Rule>` -- Converts an accepted suggestion into a persisted rule.

**Service file:** `src/engines/policy/rule-crud.ts`

Implement:
- `createRule(data: Omit<Rule, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Promise<Rule>`
- `updateRule(id: string, data: Partial<Rule>): Promise<Rule>` -- Increments version on each update.
- `deleteRule(id: string): Promise<void>` -- Sets `isActive = false` (soft delete).
- `listRules(filters: { scope?: RuleScope; entityId?: string; isActive?: boolean }, page?: number, pageSize?: number): Promise<{ data: Rule[]; total: number }>`
- `getRuleById(id: string): Promise<Rule | null>`
- `duplicateRule(id: string, overrides?: Partial<Rule>): Promise<Rule>` -- Creates a copy with a new ID and version 1.

### 2. Trust UI + Consent Receipts (CC-B)

**Types file:** `src/engines/trust-ui/types.ts`

```typescript
export interface PermissionSet {
  integrationId: string;
  integrationName: string;
  read: boolean;
  draft: boolean;
  execute: boolean;
}

export interface ExplainResponse {
  actionDescription: string;
  rulesApplied: { ruleId: string; ruleName: string; matchReason: string }[];
  dataSources: { type: string; id: string; description: string }[];
  confidence: number;
  alternatives: { description: string; ruleId?: string }[];
  timestamp: Date;
}

export interface SensitiveDataPreview {
  originalText: string;
  redactedText: string;
  redactions: { start: number; end: number; type: string; replacement: string }[];
  sensitivityLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface TrustScoreBreakdown {
  domain: string;
  overallScore: number;        // 0-100
  dimensions: {
    accuracy: number;
    transparency: number;
    reversibility: number;
    userOverrideRate: number;
  };
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  sampleSize: number;
}
```

**Service file:** `src/engines/trust-ui/consent-service.ts`

Implement:
- `createConsentReceipt(actionId: string, description: string, reason: string, impacted: string[], reversible: boolean, rollbackLink?: string, confidence?: number): Promise<ConsentReceipt>` -- Persists a consent receipt in the database.
- `getReceiptsForAction(actionId: string): Promise<ConsentReceipt[]>`
- `getRecentReceipts(userId: string, limit?: number): Promise<ConsentReceipt[]>` -- Last N consent receipts for a user's actions.
- `formatReceiptSummary(receipt: ConsentReceipt): string` -- Human-readable: "Executed [X] because [Y]; impacted [Z]; reversible: [yes/no]; rollback: [link]".

**Service file:** `src/engines/trust-ui/permissions-service.ts`

Implement:
- `getPermissions(userId: string): Promise<PermissionSet[]>` -- Returns permission state for all integrations.
- `updatePermission(userId: string, integrationId: string, permission: Partial<Pick<PermissionSet, 'read' | 'draft' | 'execute'>>): Promise<PermissionSet>` -- Toggles individual permission flags.
- `checkPermission(userId: string, integrationId: string, action: 'read' | 'draft' | 'execute'): Promise<boolean>` -- Gate check before any action.

**Service file:** `src/engines/trust-ui/explain-service.ts`

Implement:
- `explainAction(actionId: string): Promise<ExplainResponse>` -- One-click "Explain this" for any output: retrieves rules applied, data sources, confidence, and alternatives.
- `explainWithContext(actionId: string, userQuestion?: string): Promise<ExplainResponse>` -- Adds natural language question answering on top of the structured explain.

**Service file:** `src/engines/trust-ui/redaction-service.ts`

Implement:
- `previewRedaction(text: string, sensitivityThreshold?: Sensitivity): SensitiveDataPreview` -- Scans text for PII (emails, phones, SSNs, credit cards, names), HIPAA terms, financial data. Returns original and redacted versions with marked regions.
- `applyRedaction(preview: SensitiveDataPreview): string` -- Returns the redacted text.
- `calculateSensitivity(text: string): Sensitivity` -- Returns the highest sensitivity level found.

**Service file:** `src/engines/trust-ui/trust-score-service.ts`

Implement:
- `calculateTrustScore(domain: string, userId: string): Promise<TrustScoreBreakdown>` -- Computes trust score per domain based on accuracy, transparency, reversibility, override rate.
- `getTrustScores(userId: string): Promise<TrustScoreBreakdown[]>` -- All domain scores.
- `getTrustTrend(domain: string, userId: string, days?: number): Promise<{ date: Date; score: number }[]>` -- Historical scores for charting.

**Components in `src/engines/trust-ui/components/`:**

- `ConsentReceiptCard.tsx` -- Displays a single consent receipt with rollback link. Props: `receipt: ConsentReceipt`.
- `ConsentReceiptList.tsx` -- Scrollable list of recent receipts with filtering. Props: `userId: string`.
- `PermissionsDashboard.tsx` -- Grid of integrations with Read/Draft/Execute toggle switches. Props: `userId: string`.
- `ExplainButton.tsx` -- "Explain this" button that triggers a modal with full explanation. Props: `actionId: string`.
- `ExplainModal.tsx` -- Modal displaying rules applied, data sources, confidence bar, alternatives. Props: `explanation: ExplainResponse; onClose: () => void`.
- `RedactionPreview.tsx` -- Side-by-side original vs redacted text with highlighted regions. Props: `preview: SensitiveDataPreview`.
- `TrustScoreCard.tsx` -- Displays domain trust score with dimension breakdown and trend arrow. Props: `score: TrustScoreBreakdown`.
- `TrustScoreDashboard.tsx` -- Grid of all domain trust scores. Props: `userId: string`.

All components must be client components (`'use client'`) using Tailwind CSS. No external UI libraries.

### 3. Contextual Memory Architecture (CC-C)

**Types file:** `src/engines/memory/types.ts`

```typescript
export interface MemorySearchQuery {
  userId: string;
  query: string;
  types?: MemoryType[];
  minStrength?: number;
  limit?: number;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  relevanceScore: number;
  matchedTerms: string[];
}

export interface DecayConfig {
  shortTermHalfLifeHours: number;     // default 24
  workingHalfLifeDays: number;        // default 14
  longTermHalfLifeDays: number;       // default 365
  episodicHalfLifeDays: number;       // default 730
  reinforcementBoost: number;         // default 0.2 (added on access)
  minimumStrength: number;            // default 0.05 (below this, eligible for cleanup)
}

export interface MemoryStats {
  userId: string;
  totalEntries: number;
  byType: Record<MemoryType, number>;
  averageStrength: number;
  oldestEntry: Date;
  newestEntry: Date;
  decayedCount: number;
}
```

**Service file:** `src/engines/memory/memory-service.ts`

Implement:
- `createMemory(userId: string, type: MemoryType, content: string, context: string): Promise<MemoryEntry>` -- Stores a new memory with initial strength 1.0.
- `recallMemory(id: string): Promise<MemoryEntry | null>` -- Retrieves a memory and reinforces it (increments strength by `reinforcementBoost`, updates `lastAccessed`).
- `searchMemories(query: MemorySearchQuery): Promise<MemorySearchResult[]>` -- Text-based search across memory content and context. Filters by type and minimum strength. Sorts by relevance (keyword match count * strength).
- `getMemoriesByType(userId: string, type: MemoryType, limit?: number): Promise<MemoryEntry[]>` -- Fetches memories of a given type, ordered by strength descending.
- `updateMemory(id: string, updates: { content?: string; context?: string; type?: MemoryType }): Promise<MemoryEntry>` -- User edits a memory.
- `deleteMemory(id: string): Promise<void>` -- Hard delete (user right to delete).
- `getMemoryStats(userId: string): Promise<MemoryStats>` -- Aggregated statistics.

**Service file:** `src/engines/memory/decay-service.ts`

Implement:
- `applyDecay(userId: string, config?: Partial<DecayConfig>): Promise<{ decayed: number; cleaned: number }>` -- Iterates all memories for a user. For each, calculates new strength based on time since `lastAccessed` and the half-life for its type. If strength drops below `minimumStrength`, mark for cleanup. Returns count of decayed and cleaned entries.
- `reinforceMemory(id: string, boostAmount?: number): Promise<MemoryEntry>` -- Explicitly boosts a memory's strength (e.g., when the user references it).
- `getDecayConfig(): DecayConfig` -- Returns the current decay configuration with defaults.
- `cleanupWeakMemories(userId: string, threshold?: number): Promise<number>` -- Deletes memories below the threshold strength. Returns count deleted.

**Service file:** `src/engines/memory/episodic-memory.ts`

Implement:
- `storeEpisode(userId: string, content: string, context: string, tags?: string[]): Promise<MemoryEntry>` -- Creates an episodic memory with rich context (who, what, when, where, why).
- `recallEpisode(userId: string, naturalLanguageQuery: string): Promise<MemorySearchResult[]>` -- Searches episodic memories using fuzzy matching. E.g., "Remember the Nevada compliance issue in Q3?" matches episodes tagged with "Nevada", "compliance", and dated in Q3.
- `getTimeline(userId: string, startDate: Date, endDate: Date): Promise<MemoryEntry[]>` -- Returns episodic memories within a date range, chronologically ordered.

**Components in `src/engines/memory/components/`:**

- `MemoryList.tsx` -- Paginated list of memories with type filter tabs (Short-term, Working, Long-term, Episodic). Props: `userId: string`.
- `MemoryCard.tsx` -- Displays a single memory with strength bar, type badge, last accessed date. Props: `entry: MemoryEntry`.
- `MemoryEditor.tsx` -- Edit/delete modal for a memory entry. Props: `entry: MemoryEntry; onSave: (updated: MemoryEntry) => void; onDelete: (id: string) => void`.
- `MemorySearch.tsx` -- Search bar with type filters and strength threshold slider. Props: `userId: string; onResults: (results: MemorySearchResult[]) => void`.
- `MemoryStats.tsx` -- Dashboard card with total entries, breakdown by type, average strength, decay status. Props: `stats: MemoryStats`.

### 4. API Routes

Create these Next.js API route handlers using the App Router convention:

| Route File | Method | Path | Purpose |
|------------|--------|------|---------|
| `src/app/api/rules/route.ts` | GET | `/api/rules` | List rules with filters (scope, entityId, isActive), pagination |
| `src/app/api/rules/route.ts` | POST | `/api/rules` | Create a new rule |
| `src/app/api/rules/[id]/route.ts` | GET | `/api/rules/:id` | Get single rule |
| `src/app/api/rules/[id]/route.ts` | PUT | `/api/rules/:id` | Update a rule (increments version) |
| `src/app/api/rules/[id]/route.ts` | DELETE | `/api/rules/:id` | Soft-delete a rule (set isActive = false) |
| `src/app/api/rules/evaluate/route.ts` | POST | `/api/rules/evaluate` | Evaluate rules against a context object, return matched rules + winning action |
| `src/app/api/rules/conflicts/route.ts` | POST | `/api/rules/conflicts` | Detect conflicts among a set of rule IDs |
| `src/app/api/rules/suggestions/route.ts` | GET | `/api/rules/suggestions?userId=` | Get auto-generated rule suggestions based on correction patterns |
| `src/app/api/rules/[id]/audit/route.ts` | GET | `/api/rules/:id/audit` | Get audit trail entries where this rule was applied |
| `src/app/api/memory/route.ts` | GET | `/api/memory?userId=&type=` | List memories with filters |
| `src/app/api/memory/route.ts` | POST | `/api/memory` | Create a new memory |
| `src/app/api/memory/[id]/route.ts` | GET | `/api/memory/:id` | Get single memory (triggers reinforcement) |
| `src/app/api/memory/[id]/route.ts` | PUT | `/api/memory/:id` | Update memory content/context/type |
| `src/app/api/memory/[id]/route.ts` | DELETE | `/api/memory/:id` | Delete a memory (hard delete) |
| `src/app/api/memory/search/route.ts` | POST | `/api/memory/search` | Search memories by query, type, strength |
| `src/app/api/memory/decay/route.ts` | POST | `/api/memory/decay` | Trigger decay processing for a user |
| `src/app/api/memory/stats/route.ts` | GET | `/api/memory/stats?userId=` | Get memory statistics |

All routes MUST:
- Use Zod for request body and query parameter validation
- Use `success()`, `error()`, `paginated()` from `@/shared/utils/api-response`
- Use `prisma` from `@/lib/db`
- Wrap in try/catch returning `error('INTERNAL_ERROR', ...)` on failure
- Return proper HTTP status codes (200, 201, 400, 404, 500)

### 5. Dashboard Pages

**Trust Dashboard page:** `src/app/(dashboard)/trust/page.tsx`

Layout:
- Top: Trust score summary (grid of TrustScoreCard components for each domain)
- Middle: Permissions dashboard (PermissionsDashboard component)
- Bottom: Recent consent receipts (ConsentReceiptList component)
- Floating: ExplainButton available on any actionable item

**Trust Layout:** `src/app/(dashboard)/trust/layout.tsx`

Navigation tabs:
- "Overview" (`/trust`)
- "Permissions" (`/trust/permissions`)
- "Consent Log" (`/trust/consent`)
- "Memory" (`/trust/memory`)

**Sub-pages:**
- `src/app/(dashboard)/trust/permissions/page.tsx` -- Full permissions management
- `src/app/(dashboard)/trust/consent/page.tsx` -- Full consent receipt log with search/filter
- `src/app/(dashboard)/trust/memory/page.tsx` -- Memory editing UI with MemoryList, MemorySearch, MemoryEditor

## Acceptance Criteria

- [ ] Rule engine evaluates conditions against arbitrary context objects
- [ ] Conflict detection identifies all three conflict types (CONTRADICTORY_ACTIONS, OVERLAPPING_SCOPE, PRECEDENCE_TIE)
- [ ] Conflict resolution applies precedence > scope > version hierarchy correctly
- [ ] Audit trail produces human-readable explanations for any action
- [ ] Rule inheritance correctly chains Global -> Entity -> Project -> Contact with override
- [ ] Rule suggestions detect 3+ corrections of the same pattern within lookback period
- [ ] Consent receipts are created for every tracked action
- [ ] Permissions service gates actions correctly (returns false for disabled permissions)
- [ ] Redaction service detects at least: emails, phone numbers, SSNs, credit card numbers, names
- [ ] Memory decay applies correct half-life per memory type
- [ ] Memory search returns results sorted by relevance * strength
- [ ] Memory reinforcement correctly boosts strength on access
- [ ] All 17 API routes return correct `ApiResponse<T>` shapes
- [ ] All dashboard pages and components render without errors
- [ ] All unit tests pass with `npx jest tests/unit/engines/`
- [ ] No imports from other worker-owned paths (no cross-module dependencies)
- [ ] No modifications to `src/shared/types/index.ts`, `src/shared/utils/api-response.ts`, `src/lib/db/index.ts`, or `prisma/schema.prisma`

## Implementation Steps

1. **Read context files** -- `src/shared/types/index.ts`, `prisma/schema.prisma`, `src/shared/utils/api-response.ts`, `src/lib/db/index.ts`, `package.json`, `tsconfig.json`
2. **Create branch**: `git checkout -b ai-feature/w16-engines-abc`
3. **Create engine type files** -- `src/engines/policy/types.ts`, `src/engines/trust-ui/types.ts`, `src/engines/memory/types.ts`
4. **Build Policy Engine services** (in order):
   a. `src/engines/policy/rule-crud.ts` (basic CRUD, depends on prisma)
   b. `src/engines/policy/rule-engine.ts` (evaluation + conflict resolution, depends on rule-crud)
   c. `src/engines/policy/rule-suggestion.ts` (depends on rule-engine)
5. **Build Trust UI services** (in order):
   a. `src/engines/trust-ui/consent-service.ts` (depends on prisma)
   b. `src/engines/trust-ui/permissions-service.ts` (depends on prisma)
   c. `src/engines/trust-ui/explain-service.ts` (depends on rule-engine, consent-service)
   d. `src/engines/trust-ui/redaction-service.ts` (pure functions, no DB dependency)
   e. `src/engines/trust-ui/trust-score-service.ts` (depends on prisma)
6. **Build Memory services** (in order):
   a. `src/engines/memory/memory-service.ts` (core CRUD + search)
   b. `src/engines/memory/decay-service.ts` (decay logic + cleanup)
   c. `src/engines/memory/episodic-memory.ts` (episodic specialization)
7. **Build Trust UI components** -- All 8 components in `src/engines/trust-ui/components/`
8. **Build Memory components** -- All 5 components in `src/engines/memory/components/`
9. **Build API routes** -- All 17 route files with Zod schemas
10. **Build dashboard pages** -- Trust layout, overview, permissions, consent, memory pages
11. **Write tests** -- Unit tests for rule conflict resolution, memory decay, redaction
12. **Verify** -- `npx tsc --noEmit`, `npx jest tests/unit/engines/`, `npx next build`

## Tests

Create these test files in `tests/unit/engines/`:

### `tests/unit/engines/rule-engine.test.ts`

```typescript
describe('evaluateRules', () => {
  it('should return matching rules sorted by precedence');
  it('should skip inactive rules');
  it('should evaluate all condition operators (eq, neq, gt, gte, lt, lte, in, contains, matches)');
  it('should handle AND/OR logical groups correctly');
  it('should return empty array when no rules match');
});

describe('resolveConflicts', () => {
  it('should detect contradictory actions (BLOCK vs APPROVE)');
  it('should resolve by higher precedence first');
  it('should resolve by narrower scope when precedence is tied');
  it('should resolve by newer version when scope and precedence tie');
  it('should flag MANUAL_REQUIRED when all resolution criteria tie');
  it('should return empty array when no conflicts exist');
});

describe('getWinningAction', () => {
  it('should return the highest-precedence matching rule');
  it('should return null when no rules match');
});

describe('getInheritedRules', () => {
  it('should return rules in order: Global -> Entity -> Project -> Contact');
  it('should allow narrower scope to override broader scope');
  it('should include only active rules');
});
```

### `tests/unit/engines/rule-suggestion.test.ts`

```typescript
describe('detectCorrectionPattern', () => {
  it('should suggest a rule when 3+ corrections of the same type found');
  it('should not suggest when fewer than 3 corrections found');
  it('should respect lookback window');
  it('should generate descriptive evidence strings');
});
```

### `tests/unit/engines/memory-decay.test.ts`

```typescript
describe('applyDecay', () => {
  it('should reduce short-term memory strength with 24-hour half-life');
  it('should reduce working memory strength with 14-day half-life');
  it('should reduce long-term memory strength with 365-day half-life');
  it('should reduce episodic memory strength with 730-day half-life');
  it('should clean up memories below minimum strength threshold');
  it('should not decay recently accessed memories significantly');
  it('should return correct counts of decayed and cleaned entries');
});

describe('reinforceMemory', () => {
  it('should increase strength by boost amount');
  it('should cap strength at 1.0');
  it('should update lastAccessed timestamp');
});

describe('cleanupWeakMemories', () => {
  it('should delete memories below threshold');
  it('should not delete memories above threshold');
  it('should return count of deleted entries');
});
```

### `tests/unit/engines/redaction-service.test.ts`

```typescript
describe('previewRedaction', () => {
  it('should detect and redact email addresses');
  it('should detect and redact phone numbers');
  it('should detect and redact SSN patterns');
  it('should detect and redact credit card numbers');
  it('should handle text with no sensitive data');
  it('should return correct start/end positions for each redaction');
});

describe('calculateSensitivity', () => {
  it('should return RESTRICTED for SSN/credit card data');
  it('should return CONFIDENTIAL for email/phone');
  it('should return PUBLIC for text with no PII');
});
```

### `tests/unit/engines/memory-service.test.ts`

```typescript
describe('searchMemories', () => {
  it('should return results sorted by relevance * strength');
  it('should filter by memory type');
  it('should filter by minimum strength');
  it('should return matched terms');
  it('should respect limit parameter');
});

describe('recallMemory', () => {
  it('should reinforce memory on access');
  it('should update lastAccessed timestamp');
  it('should return null for non-existent memory');
});
```

Mock the Prisma client in all tests. Do NOT require a live database connection. Use `jest.mock('@/lib/db')` or manual mocks.

## Commit Strategy

Use Conventional Commits. Commit after each logical unit is complete and compiling.

```
feat(engines): add policy engine types and rule CRUD service
feat(engines): implement rule evaluation and conflict resolution engine
feat(engines): add rule inheritance and suggestion service
feat(engines): add trust-ui consent receipt and permissions services
feat(engines): implement explain-action and redaction services
feat(engines): add trust score calculation service
feat(engines): implement contextual memory service with CRUD and search
feat(engines): add memory decay and episodic memory services
feat(engines): add trust-ui dashboard components
feat(engines): add memory management components
feat(engines): add rules API routes with Zod validation
feat(engines): add memory API routes with search and decay endpoints
feat(engines): add trust dashboard pages with layout and navigation
test(engines): add unit tests for rule conflict resolution
test(engines): add unit tests for memory decay and reinforcement
test(engines): add unit tests for redaction and memory search
chore(engines): verify build and final cleanup
```

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
