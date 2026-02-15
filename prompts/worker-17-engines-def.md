# Worker 17: Cross-Cutting Engines D-F (Trust & Safety, Cost, Adoption)

## Branch: ai-feature/w17-engines-def

Create and check out the branch `ai-feature/w17-engines-def` from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside these directories:

```
src/engines/trust-safety/              # Trust & Safety engine (prompt injection, fraud, throttling)
src/engines/cost/                      # Cost & Entitlements service (metering, budgets, routing)
src/engines/adoption/                  # Adoption & Coaching engine (onboarding journey, time saved)
src/app/api/safety/                    # API routes for safety checks, throttling status
src/app/api/billing/                   # API routes for usage metering, budgets, cost attribution
src/app/(dashboard)/adoption/          # Dashboard pages for adoption checklist, time saved, playbooks
tests/unit/engines-def/                # All unit tests for this worker
```

## Context (read these first, do NOT modify)

Read and internalize these files before writing any code. They define the shared contracts.

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project-wide dev process, commit conventions, done criteria |
| `src/shared/types/index.ts` | Immutable shared types: `ActionLog`, `ActionActor`, `BlastRadius`, `AutonomyLevel`, `Workflow`, `WorkflowStep`, `WorkflowTrigger`, `FinancialRecord`, `FinancialRecordType`, `ApiResponse`, `ApiError`, `ApiMeta` |
| `prisma/schema.prisma` | Database schema: `ActionLog`, `Workflow`, `FinancialRecord`, `Entity`, `User` models with fields and relations |
| `src/shared/utils/api-response.ts` | API helpers: `success<T>()`, `error()`, `paginated<T>()` -- use these in every route handler |
| `src/lib/db/index.ts` | Prisma client singleton: `import { prisma } from '@/lib/db'` |
| `package.json` | Stack: Next.js 16, React 19, Prisma 7, Zod 4, date-fns 4, Jest 30, ts-jest, BullMQ, ioredis |
| `tsconfig.json` | Path aliases: `@/` maps to `src/` |

## Requirements

### 1. Trust & Safety Engine (CC-D)

**Types file:** `src/engines/trust-safety/types.ts`

```typescript
export type ThreatLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface PromptInjectionResult {
  isSafe: boolean;
  threatLevel: ThreatLevel;
  detectedPatterns: string[];
  sanitizedInput?: string;
  explanation: string;
}

export interface FraudHeuristic {
  id: string;
  name: string;
  description: string;
  triggers: string[];             // conditions that activate this heuristic
  severity: ThreatLevel;
  requiresHumanApproval: boolean;
}

export interface FraudCheckResult {
  passed: boolean;
  triggeredHeuristics: FraudHeuristic[];
  overallRisk: ThreatLevel;
  requiresApproval: boolean;
  explanation: string;
}

export interface ThrottleConfig {
  actionType: string;
  maxPerHour: number;
  maxPerDay: number;
  requiresApprovalAbove?: number;  // requires approval if count exceeds this
  cooldownMinutes?: number;
}

export interface ThrottleStatus {
  actionType: string;
  currentHourCount: number;
  currentDayCount: number;
  maxPerHour: number;
  maxPerDay: number;
  isThrottled: boolean;
  nextAllowedAt?: Date;
  requiresApproval: boolean;
}

export interface ImpersonationSafeguard {
  consentVerified: boolean;
  watermarkApplied: boolean;
  disclosureIncluded: boolean;
  voiceCloneId?: string;
  consentTimestamp?: Date;
}

export interface ReputationStatus {
  channel: 'PHONE' | 'EMAIL';
  identifier: string;           // phone number or email domain
  spamScore: number;            // 0-100 (0 = clean, 100 = spam)
  warmingProgress?: number;     // 0-100% for phone warming
  stirShakenCompliant?: boolean;
  dkimValid?: boolean;
  spfValid?: boolean;
  dmarcValid?: boolean;
  lastChecked: Date;
}

export interface EmailHeaderAnalysis {
  fromDomain: string;
  dkimStatus: 'PASS' | 'FAIL' | 'MISSING';
  spfStatus: 'PASS' | 'FAIL' | 'MISSING';
  dmarcStatus: 'PASS' | 'FAIL' | 'MISSING';
  isSpoofed: boolean;
  riskLevel: ThreatLevel;
  details: string[];
}
```

**Service file:** `src/engines/trust-safety/injection-firewall.ts`

Implement:
- `scanForInjection(input: string): PromptInjectionResult` -- Pure function. Checks for known injection patterns: role overrides ("ignore previous instructions"), encoded payloads (base64, unicode escapes), system prompt leaks, jailbreak templates, delimiter injection (```, ---), instruction override ("you are now"). Returns threat level and sanitized version.
- `sanitizeInput(input: string): string` -- Strips dangerous patterns while preserving legitimate content. Removes control characters, normalizes unicode, escapes delimiters.
- `isAllowedAction(action: string, allowList: string[]): boolean` -- Checks if an action is in the allow-list of structured tool calls.

**Service file:** `src/engines/trust-safety/fraud-detector.ts`

Implement:
- `checkForFraud(action: ActionLog): FraudCheckResult` -- Evaluates an action against built-in fraud heuristics. Built-in heuristics include:
  - `URGENT_WIRE`: Wire transfer with "urgent" language or same-day deadline
  - `NEW_PAYEE`: Payment to payee not seen in last 90 days
  - `INVOICE_ANOMALY`: Invoice amount > 2x average for this vendor
  - `UNUSUAL_TIME`: Financial transaction outside business hours
  - `RAPID_SUCCESSION`: Multiple financial actions within 10 minutes
  - `AMOUNT_THRESHOLD`: Single transaction > $5,000 without prior approval pattern
- `getDefaultHeuristics(): FraudHeuristic[]` -- Returns the built-in heuristic definitions.
- `evaluateHeuristic(heuristic: FraudHeuristic, action: ActionLog, history?: ActionLog[]): boolean` -- Tests a single heuristic against an action.

**Service file:** `src/engines/trust-safety/throttle-service.ts`

Implement:
- `checkThrottle(userId: string, actionType: string): Promise<ThrottleStatus>` -- Checks if an action is within rate limits. Default limits: calls = 5/hr, emails = 20/hr, financial_tx = 1/day without approval.
- `recordAction(userId: string, actionType: string): Promise<void>` -- Increments the action counter for rate limiting.
- `getThrottleConfig(actionType: string): ThrottleConfig` -- Returns rate limit config for an action type.
- `updateThrottleConfig(actionType: string, config: Partial<ThrottleConfig>): ThrottleConfig` -- Updates rate limits.
- `resetThrottle(userId: string, actionType: string): Promise<void>` -- Admin reset of throttle counters.
- `getDefaultThrottleConfigs(): ThrottleConfig[]` -- Returns all default throttle configurations.

**Service file:** `src/engines/trust-safety/impersonation-guard.ts`

Implement:
- `verifyVoiceCloneConsent(userId: string, voiceCloneId: string): Promise<ImpersonationSafeguard>` -- Checks consent status for voice cloning.
- `applyWatermark(audioContentId: string): Promise<ImpersonationSafeguard>` -- Placeholder that marks audio as AI-generated.
- `generateDisclosure(context: string): string` -- Returns appropriate disclosure text for AI-generated communications.

**Service file:** `src/engines/trust-safety/reputation-service.ts`

Implement:
- `checkPhoneReputation(phoneNumber: string): Promise<ReputationStatus>` -- Placeholder returning simulated reputation data for a phone number. Includes warming progress and STIR/SHAKEN compliance flag.
- `checkEmailReputation(domain: string): Promise<ReputationStatus>` -- Placeholder returning spam score and authentication status.
- `analyzeEmailHeaders(headers: Record<string, string>): EmailHeaderAnalysis` -- Parses email headers to check DKIM, SPF, DMARC status and detect domain spoofing.
- `getReputationDashboard(entityId: string): Promise<ReputationStatus[]>` -- Returns reputation for all phone numbers and email domains associated with an entity.

### 2. Cost & Entitlements Service (CC-E)

**Types file:** `src/engines/cost/types.ts`

```typescript
export type UsageMetricType = 'TOKENS' | 'VOICE_MINUTES' | 'STORAGE_MB' | 'WORKFLOW_RUNS' | 'API_CALLS';

export interface UsageRecord {
  id: string;
  entityId: string;
  metricType: UsageMetricType;
  amount: number;
  unitCost: number;
  totalCost: number;
  source: string;            // which feature/module generated this usage
  timestamp: Date;
}

export interface BudgetConfig {
  entityId: string;
  monthlyCapUsd: number;
  alertThresholds: number[];   // e.g., [0.75, 0.90, 1.0]
  overageBehavior: 'BLOCK' | 'WARN' | 'ALLOW_WITH_APPROVAL';
  currentSpend: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface BudgetAlert {
  entityId: string;
  threshold: number;         // which threshold was crossed
  currentSpend: number;
  monthlyCapUsd: number;
  percentUsed: number;
  message: string;
  triggeredAt: Date;
}

export type ModelTier = 'FAST' | 'BALANCED' | 'POWERFUL';

export interface ModelRoutingDecision {
  inputComplexity: 'SIMPLE' | 'MODERATE' | 'COMPLEX';
  recommendedTier: ModelTier;
  recommendedModel: string;
  reason: string;
  estimatedCost: number;
}

export interface ProviderHealth {
  providerId: string;
  providerName: string;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  latencyMs: number;
  errorRate: number;
  lastChecked: Date;
}

export interface ProviderFallback {
  primaryProviderId: string;
  fallbackProviderId: string;
  triggerCondition: 'DOWN' | 'DEGRADED' | 'SLOW' | 'ERROR_RATE_HIGH';
  isAutomatic: boolean;
  isActive: boolean;
}

export interface WorkflowCostAttribution {
  workflowId: string;
  workflowName: string;
  totalCostUsd: number;
  costPerRun: number;
  totalRuns: number;
  breakdown: { metricType: UsageMetricType; cost: number; amount: number }[];
  lastRunDate: Date;
}
```

**Service file:** `src/engines/cost/usage-metering.ts`

Implement:
- `recordUsage(entityId: string, metricType: UsageMetricType, amount: number, source: string): Promise<UsageRecord>` -- Records a usage event with cost calculation.
- `getUsageSummary(entityId: string, startDate: Date, endDate: Date): Promise<{ byMetric: Record<UsageMetricType, { amount: number; cost: number }>; totalCost: number }>` -- Aggregated usage for a period.
- `getRealtimeUsage(entityId: string): Promise<{ todaySpend: number; monthSpend: number; topSources: { source: string; cost: number }[] }>` -- Real-time usage snapshot.
- `getUnitCost(metricType: UsageMetricType): number` -- Returns the unit cost for a metric type. Defaults: TOKENS = $0.00001, VOICE_MINUTES = $0.05, STORAGE_MB = $0.01, WORKFLOW_RUNS = $0.10, API_CALLS = $0.001.

**Service file:** `src/engines/cost/budget-service.ts`

Implement:
- `setBudget(entityId: string, monthlyCapUsd: number, alertThresholds?: number[], overageBehavior?: string): Promise<BudgetConfig>` -- Creates or updates a budget for an entity.
- `getBudget(entityId: string): Promise<BudgetConfig | null>` -- Returns current budget config with live spend.
- `checkBudget(entityId: string, additionalCost: number): Promise<{ allowed: boolean; alerts: BudgetAlert[]; remainingBudget: number }>` -- Checks if spending `additionalCost` would exceed budget or trigger alerts. Returns alerts for any crossed thresholds.
- `getBudgetAlerts(entityId: string): Promise<BudgetAlert[]>` -- Returns all triggered alerts for the current period.
- `resetBudgetPeriod(entityId: string): Promise<BudgetConfig>` -- Resets spend counter for a new billing period.

**Service file:** `src/engines/cost/model-router.ts`

Implement:
- `routeRequest(inputText: string, taskType?: string): ModelRoutingDecision` -- Analyzes input complexity and returns the recommended model tier. Routing logic: short/simple queries (< 100 tokens, simple intent) -> FAST (Haiku), moderate complexity -> BALANCED (Sonnet), long/complex/creative -> POWERFUL (Opus). Draft tasks always use BALANCED.
- `estimateCost(modelTier: ModelTier, inputTokens: number, outputTokens: number): number` -- Estimates cost in USD for a model call. Uses tier-based pricing: FAST = $0.25/$1.25 per 1M, BALANCED = $3/$15 per 1M, POWERFUL = $15/$75 per 1M.
- `getModelForTier(tier: ModelTier): string` -- Returns the model identifier for a tier.

**Service file:** `src/engines/cost/provider-failover.ts`

Implement:
- `checkProviderHealth(providerId: string): Promise<ProviderHealth>` -- Placeholder health check returning simulated status.
- `getHealthyProvider(primaryId: string, fallbackId: string): Promise<string>` -- Returns the primary provider if healthy, otherwise the fallback.
- `listFallbacks(): ProviderFallback[]` -- Returns configured fallback pairs. Default pairs: Twilio -> Vonage, OpenAI -> Claude, SendGrid -> AWS SES.
- `setFallback(primaryId: string, fallbackId: string, triggerCondition: string, isAutomatic: boolean): ProviderFallback`
- `activateKillSwitch(providerId: string): Promise<void>` -- Manually disables a provider and activates its fallback.
- `deactivateKillSwitch(providerId: string): Promise<void>` -- Re-enables a provider.

**Service file:** `src/engines/cost/cost-attribution.ts`

Implement:
- `attributeCostToWorkflow(workflowId: string, startDate: Date, endDate: Date): Promise<WorkflowCostAttribution>` -- Calculates total cost and per-run cost for a workflow, broken down by usage metric.
- `getTopCostlyWorkflows(entityId: string, limit?: number): Promise<WorkflowCostAttribution[]>` -- Ranked list of most expensive workflows.
- `getCostTimeline(entityId: string, days: number): Promise<{ date: string; cost: number }[]>` -- Daily cost for charting.

### 3. Adoption & Coaching Engine (CC-F)

**Types file:** `src/engines/adoption/types.ts`

```typescript
export interface ActivationChecklist {
  userId: string;
  startDate: Date;
  currentDay: number;
  phases: ActivationPhase[];
  overallProgress: number;       // 0-100
}

export interface ActivationPhase {
  name: string;
  dayRange: [number, number];
  tasks: ActivationTask[];
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE';
}

export interface ActivationTask {
  id: string;
  title: string;
  description: string;
  phase: string;
  dayTarget: number;
  isComplete: boolean;
  completedAt?: Date;
  isAhaMoment: boolean;         // correlates with retention
}

export interface TimeSavedEntry {
  id: string;
  userId: string;
  action: string;
  minutesSaved: number;
  category: string;             // "email", "scheduling", "research", "data_entry"
  timestamp: Date;
}

export interface TimeSavedSummary {
  userId: string;
  totalMinutesSaved: number;
  totalHoursSaved: number;
  byCategory: Record<string, number>;
  byDay: { date: string; minutes: number }[];
  streak: number;               // consecutive days with time saved
  projectedMonthlySavings: number;
}

export interface Playbook {
  id: string;
  name: string;
  description: string;
  category: string;
  steps: PlaybookStep[];
  estimatedTimeSavedMinutes: number;
  activationCount: number;
  rating: number;               // 0-5 average user rating
}

export interface PlaybookStep {
  order: number;
  title: string;
  description: string;
  actionType: 'CONFIGURE' | 'CONNECT' | 'AUTOMATE' | 'REVIEW';
  isOptional: boolean;
}

export interface CoachingRecommendation {
  id: string;
  userId: string;
  type: 'FEATURE_DISCOVERY' | 'OPTIMIZATION' | 'AUTOMATION' | 'HABIT';
  title: string;
  description: string;
  estimatedImpactMinutes: number;
  oneClickAction?: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'PENDING' | 'APPLIED' | 'DISMISSED';
}

export interface AhaMoment {
  action: string;
  description: string;
  retentionCorrelation: number;  // 0-1, how strongly this correlates with retention
  targetDay: number;             // ideal day to guide user toward this
}

export interface ReengagementTrigger {
  userId: string;
  triggerType: 'USAGE_DROP' | 'FEATURE_ABANDONMENT' | 'STREAK_BREAK' | 'INACTIVE';
  message: string;
  suggestedAction: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  triggeredAt: Date;
}
```

**Service file:** `src/engines/adoption/activation-service.ts`

Implement:
- `initializeChecklist(userId: string): Promise<ActivationChecklist>` -- Creates a 30-day activation plan with 4 phases:
  - Days 1-3: "Inbox Mastery" (connect email, triage settings, first auto-draft)
  - Days 4-7: "Calendar Command" (connect calendar, set focus hours, first prep packet)
  - Days 8-14: "Automation Builder" (create first workflow, set first rule, first broadcast)
  - Days 15-21: "Voice & Communication" (voice persona setup, first call, call script)
  - Days 22-30: "Full Delegation" (delegation inbox, attention budget, first fully autonomous task)
- `getChecklist(userId: string): Promise<ActivationChecklist>` -- Returns current checklist with progress.
- `completeTask(userId: string, taskId: string): Promise<ActivationChecklist>` -- Marks a task complete, updates phase status and overall progress.
- `getCurrentPhase(userId: string): Promise<ActivationPhase>` -- Returns the phase the user should be in based on their start date.

**Service file:** `src/engines/adoption/time-saved-service.ts`

Implement:
- `recordTimeSaved(userId: string, action: string, minutesSaved: number, category: string): Promise<TimeSavedEntry>` -- Logs a time-savings event.
- `getTimeSavedSummary(userId: string, days?: number): Promise<TimeSavedSummary>` -- Aggregated summary with total hours, category breakdown, daily breakdown, streak count, projected monthly savings.
- `getRunningTotal(userId: string): Promise<{ totalMinutes: number; totalHours: number; formattedDisplay: string }>` -- Quick counter for the always-visible "Time saved" display. `formattedDisplay` returns human-friendly "12h 34m saved".
- `calculateStreak(userId: string): Promise<number>` -- Returns consecutive days with at least one time-saved entry.

**Service file:** `src/engines/adoption/playbook-service.ts`

Implement:
- `getPlaybooks(category?: string): Promise<Playbook[]>` -- Lists available playbooks, optionally filtered by category.
- `getPlaybook(playbookId: string): Promise<Playbook | null>` -- Returns single playbook with steps.
- `activatePlaybook(userId: string, playbookId: string): Promise<{ success: boolean; message: string }>` -- Begins a playbook execution for a user.
- `getDefaultPlaybooks(): Playbook[]` -- Returns built-in playbooks:
  - "Morning Briefing Setup" (category: productivity, 5 min saved/day)
  - "Email Auto-Triage" (category: email, 15 min saved/day)
  - "Meeting Prep Automation" (category: calendar, 10 min saved/meeting)
  - "Invoice Processing Pipeline" (category: finance, 20 min saved/batch)
  - "Client Follow-Up Cadence" (category: communication, 30 min saved/week)
  - "Weekly Report Generator" (category: reporting, 45 min saved/week)

**Service file:** `src/engines/adoption/coaching-service.ts`

Implement:
- `generateRecommendations(userId: string): Promise<CoachingRecommendation[]>` -- Analyzes user behavior and generates personalized recommendations. Considers: underused features, inefficient patterns, automation opportunities.
- `applyRecommendation(userId: string, recommendationId: string): Promise<{ success: boolean }>` -- One-click apply of a recommendation.
- `dismissRecommendation(userId: string, recommendationId: string): Promise<void>` -- User dismisses a recommendation.
- `getWeeklyReview(userId: string): Promise<{ recommendations: CoachingRecommendation[]; weeklyTimeSaved: number; topWin: string; improvementArea: string }>` -- Weekly coaching summary.

**Service file:** `src/engines/adoption/aha-moment-service.ts`

Implement:
- `getAhaMoments(): AhaMoment[]` -- Returns the defined aha moments:
  - "First auto-drafted email approved" (correlation: 0.85, target day 2)
  - "First workflow triggered automatically" (correlation: 0.90, target day 10)
  - "Voice call handled by AI" (correlation: 0.75, target day 17)
  - "Time saved counter reaches 1 hour" (correlation: 0.88, target day 5)
  - "First fully autonomous task completed" (correlation: 0.92, target day 25)
- `checkAhaMomentProgress(userId: string): Promise<{ completed: AhaMoment[]; next: AhaMoment | null; guidanceMessage: string }>` -- Checks which aha moments the user has reached and provides guidance toward the next one.

**Service file:** `src/engines/adoption/reengagement-service.ts`

Implement:
- `checkForReengagementTriggers(userId: string): Promise<ReengagementTrigger[]>` -- Detects disengagement signals:
  - `USAGE_DROP`: Daily active usage drops > 50% from 7-day average
  - `FEATURE_ABANDONMENT`: Feature used in week 1 but not in week 2+
  - `STREAK_BREAK`: Time-saved streak broken after 5+ day streak
  - `INACTIVE`: No login in 3+ days during first 30 days, or 7+ days after
- `generateReengagementMessage(trigger: ReengagementTrigger): string` -- Creates a personalized re-engagement message.

**Components in `src/engines/adoption/components/`:**

- `ActivationChecklist.tsx` -- Visual 30-day journey with phase headers, task checkboxes, progress bar. Props: `checklist: ActivationChecklist`.
- `TimeSavedCounter.tsx` -- Always-visible floating counter showing total time saved with animated increment. Props: `userId: string`.
- `TimeSavedChart.tsx` -- Bar chart showing daily time saved over last 30 days. Props: `data: { date: string; minutes: number }[]`.
- `PlaybookCard.tsx` -- Card displaying a playbook with steps, estimated savings, rating, and "Activate" button. Props: `playbook: Playbook; onActivate: (id: string) => void`.
- `PlaybookLibrary.tsx` -- Grid of playbook cards with category filter. Props: `playbooks: Playbook[]`.
- `CoachingCard.tsx` -- Recommendation card with one-click apply and dismiss buttons. Props: `recommendation: CoachingRecommendation; onApply: () => void; onDismiss: () => void`.
- `WeeklyReviewPanel.tsx` -- Weekly coaching summary panel. Props: `userId: string`.
- `AhaMomentTracker.tsx` -- Visual progress through aha moments with celebration animations on completion. Props: `userId: string`.

All components must be client components (`'use client'`) using Tailwind CSS. No external UI libraries except Recharts for charts (already acceptable per project conventions).

### 4. API Routes

| Route File | Method | Path | Purpose |
|------------|--------|------|---------|
| `src/app/api/safety/injection-check/route.ts` | POST | `/api/safety/injection-check` | Scan input for prompt injection, return threat level |
| `src/app/api/safety/fraud-check/route.ts` | POST | `/api/safety/fraud-check` | Evaluate an action for fraud heuristics |
| `src/app/api/safety/throttle/route.ts` | GET | `/api/safety/throttle?userId=&actionType=` | Get current throttle status |
| `src/app/api/safety/throttle/route.ts` | POST | `/api/safety/throttle` | Record an action for throttling |
| `src/app/api/safety/reputation/route.ts` | GET | `/api/safety/reputation?entityId=` | Get reputation dashboard for entity |
| `src/app/api/safety/email-headers/route.ts` | POST | `/api/safety/email-headers` | Analyze email headers for spoofing |
| `src/app/api/billing/usage/route.ts` | POST | `/api/billing/usage` | Record a usage event |
| `src/app/api/billing/usage/route.ts` | GET | `/api/billing/usage?entityId=&start=&end=` | Get usage summary for period |
| `src/app/api/billing/budget/route.ts` | GET | `/api/billing/budget?entityId=` | Get budget config |
| `src/app/api/billing/budget/route.ts` | POST | `/api/billing/budget` | Set/update budget |
| `src/app/api/billing/budget/check/route.ts` | POST | `/api/billing/budget/check` | Check if additional cost is within budget |
| `src/app/api/billing/cost-attribution/route.ts` | GET | `/api/billing/cost-attribution?entityId=` | Get workflow cost attribution |
| `src/app/api/billing/model-route/route.ts` | POST | `/api/billing/model-route` | Get recommended model for input |

All routes MUST:
- Use Zod for request body and query parameter validation
- Use `success()`, `error()`, `paginated()` from `@/shared/utils/api-response`
- Use `prisma` from `@/lib/db`
- Wrap in try/catch returning `error('INTERNAL_ERROR', ...)` on failure
- Return proper HTTP status codes (200, 201, 400, 404, 500)

### 5. Dashboard Pages

**Adoption Dashboard page:** `src/app/(dashboard)/adoption/page.tsx`

Layout:
- Top: TimeSavedCounter (prominent, always visible)
- Left column: ActivationChecklist (30-day journey)
- Right column: AhaMomentTracker + CoachingCard recommendations
- Bottom: PlaybookLibrary grid

**Adoption Layout:** `src/app/(dashboard)/adoption/layout.tsx`

Navigation tabs:
- "Journey" (`/adoption`) -- activation checklist + aha moments
- "Playbooks" (`/adoption/playbooks`) -- playbook library
- "Coaching" (`/adoption/coaching`) -- recommendations + weekly review
- "Impact" (`/adoption/impact`) -- time saved charts + usage analytics

**Sub-pages:**
- `src/app/(dashboard)/adoption/playbooks/page.tsx` -- Full playbook library with categories
- `src/app/(dashboard)/adoption/coaching/page.tsx` -- Coaching recommendations with weekly review panel
- `src/app/(dashboard)/adoption/impact/page.tsx` -- TimeSavedChart + category breakdown + streak display

## Acceptance Criteria

- [ ] Injection firewall detects at least 6 injection patterns (role override, base64 payloads, jailbreak templates, delimiter injection, system prompt leaks, instruction override)
- [ ] Fraud detector evaluates all 6 built-in heuristics correctly
- [ ] Throttle service enforces default rate limits: 5 calls/hr, 20 emails/hr, 1 financial tx/day
- [ ] Throttle status correctly reports `isThrottled: true` when limits exceeded
- [ ] Budget service returns alerts at 75%, 90%, 100% thresholds
- [ ] Budget check returns `allowed: false` when overage behavior is BLOCK and limit exceeded
- [ ] Model router correctly classifies simple/moderate/complex inputs
- [ ] Provider failover returns fallback when primary is DOWN
- [ ] Cost attribution calculates per-run costs accurately
- [ ] Activation checklist initializes with all 5 phases and correct day ranges
- [ ] Time-saved counter returns running total and formatted display
- [ ] Streak calculation is correct for consecutive days
- [ ] Re-engagement triggers fire correctly for each condition
- [ ] All 13 API routes return correct `ApiResponse<T>` shapes
- [ ] All dashboard pages and components render without errors
- [ ] All unit tests pass with `npx jest tests/unit/engines-def/`
- [ ] No imports from other worker-owned paths
- [ ] No modifications to shared/immutable files

## Implementation Steps

1. **Read context files** -- `src/shared/types/index.ts`, `prisma/schema.prisma`, `src/shared/utils/api-response.ts`, `src/lib/db/index.ts`, `package.json`, `tsconfig.json`
2. **Create branch**: `git checkout -b ai-feature/w17-engines-def`
3. **Create engine type files** -- `src/engines/trust-safety/types.ts`, `src/engines/cost/types.ts`, `src/engines/adoption/types.ts`
4. **Build Trust & Safety services** (in order):
   a. `src/engines/trust-safety/injection-firewall.ts` (pure functions, no DB)
   b. `src/engines/trust-safety/fraud-detector.ts` (depends on ActionLog type)
   c. `src/engines/trust-safety/throttle-service.ts` (depends on prisma for counters)
   d. `src/engines/trust-safety/impersonation-guard.ts` (placeholder logic)
   e. `src/engines/trust-safety/reputation-service.ts` (placeholder + header analysis)
5. **Build Cost services** (in order):
   a. `src/engines/cost/usage-metering.ts` (depends on prisma)
   b. `src/engines/cost/budget-service.ts` (depends on usage-metering)
   c. `src/engines/cost/model-router.ts` (pure function, no DB)
   d. `src/engines/cost/provider-failover.ts` (placeholder health checks)
   e. `src/engines/cost/cost-attribution.ts` (depends on usage-metering)
6. **Build Adoption services** (in order):
   a. `src/engines/adoption/activation-service.ts`
   b. `src/engines/adoption/time-saved-service.ts`
   c. `src/engines/adoption/playbook-service.ts`
   d. `src/engines/adoption/coaching-service.ts`
   e. `src/engines/adoption/aha-moment-service.ts`
   f. `src/engines/adoption/reengagement-service.ts`
7. **Build Adoption components** -- All 8 components in `src/engines/adoption/components/`
8. **Build API routes** -- All 13 route files with Zod schemas
9. **Build dashboard pages** -- Adoption layout, journey, playbooks, coaching, impact pages
10. **Write tests** -- Unit tests for throttling, budgets, time-saved
11. **Verify** -- `npx tsc --noEmit`, `npx jest tests/unit/engines-def/`, `npx next build`

## Tests

Create these test files in `tests/unit/engines-def/`:

### `tests/unit/engines-def/throttle-service.test.ts`

```typescript
describe('checkThrottle', () => {
  it('should allow action when under hourly limit');
  it('should throttle when hourly limit reached');
  it('should allow action when under daily limit');
  it('should throttle when daily limit reached');
  it('should report requiresApproval when above approval threshold');
  it('should calculate correct nextAllowedAt time');
});

describe('recordAction', () => {
  it('should increment hourly counter');
  it('should increment daily counter');
});

describe('getDefaultThrottleConfigs', () => {
  it('should return config for calls with maxPerHour=5');
  it('should return config for emails with maxPerHour=20');
  it('should return config for financial_tx with maxPerDay=1');
});
```

### `tests/unit/engines-def/budget-service.test.ts`

```typescript
describe('checkBudget', () => {
  it('should allow spending within budget');
  it('should return alert at 75% threshold');
  it('should return alert at 90% threshold');
  it('should return alert at 100% threshold');
  it('should block spending when overage behavior is BLOCK');
  it('should warn but allow when overage behavior is WARN');
  it('should calculate remaining budget correctly');
});

describe('setBudget', () => {
  it('should create new budget with default thresholds');
  it('should update existing budget');
});
```

### `tests/unit/engines-def/time-saved-service.test.ts`

```typescript
describe('getTimeSavedSummary', () => {
  it('should aggregate total minutes correctly');
  it('should break down by category');
  it('should calculate streak correctly');
  it('should project monthly savings from recent data');
});

describe('getRunningTotal', () => {
  it('should return formatted display as "Xh Ym saved"');
  it('should handle zero time saved');
  it('should handle only minutes (< 60 min)');
  it('should handle large totals (100+ hours)');
});

describe('calculateStreak', () => {
  it('should return 0 for no entries');
  it('should return 1 for entries only today');
  it('should return correct streak for consecutive days');
  it('should break streak on gaps');
});
```

### `tests/unit/engines-def/injection-firewall.test.ts`

```typescript
describe('scanForInjection', () => {
  it('should detect "ignore previous instructions" pattern');
  it('should detect base64 encoded payloads');
  it('should detect jailbreak templates');
  it('should detect delimiter injection');
  it('should detect system prompt leak attempts');
  it('should return NONE threat level for clean input');
  it('should return sanitized version of dangerous input');
});

describe('sanitizeInput', () => {
  it('should strip control characters');
  it('should normalize unicode');
  it('should preserve legitimate content');
});
```

### `tests/unit/engines-def/fraud-detector.test.ts`

```typescript
describe('checkForFraud', () => {
  it('should flag urgent wire transfers');
  it('should flag new payees not seen in 90 days');
  it('should flag invoice amounts > 2x vendor average');
  it('should flag transactions outside business hours');
  it('should pass clean transactions');
  it('should require human approval for HIGH+ severity');
});
```

### `tests/unit/engines-def/model-router.test.ts`

```typescript
describe('routeRequest', () => {
  it('should route short simple queries to FAST tier');
  it('should route moderate queries to BALANCED tier');
  it('should route complex queries to POWERFUL tier');
  it('should route draft tasks to BALANCED tier');
});

describe('estimateCost', () => {
  it('should calculate FAST tier cost correctly');
  it('should calculate BALANCED tier cost correctly');
  it('should calculate POWERFUL tier cost correctly');
});
```

Mock the Prisma client in all tests. Use `jest.mock('@/lib/db')`. No live database required.

## Commit Strategy

Use Conventional Commits. Commit after each logical unit is complete and compiling.

```
feat(trust-safety): add types and prompt injection firewall
feat(trust-safety): implement fraud detector with 6 built-in heuristics
feat(trust-safety): add action throttling service with rate limits
feat(trust-safety): add impersonation guard and reputation service
feat(cost): add usage metering service with unit cost calculations
feat(cost): implement budget service with threshold alerts
feat(cost): add smart model routing and cost estimation
feat(cost): add provider failover and cost attribution services
feat(adoption): implement 30-day activation checklist service
feat(adoption): add time-saved counter and streak tracking
feat(adoption): add playbook library and coaching recommendation services
feat(adoption): add aha-moment tracking and re-engagement triggers
feat(adoption): add dashboard components for adoption journey
feat(engines-def): add safety and billing API routes with Zod validation
feat(adoption): add adoption dashboard pages with layout
test(engines-def): add unit tests for throttle and budget services
test(engines-def): add unit tests for time-saved and streak calculations
test(engines-def): add unit tests for injection firewall and fraud detector
test(engines-def): add unit tests for model routing
chore(engines-def): verify build and final cleanup
```

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
