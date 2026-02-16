# Worker 16: Wire AI & Auth into Analytics + AI-Quality

## Branch

`ai-feature/p2-w16-wire-analytics`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to modifying files within these paths. Do NOT touch any files outside these directories:

```
src/modules/analytics/                 # Analytics module services and components
src/modules/ai-quality/                # AI Quality harness services and components
src/app/api/analytics/                 # API routes for analytics data
src/app/(dashboard)/analytics/         # Dashboard pages for analytics
src/app/(dashboard)/ai-quality/        # Dashboard pages for AI quality metrics
tests/unit/analytics/                  # Unit tests (modify existing or add new)
```

**DO NOT modify these files:**
- `jest.config.ts`
- `package.json`
- `src/lib/ai/` -- the AI client is shared infrastructure, read only
- `src/shared/middleware/auth.ts` -- the auth middleware is shared infrastructure, read only
- `src/shared/types/index.ts`
- `src/shared/utils/api-response.ts`
- `src/lib/db/index.ts`
- `prisma/schema.prisma`

## Context (read these first, do NOT modify)

Before modifying any code, read and internalize these files. They define the shared contracts and the AI/auth APIs you will wire in.

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project-wide dev process, commit conventions, done criteria |
| `src/lib/ai/index.ts` | AI client exports: `generateText`, `generateJSON`, `chat`, `streamText` with `AIOptions` |
| `src/lib/ai/client.ts` | Full AI client implementation -- understand the function signatures and `AIOptions` type |
| `src/shared/middleware/auth.ts` | Auth middleware: `withAuth(req, handler)`, `withRole(req, roles, handler)`, `withEntityAccess(req, entityId, handler)` |
| `src/shared/types/index.ts` | Immutable shared types |
| `src/shared/utils/api-response.ts` | API helpers: `success<T>()`, `error()`, `paginated<T>()` |
| `src/lib/db/index.ts` | Prisma client singleton: `import { prisma } from '@/lib/db'` |
| `src/modules/analytics/types.ts` | Analytics type definitions (TimeAuditReport, ProductivityScore, GoalDefinition, HabitCorrelation, etc.) |
| `src/modules/ai-quality/types.ts` | AI Quality type definitions (AccuracyScorecard, GoldenTestCase, BiasReport, etc.) |
| `tsconfig.json` | Path aliases: `@/` maps to `src/` |

## Requirements

### 1. Wire AI into Analytics Services

Read each service file in `src/modules/analytics/services/`. Look for patterns such as:
- Hardcoded return values that should be AI-generated
- Placeholder strings like `"TODO"`, `"placeholder"`, `"mock"`
- Functions that return static suggestions, insights, or recommendations
- Any function that generates natural language output without calling AI

Replace these with real AI calls using the following import:

```typescript
import { generateText, generateJSON } from '@/lib/ai';
```

**Specific AI wiring targets:**

#### `src/modules/analytics/services/productivity-scoring.ts`
- If there is a function that generates productivity insights or recommendations, wire it to call `generateText()` with a prompt that includes the user's productivity dimensions and scores.
- The trend analysis (`calculateTrend`) is pure math -- leave it as-is.

#### `src/modules/analytics/services/goal-tracking-service.ts`
- `suggestCourseCorrection()` should call `generateJSON()` to produce AI-powered course correction suggestions. Build a prompt that includes current pace, required pace, goal description, and time remaining.

#### `src/modules/analytics/services/habit-tracking-service.ts`
- `calculateCorrelations()` uses Pearson coefficient -- this is pure math, leave it.
- If there are any text-based habit insights or descriptions generated, wire those to `generateText()`.

#### `src/modules/analytics/services/time-audit-service.ts`
- `detectDriftAlerts()` should enhance alert `suggestedAction` fields with AI-generated actionable advice. Call `generateText()` with the drift data to produce specific, contextual suggestions.

#### `src/modules/analytics/services/ai-accuracy-service.ts`
- If accuracy insights or trend explanations are generated as text, wire to `generateText()`.

#### `src/modules/analytics/services/llm-cost-service.ts`
- `getCostAlerts()` should use `generateText()` to produce human-readable cost optimization recommendations when features approach budget caps.

#### `src/modules/analytics/services/call-analytics-service.ts`
- Any generated call performance insights should be wired to `generateText()`.

### 2. Wire AI into AI-Quality Services

Read each service file in `src/modules/ai-quality/services/`. Wire AI calls:

```typescript
import { generateText, generateJSON } from '@/lib/ai';
```

#### `src/modules/ai-quality/services/accuracy-scorecard-service.ts`
- `getGradeBreakdown()` should use `generateJSON()` to produce per-dimension improvement suggestions. Prompt should include the scorecard data and ask for actionable suggestions per dimension.

#### `src/modules/ai-quality/services/golden-test-service.ts`
- `runTestSuite()` is the critical wiring point. Each test case should call `generateJSON()` with the test case input, then compare the AI output against `expectedOutput`. The prompt should include the test category and input data.
- Build the prompt to instruct the AI to produce output matching the expected format.

#### `src/modules/ai-quality/services/confidence-service.ts`
- `calculateConfidence()` is pure math (weighted average) -- leave as-is.

#### `src/modules/ai-quality/services/override-tracking-service.ts`
- `getOverridePatterns()` should use `generateJSON()` to analyze override records and identify recurring patterns with suggested prompt/rule improvements.

#### `src/modules/ai-quality/services/bias-detection-service.ts`
- `detectBias()` should use `generateJSON()` to analyze distribution data across dimensions and produce bias scores with descriptions. The prompt should include the raw distribution data and ask for bias assessment per dimension.

#### `src/modules/ai-quality/services/citation-service.ts`
- `verifyCitation()` should use `generateText()` to cross-check the source excerpt against the claim and return a verification result with reasoning.

### 3. Apply Auth to ALL Analytics API Routes

Wrap every route handler in `src/app/api/analytics/` with `withAuth()`. The existing routes use bare `export async function GET/POST` handlers without auth. Transform them to use the auth middleware.

Import:
```typescript
import { withAuth } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
```

**Before (existing pattern):**
```typescript
export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    // ... handler logic
    return success(result);
  } catch (err) {
    return error('INTERNAL_ERROR', '...', 500);
  }
}
```

**After (with auth):**
```typescript
export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      // ... handler logic, can use session.userId instead of query param
      return success(result);
    } catch (err) {
      return error('INTERNAL_ERROR', '...', 500);
    }
  });
}
```

Apply this transformation to ALL route files:
- `src/app/api/analytics/time-audit/route.ts`
- `src/app/api/analytics/productivity/route.ts`
- `src/app/api/analytics/goals/route.ts`
- `src/app/api/analytics/goals/[id]/route.ts`
- `src/app/api/analytics/habits/route.ts`
- `src/app/api/analytics/habits/[id]/complete/route.ts`
- `src/app/api/analytics/ai-accuracy/route.ts`
- `src/app/api/analytics/call-analytics/route.ts`
- `src/app/api/analytics/llm-costs/route.ts`
- `src/app/api/analytics/scorecard/route.ts`
- `src/app/api/analytics/overrides/route.ts`
- `src/app/api/analytics/overrides/analysis/route.ts`
- `src/app/api/analytics/bias/route.ts`

Where routes currently accept `userId` as a query parameter, prefer using `session.userId` from the auth context instead (but keep `userId` as an optional override for admin use cases).

### 4. Review and Fix

After wiring:
- Ensure no function still returns hardcoded placeholder text where AI should generate it.
- Ensure every AI call has a well-structured prompt with relevant context data.
- Ensure every AI call handles errors gracefully (wrap in try/catch, fall back to a reasonable default if AI fails).
- Ensure `AIOptions` are tuned appropriately:
  - Use lower temperature (0.3-0.5) for structured/JSON responses.
  - Use moderate temperature (0.7) for natural language insights.
  - Set appropriate `maxTokens` based on expected output size.

## Acceptance Criteria

- [ ] All analytics services that generate text insights use `generateText()` from `@/lib/ai`
- [ ] `suggestCourseCorrection()` uses `generateJSON()` for AI-powered suggestions
- [ ] `detectDriftAlerts()` enhances suggestions with AI-generated advice
- [ ] `getCostAlerts()` produces AI-generated cost optimization recommendations
- [ ] Golden test runner (`runTestSuite()`) calls AI and compares outputs against expected
- [ ] `getGradeBreakdown()` uses AI for improvement suggestions per dimension
- [ ] `getOverridePatterns()` uses AI to identify recurring override patterns
- [ ] `detectBias()` uses AI to analyze distribution data and produce bias assessments
- [ ] `verifyCitation()` uses AI to cross-check source excerpts
- [ ] ALL 13 route files in `src/app/api/analytics/` are wrapped with `withAuth()`
- [ ] Routes use `session.userId` from auth context where applicable
- [ ] All AI calls have error handling with graceful fallbacks
- [ ] All AI calls use appropriate temperature and maxTokens settings
- [ ] No modifications to `jest.config.ts` or `package.json`
- [ ] `npx tsc --noEmit` passes with no errors in owned paths
- [ ] Existing tests still pass: `npx jest tests/unit/analytics/`

## Implementation Steps

1. **Read context files**: Read `src/lib/ai/client.ts`, `src/shared/middleware/auth.ts`, all service files in `src/modules/analytics/services/`, all service files in `src/modules/ai-quality/services/`, all route files in `src/app/api/analytics/`.
2. **Create branch**: `git checkout -b ai-feature/p2-w16-wire-analytics`
3. **Wire AI into analytics services**: Go through each service file. Identify placeholder/hardcoded responses. Replace with `generateText()` or `generateJSON()` calls. Add error handling around each AI call.
4. **Wire AI into AI-quality services**: Same process for `src/modules/ai-quality/services/`. Focus on golden test runner, bias detection, override patterns, and citation verification.
5. **Apply auth to routes**: Transform all 13 route handlers to use `withAuth()`. Update userId references to use session context.
6. **Update tests**: Mock `@/lib/ai` in existing tests. Add tests for AI integration points if coverage is missing.
7. **Verify**: Run `npx tsc --noEmit`, `npx jest tests/unit/analytics/`, `npx next build`.

## Tests Required

Update existing tests in `tests/unit/analytics/` to mock the AI client:

```typescript
jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('AI-generated insight'),
  generateJSON: jest.fn().mockResolvedValue({ suggestion: 'Increase pace' }),
  chat: jest.fn().mockResolvedValue('AI response'),
}));
```

Add or update these test cases:

### `tests/unit/analytics/goal-tracking.test.ts`
```typescript
describe('suggestCourseCorrection (AI-powered)', () => {
  it('should call generateJSON with goal context in prompt');
  it('should include current pace and required pace in prompt');
  it('should return AI-generated suggestion');
  it('should handle AI failure gracefully with fallback');
});
```

### `tests/unit/analytics/time-audit.test.ts`
```typescript
describe('detectDriftAlerts (AI-enhanced)', () => {
  it('should call generateText to enhance suggestedAction');
  it('should include drift data in prompt');
  it('should fall back to static suggestion if AI fails');
});
```

### `tests/unit/analytics/golden-test-runner.test.ts` (new)
```typescript
describe('runTestSuite (AI-powered)', () => {
  it('should call generateJSON for each test case');
  it('should compare AI output against expectedOutput');
  it('should apply tolerance for numeric comparisons');
  it('should record pass/fail for each test case');
  it('should handle AI errors without crashing the suite');
});
```

### `tests/unit/analytics/bias-detection.test.ts` (new)
```typescript
describe('detectBias (AI-powered)', () => {
  it('should call generateJSON with distribution data');
  it('should return bias scores per dimension');
  it('should handle AI failure gracefully');
});
```

Mock `@/lib/ai` in all tests. Mock `@/shared/middleware/auth` for route handler tests if applicable.

## Commit Strategy

Use Conventional Commits. Commit after each logical unit is complete and compiling.

```
feat(analytics): wire AI into productivity and goal tracking services
feat(analytics): wire AI into time audit and cost alert services
feat(ai-quality): wire AI into golden test runner for real model evaluation
feat(ai-quality): wire AI into bias detection and override pattern analysis
feat(ai-quality): wire AI into citation verification
feat(analytics): apply withAuth to all analytics API routes
test(analytics): update tests with AI client mocks and new AI integration tests
chore(analytics): verify build and final cleanup
```

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
