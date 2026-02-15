# Worker 07: Decision Support Engine (M5)

## Branch: ai-feature/w07-decisions

## Owned Paths (ONLY modify these)

You MUST only create or modify files within these directories. Do NOT touch anything outside them.

```
src/modules/decisions/services/            # Business logic services
src/modules/decisions/types/               # Module-specific TypeScript types
src/modules/decisions/components/          # React components for decision UI
src/modules/decisions/api/                 # Module-internal API helpers / validation
src/app/api/decisions/                     # Next.js API routes for decisions
src/app/(dashboard)/decisions/             # Dashboard pages for decision support
tests/unit/decisions/                      # All unit tests for this worker
```

## Context (read these first, do NOT modify)

Read and internalize these files before writing any code. They define the shared contracts.

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project-wide dev process, commit conventions, done criteria |
| `src/shared/types/index.ts` | Immutable shared types: `Document`, `Citation`, `ApiResponse`, `ApiError`, `ApiMeta`, `Priority`, `BlastRadius`, `ActionActor` |
| `prisma/schema.prisma` | Database schema: `Document`, `Entity`, `ActionLog` models |
| `src/shared/utils/api-response.ts` | API helpers: `success<T>()`, `error()`, `paginated<T>()` |
| `src/lib/db/index.ts` | Prisma client singleton: `import { prisma } from '@/lib/db'` |
| `package.json` | Stack: Next.js 16, React 19, Prisma 7, Zod 4, date-fns 4, Jest 30, ts-jest |
| `tsconfig.json` | Path aliases: `@/` maps to `src/` |

## Requirements

### 1. Decision Framework Service

**Service file:** `src/modules/decisions/services/decision-framework.ts`

Build a service that structures decisions into 3-option briefs with weighted scoring.

```typescript
export interface DecisionRequest {
  entityId: string;
  title: string;
  description: string;
  context: string;
  deadline?: Date;
  stakeholders: string[];        // Contact IDs
  constraints: string[];
  blastRadius: BlastRadius;
}

export interface DecisionBrief {
  id: string;
  title: string;
  options: DecisionOption[];     // Always exactly 3: conservative, moderate, aggressive
  recommendation: string;        // Which option and why
  confidenceScore: number;       // 0-1
  blindSpots: string[];          // Things the analysis might be missing
  createdAt: Date;
}

export interface DecisionOption {
  id: string;
  label: string;
  strategy: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
  description: string;
  pros: string[];
  cons: string[];
  estimatedCost: number;
  estimatedTimeline: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  reversibility: 'EASY' | 'MODERATE' | 'DIFFICULT' | 'IRREVERSIBLE';
  secondOrderEffects: SecondOrderEffect[];
}
```

Implement:
- `createDecisionBrief(request: DecisionRequest): Promise<DecisionBrief>` -- Generates 3-option brief
- `getDecisionBrief(id: string): Promise<DecisionBrief | null>`
- `listDecisionBriefs(entityId: string, page: number, pageSize: number): Promise<{ briefs: DecisionBrief[]; total: number }>`

### 2. Decision Matrix with Weighted Scoring

**Service file:** `src/modules/decisions/services/decision-matrix.ts`

```typescript
export interface MatrixCriterion {
  id: string;
  name: string;
  weight: number;               // 0-1, all weights must sum to 1
  description?: string;
}

export interface MatrixScore {
  criterionId: string;
  optionId: string;
  score: number;                // 1-10
  rationale: string;
}

export interface MatrixResult {
  optionScores: { optionId: string; label: string; weightedTotal: number; rank: number }[];
  sensitivityAnalysis: SensitivityResult[];
  winner: string;               // Option ID
  margin: number;               // Gap between #1 and #2
}

export interface SensitivityResult {
  criterionId: string;
  criterionName: string;
  tippingWeight: number | null;  // Weight at which winner changes, null if never
  impactOnRanking: 'NONE' | 'MINOR' | 'MAJOR';
}
```

Implement:
- `createMatrix(decisionId: string, criteria: MatrixCriterion[], scores: MatrixScore[]): MatrixResult` -- Pure function, no DB
- `runSensitivityAnalysis(criteria: MatrixCriterion[], scores: MatrixScore[]): SensitivityResult[]` -- Vary each weight +/- 20% and check if winner changes
- `validateWeights(criteria: MatrixCriterion[]): { valid: boolean; error?: string }` -- Weights must sum to 1.0 (+/- 0.01 tolerance)

### 3. Pre-Mortem Analysis

**Service file:** `src/modules/decisions/services/pre-mortem.ts`

```typescript
export interface PreMortemRequest {
  decisionId: string;
  chosenOptionId: string;
  timeHorizon: '30_DAYS' | '90_DAYS' | '1_YEAR' | '3_YEARS';
}

export interface PreMortemResult {
  failureScenarios: FailureScenario[];
  mitigationPlan: MitigationStep[];
  overallRiskScore: number;      // 0-100
  killSignals: string[];         // Leading indicators that this is failing
}

export interface FailureScenario {
  id: string;
  description: string;
  probability: 'LOW' | 'MEDIUM' | 'HIGH';
  impact: 'LOW' | 'MEDIUM' | 'HIGH';
  category: 'FINANCIAL' | 'OPERATIONAL' | 'REPUTATIONAL' | 'LEGAL' | 'TECHNICAL';
  rootCause: string;
}

export interface MitigationStep {
  scenarioId: string;
  action: string;
  owner: string;
  deadline?: Date;
  cost?: number;
}
```

Implement:
- `runPreMortem(request: PreMortemRequest): Promise<PreMortemResult>` -- Generates failure scenarios and mitigations
- `calculateRiskScore(scenarios: FailureScenario[]): number` -- Weighted average of probability x impact

### 4. Second-Order Effects Visualization

**Service file:** `src/modules/decisions/services/effects-analyzer.ts`

```typescript
export interface SecondOrderEffect {
  id: string;
  description: string;
  order: 1 | 2 | 3;             // 1st, 2nd, 3rd order
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  likelihood: number;            // 0-1
  affectedAreas: string[];
  parentEffectId?: string;       // For chaining effects
}

export interface EffectsTree {
  rootAction: string;
  effects: SecondOrderEffect[];
  totalPositive: number;
  totalNegative: number;
  netSentiment: number;          // -1 to 1
}
```

Implement:
- `analyzeEffects(action: string, context: string): Promise<EffectsTree>` -- Returns tree of cascading effects
- `flattenEffectsTree(tree: EffectsTree): SecondOrderEffect[]` -- Flatten for table display
- `filterByOrder(effects: SecondOrderEffect[], order: number): SecondOrderEffect[]`

### 5. Decision Journal

**Service file:** `src/modules/decisions/services/decision-journal.ts`

```typescript
export interface JournalEntry {
  id: string;
  entityId: string;
  decisionId?: string;           // Link to DecisionBrief if one exists
  title: string;
  context: string;
  optionsConsidered: string[];
  chosenOption: string;
  rationale: string;
  expectedOutcomes: string[];
  actualOutcomes?: string[];
  reviewDate: Date;
  status: 'PENDING_REVIEW' | 'REVIEWED_CORRECT' | 'REVIEWED_INCORRECT' | 'REVIEWED_MIXED';
  lessonsLearned?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

Implement:
- `createEntry(entry: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<JournalEntry>`
- `reviewEntry(id: string, actualOutcomes: string[], status: string, lessonsLearned: string): Promise<JournalEntry>`
- `getUpcomingReviews(entityId: string, days: number): Promise<JournalEntry[]>` -- Entries with reviewDate within N days
- `getDecisionAccuracy(entityId: string): Promise<{ total: number; correct: number; incorrect: number; mixed: number; accuracy: number }>`

### 6. Deep Research Agent Service

**Service file:** `src/modules/decisions/services/research-agent.ts`

```typescript
export interface ResearchRequest {
  query: string;
  entityId: string;
  depth: 'QUICK' | 'STANDARD' | 'DEEP';
  sourceTypes: ('WEB' | 'DOCUMENT' | 'KNOWLEDGE')[];
  maxSources: number;
}

export interface ResearchReport {
  id: string;
  query: string;
  summary: string;
  findings: ResearchFinding[];
  sources: ResearchSource[];
  confidenceScore: number;
  gaps: string[];                // Areas where information is missing
  createdAt: Date;
}

export interface ResearchFinding {
  claim: string;
  evidence: string;
  sourceIds: string[];
  confidence: number;
}

export interface ResearchSource {
  id: string;
  type: 'WEB' | 'DOCUMENT' | 'KNOWLEDGE';
  title: string;
  url?: string;
  credibilityScore: number;     // 0-1
  excerpt: string;
  accessedAt: Date;
}
```

Implement:
- `conductResearch(request: ResearchRequest): Promise<ResearchReport>` -- Placeholder: generates structured report skeleton
- `evaluateSourceCredibility(source: Partial<ResearchSource>): number` -- Score 0-1 based on source type and attributes
- `analyzeDocument(content: string): Promise<DocumentAnalysis>` -- Extract key terms, risks, obligations

```typescript
export interface DocumentAnalysis {
  keyTerms: string[];
  risks: { description: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' }[];
  obligations: { party: string; obligation: string; deadline?: string }[];
  summary: string;
}
```

### 7. API Routes

Create these Next.js API route handlers:

| Route File | Method | Path | Purpose |
|------------|--------|------|---------|
| `src/app/api/decisions/route.ts` | GET | `/api/decisions` | List decision briefs with pagination, filter by entityId |
| `src/app/api/decisions/route.ts` | POST | `/api/decisions` | Create new decision brief (accepts DecisionRequest) |
| `src/app/api/decisions/[id]/route.ts` | GET | `/api/decisions/:id` | Get single decision brief |
| `src/app/api/decisions/[id]/route.ts` | DELETE | `/api/decisions/:id` | Archive decision brief |
| `src/app/api/decisions/[id]/matrix/route.ts` | POST | `/api/decisions/:id/matrix` | Run decision matrix with criteria and scores |
| `src/app/api/decisions/[id]/pre-mortem/route.ts` | POST | `/api/decisions/:id/pre-mortem` | Run pre-mortem analysis |
| `src/app/api/decisions/journal/route.ts` | GET | `/api/decisions/journal` | List journal entries with pagination |
| `src/app/api/decisions/journal/route.ts` | POST | `/api/decisions/journal` | Create journal entry |
| `src/app/api/decisions/journal/[id]/review/route.ts` | PUT | `/api/decisions/journal/:id/review` | Review a journal entry |
| `src/app/api/decisions/research/route.ts` | POST | `/api/decisions/research` | Conduct research |

All routes MUST:
- Use Zod for request body validation
- Use `success()`, `error()`, `paginated()` from `@/shared/utils/api-response`
- Use `prisma` from `@/lib/db`
- Wrap in try/catch returning `error('INTERNAL_ERROR', ...)` on failure
- Return proper HTTP status codes (200, 201, 400, 404, 500)

Store decision briefs and journal entries in the `Document` table with `type = 'BRIEF'` or a new JSON structure. Use the `content` field (TEXT) to store serialized JSON of the decision-specific data. Use `citations` JSON field for research sources.

### 8. Dashboard Pages

**Decision hub page:** `src/app/(dashboard)/decisions/page.tsx`
- Decision brief cards showing title, blast radius badge, confidence score
- "New Decision" button that opens brief creation form
- Filter by entity
- Sort by date, confidence, blast radius

**Decision detail page:** `src/app/(dashboard)/decisions/[id]/page.tsx`
- 3-column layout showing Conservative / Moderate / Aggressive options side by side
- Decision matrix table with weighted scores and color-coded cells
- Pre-mortem results panel
- Second-order effects tree visualization (nested list with indentation and sentiment color-coding)
- Action buttons: "Run Matrix", "Run Pre-Mortem", "Log to Journal"

**Decision journal page:** `src/app/(dashboard)/decisions/journal/page.tsx`
- Journal entry list with status badges (PENDING_REVIEW, REVIEWED_CORRECT, etc.)
- Upcoming reviews section
- Decision accuracy stats (pie chart placeholder: correct/incorrect/mixed percentages)

**Components to create in `src/modules/decisions/components/`:**
- `DecisionBriefCard.tsx` -- Summary card for decision list
- `OptionComparisonPanel.tsx` -- 3-column option comparison
- `DecisionMatrixTable.tsx` -- Weighted criteria table with totals
- `SensitivityChart.tsx` -- Sensitivity analysis results display
- `PreMortemPanel.tsx` -- Failure scenarios and mitigations
- `EffectsTreeView.tsx` -- Nested effects visualization with color-coding
- `JournalEntryCard.tsx` -- Journal entry display with review status
- `JournalReviewForm.tsx` -- Form for reviewing past decisions
- `ResearchReportPanel.tsx` -- Structured research findings display
- `BlastRadiusBadge.tsx` -- Color-coded badge (LOW=green, MEDIUM=yellow, HIGH=orange, CRITICAL=red)
- `NewDecisionForm.tsx` -- Multi-step form for creating decision requests

All components must be client components (`'use client'`) using Tailwind CSS. No external UI libraries.

## Acceptance Criteria

- [ ] Decision brief generation produces exactly 3 options (conservative, moderate, aggressive)
- [ ] Decision matrix correctly calculates weighted scores and ranks options
- [ ] Sensitivity analysis identifies the tipping weight for each criterion
- [ ] Weight validation rejects criteria sets not summing to 1.0
- [ ] Pre-mortem generates at least 3 failure scenarios per analysis
- [ ] Risk score calculation uses probability x impact weighting
- [ ] Effects tree correctly chains 1st, 2nd, and 3rd order effects
- [ ] Journal accuracy calculation returns correct percentages
- [ ] All 10 API routes return correct `ApiResponse<T>` shapes
- [ ] Zod validation rejects malformed requests
- [ ] Dashboard pages render without errors
- [ ] All unit tests pass with `npx jest tests/unit/decisions/`
- [ ] No imports from other worker-owned paths

## Implementation Steps

1. **Read context files** -- `src/shared/types/index.ts`, `prisma/schema.prisma`, `src/shared/utils/api-response.ts`, `src/lib/db/index.ts`
2. **Create types** -- `src/modules/decisions/types/index.ts` with all module-specific interfaces
3. **Build core services** (in order):
   a. `decision-matrix.ts` (pure functions, no DB dependency)
   b. `effects-analyzer.ts` (pure functions, no DB dependency)
   c. `pre-mortem.ts` (pure functions, no DB dependency)
   d. `decision-framework.ts` (depends on matrix, effects, prisma)
   e. `decision-journal.ts` (depends on prisma)
   f. `research-agent.ts` (placeholder with structured stubs)
4. **Build API routes** -- All 10 route files with Zod schemas
5. **Build components** -- All 11 React components
6. **Build dashboard pages** -- Hub, detail, and journal pages
7. **Write tests** -- Unit tests for all services
8. **Verify** -- `npx tsc --noEmit`, `npx jest tests/unit/decisions/`, `npx next build`

## Tests

Create these test files in `tests/unit/decisions/`:

| Test File | What It Tests |
|-----------|---------------|
| `decision-framework.test.ts` | Brief generation produces 3 options, each has required fields, confidence score in range |
| `decision-matrix.test.ts` | Weighted score calculation, ranking correctness, weight validation (sum to 1.0 check, edge cases: all zeros, negative weights) |
| `sensitivity-analysis.test.ts` | Tipping weight detection, impact classification, edge case: all options tied |
| `pre-mortem.test.ts` | Scenario generation, risk score calculation (probability x impact), mitigation plan structure |
| `effects-analyzer.test.ts` | Effects tree depth, sentiment counting, flatten function correctness, filter by order |
| `decision-journal.test.ts` | Entry creation, review flow, accuracy stats calculation, upcoming reviews filtering |
| `research-agent.test.ts` | Source credibility scoring, document analysis extraction |

Each test file must:
- Mock `prisma` using `jest.mock('@/lib/db')`
- Use `describe/it` blocks with descriptive names
- Test both success and error paths
- Test edge cases (empty inputs, boundary values)
- Import types from `@/shared/types` and `@/modules/decisions/types`

## Commit Strategy

Use Conventional Commits. Commit after each logical unit is complete and compiling.

```
feat(decisions): add module-specific types and interfaces
feat(decisions): implement decision matrix with weighted scoring
feat(decisions): implement effects analyzer for second-order effects
feat(decisions): implement pre-mortem analysis service
feat(decisions): implement decision framework with 3-option briefs
feat(decisions): implement decision journal with review flow
feat(decisions): implement research agent service with stubs
feat(decisions): add decision CRUD and matrix API routes
feat(decisions): add journal and research API routes
feat(decisions): add decision dashboard components
feat(decisions): add decision hub, detail, and journal pages
test(decisions): add unit tests for all services
chore(decisions): verify build and final cleanup
```
