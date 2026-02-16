# Worker 13: Persist Analytics Habits + Complete Analytics Stubs

## Branch

`ai-feature/p3-w13-analytics-module`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to modifying files within these paths. Do NOT touch any files outside these directories:

- `src/modules/analytics/services/habit-tracking-service.ts`
- `src/modules/analytics/services/ai-accuracy-service.ts`
- `src/modules/analytics/services/call-analytics-service.ts`
- `src/modules/analytics/services/goal-tracking-service.ts`
- `src/modules/analytics/services/llm-cost-service.ts`
- `src/modules/analytics/services/productivity-scoring.ts`
- `src/modules/analytics/services/time-audit-service.ts`
- `src/app/(dashboard)/analytics/page.tsx`
- `tests/unit/analytics/habit-tracking.test.ts`
- `tests/unit/analytics/call-analytics.test.ts`
- `tests/unit/analytics/llm-cost.test.ts`

### Do NOT modify

- `jest.config.ts`
- `package.json`
- `tsconfig.json`
- `prisma/schema.prisma`
- Any files outside the owned paths above

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

1. **`src/lib/ai/index.ts`** -- Exports `generateText(prompt, options?)`, `generateJSON<T>(prompt, options?)`, `chat(messages, options?)`, `streamText(prompt, options?)`. Options include `model`, `maxTokens`, `temperature`, `system`.
2. **`src/lib/db/index.ts`** -- Exports `prisma` client instance. Import as `import { prisma } from '@/lib/db'`.
3. **`prisma/schema.prisma`** -- Database models. Key models for this worker:
   - `HabitEntry` model: `id`, `entityId`, `name`, `description`, `frequency` (String: "daily", "weekly", "weekdays", "custom"), `targetPerPeriod` (Int, default 1), `streak` (Int, default 0), `longestStreak` (Int, default 0), `completedDates` (Json, default "[]" -- array of ISO date strings), `isActive` (Boolean, default true), `createdAt`, `updatedAt`. Indexes on `entityId` and `isActive`.
   - `UsageRecord` model: `id`, `entityId`, `model` (String -- AI model used), `inputTokens` (Int), `outputTokens` (Int), `cost` (Float -- USD), `module` (String -- which module made the call), `userId` (String?), `metadata` (Json?), `createdAt`. Indexes on `entityId`, `module`, `createdAt`.
   - `ActionLog` model: `id`, `actor`, `actorId`, `actionType`, `target`, `targetId`, `details` (Json), `entityId`, `createdAt`.
   - `Call` model: check schema for fields like `duration`, `sentiment`, `outcome`, `entityId`, `createdAt`.
   - `Document` model: used for goals with `type: "GOAL"`.
   - `Task` model: for productivity signals.
4. **`src/modules/analytics/services/habit-tracking-service.ts`** -- Current implementation uses `const habitStore = new Map()` for in-memory storage. This MUST be replaced with Prisma HabitEntry queries.
5. **`src/modules/analytics/services/ai-accuracy-service.ts`** -- Current implementation. May be stub.
6. **`src/modules/analytics/services/call-analytics-service.ts`** -- Current implementation. Was partially AI-enhanced in Phase 2.
7. **`src/modules/analytics/services/goal-tracking-service.ts`** -- Was AI-enhanced in Phase 2. Uses Document model with `type: "GOAL"`.
8. **`src/modules/analytics/services/llm-cost-service.ts`** -- Current implementation. May be stub.
9. **`src/modules/analytics/services/productivity-scoring.ts`** -- Current implementation. May be stub.
10. **`src/modules/analytics/services/time-audit-service.ts`** -- Was AI-enhanced in Phase 2.
11. **`src/app/(dashboard)/analytics/page.tsx`** -- Current analytics dashboard page. Likely uses hardcoded demo data.
12. **`src/app/api/analytics/`** -- Existing API routes for analytics (read to understand available endpoints).
13. **`src/modules/analytics/types/`** -- Analytics types if they exist.

## Requirements

### 1. Habit Tracking Service -- Replace In-Memory with Prisma (`src/modules/analytics/services/habit-tracking-service.ts`)

**Read the file first** to understand the current in-memory implementation and all exported function signatures.

**Critical change**: Replace `const habitStore = new Map()` with Prisma `HabitEntry` queries. Every function that reads from or writes to the Map must be converted to use Prisma.

Implement the following functions (keep existing signatures where they exist, add only what is missing):

- **`createHabit(entityId, habit)`**: Create a new `HabitEntry` via `prisma.habitEntry.create`. Input: `{ name: string, description?: string, frequency: string, targetPerPeriod?: number }`. Return the created habit.
- **`completeHabit(habitId, date?)`**: Mark a habit as completed for today (or specified date). Read the current `completedDates` JSON array, append the new date (ISO string), recalculate `streak` and `longestStreak`. Use `prisma.habitEntry.update` to persist.
  - Streak calculation: Count consecutive days/periods where the habit was completed. If the previous expected period is missing, streak resets to 1. Update `longestStreak` if current `streak` exceeds it.
- **`getHabits(entityId, includeInactive?)`**: Query `prisma.habitEntry.findMany` where `entityId` matches. If `includeInactive` is false/undefined, filter by `isActive: true`.
- **`getHabit(habitId)`**: Get a single habit by ID.
- **`getStreaks(entityId)`**: Return all active habits with their current streak, longest streak, and completion rate (completed count / expected count based on frequency and creation date).
- **`deleteHabit(habitId)`**: Soft delete by setting `isActive: false` via `prisma.habitEntry.update`. Do NOT use `prisma.habitEntry.delete`.
- **`updateHabit(habitId, updates)`**: Update habit name, description, frequency, or targetPerPeriod.

**Important**: Remove the `habitStore` Map entirely. All state must persist via Prisma. Keep all existing exported function names and signatures -- consumers depend on them.

### 2. AI Accuracy Service (`src/modules/analytics/services/ai-accuracy-service.ts`)

**Read the file first** to understand the current implementation.

If stub, implement:

- **`trackPrediction(entityId, prediction)`**: Record an AI prediction. Store in ActionLog with `actionType: "AI_PREDICTION"`. Prediction includes: `{ module: string, predictionType: string, predictedValue: any, confidence: number, timestamp: Date }`.
- **`recordOutcome(predictionId, actualValue)`**: Record what actually happened. Update the ActionLog entry's `details` JSON to include `actualValue` and `accurate: boolean` (comparing predicted vs actual).
- **`getAccuracyByModule(entityId, dateRange?)`**: Query ActionLog for AI_PREDICTION entries. Group by module. Calculate accuracy percentage (accurate / total * 100) for each module.
- **`getOverallAccuracy(entityId, dateRange?)`**: Calculate overall accuracy across all modules.
- **`getAccuracyTrend(entityId, periodDays)`**: Calculate accuracy over rolling periods to show improvement/degradation trends.

### 3. Call Analytics Service (`src/modules/analytics/services/call-analytics-service.ts`)

**Read the file first** -- this was partially AI-enhanced in Phase 2.

Verify and complete the following:

- **`getCallsPerPeriod(entityId, period, dateRange?)`**: Aggregate Call model data. Group by day/week/month. Return `{ period: string, count: number }[]`.
- **`getAverageDuration(entityId, dateRange?)`**: Calculate average call duration from Call records.
- **`getSentimentDistribution(entityId, dateRange?)`**: Aggregate sentiment values from Call records. Return `{ positive: number, neutral: number, negative: number }` as percentages.
- **`getOutcomeRates(entityId, dateRange?)`**: Aggregate call outcomes (e.g., completed, no_answer, voicemail, callback_requested). Return counts and percentages.
- **`getTopCallers(entityId, limit?, dateRange?)`**: Find contacts with most calls. Join with Contact model.
- **`getCallTrends(entityId)`**: Use AI via `generateJSON` to analyze call data patterns and provide insights (busiest times, sentiment trends, outcome improvements).

If any functions exist but are stubs or return hardcoded data, replace with real Prisma queries.

### 4. Goal Tracking Service (`src/modules/analytics/services/goal-tracking-service.ts`)

**Read the file first** -- this was AI-enhanced in Phase 2.

Verify it properly:
- Tracks goals using Document model with `type: "GOAL"` and progress metrics in `content` JSON
- Uses AI for goal progress analysis and suggestions
- Supports CRUD operations for goals
- Calculates progress percentages and milestone tracking

If any of the above is missing or stubbed, implement it. Do not break existing AI integration.

### 5. LLM Cost Service (`src/modules/analytics/services/llm-cost-service.ts`)

**Read the file first** to understand the current implementation.

If stub, implement:

- **`getCostsByModule(entityId, dateRange?)`**: Query `prisma.usageRecord.findMany` filtered by `entityId` and optional date range. Group by `module` field. Sum `cost`, `inputTokens`, `outputTokens` per module. Return `{ module: string, totalCost: number, totalInputTokens: number, totalOutputTokens: number, requestCount: number }[]`.
- **`getCostsByModel(entityId, dateRange?)`**: Same aggregation but grouped by `model` field.
- **`getCostsByPeriod(entityId, period, dateRange?)`**: Aggregate costs by day/week/month. Return time series data for charting.
- **`getTotalCost(entityId, dateRange?)`**: Sum all costs for the entity within the date range.
- **`getCostTrend(entityId, periods)`**: Calculate cost change over rolling periods. Return `{ period: string, cost: number, changePercent: number }[]`.
- **`getCostForecast(entityId, forecastDays)`**: Use recent cost data to project future costs. Simple linear regression or rolling average. Return `{ forecastedCost: number, confidence: number, basedOnDays: number }`.
- **`getTokenUsageSummary(entityId, dateRange?)`**: Return total input tokens, output tokens, average tokens per request, most expensive module.

### 6. Productivity Scoring (`src/modules/analytics/services/productivity-scoring.ts`)

**Read the file first** to understand the current implementation.

If stub, implement:

- **`calculateScore(entityId, userId, dateRange?)`**: Calculate a productivity score (0-100) from multiple signals:
  - Tasks completed: Query `prisma.task.count` where `status: "COMPLETED"` and `assigneeId: userId` within date range. Weight: 30%.
  - Response time: Average time between message received and response sent (from Message model). Weight: 20%.
  - Focus time: Duration of focus sessions from ActionLog (`actionType: "FOCUS_SESSION"`). Weight: 20%.
  - Meetings attended: Count from Calendar events. Weight: 10%.
  - Goals progressed: Count of goal updates from Document model. Weight: 20%.
- **`getScoreHistory(entityId, userId, days)`**: Calculate daily scores for the past N days. Return `{ date: string, score: number }[]`.
- **`getTeamScores(entityId, dateRange?)`**: Calculate scores for all users in the entity. Return ranked list.
- **`getInsights(entityId, userId)`**: Use AI via `generateJSON` to analyze productivity patterns and provide personalized improvement suggestions.

### 7. Time Audit Service (`src/modules/analytics/services/time-audit-service.ts`)

**Read the file first** -- this was AI-enhanced in Phase 2.

Verify it properly:
- Tracks time allocation across categories (meetings, focused work, communication, admin)
- Detects time drift (planned vs actual time allocation)
- Uses AI for pattern analysis and recommendations
- Aggregates data from Calendar, Task, ActionLog models

If any of the above is missing or stubbed, implement it. Do not break existing AI integration.

### 8. Analytics Dashboard Page (`src/app/(dashboard)/analytics/page.tsx`)

**Read the file first** to understand the current hardcoded demo data.

Replace hardcoded demo data with real API calls:

- Replace hardcoded habit data with fetch to `/api/analytics/habits` (or appropriate endpoint)
- Replace hardcoded cost data with fetch to `/api/analytics/costs` (or appropriate endpoint)
- Replace hardcoded call data with fetch to `/api/analytics/calls` (or appropriate endpoint)
- Replace hardcoded productivity data with fetch to `/api/analytics/productivity` (or appropriate endpoint)
- Replace hardcoded goal data with fetch to `/api/analytics/goals` (or appropriate endpoint)

Use Next.js patterns:
- If server component: use direct service imports or fetch with appropriate caching
- If client component: use `useEffect` + `useState` or a data fetching library
- Handle loading states (show skeleton or spinner)
- Handle error states (show error message with retry)
- Read the existing component structure and maintain the same UI layout -- only replace data sources

**Important**: Read the existing API routes in `src/app/api/analytics/` to understand what endpoints are available. Only call endpoints that exist. If an endpoint does not exist, keep the demo data for that section with a TODO comment.

### 9. Tests

Write comprehensive tests for 3 test files:

#### `tests/unit/analytics/habit-tracking.test.ts`

**Important**: This test file may already exist. Read it first. If it exists, update it to test the new Prisma-based implementation. If it does not exist, create it.

```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    habitEntry: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

describe('createHabit', () => {
  it('should create a HabitEntry via Prisma');
  it('should set default streak to 0');
  it('should set default completedDates to empty array');
});
describe('completeHabit', () => {
  it('should append date to completedDates array');
  it('should increment streak for consecutive completions');
  it('should reset streak when a day is missed');
  it('should update longestStreak when current streak exceeds it');
  it('should not duplicate dates for same-day completion');
});
describe('getHabits', () => {
  it('should return only active habits by default');
  it('should return all habits when includeInactive is true');
});
describe('getStreaks', () => {
  it('should calculate completion rate correctly');
});
describe('deleteHabit', () => {
  it('should soft delete by setting isActive to false');
  it('should NOT call prisma.habitEntry.delete');
});
```

#### `tests/unit/analytics/call-analytics.test.ts`
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    call: { findMany: jest.fn(), count: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn() },
    contact: { findMany: jest.fn() },
  },
}));
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

describe('getCallsPerPeriod', () => {
  it('should aggregate calls by day');
  it('should aggregate calls by week');
  it('should filter by date range');
});
describe('getAverageDuration', () => {
  it('should calculate correct average duration');
  it('should return 0 when no calls exist');
});
describe('getSentimentDistribution', () => {
  it('should return percentage breakdown of sentiments');
});
describe('getCallTrends', () => {
  it('should call generateJSON for AI trend analysis');
  it('should handle AI failure gracefully');
});
```

#### `tests/unit/analytics/llm-cost.test.ts`
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    usageRecord: { findMany: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn(), count: jest.fn() },
  },
}));

describe('getCostsByModule', () => {
  it('should aggregate costs grouped by module');
  it('should filter by date range when provided');
  it('should include request count per module');
});
describe('getCostsByPeriod', () => {
  it('should return time series cost data');
});
describe('getTotalCost', () => {
  it('should sum all costs for the entity');
  it('should return 0 when no usage records exist');
});
describe('getCostForecast', () => {
  it('should project future costs from historical data');
  it('should handle insufficient data gracefully');
});
describe('getTokenUsageSummary', () => {
  it('should return total input and output tokens');
  it('should identify the most expensive module');
});
```

## Acceptance Criteria

1. `habit-tracking-service.ts` no longer contains `const habitStore = new Map()` -- all state persists via Prisma HabitEntry model.
2. `habit-tracking-service.ts` correctly calculates streaks and longestStreak on habit completion.
3. `habit-tracking-service.ts` soft-deletes habits (sets `isActive: false`) rather than hard deleting.
4. `ai-accuracy-service.ts` tracks AI prediction accuracy using ActionLog.
5. `call-analytics-service.ts` aggregates real Call model data with AI-powered trend analysis.
6. `goal-tracking-service.ts` properly tracks goals with AI assistance (verified, not broken).
7. `llm-cost-service.ts` queries UsageRecord model for cost aggregation, trends, and forecasting.
8. `productivity-scoring.ts` calculates multi-signal productivity scores with AI insights.
9. `time-audit-service.ts` properly tracks time allocation with AI analysis (verified, not broken).
10. `analytics/page.tsx` fetches real data from API endpoints instead of using hardcoded demo data.
11. All 3 test files pass with `npx jest tests/unit/analytics/habit-tracking tests/unit/analytics/call-analytics tests/unit/analytics/llm-cost`.
12. `jest.config.ts`, `package.json`, `tsconfig.json`, and `prisma/schema.prisma` are NOT modified.
13. All existing function signatures and exports are preserved.

## Implementation Steps

1. **Read all context files** listed above. Pay special attention to the current habit-tracking-service.ts in-memory Map implementation -- note every function that uses it.
2. **Create branch**: `git checkout -b ai-feature/p3-w13-analytics-module`
3. **Replace habit-tracking-service.ts**: Remove Map, implement all functions with Prisma HabitEntry queries. This is the highest priority task.
4. **Read and implement `ai-accuracy-service.ts`**: Add prediction tracking via ActionLog.
5. **Read and verify/complete `call-analytics-service.ts`**: Ensure real Prisma queries, fix stubs.
6. **Read and verify `goal-tracking-service.ts`**: Confirm AI-enhanced goal tracking works.
7. **Read and implement `llm-cost-service.ts`**: Add UsageRecord aggregation queries.
8. **Read and implement `productivity-scoring.ts`**: Add multi-signal scoring with AI insights.
9. **Read and verify `time-audit-service.ts`**: Confirm AI-enhanced time auditing works.
10. **Update `analytics/page.tsx`**: Replace demo data with real API calls. Read existing API routes first.
11. **Write/update tests**: Create or update the 3 test files with mocked Prisma dependencies.
12. **Type-check**: `npx tsc --noEmit`
13. **Run tests**: `npx jest tests/unit/analytics/`
14. **Commit** with conventional commits.

## Tests Required

See Requirement 9 above for detailed test specifications. Each test file must:

- Mock `@/lib/db` with `jest.mock` providing relevant Prisma model mocks
- Mock `@/lib/ai` with `jest.mock` where services use AI
- Test all public functions with happy path + error cases
- Have 3-8 test cases minimum per file

## Commit Strategy

Make atomic commits in this order:

1. `feat(analytics): replace in-memory habit store with Prisma HabitEntry persistence`
   - Files: `src/modules/analytics/services/habit-tracking-service.ts`
2. `feat(analytics): implement AI accuracy tracking via ActionLog`
   - Files: `src/modules/analytics/services/ai-accuracy-service.ts`
3. `feat(analytics): complete call analytics with Prisma aggregation and AI trends`
   - Files: `src/modules/analytics/services/call-analytics-service.ts`
4. `feat(analytics): implement LLM cost aggregation, trends, and forecasting`
   - Files: `src/modules/analytics/services/llm-cost-service.ts`
5. `feat(analytics): implement multi-signal productivity scoring with AI insights`
   - Files: `src/modules/analytics/services/productivity-scoring.ts`
6. `feat(analytics): replace analytics dashboard demo data with real API calls`
   - Files: `src/app/(dashboard)/analytics/page.tsx`
7. `test(analytics): add tests for habit-tracking, call-analytics, llm-cost services`
   - Files: `tests/unit/analytics/habit-tracking.test.ts`, `tests/unit/analytics/call-analytics.test.ts`, `tests/unit/analytics/llm-cost.test.ts`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
