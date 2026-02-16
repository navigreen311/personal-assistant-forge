# Worker 13: Wire AI & Auth into Calendar + Decisions + Knowledge

## Branch

`ai-feature/p2-w13-wire-cal-decisions`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to modifying files within these paths. Do NOT touch any files outside these directories:

- `src/modules/calendar/` (modify existing -- nlp.service.ts, scheduling.service.ts)
- `src/modules/decisions/services/` (modify existing -- decision-framework.ts, research-agent.ts, pre-mortem.ts)
- `src/modules/knowledge/services/` (modify existing -- search-service.ts, surfacing-service.ts, ingestion-service.ts)
- `src/app/api/calendar/` (modify existing -- all route.ts files to add withAuth)
- `src/app/api/decisions/` (modify existing -- all route.ts files to add withAuth)
- `src/app/api/knowledge/` (modify existing -- all route.ts files to add withAuth)
- `tests/unit/calendar/` (update existing tests if mocks change)
- `tests/unit/decisions/` (update existing tests if mocks change)
- `tests/unit/knowledge/` (update existing tests if mocks change)

### Do NOT modify

- `jest.config.ts`
- `package.json`
- Any files outside the owned paths above

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

1. **`src/lib/ai/index.ts`** -- Exports `generateText(prompt, options?)`, `generateJSON<T>(prompt, options?)`, `chat(messages, options?)`, `streamText(prompt, options?)`. Options include `model`, `maxTokens`, `temperature`, `system`.
2. **`src/lib/ai/client.ts`** -- Full implementation using `@anthropic-ai/sdk`. Default model is `claude-sonnet-4-5-20250929`. `generateJSON` appends a system instruction to respond with JSON only.
3. **`src/shared/middleware/auth.ts`** -- Three auth wrappers:
   - `withAuth(req, handler)` -- Validates JWT, passes `AuthSession` (userId, email, name, role, activeEntityId) to handler. Returns 401 if no token.
   - `withRole(req, roles, handler)` -- Wraps `withAuth`, checks role. Returns 403 if insufficient.
   - `withEntityAccess(req, entityId, handler)` -- Wraps `withAuth`, verifies entity belongs to user. Returns 403/404 on mismatch.
4. **`src/modules/calendar/nlp.service.ts`** -- Current `NLPSchedulingService` class with `parseScheduleRequest()`. Uses regex-based parsing for dates, times, durations, participants, locations. Has `inferEventType`, `inferDuration`, `inferPriority`, `extractParticipants`, `extractTimeHints`, `extractLocation`, `buildTitle` methods.
5. **`src/modules/calendar/scheduling.service.ts`** -- Scheduling service. Read to determine if any AI suggestion methods exist.
6. **`src/modules/calendar/calendar.types.ts`** -- Types: `NaturalLanguageScheduleInput`, `ParsedScheduleIntent`, `TimeHint`, `TimeRange`, `EventType`.
7. **`src/modules/decisions/services/decision-framework.ts`** -- `createDecisionBrief()` generates 3-option briefs using rule-based `generateThreeOptions`, `deriveRecommendation`, `computeConfidence`, `identifyBlindSpots`. Stores in `prisma.document`.
8. **`src/modules/decisions/services/research-agent.ts`** -- `conductResearch()` returns placeholder/mock research with `generatePlaceholderSources` and `generatePlaceholderFindings`. Comment says "In production, this would integrate with web search APIs."
9. **`src/modules/decisions/services/pre-mortem.ts`** -- `runPreMortem()` generates failure scenarios using rule-based `generateFailureScenarios` and `generateMitigations`. Comment says "ASSUMPTION: This is a placeholder."
10. **`src/modules/decisions/types/`** -- Decision types: `DecisionRequest`, `DecisionBrief`, `DecisionOption`, `ResearchRequest`, `ResearchReport`, `PreMortemRequest`, `PreMortemResult`, `FailureScenario`.
11. **`src/modules/knowledge/services/search-service.ts`** -- Knowledge search service. Read to determine current search implementation.
12. **`src/modules/knowledge/services/surfacing-service.ts`** -- Knowledge surfacing service. Read to determine if AI summarization is needed.
13. **`src/modules/knowledge/services/ingestion-service.ts`** -- Knowledge ingestion. Read to determine if AI is used for auto-tagging/categorization.
14. **`src/shared/types/index.ts`** -- Shared types.
15. **`prisma/schema.prisma`** -- Database models: Event, Document, KnowledgeNode, etc.

## Requirements

### 1. Calendar NLP Service -- Wire AI (`src/modules/calendar/nlp.service.ts`)

**Read the file first** to understand the current regex-based NLP implementation.

#### Specific modifications:

a. **Add import at top of file**:
```typescript
import { generateJSON } from '@/lib/ai';
```

b. **Add AI-powered parsing method**:
```typescript
private async parseWithAI(
  text: string,
  referenceDate: Date = new Date()
): Promise<ParsedScheduleIntent> {
  const result = await generateJSON<{
    title: string;
    eventType: string;
    startDate: string;      // ISO date string
    startTime: string;      // HH:MM 24h format
    duration: number;        // minutes
    participants: string[];
    location?: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    recurrence?: string;    // 'DAILY' | 'WEEKLY' | 'MONTHLY' | null
    notes?: string;
    confidence: number;
  }>(`Parse this natural language scheduling request into structured event data.

Input text: "${text}"
Reference date (today): ${referenceDate.toISOString().split('T')[0]}
Day of week: ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][referenceDate.getDay()]}

Return JSON with:
- title: descriptive event title
- eventType: one of MEETING, CALL, FOCUS_BLOCK, BREAK, DEADLINE, REMINDER, SOCIAL, TRAVEL, RECURRING
- startDate: ISO date string (YYYY-MM-DD)
- startTime: 24h time string (HH:MM)
- duration: duration in minutes
- participants: array of participant names extracted from text
- location: location if mentioned, null otherwise
- priority: LOW, MEDIUM, or HIGH
- recurrence: DAILY, WEEKLY, MONTHLY, or null
- notes: any additional context
- confidence: 0.0-1.0 how confident you are in the parsing`, {
    maxTokens: 512,
    temperature: 0.2,
    system: 'You are a calendar scheduling assistant. Parse natural language into precise event data. Always resolve relative dates against the reference date provided. Default meeting duration is 30 minutes, call duration is 15 minutes.',
  });

  // Convert AI result to ParsedScheduleIntent format
  // Map the AI output fields to the existing type structure
  // ...
}
```

c. **Modify `parseScheduleRequest`** to use AI with fallback:
- Try AI parsing first via `parseWithAI`
- If AI call fails, fall back to existing regex-based parsing
- If AI confidence is below 0.5, fall back to regex parsing
- Log which method was used

d. **Keep all existing regex methods** (`inferEventType`, `inferDuration`, `extractParticipants`, etc.) intact as the fallback path.

### 2. Calendar Scheduling Service -- Wire AI (`src/modules/calendar/scheduling.service.ts`)

**Read the file first** to see if there are AI suggestion methods.

If the service has methods for suggesting meeting times, optimal scheduling, or conflict resolution:
- Wire `generateJSON` to suggest optimal time slots based on calendar context
- Use AI for smart conflict resolution suggestions

If the service is purely CRUD/logic-based:
- Add auth-related changes only (if needed for service-level auth checks)
- Document that no AI changes were needed

### 3. Decision Framework -- Wire AI (`src/modules/decisions/services/decision-framework.ts`)

**Read the file first** to understand the rule-based 3-option generation.

#### Specific modifications:

a. **Add import**:
```typescript
import { generateJSON } from '@/lib/ai';
```

b. **Replace `generateThreeOptions`** with an AI-powered version:
```typescript
async function generateThreeOptionsWithAI(
  request: DecisionRequest
): Promise<DecisionOption[]> {
  const result = await generateJSON<{
    options: Array<{
      label: string;
      stance: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
      description: string;
      pros: string[];
      cons: string[];
      estimatedCost?: string;
      estimatedTimeline?: string;
      riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
      secondOrderEffects: Array<{
        description: string;
        probability: 'LOW' | 'MEDIUM' | 'HIGH';
        impact: 'LOW' | 'MEDIUM' | 'HIGH';
        timeframe: string;
      }>;
    }>;
  }>(`Generate exactly 3 decision options for this business decision.

Decision: ${request.title}
Description: ${request.description}
Context: ${request.context ?? 'No additional context'}
Constraints: ${request.constraints?.join(', ') ?? 'None specified'}
Stakeholders: ${request.stakeholders?.join(', ') ?? 'Not specified'}
Deadline: ${request.deadline ?? 'No deadline'}
Blast radius: ${request.blastRadius ?? 'Unknown'}

Generate exactly 3 options:
1. CONSERVATIVE - low risk, incremental approach
2. MODERATE - balanced risk/reward
3. AGGRESSIVE - high risk, high reward, bold action

For each option provide: label, stance, description, pros (3-5), cons (2-4), estimatedCost, estimatedTimeline, riskLevel, and 2-3 secondOrderEffects.`, {
    maxTokens: 2048,
    temperature: 0.6,
    system: 'You are a strategic business advisor. Generate thoughtful, actionable decision options. Be specific and realistic. Consider second-order effects carefully.',
  });

  return result.options.map((o) => ({
    // Map to DecisionOption type
    ...o,
  }));
}
```

c. **Modify `createDecisionBrief`** to use AI with fallback:
- Try `generateThreeOptionsWithAI` first
- Fall back to existing `generateThreeOptions` on failure
- Keep `deriveRecommendation` and store logic as-is

d. **Replace `identifyBlindSpots`** with AI:
- Call `generateJSON` to identify blind spots specific to the decision context
- Fall back to generic blind spots on failure

### 4. Research Agent -- Wire AI (`src/modules/decisions/services/research-agent.ts`)

**Read the file first** -- it currently returns placeholder sources and findings.

#### Specific modifications:

a. **Add import**:
```typescript
import { generateJSON, generateText } from '@/lib/ai';
```

b. **Replace `conductResearch`** with AI-powered version:
- Call `generateJSON` to produce structured research findings based on the query
- Generate a proper research summary via `generateText`
- Keep `evaluateSourceCredibility` as-is (it is rule-based scoring, not placeholder)
- Wrap in try/catch; fall back to placeholder on failure

c. **Replace `generatePlaceholderSources` and `generatePlaceholderFindings`** calls:
- Instead of calling these functions, call AI to generate contextually relevant sources and findings
- The AI prompt should include the research query, depth, and domain

### 5. Pre-Mortem Analysis -- Wire AI (`src/modules/decisions/services/pre-mortem.ts`)

**Read the file first** -- it currently generates generic failure scenarios.

#### Specific modifications:

a. **Add import**:
```typescript
import { generateJSON } from '@/lib/ai';
```

b. **Replace `generateFailureScenarios`** with AI-powered version:
- Call `generateJSON` with the decision context, chosen option, and time horizon
- Ask AI to generate realistic failure scenarios with probability and impact ratings
- Keep `calculateRiskScore` as-is (it is math-based)

c. **Replace `generateMitigations`** with AI-powered version:
- Given the failure scenarios, call `generateJSON` to generate specific mitigation steps
- Include the decision context so mitigations are contextually relevant

d. **Keep `generateKillSignals`** -- update to use AI if it currently returns generic signals, or keep as-is if already contextual.

e. **Wrap all AI calls in try/catch** with fallback to existing rule-based generation.

### 6. Knowledge Services -- Wire AI

**Read each file first** to determine what needs AI.

#### `search-service.ts`:
- If search is keyword-based, add AI-powered semantic search enhancement
- Use `generateJSON` to expand search queries with synonyms and related terms
- Use `generateText` to generate search summaries for result sets
- Wrap in try/catch; fall back to keyword search on failure

#### `surfacing-service.ts`:
- If there is content summarization, wire `generateText` for AI summaries
- If there is recommendation logic, wire `generateJSON` for AI-powered suggestions

#### `ingestion-service.ts`:
- If there is auto-tagging or categorization, wire `generateJSON` for AI classification
- If there is content extraction, wire `generateText` for AI extraction

### 7. Apply Auth to All API Routes

Wrap every route handler in the owned API paths with `withAuth()` or `withEntityAccess()`.

#### Pattern:

**Before**:
```typescript
export async function GET(request: NextRequest) {
  try { /* ... getCurrentUserId() or no auth ... */ }
  catch (err) { /* ... */ }
}
```

**After**:
```typescript
import { withAuth, withEntityAccess } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      // Replace getCurrentUserId() with session.userId
      // Replace any hardcoded entityId with session.activeEntityId or route param
    } catch (err) { /* ... */ }
  });
}
```

#### Routes to wrap:

**`src/app/api/calendar/`** -- All route files. Use `withAuth` for all handlers. For entity-scoped calendar operations, use `withEntityAccess` with the entityId from query params or route params.

**`src/app/api/decisions/`** -- All route files. Use `withAuth` for all handlers.

**`src/app/api/knowledge/`** -- All route files. Use `withAuth` for all handlers.

Enumerate all route files in these directories by reading their contents first, then apply the auth wrapping pattern.

## Acceptance Criteria

1. `nlp.service.ts` calls `generateJSON` from `@/lib/ai` for natural language schedule parsing.
2. `nlp.service.ts` falls back to regex-based parsing if AI call fails or confidence is low.
3. `decision-framework.ts` calls `generateJSON` to produce AI-generated 3-option briefs.
4. `decision-framework.ts` falls back to rule-based generation if AI fails.
5. `research-agent.ts` calls `generateJSON`/`generateText` to produce real research instead of placeholders.
6. `pre-mortem.ts` calls `generateJSON` for AI-generated failure scenarios and mitigations.
7. Knowledge services are AI-enhanced where applicable (search expansion, summarization, auto-tagging).
8. All route handlers in `src/app/api/calendar/`, `src/app/api/decisions/`, `src/app/api/knowledge/` are wrapped with `withAuth()` or `withEntityAccess()`.
9. No uses of `getCurrentUserId()` stubs remain in wrapped routes.
10. `jest.config.ts` and `package.json` are NOT modified.
11. All existing tests still pass (update mocks if needed).

## Implementation Steps

1. **Read all context files** listed above. Pay special attention to the current implementation patterns and any TODO/placeholder comments in each service file.
2. **Create branch**: `git checkout -b ai-feature/p2-w13-wire-cal-decisions`
3. **Modify `nlp.service.ts`**: Add AI import, create `parseWithAI`, update `parseScheduleRequest` to use AI with fallback.
4. **Read and optionally modify `scheduling.service.ts`**: Wire AI if suggestion methods exist.
5. **Modify `decision-framework.ts`**: Add AI import, create `generateThreeOptionsWithAI`, update `createDecisionBrief`, AI-power `identifyBlindSpots`.
6. **Modify `research-agent.ts`**: Add AI imports, replace `conductResearch` with AI-powered version.
7. **Modify `pre-mortem.ts`**: Add AI import, replace `generateFailureScenarios` and `generateMitigations` with AI versions.
8. **Read and modify knowledge services**: Wire AI into search, surfacing, and ingestion as needed.
9. **Wrap calendar API routes**: Add `withAuth`/`withEntityAccess` to all handlers.
10. **Wrap decisions API routes**: Add `withAuth` to all handlers.
11. **Wrap knowledge API routes**: Add `withAuth` to all handlers.
12. **Update tests**: Update mocks in `tests/unit/calendar/`, `tests/unit/decisions/`, `tests/unit/knowledge/`.
13. **Type-check**: `npx tsc --noEmit`
14. **Run tests**: `npx jest tests/unit/calendar/ tests/unit/decisions/ tests/unit/knowledge/`
15. **Commit** with conventional commits.

## Tests Required

Update existing test files to mock the AI client:

### In `tests/unit/calendar/` (update existing)
```typescript
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

describe('NLPSchedulingService with AI', () => {
  it('should call generateJSON for natural language parsing');
  it('should extract date, time, duration, and participants from AI response');
  it('should fall back to regex parsing when AI fails');
  it('should fall back to regex parsing when AI confidence is below 0.5');
  it('should handle ambiguous time references via AI');
  it('should parse complex multi-person scheduling requests');
});
```

### In `tests/unit/decisions/` (update existing)
```typescript
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
  generateText: jest.fn(),
}));

describe('createDecisionBrief with AI', () => {
  it('should call generateJSON to produce 3 options');
  it('should include decision context in AI prompt');
  it('should fall back to rule-based generation on AI failure');
  it('should store AI-generated brief in database');
});

describe('conductResearch with AI', () => {
  it('should call generateJSON for research findings');
  it('should call generateText for research summary');
  it('should include query and depth in prompts');
  it('should fall back to placeholder on AI failure');
});

describe('runPreMortem with AI', () => {
  it('should call generateJSON for failure scenarios');
  it('should call generateJSON for mitigations');
  it('should preserve risk score calculation');
  it('should fall back to rule-based scenarios on AI failure');
});
```

### In `tests/unit/knowledge/` (update existing)
```typescript
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
  generateText: jest.fn(),
}));

describe('Knowledge search with AI', () => {
  it('should use AI for query expansion when available');
  it('should fall back to keyword search on AI failure');
});

describe('Knowledge surfacing with AI', () => {
  it('should use AI for content summarization');
});
```

## Commit Strategy

Make atomic commits in this order:

1. `feat(calendar): wire AI-powered NLP parsing via generateJSON with regex fallback`
   - Files: `src/modules/calendar/nlp.service.ts`
2. `feat(decisions): wire AI-generated 3-option briefs in decision framework`
   - Files: `src/modules/decisions/services/decision-framework.ts`
3. `feat(decisions): replace placeholder research with AI-generated findings`
   - Files: `src/modules/decisions/services/research-agent.ts`
4. `feat(decisions): wire AI-generated pre-mortem failure scenarios and mitigations`
   - Files: `src/modules/decisions/services/pre-mortem.ts`
5. `feat(knowledge): enhance search, surfacing, and ingestion with AI capabilities`
   - Files: `src/modules/knowledge/services/search-service.ts`, `surfacing-service.ts`, `ingestion-service.ts`
6. `feat(calendar): apply withAuth to all calendar API route handlers`
   - Files: All `route.ts` in `src/app/api/calendar/`
7. `feat(decisions): apply withAuth to all decisions API route handlers`
   - Files: All `route.ts` in `src/app/api/decisions/`
8. `feat(knowledge): apply withAuth to all knowledge API route handlers`
   - Files: All `route.ts` in `src/app/api/knowledge/`
9. `test(calendar): update NLP tests with AI client mocks`
   - Files: `tests/unit/calendar/`
10. `test(decisions): update decision framework, research, and pre-mortem tests with AI mocks`
    - Files: `tests/unit/decisions/`
11. `test(knowledge): update knowledge service tests with AI mocks`
    - Files: `tests/unit/knowledge/`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
