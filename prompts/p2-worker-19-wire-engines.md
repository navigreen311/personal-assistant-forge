# Worker 19: Wire AI & Auth into All 6 Engines

## Branch

`ai-feature/p2-w19-wire-engines`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to modifying files within these paths. Do NOT touch any files outside these directories:

```
src/engines/policy/                    # Policy/Rule engine
src/engines/trust-ui/                  # Trust UI and consent system
src/engines/memory/                    # Contextual memory architecture
src/engines/trust-safety/              # Trust & Safety engine
src/engines/cost/                      # Cost/Billing engine
src/engines/adoption/                  # Adoption engine
src/app/api/rules/                     # API routes for rules
src/app/api/memory/                    # API routes for memory
src/app/api/safety/                    # API routes for safety (create if needed)
src/app/api/billing/                   # API routes for billing (create if needed)
tests/unit/engines/                    # Unit tests (modify existing or add new)
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
| `src/lib/ai/client.ts` | Full AI client -- `generateText(prompt, options)`, `generateJSON<T>(prompt, options)`, `chat(messages, options)` |
| `src/shared/middleware/auth.ts` | Auth middleware: `withAuth(req, handler)`, `withRole(req, roles, handler)`, `withEntityAccess(req, entityId, handler)` |
| `src/engines/policy/types.ts` | Policy types (RuleCondition, RuleAction, EvaluatedRule, ConflictReport, RuleSuggestion, AuditTrail) |
| `src/engines/trust-ui/types.ts` | Trust UI types (ExplainResponse, TrustScoreBreakdown, SensitiveDataPreview) |
| `src/engines/memory/types.ts` | Memory types (MemorySearchQuery, MemorySearchResult, DecayConfig) |
| `src/engines/trust-safety/types.ts` | Trust & Safety types |
| `src/engines/cost/types.ts` | Cost engine types (ModelTier, ModelRoutingDecision) |
| `src/engines/adoption/types.ts` | Adoption engine types |
| `tsconfig.json` | Path aliases: `@/` maps to `src/` |

## Requirements

### 1. Wire AI into Policy Engine

Import where needed:
```typescript
import { generateText, generateJSON } from '@/lib/ai';
```

#### `src/engines/policy/rule-suggestion.ts`
- `detectCorrectionPattern()` should use `generateJSON()` to analyze correction patterns and produce rule suggestions. Build a prompt that includes the user's recent override/correction history (from ActionLog). Ask the AI to identify recurring patterns and suggest rules with conditions, actions, and evidence.
- The existing 3+ correction threshold should remain as a gate. AI enhances the suggestion quality, not the detection threshold.
- Use temperature 0.3 for consistent rule suggestions.

#### `src/engines/policy/rule-engine.ts`
- `resolveConflicts()` -- If any conflicts result in `MANUAL_REQUIRED` resolution, use `generateText()` to produce a human-readable explanation of why the conflict cannot be auto-resolved and what the user should consider.
- `buildAuditTrail()` should use `generateText()` to produce the `explanation` field. Build a prompt that includes the evaluated rules, the winning action, and the data sources. Ask the AI to produce a clear, non-technical explanation of why the action was taken. This is the "Why did you do that?" answer.
- Use temperature 0.5 for explanations.

### 2. Wire AI into Trust UI Engine

#### `src/engines/trust-ui/explain-service.ts`
- `explainAction()` should use `generateText()` to produce the `actionDescription` field and enhance the `alternatives` array. Build a prompt with the action log entry, rules applied, and data sources. Ask the AI for a human-readable explanation and alternative actions that could have been taken.
- `explainWithContext()` should use `chat()` for natural language Q&A. Build a conversation where the system message includes the structured explanation data, and the user message is the `userQuestion`. The AI should answer questions about the action in conversational form.
- Use temperature 0.6 for natural explanations.

#### `src/engines/trust-ui/trust-score-service.ts`
- `calculateTrustScore()` -- If there is a text-based summary or recommendation associated with the trust score, wire to `generateText()`. Include the score dimensions and trend in the prompt.

### 3. Wire AI into Memory Engine

#### `src/engines/memory/memory-service.ts`
- `searchMemories()` should use `generateJSON()` to enhance relevance scoring. After the initial keyword-based search, pass the top results and the query to the AI for re-ranking by semantic relevance. Ask the AI to return the results in order of true relevance to the query.
- Use temperature 0.2 for consistent ranking.

#### `src/engines/memory/episodic-memory.ts`
- `recallEpisode()` should use `generateText()` to enhance fuzzy matching. When the keyword search returns results, pass them along with the natural language query to the AI for semantic matching and summarization. The AI should explain why each result matches the query.
- `storeEpisode()` -- If the episode content needs enrichment (extracting who/what/when/where/why), use `generateJSON()` to parse the raw content into structured episodic context.

#### `src/engines/memory/decay-service.ts`
- Decay is purely mathematical -- no AI wiring needed. Leave as-is.

### 4. Wire AI into Trust & Safety Engine

Read all service files in `src/engines/trust-safety/`:

#### `src/engines/trust-safety/injection-firewall.ts`
- Wire `generateJSON()` for AI-powered prompt injection detection. Build a prompt that includes the suspect input text and ask the AI to classify it as safe, suspicious, or malicious with confidence and reasoning. This acts as a secondary detection layer on top of pattern-based checks.
- Use temperature 0.1 for maximum consistency in safety classification.
- **IMPORTANT**: The AI call itself must be protected against injection. Use a system prompt that clearly separates the analysis task from the input being analyzed. Wrap the user input in delimiters: `<user_input>...</user_input>`.

#### `src/engines/trust-safety/fraud-detector.ts`
- Wire `generateJSON()` for fraud pattern analysis. Build a prompt with recent action patterns (timestamps, types, volumes) and ask the AI to assess whether the pattern indicates fraudulent activity. Include reasoning and confidence in the response.
- Use temperature 0.1 for safety analysis.

#### `src/engines/trust-safety/impersonation-guard.ts`
- Wire `generateJSON()` for impersonation detection. Build a prompt with the communication style characteristics (vocabulary, sentence structure, tone) of a baseline user profile vs. the suspect message. Ask the AI to assess likelihood of impersonation.
- Use temperature 0.2 for consistent detection.

### 5. Wire AI into Cost Engine

#### `src/engines/cost/model-router.ts`
- The model router already has complexity classification logic. Enhance it by using `generateJSON()` as an optional fallback when the rule-based classifier is uncertain. If `classifyComplexity()` returns `MODERATE`, optionally call the AI to refine the classification.
- This must be fast -- set `maxTokens: 50` and use the FAST model tier. If AI is slower than 200ms, fall back to the rule-based result.
- Use temperature 0.1 for deterministic routing.

#### `src/engines/cost/budget-service.ts`
- If there are budget alert messages or optimization recommendations, wire to `generateText()`. Include spending data, feature breakdown, and budget caps in the prompt.

### 6. Wire AI into Adoption Engine

Read all service files in `src/engines/adoption/`:

#### `src/engines/adoption/coaching-service.ts`
- Wire `generateText()` for personalized coaching recommendations. Build a prompt with the user's usage patterns, feature adoption levels, and engagement metrics. Ask the AI to produce specific, actionable coaching tips.
- Use temperature 0.7 for conversational coaching.

#### `src/engines/adoption/playbook-service.ts`
- Wire `generateJSON()` for personalized playbook generation. Build a prompt with the user's role, industry, usage patterns, and goals. Ask the AI to produce a structured adoption playbook with steps, estimated times, and expected outcomes.

#### `src/engines/adoption/aha-moment-service.ts`
- Wire `generateJSON()` for aha-moment detection. Build a prompt with the user's recent activity timeline and engagement metrics. Ask the AI to identify potential aha-moments (feature discoveries, efficiency gains) and produce celebratory messaging.
- Use temperature 0.6 for engaging messaging.

#### `src/engines/adoption/reengagement-service.ts`
- Wire `generateText()` for re-engagement messaging. If the user has been inactive, produce personalized re-engagement messages referencing their past usage and what they're missing.

### 7. Apply Auth to ALL Engine API Routes

Import:
```typescript
import { withAuth, withRole } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
```

**Rules routes** (`src/app/api/rules/`): Wrap ALL handlers with `withAuth()`:
- `src/app/api/rules/route.ts` (GET, POST)
- `src/app/api/rules/[id]/route.ts` (GET, PUT, DELETE)
- `src/app/api/rules/evaluate/route.ts` (POST)
- `src/app/api/rules/conflicts/route.ts` (POST)
- `src/app/api/rules/suggestions/route.ts` (GET)
- `src/app/api/rules/[id]/audit/route.ts` (GET)

**Memory routes** (`src/app/api/memory/`): Wrap ALL handlers with `withAuth()`:
- `src/app/api/memory/route.ts` (GET, POST)
- `src/app/api/memory/[id]/route.ts` (GET, PUT, DELETE)
- `src/app/api/memory/search/route.ts` (POST)
- `src/app/api/memory/decay/route.ts` (POST)
- `src/app/api/memory/stats/route.ts` (GET)

**Safety routes** (`src/app/api/safety/`): If these routes exist, wrap with `withRole(['ADMIN'])`. If they do not exist, create minimal route stubs with auth:
- `src/app/api/safety/injection-check/route.ts` -- POST, accepts `{ input: string }`, returns safety classification. Protected with `withRole(['ADMIN'])`.
- `src/app/api/safety/fraud-check/route.ts` -- POST, accepts action pattern data. Protected with `withRole(['ADMIN'])`.

**Billing routes** (`src/app/api/billing/`): If these routes exist, wrap with `withAuth()`. If they do not exist, create minimal stubs:
- `src/app/api/billing/usage/route.ts` -- GET, returns usage metrics. Protected with `withAuth()`.

Where routes accept `userId` as a query parameter, prefer `session.userId` from auth context.

## Acceptance Criteria

- [ ] Rule suggestion service uses AI to enhance correction pattern analysis
- [ ] Rule engine uses AI for human-readable audit trail explanations
- [ ] Conflict resolution uses AI to explain MANUAL_REQUIRED conflicts
- [ ] Explain service uses AI for action descriptions and `chat()` for conversational Q&A
- [ ] Memory search uses AI for semantic relevance re-ranking
- [ ] Episodic memory recall uses AI for semantic matching
- [ ] Prompt injection firewall uses AI as a secondary detection layer with input isolation
- [ ] Fraud detector uses AI for pattern analysis
- [ ] Impersonation guard uses AI for style comparison
- [ ] Cost engine model router uses AI as optional refinement for MODERATE complexity
- [ ] Adoption coaching uses AI for personalized recommendations
- [ ] Adoption playbooks use AI for personalized generation
- [ ] Aha-moment detection uses AI for identifying and messaging moments
- [ ] ALL rules routes are wrapped with `withAuth()`
- [ ] ALL memory routes are wrapped with `withAuth()`
- [ ] Safety routes use `withRole(['ADMIN'])` -- returns 403 for non-admin users
- [ ] All AI calls have error handling with graceful fallbacks
- [ ] Trust & Safety AI calls use temperature 0.1-0.2 for maximum consistency
- [ ] Cost engine AI calls use `maxTokens: 50` for speed
- [ ] Prompt injection detection isolates user input with delimiters
- [ ] No modifications to `jest.config.ts` or `package.json`
- [ ] `npx tsc --noEmit` passes with no errors in owned paths
- [ ] Existing tests still pass: `npx jest tests/unit/engines/`

## Implementation Steps

1. **Read context files**: Read `src/lib/ai/client.ts`, `src/shared/middleware/auth.ts`, all service files in the 6 engine directories, all route files in `src/app/api/rules/` and `src/app/api/memory/`. Check if `src/app/api/safety/` and `src/app/api/billing/` exist.
2. **Create branch**: `git checkout -b ai-feature/p2-w19-wire-engines`
3. **Wire AI into policy engine**: Rule suggestions, conflict explanations, audit trail.
4. **Wire AI into trust-ui engine**: Explain service, trust score summaries.
5. **Wire AI into memory engine**: Semantic re-ranking, episodic matching.
6. **Wire AI into trust-safety engine**: Injection detection, fraud analysis, impersonation detection.
7. **Wire AI into cost engine**: Model routing refinement, budget recommendations.
8. **Wire AI into adoption engine**: Coaching, playbooks, aha-moments, re-engagement.
9. **Apply auth to rules routes**: `withAuth()` for all handlers.
10. **Apply auth to memory routes**: `withAuth()` for all handlers.
11. **Create/protect safety routes**: `withRole(['ADMIN'])` for safety routes.
12. **Create/protect billing routes**: `withAuth()` for billing routes.
13. **Update tests**: Mock `@/lib/ai` in existing tests. Add tests for AI integration points.
14. **Verify**: Run `npx tsc --noEmit`, `npx jest tests/unit/engines/`, `npx next build`.

## Tests Required

Update existing tests in `tests/unit/engines/` to mock the AI client:

```typescript
jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('AI-generated explanation'),
  generateJSON: jest.fn().mockResolvedValue({}),
  chat: jest.fn().mockResolvedValue('AI conversational response'),
}));
```

Add or update these test cases:

### `tests/unit/engines/rule-engine.test.ts`
```typescript
describe('buildAuditTrail (AI-powered)', () => {
  it('should call generateText to produce human-readable explanation');
  it('should include evaluated rules and winning action in prompt');
  it('should handle AI failure with fallback static explanation');
});

describe('resolveConflicts (AI-enhanced)', () => {
  it('should call generateText for MANUAL_REQUIRED conflict explanations');
  it('should not call AI for auto-resolved conflicts');
});
```

### `tests/unit/engines/rule-suggestion.test.ts`
```typescript
describe('detectCorrectionPattern (AI-enhanced)', () => {
  it('should call generateJSON to enhance suggestion quality');
  it('should still require 3+ corrections threshold');
  it('should produce AI-enriched evidence strings');
  it('should handle AI failure with basic pattern description');
});
```

### `tests/unit/engines/injection-firewall.test.ts` (new)
```typescript
describe('AI-powered injection detection', () => {
  it('should call generateJSON with isolated user input');
  it('should wrap input in <user_input> delimiters');
  it('should classify safe input as safe');
  it('should classify injection attempts as malicious');
  it('should use temperature 0.1 for consistency');
  it('should fall back to pattern-based detection if AI fails');
});
```

### `tests/unit/engines/memory-search.test.ts` (new)
```typescript
describe('searchMemories (AI-enhanced)', () => {
  it('should call generateJSON for semantic re-ranking');
  it('should pass top keyword results to AI');
  it('should return AI-reranked results');
  it('should fall back to keyword ranking if AI fails');
});
```

### `tests/unit/engines/adoption-coaching.test.ts` (new)
```typescript
describe('coaching recommendations (AI-powered)', () => {
  it('should call generateText with usage patterns');
  it('should produce personalized coaching tips');
  it('should handle AI failure with generic tips');
});
```

Mock `@/lib/ai`, `@/lib/db`, and `@/shared/middleware/auth` in all tests.

## Commit Strategy

Use Conventional Commits. Commit after each logical unit is complete and compiling.

```
feat(engines): wire AI into rule suggestion and audit trail explanation
feat(engines): wire AI into conflict resolution explanations
feat(engines): wire AI into trust-ui explain service with chat support
feat(engines): wire AI into memory semantic re-ranking and episodic matching
feat(engines): wire AI into prompt injection detection with input isolation
feat(engines): wire AI into fraud detection and impersonation guard
feat(engines): wire AI into cost engine model routing refinement
feat(engines): wire AI into adoption coaching, playbooks, and aha-moments
feat(engines): apply withAuth to all rules and memory API routes
feat(engines): create and protect safety routes with withRole(['ADMIN'])
feat(engines): create and protect billing routes with withAuth
test(engines): update tests with AI mocks and new AI integration tests
test(engines): add injection firewall and memory search AI tests
chore(engines): verify build and final cleanup
```

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
