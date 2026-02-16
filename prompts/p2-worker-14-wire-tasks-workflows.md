# Worker 14: Wire AI & Auth into Tasks + Workflows + Finance

## Branch

`ai-feature/p2-w14-wire-tasks-workflows`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to modifying files within these paths. Do NOT touch any files outside these directories:

- `src/modules/tasks/services/` (modify existing -- nlp-parser.ts, prioritization-engine.ts, forecasting-service.ts)
- `src/modules/workflows/services/` (modify existing -- ai-decision-service.ts, action-handlers.ts, simulation-service.ts)
- `src/modules/finance/services/` (modify existing -- cashflow-service.ts, invoice-service.ts, budget-service.ts)
- `src/app/api/tasks/` (modify existing -- all route.ts files to add withAuth)
- `src/app/api/workflows/` (modify existing -- all route.ts files to add withAuth)
- `src/app/api/finance/` (modify existing -- all route.ts files to add withAuth)
- `tests/unit/tasks/` (update existing tests if mocks change)
- `tests/unit/workflows/` (update existing tests if mocks change)
- `tests/unit/finance/` (update existing tests if mocks change)

### Do NOT modify

- `jest.config.ts`
- `package.json`
- Any files outside the owned paths above

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

1. **`src/lib/ai/index.ts`** -- Exports `generateText(prompt, options?)`, `generateJSON<T>(prompt, options?)`, `chat(messages, options?)`, `streamText(prompt, options?)`. Options include `model`, `maxTokens`, `temperature`, `system`.
2. **`src/lib/ai/client.ts`** -- Full AI client implementation. `generateJSON` appends a system instruction to respond with JSON only.
3. **`src/shared/middleware/auth.ts`** -- Three auth wrappers:
   - `withAuth(req, handler)` -- Validates JWT, passes `AuthSession` to handler. Returns 401.
   - `withRole(req, roles, handler)` -- Checks role against allowed list. Returns 403.
   - `withEntityAccess(req, entityId, handler)` -- Verifies entity belongs to user. Returns 403/404.
4. **`src/modules/tasks/services/nlp-parser.ts`** -- Current NLP parser uses regex patterns for priority (`PRIORITY_PATTERNS`), dates (`DATE_PATTERNS` with resolvers for tomorrow, next Monday, etc.), times, durations, and person names. Parses input like "Call John tomorrow at 3pm about the budget" into `ParsedTaskInput`. All extraction is regex/keyword-based.
5. **`src/modules/tasks/services/prioritization-engine.ts`** -- Task prioritization engine. Read to determine if AI is used for priority suggestions.
6. **`src/modules/tasks/services/forecasting-service.ts`** -- Task completion forecasting. Read to determine if AI prediction is used.
7. **`src/modules/tasks/types/`** -- Task types including `ParsedTaskInput`, `NLPEntity`.
8. **`src/modules/workflows/services/ai-decision-service.ts`** -- Handles AI decision nodes in workflows. Currently returns placeholder/mock responses. Has `executeAIDecision` that switches on `config.decisionType` (CLASSIFY, SCORE, DRAFT, SUMMARIZE, RECOMMEND, EXTRACT). All inner methods (`classifyInput`, `scoreInput`, `draftContent`, `summarizeContent`, `generateRecommendation`, `extractEntities`) return mock data.
9. **`src/modules/workflows/services/action-handlers.ts`** -- Workflow action handlers. Read to find AI-related action types.
10. **`src/modules/workflows/services/simulation-service.ts`** -- Workflow simulation. Read to determine if AI is used.
11. **`src/modules/workflows/types/`** -- Workflow types including `AIDecisionNodeConfig`.
12. **`src/modules/finance/services/cashflow-service.ts`** -- Cashflow service. Read to determine if AI forecasting exists.
13. **`src/modules/finance/services/invoice-service.ts`** -- Invoice service. Read to determine if AI description generation exists.
14. **`src/modules/finance/services/budget-service.ts`** -- Budget service. Read for AI scenario modeling.
15. **`src/shared/types/index.ts`** -- Shared types.
16. **`src/shared/utils/api-response.ts`** -- Use `success()`, `error()` for API responses.
17. **`prisma/schema.prisma`** -- Database models: Task, Project, Workflow, Invoice, etc.

## Requirements

### 1. Tasks NLP Parser -- Wire AI (`src/modules/tasks/services/nlp-parser.ts`)

**Read the file first** to understand the current regex-based NLP.

#### Specific modifications:

a. **Add import at top of file**:
```typescript
import { generateJSON } from '@/lib/ai';
```

b. **Add AI-powered parsing method**:
```typescript
async function parseWithAI(
  input: string,
  referenceDate: Date = new Date()
): Promise<ParsedTaskInput> {
  const result = await generateJSON<{
    title: string;
    description?: string;
    dueDate?: string;        // ISO date string
    dueTime?: string;        // HH:MM 24h format
    priority: 'P0' | 'P1' | 'P2';
    assignee?: string;       // person name
    project?: string;        // project name if mentioned
    tags: string[];
    estimatedMinutes?: number;
    recurrence?: string;     // DAILY, WEEKLY, MONTHLY, or null
    dependencies?: string[]; // other tasks mentioned
    confidence: number;
  }>(`Parse this natural language task input into structured task data.

Input: "${input}"
Reference date (today): ${referenceDate.toISOString().split('T')[0]}
Day of week: ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][referenceDate.getDay()]}

Return JSON with:
- title: concise task title (action-oriented, starts with verb)
- description: additional context if present, null otherwise
- dueDate: ISO date string (YYYY-MM-DD), null if no date mentioned
- dueTime: 24h time (HH:MM) if specific time mentioned, null otherwise
- priority: P0 (urgent/critical), P1 (important), P2 (normal/low)
- assignee: person name if someone is mentioned to do the task, null otherwise
- project: project or category name if mentioned, null otherwise
- tags: relevant tags extracted from context
- estimatedMinutes: estimated time to complete, null if unclear
- recurrence: DAILY, WEEKLY, MONTHLY if recurring, null otherwise
- dependencies: names/descriptions of prerequisite tasks if mentioned
- confidence: 0.0-1.0 parsing confidence`, {
    maxTokens: 512,
    temperature: 0.2,
    system: 'You are a task parsing assistant. Convert natural language into structured task data. Be precise with dates and times. Default priority is P1 unless urgency is explicit.',
  });

  // Map AI output to ParsedTaskInput type
  // ...
}
```

c. **Modify the main parse function** to use AI with fallback:
- Try `parseWithAI` first
- If AI call fails or confidence is below 0.4, fall back to existing regex parsing
- Log which method was used
- Wrap AI call in try/catch

d. **Keep all existing regex patterns and methods** intact as the fallback path.

### 2. Tasks Prioritization Engine -- Wire AI (`src/modules/tasks/services/prioritization-engine.ts`)

**Read the file first** to determine if AI suggestion methods exist.

#### Modifications (if applicable):

- If there are methods that suggest task priorities or reorder tasks, wire `generateJSON` to get AI-powered priority suggestions based on task context, deadlines, dependencies, and workload
- If purely algorithmic (e.g., weighted scoring), keep as-is and add a new AI method:

```typescript
export async function suggestPriorityWithAI(
  task: { title: string; description?: string; dueDate?: Date; dependencies?: string[] },
  context: { openTaskCount: number; upcomingDeadlines: number; entityGoals?: string[] }
): Promise<{ priority: 'P0' | 'P1' | 'P2'; reasoning: string }> {
  // Call generateJSON with task and context
  // Fall back to algorithmic scoring on failure
}
```

### 3. Tasks Forecasting Service -- Wire AI (`src/modules/tasks/services/forecasting-service.ts`)

**Read the file first** to determine current forecasting approach.

#### Modifications:

- If the service predicts task completion dates or probabilities, wire `generateJSON` to get AI-powered predictions that consider historical patterns, task complexity, and team velocity
- Build prompts that include historical completion data from Prisma queries
- Fall back to statistical/algorithmic methods on failure

### 4. Workflows AI Decision Service -- Wire AI (`src/modules/workflows/services/ai-decision-service.ts`)

**Read the file first** -- this is the primary AI integration point for workflows. Currently returns mock data for all decision types.

#### Specific modifications:

a. **Add import**:
```typescript
import { generateJSON, generateText } from '@/lib/ai';
```

b. **Replace all mock implementations** with real AI calls:

**`classifyInput`**:
```typescript
async function classifyInput(
  prompt: string,
  contextJson: string,
  categories: string[]
): Promise<ClassifyResult> {
  const result = await generateJSON<{ category: string; confidence: number }>(
    `${prompt}\n\nContext: ${contextJson}\n\nClassify into one of: ${categories.join(', ')}`,
    { maxTokens: 256, temperature: 0.3, system: 'You are a classification engine. Return the best matching category and your confidence 0-1.' }
  );
  return result;
}
```

**`scoreInput`**:
```typescript
async function scoreInput(
  prompt: string,
  contextJson: string,
  dimensions: string[]
): Promise<ScoreResult> {
  const result = await generateJSON<{ score: number; breakdown: Record<string, number> }>(
    `${prompt}\n\nContext: ${contextJson}\n\nScore on dimensions: ${dimensions.join(', ')}. Each dimension 0-100. Overall score is weighted average.`,
    { maxTokens: 512, temperature: 0.3 }
  );
  return result;
}
```

**`draftContent`**:
```typescript
async function draftContent(
  prompt: string,
  contextJson: string
): Promise<DraftResult> {
  const content = await generateText(
    `${prompt}\n\nContext: ${contextJson}`,
    { maxTokens: 1024, temperature: 0.7, system: 'You are a content drafting assistant. Produce high-quality, contextually appropriate content.' }
  );
  return { content, confidence: 0.8 };
}
```

**`summarizeContent`**:
```typescript
async function summarizeContent(
  prompt: string,
  contextJson: string
): Promise<SummaryResult> {
  const summary = await generateText(
    `${prompt}\n\nContent to summarize: ${contextJson}`,
    { maxTokens: 512, temperature: 0.3, system: 'You are a summarization engine. Be concise and capture key points.' }
  );
  return { summary };
}
```

**`generateRecommendation`** and **`extractEntities`**: Similar pattern -- replace mock returns with real AI calls using `generateJSON`.

c. **Wrap each AI call in try/catch** -- return a fallback mock result with `confidence: 0` and `requiresHumanReview: true` if AI fails.

d. **Update `executeAIDecision`** -- the switch statement routes to the correct function. Ensure the `requiresHumanReview` field is set based on the confidence threshold from `config.confidenceThreshold`.

### 5. Workflows Action Handlers -- Wire AI (`src/modules/workflows/services/action-handlers.ts`)

**Read the file first** to find AI-related action types.

#### Modifications:

- If there are action types like `AI_CLASSIFY`, `AI_DRAFT`, `AI_SUMMARIZE`, etc., wire them to call `executeAIDecision` from the updated `ai-decision-service.ts`
- If action handlers have placeholder AI responses, replace with real calls
- Ensure error handling routes failed AI actions to human review queues

### 6. Finance Services -- Wire AI

**Read each file first** to determine where AI can add value.

#### `cashflow-service.ts`:
- If there are forecast/projection methods that use simple math, enhance with AI:
  - Add `generateJSON` call for AI-powered cashflow predictions
  - Include historical transaction data in the prompt
  - Fall back to statistical projection on failure

#### `invoice-service.ts`:
- If invoice creation has description/memo fields:
  - Add `generateText` for AI-generated invoice descriptions based on line items and client context
  - Add `generateText` for payment reminder email drafts
  - Fall back to template-based descriptions on failure

#### `budget-service.ts`:
- If there are scenario modeling or forecasting methods:
  - Wire `generateJSON` for AI-powered budget scenario analysis
  - Include historical spending patterns in prompts
  - Fall back to rule-based scenarios on failure

### 7. Apply Auth to All API Routes

Wrap every route handler in the owned API paths with `withAuth()` or `withEntityAccess()`.

#### Pattern:

```typescript
import { withAuth, withEntityAccess } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';

// Before: export async function GET(request: NextRequest) { ... }
// After:
export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      // Use session.userId instead of getCurrentUserId()
      // Use session.activeEntityId for entity scoping
    } catch (err) { /* ... */ }
  });
}
```

#### Routes to wrap:

**`src/app/api/tasks/`** -- All route files. Use `withAuth` for all handlers. For entity-scoped task operations, use `withEntityAccess`.

**`src/app/api/workflows/`** -- All route files. Use `withAuth` for all handlers. For entity-scoped workflow operations, use `withEntityAccess`.

**`src/app/api/finance/`** -- All route files. Use `withAuth` for all handlers. For entity-scoped finance operations, use `withEntityAccess`.

Enumerate all route files in these directories by reading their contents first, then apply the auth wrapping pattern.

## Acceptance Criteria

1. `nlp-parser.ts` calls `generateJSON` from `@/lib/ai` to parse natural language into structured task data.
2. `nlp-parser.ts` falls back to regex parsing if AI call fails or confidence is low.
3. `prioritization-engine.ts` has AI-powered priority suggestions (if applicable).
4. `forecasting-service.ts` uses AI for completion predictions (if applicable).
5. `ai-decision-service.ts` calls real AI for all decision types: CLASSIFY, SCORE, DRAFT, SUMMARIZE, RECOMMEND, EXTRACT -- no more mock responses.
6. `ai-decision-service.ts` falls back to mock responses with `requiresHumanReview: true` on AI failure.
7. `action-handlers.ts` correctly routes AI action types to the updated AI decision service.
8. Finance services use AI for forecasting, invoice descriptions, and/or scenario analysis where applicable.
9. All route handlers in `src/app/api/tasks/`, `src/app/api/workflows/`, `src/app/api/finance/` are wrapped with `withAuth()` or `withEntityAccess()`.
10. No uses of `getCurrentUserId()` stubs remain in wrapped routes.
11. `jest.config.ts` and `package.json` are NOT modified.
12. All existing tests still pass (update mocks if needed).

## Implementation Steps

1. **Read all context files** listed above. Pay special attention to current implementation patterns, TODO comments, and placeholder annotations.
2. **Create branch**: `git checkout -b ai-feature/p2-w14-wire-tasks-workflows`
3. **Modify `nlp-parser.ts`**: Add AI import, create `parseWithAI`, update main parse function to use AI with fallback.
4. **Read and modify `prioritization-engine.ts`**: Wire AI for priority suggestions if applicable.
5. **Read and modify `forecasting-service.ts`**: Wire AI for completion predictions if applicable.
6. **Modify `ai-decision-service.ts`**: Add AI imports, replace ALL mock implementations (`classifyInput`, `scoreInput`, `draftContent`, `summarizeContent`, `generateRecommendation`, `extractEntities`) with real AI calls.
7. **Read and modify `action-handlers.ts`**: Wire AI action types to updated AI decision service.
8. **Read and optionally modify `simulation-service.ts`**: Wire AI if applicable.
9. **Read and modify finance services**: Wire AI into `cashflow-service.ts`, `invoice-service.ts`, `budget-service.ts` where applicable.
10. **Wrap tasks API routes**: Add `withAuth`/`withEntityAccess` to all handlers in `src/app/api/tasks/`.
11. **Wrap workflows API routes**: Add `withAuth`/`withEntityAccess` to all handlers in `src/app/api/workflows/`.
12. **Wrap finance API routes**: Add `withAuth`/`withEntityAccess` to all handlers in `src/app/api/finance/`.
13. **Update tests**: Update mocks in relevant test directories.
14. **Type-check**: `npx tsc --noEmit`
15. **Run tests**: `npx jest tests/unit/tasks/ tests/unit/workflows/ tests/unit/finance/`
16. **Commit** with conventional commits.

## Tests Required

Update existing test files to mock the AI client:

### In `tests/unit/tasks/` (update existing)
```typescript
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

describe('NLP Parser with AI', () => {
  it('should call generateJSON for natural language task parsing');
  it('should parse "Call John tomorrow at 3pm about the budget" into structured data');
  it('should extract assignee, due date, time, and context from AI response');
  it('should fall back to regex parsing when AI fails');
  it('should fall back to regex parsing when AI confidence is below 0.4');
  it('should handle tasks with no date or assignee');
  it('should handle recurring task patterns via AI');
});
```

### In `tests/unit/workflows/` (update existing)
```typescript
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
  generateText: jest.fn(),
}));

describe('AI Decision Service with real AI', () => {
  describe('classifyInput', () => {
    it('should call generateJSON with prompt, context, and categories');
    it('should return category and confidence from AI');
    it('should fall back to mock with requiresHumanReview on failure');
  });
  describe('scoreInput', () => {
    it('should call generateJSON with prompt and dimensions');
    it('should return score and breakdown from AI');
  });
  describe('draftContent', () => {
    it('should call generateText with prompt and context');
    it('should return generated content');
  });
  describe('summarizeContent', () => {
    it('should call generateText for summarization');
    it('should return concise summary');
  });
  describe('executeAIDecision', () => {
    it('should route CLASSIFY to classifyInput');
    it('should route SCORE to scoreInput');
    it('should route DRAFT to draftContent');
    it('should set requiresHumanReview when confidence < threshold');
  });
});
```

### In `tests/unit/finance/` (update existing)
```typescript
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
  generateText: jest.fn(),
}));

describe('Finance services with AI', () => {
  it('should use AI for cashflow predictions (if wired)');
  it('should use AI for invoice descriptions (if wired)');
  it('should fall back to non-AI methods on failure');
});
```

## Commit Strategy

Make atomic commits in this order:

1. `feat(tasks): wire AI-powered NLP task parsing via generateJSON with regex fallback`
   - Files: `src/modules/tasks/services/nlp-parser.ts`
2. `feat(tasks): wire AI into prioritization and forecasting services`
   - Files: `src/modules/tasks/services/prioritization-engine.ts`, `forecasting-service.ts`
3. `feat(workflows): replace mock AI decision service with real Anthropic API calls`
   - Files: `src/modules/workflows/services/ai-decision-service.ts`
4. `feat(workflows): wire AI action types in workflow action handlers`
   - Files: `src/modules/workflows/services/action-handlers.ts`
5. `feat(finance): wire AI into cashflow forecasting and invoice description generation`
   - Files: `src/modules/finance/services/cashflow-service.ts`, `invoice-service.ts`, `budget-service.ts`
6. `feat(tasks): apply withAuth to all tasks API route handlers`
   - Files: All `route.ts` in `src/app/api/tasks/`
7. `feat(workflows): apply withAuth to all workflows API route handlers`
   - Files: All `route.ts` in `src/app/api/workflows/`
8. `feat(finance): apply withAuth to all finance API route handlers`
   - Files: All `route.ts` in `src/app/api/finance/`
9. `test(tasks): update NLP parser tests with AI client mocks`
   - Files: `tests/unit/tasks/`
10. `test(workflows): update AI decision service tests with real AI mocks`
    - Files: `tests/unit/workflows/`
11. `test(finance): update finance service tests with AI mocks`
    - Files: `tests/unit/finance/`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
