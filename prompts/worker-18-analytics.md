# Worker 18: Analytics & AI Quality (M14 + M20)

## Branch: ai-feature/w18-analytics

Create and check out the branch `ai-feature/w18-analytics` from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside these directories:

```
src/modules/analytics/                 # Analytics module (time audit, productivity, goals, habits, cost dashboards)
src/modules/ai-quality/                # AI Quality harness (accuracy, golden tests, confidence, bias)
src/app/api/analytics/                 # API routes for analytics data
src/app/(dashboard)/analytics/         # Dashboard pages for analytics charts and reports
src/app/(dashboard)/ai-quality/        # Dashboard pages for AI quality metrics
tests/unit/analytics/                  # All unit tests for this worker
```

## Context (read these first, do NOT modify)

Read and internalize these files before writing any code. They define the shared contracts.

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project-wide dev process, commit conventions, done criteria |
| `src/shared/types/index.ts` | Immutable shared types: `Task`, `TaskStatus`, `Priority`, `Project`, `ProjectHealth`, `CalendarEvent`, `Call`, `CallDirection`, `CallOutcome`, `Message`, `ActionLog`, `ActionActor`, `Workflow`, `ApiResponse`, `ApiError`, `ApiMeta` |
| `prisma/schema.prisma` | Database schema: `Task`, `Project`, `CalendarEvent`, `Call`, `Message`, `ActionLog`, `Workflow`, `Entity`, `User` models |
| `src/shared/utils/api-response.ts` | API helpers: `success<T>()`, `error()`, `paginated<T>()` -- use these in every route handler |
| `src/lib/db/index.ts` | Prisma client singleton: `import { prisma } from '@/lib/db'` |
| `package.json` | Stack: Next.js 16, React 19, Prisma 7, Zod 4, date-fns 4, Jest 30, ts-jest |
| `tsconfig.json` | Path aliases: `@/` maps to `src/` |

**Charting library:** Use Recharts (install is permitted: `npm install recharts`). Add it to your first commit if not already in package.json dependencies. Import as needed in chart components.

## Requirements

### 1. Analytics Module (M14)

**Types file:** `src/modules/analytics/types.ts`

```typescript
export interface TimeAuditEntry {
  date: string;              // ISO date
  category: string;          // e.g., "deep_work", "meetings", "email", "admin", "personal"
  intendedMinutes: number;
  actualMinutes: number;
  driftMinutes: number;      // actual - intended
  driftPercent: number;
}

export interface TimeAuditReport {
  userId: string;
  periodStart: Date;
  periodEnd: Date;
  entries: TimeAuditEntry[];
  totalDriftMinutes: number;
  worstDriftCategory: string;
  alerts: DriftAlert[];
}

export interface DriftAlert {
  category: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  suggestedAction: string;
}

export interface ProductivityScore {
  userId: string;
  date: string;
  overallScore: number;       // 0-100
  dimensions: {
    highPriorityCompletion: number;   // % of P0/P1 tasks completed on time
    focusTimeAchieved: number;        // % of intended focus time realized
    goalProgress: number;             // weekly goal completion rate
    meetingEfficiency: number;        // prep time / meeting time ratio
    communicationSpeed: number;       // avg response time to P0 messages
  };
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
}

export interface GoalDefinition {
  id: string;
  userId: string;
  entityId?: string;
  title: string;
  description?: string;
  framework: 'OKR' | 'SMART' | 'CUSTOM';
  targetValue: number;
  currentValue: number;
  unit: string;
  milestones: GoalMilestone[];
  startDate: Date;
  endDate: Date;
  status: 'ON_TRACK' | 'AT_RISK' | 'BEHIND' | 'COMPLETE' | 'ABANDONED';
  autoProgress: boolean;     // auto-update progress from linked tasks/workflows
  linkedTaskIds: string[];
  linkedWorkflowIds: string[];
}

export interface GoalMilestone {
  id: string;
  title: string;
  targetValue: number;
  targetDate: Date;
  isComplete: boolean;
  completedAt?: Date;
}

export interface GoalCorrectionSuggestion {
  goalId: string;
  currentPace: number;
  requiredPace: number;
  suggestion: string;
  adjustedEndDate?: Date;
}

export interface HabitDefinition {
  id: string;
  userId: string;
  name: string;
  frequency: 'DAILY' | 'WEEKDAY' | 'WEEKLY';
  streak: number;
  longestStreak: number;
  successRate: number;        // last 30 days
  completionHistory: { date: string; completed: boolean }[];
  correlations: HabitCorrelation[];
}

export interface HabitCorrelation {
  habitName: string;
  metric: string;             // e.g., "productivity_score", "focus_time"
  correlationCoefficient: number;  // -1 to 1
  description: string;        // e.g., "Morning exercise correlates with 12% higher productivity"
}

export interface AIAccuracyMetrics {
  period: string;             // e.g., "2026-02-W7"
  triageAccuracy: number;     // % of correctly classified messages
  draftApprovalRate: number;  // % of AI drafts approved without edits
  predictionAccuracy: number; // % of deadline/outcome predictions correct
  automationSuccess: number;  // % of workflows completing without error
  overallScore: number;
}

export interface LLMCostDashboard {
  entityId: string;
  period: string;
  totalCostUsd: number;
  byFeature: { feature: string; cost: number; tokenCount: number }[];
  budgetCapUsd: number;
  percentUsed: number;
  projectedMonthEnd: number;
  alerts: string[];
}

export interface CallAnalytics {
  entityId: string;
  period: string;
  totalCalls: number;
  connectRate: number;
  averageDuration: number;
  outcomeDistribution: Record<string, number>;  // CallOutcome -> count
  sentimentAverage: number;
  roiPerCallType: { callType: string; averageRevenue: number; averageCost: number; roi: number }[];
}

export interface TimeSavedAggregate {
  userId: string;
  totalMinutesSaved: number;
  bySource: { source: string; minutes: number }[];
  dailyTrend: { date: string; minutes: number }[];
}
```

**Service file:** `src/modules/analytics/services/time-audit-service.ts`

Implement:
- `generateTimeAudit(userId: string, startDate: Date, endDate: Date): Promise<TimeAuditReport>` -- Compares intended time allocation (from user preferences focus hours, meeting-free days) against actual (calendar events, task completion times). Calculates drift per category.
- `detectDriftAlerts(entries: TimeAuditEntry[], threshold?: number): DriftAlert[]` -- Flags categories with drift > threshold% (default 20%). CRITICAL if > 50%.
- `getIntendedAllocation(userId: string): Promise<Record<string, number>>` -- Returns planned time allocation based on user preferences.

**Service file:** `src/modules/analytics/services/productivity-scoring.ts`

Implement:
- `calculateProductivityScore(userId: string, date: string): Promise<ProductivityScore>` -- Computes daily score from 5 dimensions. Each dimension 0-100, overall = weighted average (highPriorityCompletion: 30%, focusTimeAchieved: 25%, goalProgress: 20%, meetingEfficiency: 15%, communicationSpeed: 10%).
- `getProductivityTrend(userId: string, days: number): Promise<ProductivityScore[]>` -- Returns scores for last N days.
- `calculateTrend(scores: ProductivityScore[]): 'IMPROVING' | 'STABLE' | 'DECLINING'` -- Compares last 7 days vs previous 7 days. Improving if > 5% increase, declining if > 5% decrease, otherwise stable.

**Service file:** `src/modules/analytics/services/goal-tracking-service.ts`

Implement:
- `createGoal(goal: Omit<GoalDefinition, 'id' | 'currentValue' | 'status' | 'milestones'> & { milestones?: Omit<GoalMilestone, 'id' | 'isComplete'>[] }): Promise<GoalDefinition>` -- Creates a new goal with OKR or SMART framework.
- `updateGoalProgress(goalId: string): Promise<GoalDefinition>` -- Auto-updates currentValue from linked tasks/workflows. Recalculates status: ON_TRACK if pace >= requiredPace, AT_RISK if 80-100% of required, BEHIND if < 80%.
- `getGoals(userId: string, entityId?: string): Promise<GoalDefinition[]>` -- Lists goals.
- `suggestCourseCorrection(goalId: string): Promise<GoalCorrectionSuggestion>` -- When a goal is AT_RISK or BEHIND, suggests adjustments.
- `completeGoal(goalId: string): Promise<GoalDefinition>` -- Marks goal as COMPLETE.

**Service file:** `src/modules/analytics/services/habit-tracking-service.ts`

Implement:
- `createHabit(userId: string, name: string, frequency: string): Promise<HabitDefinition>` -- Creates a new habit to track.
- `recordCompletion(habitId: string, date: string, completed: boolean): Promise<HabitDefinition>` -- Logs daily completion. Updates streak and success rate.
- `getHabits(userId: string): Promise<HabitDefinition[]>` -- Lists all habits with current stats.
- `calculateCorrelations(habitId: string): Promise<HabitCorrelation[]>` -- Correlates habit completion with productivity score, focus time, task completion rate. Uses Pearson correlation coefficient.
- `calculateStreak(completionHistory: { date: string; completed: boolean }[]): number` -- Counts consecutive completions from today backwards.

**Service file:** `src/modules/analytics/services/ai-accuracy-service.ts`

Implement:
- `calculateAccuracyMetrics(entityId: string, period: string): Promise<AIAccuracyMetrics>` -- Aggregates accuracy metrics from ActionLog (overrides = inaccuracy), Message (draft approval rate), Workflow (success rate).
- `getAccuracyTrend(entityId: string, periods: number): Promise<AIAccuracyMetrics[]>` -- Returns metrics for last N weeks.

**Service file:** `src/modules/analytics/services/llm-cost-service.ts`

Implement:
- `getCostDashboard(entityId: string, period: string): Promise<LLMCostDashboard>` -- Aggregates token usage and costs by feature. Projects month-end spend from current burn rate.
- `getCostAlerts(entityId: string): Promise<string[]>` -- Returns alert messages for features approaching budget caps.

**Service file:** `src/modules/analytics/services/call-analytics-service.ts`

Implement:
- `getCallAnalytics(entityId: string, startDate: Date, endDate: Date): Promise<CallAnalytics>` -- Aggregates call data: connect rates, duration, outcomes, sentiment. Calculates ROI per call type.
- `getCallTrend(entityId: string, days: number): Promise<{ date: string; calls: number; connectRate: number }[]>` -- Daily call metrics for charting.

### 2. AI Quality Harness (M20)

**Types file:** `src/modules/ai-quality/types.ts`

```typescript
export interface AccuracyScorecard {
  entityId: string;
  period: string;
  triageAccuracy: number;
  draftApprovalRate: number;
  missedDeadlineRate: number;
  automationSuccessRate: number;
  overallGrade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface GoldenTestCase {
  id: string;
  category: 'TRIAGE' | 'DRAFT' | 'CLASSIFICATION' | 'PREDICTION' | 'EXTRACTION';
  input: Record<string, unknown>;
  expectedOutput: Record<string, unknown>;
  tolerance?: number;           // allowed deviation for numeric outputs
  tags: string[];
  createdAt: Date;
  lastRun?: Date;
  lastResult?: 'PASS' | 'FAIL';
}

export interface GoldenTestSuite {
  id: string;
  name: string;
  description: string;
  testCases: GoldenTestCase[];
  lastRunDate?: Date;
  passRate: number;
  totalRuns: number;
}

export interface GoldenTestResult {
  testCaseId: string;
  passed: boolean;
  actualOutput: Record<string, unknown>;
  deviation?: number;
  runDuration: number;
  modelVersion: string;
  timestamp: Date;
}

export interface ConfidenceScore {
  actionId: string;
  confidence: number;           // 0-1
  factors: { factor: string; weight: number; value: number }[];
  recommendation: 'AUTO_EXECUTE' | 'REVIEW_RECOMMENDED' | 'HUMAN_REQUIRED';
}

export interface OverrideRecord {
  id: string;
  actionId: string;
  userId: string;
  originalOutput: string;
  overriddenOutput: string;
  reason: 'INCORRECT' | 'INCOMPLETE' | 'WRONG_TONE' | 'POLICY_VIOLATION' | 'PREFERENCE' | 'OTHER';
  reasonDetail?: string;
  timestamp: Date;
}

export interface OverrideAnalysis {
  totalOverrides: number;
  byReason: Record<string, number>;
  overrideRate: number;         // overrides / total actions
  trend: 'IMPROVING' | 'STABLE' | 'WORSENING';
  topPatterns: { pattern: string; count: number; suggestedFix: string }[];
}

export interface BiasReport {
  entityId: string;
  period: string;
  dimensions: BiasDimension[];
  overallBiasScore: number;     // 0 = no bias, 1 = severe bias
  alerts: string[];
}

export interface BiasDimension {
  name: string;                 // e.g., "entity_bias", "contact_bias", "channel_bias"
  score: number;                // 0-1
  description: string;
  affectedGroups: { group: string; deviation: number }[];
}

export interface CitationRecord {
  claimId: string;
  claim: string;
  sourceType: 'DOCUMENT' | 'MESSAGE' | 'KNOWLEDGE' | 'WEB';
  sourceId: string;
  sourceExcerpt: string;
  confidence: number;
  verified: boolean;
}

export interface ProvenanceChain {
  outputId: string;
  citations: CitationRecord[];
  uncitedClaims: string[];
  citationCoveragePercent: number;
}
```

**Service file:** `src/modules/ai-quality/services/accuracy-scorecard-service.ts`

Implement:
- `generateScorecard(entityId: string, period: string): Promise<AccuracyScorecard>` -- Computes accuracy from ActionLog overrides, Message draft approvals, Task deadline misses, Workflow success rates. Grade: A >= 90, B >= 80, C >= 70, D >= 60, F < 60.
- `getScorecardHistory(entityId: string, periods: number): Promise<AccuracyScorecard[]>` -- Historical scorecards for trend charting.
- `getGradeBreakdown(scorecard: AccuracyScorecard): { dimension: string; score: number; grade: string; suggestion: string }[]` -- Per-dimension analysis with improvement suggestions.

**Service file:** `src/modules/ai-quality/services/golden-test-service.ts`

Implement:
- `createTestSuite(name: string, description: string): Promise<GoldenTestSuite>` -- Creates a new test suite.
- `addTestCase(suiteId: string, testCase: Omit<GoldenTestCase, 'id' | 'createdAt' | 'lastRun' | 'lastResult'>): Promise<GoldenTestCase>` -- Adds a labeled test case.
- `runTestSuite(suiteId: string, modelVersion: string): Promise<{ passRate: number; results: GoldenTestResult[] }>` -- Runs all test cases, compares actual vs expected output, returns pass/fail for each. Uses tolerance for numeric comparisons.
- `getTestSuites(): Promise<GoldenTestSuite[]>` -- Lists all suites with summary stats.
- `getRegressionReport(suiteId: string): Promise<{ currentPassRate: number; previousPassRate: number; regressions: GoldenTestResult[] }>` -- Compares latest run vs previous run, highlights regressions.

**Service file:** `src/modules/ai-quality/services/confidence-service.ts`

Implement:
- `calculateConfidence(actionId: string, factors: { factor: string; weight: number; value: number }[]): ConfidenceScore` -- Computes weighted confidence score. Recommendation: >= 0.9 AUTO_EXECUTE, 0.7-0.9 REVIEW_RECOMMENDED, < 0.7 HUMAN_REQUIRED.
- `getConfidenceDistribution(entityId: string, period: string): Promise<{ bucket: string; count: number }[]>` -- Distribution of confidence scores in buckets (0-0.3, 0.3-0.5, 0.5-0.7, 0.7-0.9, 0.9-1.0).

**Service file:** `src/modules/ai-quality/services/override-tracking-service.ts`

Implement:
- `recordOverride(actionId: string, userId: string, originalOutput: string, overriddenOutput: string, reason: string, reasonDetail?: string): Promise<OverrideRecord>` -- Logs a user override.
- `analyzeOverrides(entityId: string, period: string): Promise<OverrideAnalysis>` -- Aggregates override data: total, by reason, rate, trend, top patterns.
- `getOverridePatterns(entityId: string): Promise<{ pattern: string; count: number; suggestedFix: string }[]>` -- Identifies recurring override patterns and suggests prompt/rule improvements.

**Service file:** `src/modules/ai-quality/services/bias-detection-service.ts`

Implement:
- `detectBias(entityId: string, period: string): Promise<BiasReport>` -- Monitors for bias across dimensions:
  - Entity bias: Does the AI favor one entity's tasks over another?
  - Contact bias: Does response quality vary by contact?
  - Channel bias: Does accuracy differ by communication channel?
  - Time bias: Does performance degrade at certain hours?
- `getAffectedGroups(dimension: BiasDimension): { group: string; expectedRate: number; actualRate: number; deviation: number }[]` -- Details which groups are over/under-served.

**Service file:** `src/modules/ai-quality/services/citation-service.ts`

Implement:
- `addCitation(outputId: string, claim: string, sourceType: string, sourceId: string, sourceExcerpt: string): Promise<CitationRecord>` -- Attaches a citation to an output claim.
- `getProvenance(outputId: string): Promise<ProvenanceChain>` -- Returns all citations for an output, plus any uncited claims. Calculates citation coverage percentage.
- `verifyCitation(citationId: string): Promise<{ verified: boolean; reason: string }>` -- Cross-checks the source excerpt against the actual source document.

### 3. Components

**Analytics components in `src/modules/analytics/components/`:**

- `TimeAuditChart.tsx` -- Stacked bar chart (Recharts) showing intended vs actual time per category. Props: `report: TimeAuditReport`.
- `DriftAlertBanner.tsx` -- Alert banner showing drift warnings with severity colors. Props: `alerts: DriftAlert[]`.
- `ProductivityScoreCard.tsx` -- Radial gauge showing overall score with dimension breakdown. Props: `score: ProductivityScore`.
- `ProductivityTrendChart.tsx` -- Line chart of daily productivity scores. Props: `scores: ProductivityScore[]`.
- `GoalCard.tsx` -- Goal progress card with progress bar, status badge, milestones. Props: `goal: GoalDefinition`.
- `GoalList.tsx` -- Grid of GoalCard components with filter by status/entity. Props: `goals: GoalDefinition[]`.
- `HabitTracker.tsx` -- Calendar heatmap showing habit completion with streak display. Props: `habit: HabitDefinition`.
- `HabitCorrelationChart.tsx` -- Scatter plot showing habit-metric correlations. Props: `correlations: HabitCorrelation[]`.
- `AIAccuracyChart.tsx` -- Multi-line chart tracking accuracy dimensions over time. Props: `metrics: AIAccuracyMetrics[]`.
- `LLMCostChart.tsx` -- Donut chart for cost by feature + line chart for cost trend. Props: `dashboard: LLMCostDashboard`.
- `CallAnalyticsPanel.tsx` -- Dashboard panel with call metrics, outcome pie chart, sentiment gauge. Props: `analytics: CallAnalytics`.
- `TimeSavedDisplay.tsx` -- Prominent counter with daily trend sparkline. Props: `aggregate: TimeSavedAggregate`.

**AI Quality components in `src/modules/ai-quality/components/`:**

- `AccuracyScorecardCard.tsx` -- Grade card (A-F) with dimension bars. Props: `scorecard: AccuracyScorecard`.
- `ScorecardTrend.tsx` -- Line chart of scorecard grades over time. Props: `history: AccuracyScorecard[]`.
- `GoldenTestPanel.tsx` -- Test suite management panel: list suites, run tests, view results. Props: `suites: GoldenTestSuite[]`.
- `TestResultBadge.tsx` -- PASS/FAIL badge with deviation info. Props: `result: GoldenTestResult`.
- `ConfidenceGauge.tsx` -- Circular gauge showing confidence % with color coding. Props: `score: ConfidenceScore`.
- `OverrideAnalysisPanel.tsx` -- Override stats with reason breakdown bar chart and pattern table. Props: `analysis: OverrideAnalysis`.
- `BiasReportCard.tsx` -- Bias dimension bars with alert flags. Props: `report: BiasReport`.
- `ProvenanceViewer.tsx` -- Linked citation list for an output showing source excerpts. Props: `chain: ProvenanceChain`.

All components must be client components (`'use client'`) using Tailwind CSS. Use Recharts for all charts.

### 4. API Routes

| Route File | Method | Path | Purpose |
|------------|--------|------|---------|
| `src/app/api/analytics/time-audit/route.ts` | GET | `/api/analytics/time-audit?userId=&start=&end=` | Generate time audit report |
| `src/app/api/analytics/productivity/route.ts` | GET | `/api/analytics/productivity?userId=&days=` | Get productivity scores |
| `src/app/api/analytics/goals/route.ts` | GET | `/api/analytics/goals?userId=&entityId=` | List goals |
| `src/app/api/analytics/goals/route.ts` | POST | `/api/analytics/goals` | Create a goal |
| `src/app/api/analytics/goals/[id]/route.ts` | GET | `/api/analytics/goals/:id` | Get goal with progress |
| `src/app/api/analytics/goals/[id]/route.ts` | PUT | `/api/analytics/goals/:id` | Update goal |
| `src/app/api/analytics/habits/route.ts` | GET | `/api/analytics/habits?userId=` | List habits |
| `src/app/api/analytics/habits/route.ts` | POST | `/api/analytics/habits` | Create a habit |
| `src/app/api/analytics/habits/[id]/complete/route.ts` | POST | `/api/analytics/habits/:id/complete` | Record habit completion |
| `src/app/api/analytics/ai-accuracy/route.ts` | GET | `/api/analytics/ai-accuracy?entityId=&periods=` | Get AI accuracy trend |
| `src/app/api/analytics/call-analytics/route.ts` | GET | `/api/analytics/call-analytics?entityId=&start=&end=` | Get call analytics |
| `src/app/api/analytics/llm-costs/route.ts` | GET | `/api/analytics/llm-costs?entityId=&period=` | Get LLM cost dashboard |
| `src/app/api/analytics/scorecard/route.ts` | GET | `/api/analytics/scorecard?entityId=&period=` | Get accuracy scorecard |
| `src/app/api/analytics/overrides/route.ts` | POST | `/api/analytics/overrides` | Record a user override |
| `src/app/api/analytics/overrides/analysis/route.ts` | GET | `/api/analytics/overrides/analysis?entityId=&period=` | Get override analysis |
| `src/app/api/analytics/bias/route.ts` | GET | `/api/analytics/bias?entityId=&period=` | Get bias report |

All routes MUST:
- Use Zod for request body and query parameter validation
- Use `success()`, `error()`, `paginated()` from `@/shared/utils/api-response`
- Use `prisma` from `@/lib/db`
- Wrap in try/catch returning `error('INTERNAL_ERROR', ...)` on failure
- Return proper HTTP status codes (200, 201, 400, 404, 500)

### 5. Dashboard Pages

**Analytics Dashboard page:** `src/app/(dashboard)/analytics/page.tsx`

Layout:
- Top row: TimeSavedDisplay + ProductivityScoreCard (hero metrics)
- Second row: TimeAuditChart + DriftAlertBanner
- Third row: GoalList (current active goals)
- Bottom row: LLMCostChart + CallAnalyticsPanel

**Analytics Layout:** `src/app/(dashboard)/analytics/layout.tsx`

Navigation tabs:
- "Overview" (`/analytics`)
- "Goals" (`/analytics/goals`)
- "Habits" (`/analytics/habits`)
- "AI Costs" (`/analytics/costs`)
- "Calls" (`/analytics/calls`)

**Sub-pages:**
- `src/app/(dashboard)/analytics/goals/page.tsx` -- Full goal management with create/edit forms
- `src/app/(dashboard)/analytics/habits/page.tsx` -- Habit tracker grid with correlation charts
- `src/app/(dashboard)/analytics/costs/page.tsx` -- Full LLM cost dashboard with feature breakdown
- `src/app/(dashboard)/analytics/calls/page.tsx` -- Call analytics with outcome distribution and ROI

**AI Quality Dashboard page:** `src/app/(dashboard)/ai-quality/page.tsx`

Layout:
- Top: AccuracyScorecardCard with ScorecardTrend chart
- Middle: ConfidenceGauge distribution + OverrideAnalysisPanel
- Bottom: BiasReportCard + GoldenTestPanel

**AI Quality Layout:** `src/app/(dashboard)/ai-quality/layout.tsx`

Navigation tabs:
- "Scorecard" (`/ai-quality`)
- "Golden Tests" (`/ai-quality/tests`)
- "Overrides" (`/ai-quality/overrides`)
- "Bias" (`/ai-quality/bias`)
- "Provenance" (`/ai-quality/provenance`)

**Sub-pages:**
- `src/app/(dashboard)/ai-quality/tests/page.tsx` -- Golden test suite management
- `src/app/(dashboard)/ai-quality/overrides/page.tsx` -- Override analysis with pattern table
- `src/app/(dashboard)/ai-quality/bias/page.tsx` -- Full bias report with affected groups
- `src/app/(dashboard)/ai-quality/provenance/page.tsx` -- Citation viewer with search

## Acceptance Criteria

- [ ] Time audit correctly compares intended vs actual time allocation
- [ ] Drift alerts fire at 20% (WARNING) and 50% (CRITICAL) thresholds
- [ ] Productivity score weights sum to 100% and are correctly applied
- [ ] Trend detection compares 7-day windows and classifies correctly
- [ ] Goal progress auto-updates from linked tasks/workflows
- [ ] Course correction suggestions trigger for AT_RISK and BEHIND goals
- [ ] Habit streak calculation handles gaps correctly
- [ ] Habit correlation uses Pearson coefficient
- [ ] Accuracy scorecard grade boundaries are correct (A>=90, B>=80, etc.)
- [ ] Golden test runner compares outputs with tolerance for numerics
- [ ] Confidence score thresholds map to correct recommendations
- [ ] Override analysis identifies top recurring patterns
- [ ] Bias detection scores are calculated per dimension
- [ ] All charts render correctly with Recharts
- [ ] All 16 API routes return correct `ApiResponse<T>` shapes
- [ ] All unit tests pass with `npx jest tests/unit/analytics/`
- [ ] No imports from other worker-owned paths
- [ ] No modifications to shared/immutable files

## Implementation Steps

1. **Read context files** -- `src/shared/types/index.ts`, `prisma/schema.prisma`, `src/shared/utils/api-response.ts`, `src/lib/db/index.ts`, `package.json`, `tsconfig.json`
2. **Create branch**: `git checkout -b ai-feature/w18-analytics`
3. **Install Recharts**: Add `recharts` to dependencies if not present
4. **Create type files** -- `src/modules/analytics/types.ts`, `src/modules/ai-quality/types.ts`
5. **Build Analytics services** (in order):
   a. `src/modules/analytics/services/time-audit-service.ts`
   b. `src/modules/analytics/services/productivity-scoring.ts`
   c. `src/modules/analytics/services/goal-tracking-service.ts`
   d. `src/modules/analytics/services/habit-tracking-service.ts`
   e. `src/modules/analytics/services/ai-accuracy-service.ts`
   f. `src/modules/analytics/services/llm-cost-service.ts`
   g. `src/modules/analytics/services/call-analytics-service.ts`
6. **Build AI Quality services** (in order):
   a. `src/modules/ai-quality/services/accuracy-scorecard-service.ts`
   b. `src/modules/ai-quality/services/golden-test-service.ts`
   c. `src/modules/ai-quality/services/confidence-service.ts`
   d. `src/modules/ai-quality/services/override-tracking-service.ts`
   e. `src/modules/ai-quality/services/bias-detection-service.ts`
   f. `src/modules/ai-quality/services/citation-service.ts`
7. **Build Analytics components** -- All 12 components with Recharts charts
8. **Build AI Quality components** -- All 8 components with Recharts charts
9. **Build API routes** -- All 16 route files with Zod schemas
10. **Build dashboard pages** -- Analytics + AI Quality layouts and sub-pages
11. **Write tests** -- Unit tests for scoring, correlations, grading
12. **Verify** -- `npx tsc --noEmit`, `npx jest tests/unit/analytics/`, `npx next build`

## Tests

Create these test files in `tests/unit/analytics/`:

### `tests/unit/analytics/productivity-scoring.test.ts`

```typescript
describe('calculateProductivityScore', () => {
  it('should return score 0-100');
  it('should weight highPriorityCompletion at 30%');
  it('should weight focusTimeAchieved at 25%');
  it('should weight goalProgress at 20%');
  it('should weight meetingEfficiency at 15%');
  it('should weight communicationSpeed at 10%');
  it('should handle all dimensions at 0');
  it('should handle all dimensions at 100');
});

describe('calculateTrend', () => {
  it('should return IMPROVING when recent 7 days > previous 7 days by 5%+');
  it('should return DECLINING when recent 7 days < previous 7 days by 5%+');
  it('should return STABLE when difference is within 5%');
  it('should handle fewer than 14 days of data');
});
```

### `tests/unit/analytics/goal-tracking.test.ts`

```typescript
describe('updateGoalProgress', () => {
  it('should update currentValue from linked task completion');
  it('should set ON_TRACK when pace >= required pace');
  it('should set AT_RISK when pace is 80-100% of required');
  it('should set BEHIND when pace < 80% of required');
  it('should set COMPLETE when currentValue >= targetValue');
});

describe('suggestCourseCorrection', () => {
  it('should suggest for AT_RISK goals');
  it('should suggest for BEHIND goals');
  it('should not suggest for ON_TRACK goals');
  it('should calculate adjusted end date');
});
```

### `tests/unit/analytics/habit-tracking.test.ts`

```typescript
describe('calculateStreak', () => {
  it('should return 0 for empty history');
  it('should return consecutive completions from today');
  it('should break streak on missed day');
  it('should handle weekday-only frequency');
});

describe('calculateCorrelations', () => {
  it('should return Pearson correlation coefficient');
  it('should return positive correlation for correlated data');
  it('should return negative correlation for anti-correlated data');
  it('should return near-zero for uncorrelated data');
  it('should handle insufficient data points gracefully');
});
```

### `tests/unit/analytics/accuracy-scorecard.test.ts`

```typescript
describe('generateScorecard', () => {
  it('should assign grade A for overall >= 90');
  it('should assign grade B for overall >= 80');
  it('should assign grade C for overall >= 70');
  it('should assign grade D for overall >= 60');
  it('should assign grade F for overall < 60');
});

describe('getGradeBreakdown', () => {
  it('should return all 4 dimensions with individual grades');
  it('should provide improvement suggestions for low-scoring dimensions');
});
```

### `tests/unit/analytics/confidence-service.test.ts`

```typescript
describe('calculateConfidence', () => {
  it('should return AUTO_EXECUTE for confidence >= 0.9');
  it('should return REVIEW_RECOMMENDED for confidence 0.7-0.9');
  it('should return HUMAN_REQUIRED for confidence < 0.7');
  it('should calculate weighted average correctly');
  it('should handle empty factors array');
});
```

### `tests/unit/analytics/time-audit.test.ts`

```typescript
describe('detectDriftAlerts', () => {
  it('should flag WARNING for drift > 20%');
  it('should flag CRITICAL for drift > 50%');
  it('should not alert for drift <= 20%');
  it('should include suggested action in alerts');
  it('should identify worst drift category');
});
```

Mock the Prisma client in all tests. Use `jest.mock('@/lib/db')`. No live database required.

## Commit Strategy

Use Conventional Commits. Commit after each logical unit is complete and compiling.

```
feat(analytics): add analytics and ai-quality type definitions
feat(analytics): implement time audit service with drift alerts
feat(analytics): implement productivity scoring with weighted dimensions
feat(analytics): implement goal tracking with OKR framework
feat(analytics): implement habit tracking with Pearson correlations
feat(analytics): implement AI accuracy and LLM cost services
feat(analytics): implement call analytics service
feat(ai-quality): implement accuracy scorecard with A-F grading
feat(ai-quality): implement golden test suite management and runner
feat(ai-quality): implement confidence scoring and override tracking
feat(ai-quality): implement bias detection and citation services
feat(analytics): add Recharts analytics dashboard components
feat(ai-quality): add AI quality dashboard components
feat(analytics): add analytics API routes with Zod validation
feat(analytics): add analytics dashboard pages with layout
feat(ai-quality): add AI quality dashboard pages with layout
test(analytics): add unit tests for productivity scoring and trends
test(analytics): add unit tests for goal tracking and habit correlations
test(analytics): add unit tests for accuracy scorecard and confidence
test(analytics): add unit tests for time audit drift alerts
chore(analytics): verify build and final cleanup
```

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
