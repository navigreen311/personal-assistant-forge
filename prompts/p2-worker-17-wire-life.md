# Worker 17: Wire AI & Auth into Life Modules (Travel, Health, Household, Crisis)

## Branch

`ai-feature/p2-w17-wire-life`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to modifying files within these paths. Do NOT touch any files outside these directories:

```
src/modules/travel/                    # Travel module services and components
src/modules/health/                    # Health & wellness module services and components
src/modules/household/                 # Household management module services and components
src/modules/crisis/                    # Crisis management module services and components
src/app/api/travel/                    # API routes for travel
src/app/api/health/                    # API routes for health
src/app/api/household/                 # API routes for household
src/app/api/crisis/                    # API routes for crisis
tests/unit/life-modules/               # Unit tests (modify existing or add new)
```

**DO NOT modify these files:**
- `jest.config.ts`
- `package.json`
- `src/lib/ai/` -- read only
- `src/shared/middleware/auth.ts` -- read only
- `src/shared/types/index.ts`
- `src/shared/utils/api-response.ts`
- `src/lib/db/index.ts`
- `prisma/schema.prisma`

## Context (read these first, do NOT modify)

Before modifying any code, read and internalize these files:

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project-wide dev process, commit conventions, done criteria |
| `src/lib/ai/index.ts` | AI client exports: `generateText`, `generateJSON`, `chat`, `streamText` with `AIOptions` |
| `src/lib/ai/client.ts` | Full AI client implementation -- understand function signatures and `AIOptions` type |
| `src/shared/middleware/auth.ts` | Auth middleware: `withAuth(req, handler)`, `withRole(req, roles, handler)`, `withEntityAccess(req, entityId, handler)` |
| `src/shared/types/index.ts` | Immutable shared types |
| `src/shared/utils/api-response.ts` | API helpers: `success<T>()`, `error()`, `paginated<T>()` |
| `src/lib/db/index.ts` | Prisma client singleton |
| `src/modules/travel/types.ts` | Travel types (Itinerary, VisaRequirement, DisruptionResponse, etc.) |
| `src/modules/health/types.ts` | Health types (SleepOptimization, EnergyForecast, StressAdjustment, etc.) |
| `src/modules/household/types.ts` | Household types (MaintenanceTask, ServiceProvider, etc.) |
| `src/modules/crisis/types.ts` | Crisis types (CrisisEvent, CrisisDetectionSignal, PostIncidentReview, etc.) |
| `tsconfig.json` | Path aliases: `@/` maps to `src/` |

## Requirements

### 1. Wire AI into Travel Services

Read each service file in `src/modules/travel/services/`. Add this import where needed:

```typescript
import { generateText, generateJSON } from '@/lib/ai';
```

#### `src/modules/travel/services/itinerary-service.ts`
- Wire AI for **itinerary optimization**. If there is a function that suggests itinerary improvements or reordering, replace placeholder logic with `generateJSON()`. Build a prompt that includes the legs, times, and locations to suggest optimized routing.
- If itinerary creation includes any AI-generated notes or suggestions, wire those.

#### `src/modules/travel/services/visa-checker-service.ts`
- `checkVisaRequirements()` should enhance its lookup with AI. For country pairs not in the built-in table, call `generateJSON()` with a prompt asking about visa requirements for the specific citizenship/destination pair. The AI response should match the `VisaRequirement` type structure.
- Add a system prompt instructing the AI to be conservative (when unsure, say visa may be required).

#### `src/modules/travel/services/flight-monitor-service.ts`
- `generateDisruptionResponse()` should use `generateText()` to produce the `reason` field explaining why the recommended alternative was chosen.
- Wire AI to analyze disruption patterns and produce actionable recommendations.

#### `src/modules/travel/services/timezone-service.ts`
- If there is any natural-language output about timezone adjustments, wire to `generateText()`.

### 2. Wire AI into Health Services

#### `src/modules/health/services/sleep-service.ts`
- `analyzeSleepPatterns()` should use `generateJSON()` to produce sleep optimization recommendations. Build a prompt with the user's sleep history data (scores, bed times, wake times) and ask for correlations and suggestions. Response should match `SleepOptimization` type.
- Use temperature 0.4 for structured health recommendations.

#### `src/modules/health/services/energy-service.ts`
- `forecastEnergy()` should use `generateJSON()` to produce the `recommendation` field and identify peak/trough hours. Include sleep data and historical patterns in the prompt.
- `getOptimalSchedule()` should use `generateJSON()` to produce intelligent slot recommendations based on the energy forecast data.

#### `src/modules/health/services/stress-service.ts`
- `suggestScheduleAdjustments()` should use `generateJSON()` to produce `StressAdjustment[]`. Build a prompt that includes current stress level, triggers, and the user's upcoming calendar events. Ask the AI to recommend specific schedule changes.
- Use temperature 0.5 for balanced recommendations.

#### `src/modules/health/services/wearable-service.ts`
- `syncData()` generates simulated data -- this is a placeholder. No AI wiring needed here, but add a TODO comment noting this will be replaced with real wearable API integration.

### 3. Wire AI into Household Services

#### `src/modules/household/services/maintenance-service.ts`
- `generateAnnualSchedule()` should use `generateJSON()` to produce an optimized maintenance schedule. Include the user's location (if available), property details, and climate considerations in the prompt.
- Wire AI for smarter `nextDueDate` calculation that considers seasonal factors.

#### `src/modules/household/services/provider-service.ts`
- `getRecommendedProvider()` should use `generateText()` to produce a recommendation rationale. Include the provider's rating, cost history, and category match in the prompt. The AI should explain why this provider is recommended.

#### `src/modules/household/services/shopping-service.ts`
- `getSmartSuggestions()` should use `generateJSON()` to analyze purchase history and recurring patterns, then suggest items to add. Build a prompt with past purchases, recurring frequencies, and current list.

### 4. Wire AI into Crisis Services

#### `src/modules/crisis/services/detection-service.ts`
- `analyzeSignals()` should use `generateJSON()` to enhance crisis detection. Build a prompt that includes all signals with their types, confidence levels, and timestamps. Ask the AI to assess whether a crisis is occurring, classify its type, estimate severity, and explain reasoning.
- Use temperature 0.2 for safety-critical analysis (low creativity, high consistency).
- The existing keyword/pattern matching should remain as a first-pass filter. AI acts as a second-pass confirmation and enrichment layer.

#### `src/modules/crisis/services/escalation-service.ts`
- `executeEscalation()` should use `generateText()` to produce personalized notification messages for each escalation step. Include the crisis type, severity, and context in the prompt.

#### `src/modules/crisis/services/post-incident-service.ts`
- `generateReview()` should use `generateJSON()` to produce the `PostIncidentReview`. Build a prompt that includes the full crisis event timeline, actions taken, escalation steps, and resolution. Ask the AI to identify root cause, what worked, what failed, and lessons learned.
- This is a critical AI integration -- the post-incident review should be comprehensive and actionable.

#### `src/modules/crisis/services/war-room-service.ts`
- `activateWarRoom()` should use `generateText()` to produce drafted communications (`draftedComms` field). Build a prompt that includes the crisis type, severity, and known details. Ask the AI to draft initial stakeholder communications.

### 5. Apply Auth to ALL Life Module API Routes

Wrap every route handler with `withAuth()` or `withEntityAccess()` as appropriate.

Import:
```typescript
import { withAuth, withEntityAccess } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
```

**Transformation pattern:**
```typescript
// Before:
export async function GET(request: NextRequest) {
  // ... handler logic
}

// After:
export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    // ... handler logic, use session.userId
  });
}
```

For routes that operate on entity-scoped data (where an `entityId` is involved), use `withEntityAccess()`:
```typescript
export async function GET(request: NextRequest) {
  const entityId = request.nextUrl.searchParams.get('entityId');
  if (!entityId) return error('VALIDATION_ERROR', 'entityId required', 400);
  return withEntityAccess(request, entityId, async (req, session) => {
    // ... handler logic
  });
}
```

Apply auth to ALL route files in:
- `src/app/api/travel/` (all routes: itineraries, preferences, visa)
- `src/app/api/health/` (all routes: wearables, sleep, energy, stress, medical)
- `src/app/api/household/` (all routes: maintenance, shopping, vehicles)
- `src/app/api/crisis/` (all routes: crisis CRUD, acknowledge, war-room, detect, dead-man-switch)

Where routes accept `userId` as a query parameter, prefer `session.userId` from auth context.

## Acceptance Criteria

- [ ] Travel itinerary optimization uses AI for intelligent suggestions
- [ ] Visa checker falls back to AI for unknown country pairs
- [ ] Disruption response generates AI-powered alternative recommendations
- [ ] Sleep pattern analysis produces AI-generated optimization recommendations
- [ ] Energy forecast uses AI for peak/trough identification and recommendations
- [ ] Stress adjustment uses AI to suggest specific schedule changes
- [ ] Household maintenance schedule uses AI for optimization
- [ ] Provider recommendations include AI-generated rationale
- [ ] Shopping suggestions use AI to analyze purchase patterns
- [ ] Crisis detection uses AI as second-pass confirmation layer
- [ ] Post-incident review generates comprehensive AI-powered analysis
- [ ] War room activation drafts AI-generated stakeholder communications
- [ ] ALL route files in `src/app/api/travel/` are wrapped with auth
- [ ] ALL route files in `src/app/api/health/` are wrapped with auth
- [ ] ALL route files in `src/app/api/household/` are wrapped with auth
- [ ] ALL route files in `src/app/api/crisis/` are wrapped with auth
- [ ] Entity-scoped routes use `withEntityAccess()` where applicable
- [ ] All AI calls use appropriate temperature settings (0.2 for safety, 0.4-0.5 for structured, 0.7 for natural language)
- [ ] All AI calls have error handling with graceful fallbacks
- [ ] No modifications to `jest.config.ts` or `package.json`
- [ ] `npx tsc --noEmit` passes with no errors in owned paths
- [ ] Existing tests still pass: `npx jest tests/unit/life-modules/`

## Implementation Steps

1. **Read context files**: Read `src/lib/ai/client.ts`, `src/shared/middleware/auth.ts`, all service files in the 4 module directories, all route files in the 4 API directories.
2. **Create branch**: `git checkout -b ai-feature/p2-w17-wire-life`
3. **Wire AI into travel services**: Itinerary optimization, visa fallback, disruption recommendations.
4. **Wire AI into health services**: Sleep analysis, energy forecast, stress adjustments.
5. **Wire AI into household services**: Maintenance optimization, provider recommendations, shopping suggestions.
6. **Wire AI into crisis services**: Detection enrichment, escalation messaging, post-incident review, war room comms.
7. **Apply auth to travel routes**: Wrap all handlers with `withAuth()`.
8. **Apply auth to health routes**: Wrap all handlers with `withAuth()`.
9. **Apply auth to household routes**: Wrap all handlers with `withAuth()`.
10. **Apply auth to crisis routes**: Wrap all handlers with `withAuth()`.
11. **Update tests**: Mock `@/lib/ai` in existing tests. Add new tests for AI integration points.
12. **Verify**: Run `npx tsc --noEmit`, `npx jest tests/unit/life-modules/`, `npx next build`.

## Tests Required

Update existing tests in `tests/unit/life-modules/` to mock the AI client:

```typescript
jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('AI-generated response'),
  generateJSON: jest.fn().mockResolvedValue({}),
  chat: jest.fn().mockResolvedValue('AI response'),
}));
```

Add or update these test cases:

### `tests/unit/life-modules/crisis-detection.test.ts`
```typescript
describe('analyzeSignals (AI-enhanced)', () => {
  it('should call generateJSON for second-pass analysis');
  it('should include all signals in the prompt');
  it('should use low temperature (0.2) for safety-critical analysis');
  it('should fall back to keyword-based detection if AI fails');
  it('should merge AI assessment with pattern-based detection');
});
```

### `tests/unit/life-modules/post-incident-review.test.ts` (new)
```typescript
describe('generateReview (AI-powered)', () => {
  it('should call generateJSON with crisis timeline data');
  it('should produce root cause analysis');
  it('should identify what worked and what failed');
  it('should generate actionable lessons learned');
  it('should handle AI failure gracefully');
});
```

### `tests/unit/life-modules/sleep-analysis.test.ts` (new)
```typescript
describe('analyzeSleepPatterns (AI-powered)', () => {
  it('should call generateJSON with sleep history data');
  it('should produce optimization recommendations');
  it('should use temperature 0.4 for structured output');
  it('should handle AI failure with fallback recommendations');
});
```

### `tests/unit/life-modules/stress-adjustments.test.ts` (new)
```typescript
describe('suggestScheduleAdjustments (AI-powered)', () => {
  it('should call generateJSON when stress > 70');
  it('should include upcoming calendar events in prompt');
  it('should return StressAdjustment array from AI');
  it('should not call AI when stress <= 70');
  it('should handle AI failure gracefully');
});
```

Mock `@/lib/ai` and `@/lib/db` in all tests. No live API connections required.

## Commit Strategy

Use Conventional Commits. Commit after each logical unit is complete and compiling.

```
feat(travel): wire AI into itinerary optimization and visa requirement lookups
feat(travel): wire AI into disruption response recommendations
feat(health): wire AI into sleep analysis and energy forecasting
feat(health): wire AI into stress pattern detection and schedule adjustments
feat(household): wire AI into maintenance optimization and provider recommendations
feat(crisis): wire AI into crisis detection as second-pass analysis layer
feat(crisis): wire AI into post-incident review generation and war room communications
feat(travel): apply withAuth to all travel API routes
feat(health): apply withAuth to all health API routes
feat(household): apply withAuth to all household API routes
feat(crisis): apply withAuth to all crisis API routes
test(life-modules): update tests with AI client mocks and new integration tests
chore(life-modules): verify build and final cleanup
```

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
