# Worker 19: Knowledge Embeddings + SSE Fix + Adoption Engine

## Branch

`ai-feature/p3-w19-knowledge-adoption`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to modifying or creating files within these paths. Do NOT touch any files outside this list:

- `src/modules/knowledge/services/search-service.ts` (modify)
- `src/app/api/events/stream/route.ts` (modify)
- `src/engines/adoption/activation-service.ts` (modify)
- `src/engines/adoption/aha-moment-service.ts` (modify)
- `src/engines/adoption/coaching-service.ts` (modify)
- `src/engines/adoption/playbook-service.ts` (modify)
- `src/engines/adoption/reengagement-service.ts` (modify)
- `src/engines/adoption/time-saved-service.ts` (modify)
- `tests/unit/knowledge/embedding-search.test.ts` (create)
- `tests/unit/engines/adoption-activation.test.ts` (create)

**DO NOT modify:**
- `jest.config.ts`
- `package.json`
- `tsconfig.json`
- `prisma/schema.prisma`
- `tests/unit/engines/adoption-coaching.test.ts` (already exists, do NOT touch)
- `tests/unit/knowledge/search-service.test.ts` (already exists, do NOT touch)

## Context (read these first, do NOT modify unless listed in Owned Paths)

Before writing any code, read and internalize these files:

1. **`src/modules/knowledge/services/search-service.ts`** -- Current implementation has keyword-based search with AI query expansion (`expandQueryWithAI`). Has a TODO at line 1: "Replace with embedding-based semantic search". Exports: `calculateRelevance`, `highlightExcerpt`, `suggestRelatedQueries`, `search`. Uses `prisma` from `@/lib/db` and `generateJSON` from `@/lib/ai`. The `search` function already uses `expandQueryWithAI` to enhance queries with synonyms.
2. **`src/app/api/events/stream/route.ts`** -- SSE endpoint. Uses `withAuth` from auth middleware, `createSSEStream`/`encodeSSEMessage` from `@/lib/realtime/sse`, and `getRecentEvents` from `@/lib/realtime/events`. Currently MISSING try-catch error handling — if `createSSEStream` or `getRecentEvents` throws, the error is unhandled and may crash the response.
3. **`src/engines/adoption/activation-service.ts`** -- Fully implemented with `initializeChecklist`, `getChecklist`, `completeTask`, `getCurrentPhase`. Uses in-memory Map. Has 5 activation phases with 3 tasks each (15 tasks total). No AI or Prisma calls.
4. **`src/engines/adoption/aha-moment-service.ts`** -- AI-enhanced. Exports: `getAhaMoments`, `checkAhaMomentProgress`, `markAhaMomentCompleted`. Uses `generateJSON` from `@/lib/ai` for personalized guidance messages. Has 5 predefined aha moments with retention correlations. In-memory `completedMoments` Map.
5. **`src/engines/adoption/coaching-service.ts`** -- AI-enhanced. Exports: `generateRecommendations`, `applyRecommendation`, `dismissRecommendation`, `getWeeklyReview`. Uses `generateText` from `@/lib/ai` for personalized tips. In-memory store. Has 4 default recommendation types.
6. **`src/engines/adoption/playbook-service.ts`** -- AI-enhanced. Exports: `getDefaultPlaybooks`, `getPlaybooks`, `getPlaybook`, `generatePersonalizedPlaybook`, `activatePlaybook`. Uses `generateJSON` from `@/lib/ai` for personalized playbook generation. Has 6 default playbooks. In-memory cache.
7. **`src/engines/adoption/reengagement-service.ts`** -- AI-enhanced. Exports: `setUserActivity`, `checkForReengagementTriggers`, `generateReengagementMessage`. Uses `generateText` from `@/lib/ai` for personalized messages. Checks 4 trigger types: USAGE_DROP, FEATURE_ABANDONMENT, STREAK_BREAK, INACTIVE.
8. **`src/engines/adoption/time-saved-service.ts`** -- Fully implemented. Exports: `recordTimeSaved`, `getTimeSavedSummary`, `getRunningTotal`, `calculateStreak`, `_resetTimeSavedStore`, `_getTimeSavedEntries`. No AI calls. In-memory array store.
9. **`src/lib/ai/index.ts`** -- AI client library. Import as `import { generateText, generateJSON } from '@/lib/ai'`.
10. **`src/lib/db/index.ts`** -- Prisma client. Import as `import { prisma } from '@/lib/db'`.
11. **`tests/unit/knowledge/search-service.test.ts`** -- Existing test file for search service. Do NOT modify this.
12. **`tests/unit/engines/adoption-coaching.test.ts`** -- Existing test for coaching service. Do NOT modify.

## Requirements

### 1. Enhance `search-service.ts` with Semantic Search

Read the current implementation carefully. The file already has `expandQueryWithAI` that uses `generateJSON` to expand queries with synonyms. The `search` function already uses it.

Add a new exported function `semanticSearch` that adds an AI-powered re-ranking layer on top of the existing keyword search:

```typescript
export async function semanticSearch(request: SearchRequest): Promise<SearchResponse> {
  // 1. Run the existing keyword search
  // 2. If results found, use generateJSON to re-rank the top results by semantic relevance
  // 3. Return re-ranked results
  // Falls back to keyword search results if AI re-ranking fails
}
```

Implementation details:
- Call the existing `search(request)` to get keyword results first.
- If results are empty or query is empty, return keyword results as-is.
- Take top 20 results and send to AI for re-ranking via `generateJSON`.
- AI prompt should include the query and result titles/excerpts, asking for a reordered array of result IDs by semantic relevance.
- Merge AI ordering back into the results, using AI relevance as the primary sort.
- If AI fails, return original keyword results unchanged.
- Keep the existing `search` function completely unchanged.

### 2. Fix SSE Error Handling in `events/stream/route.ts`

Read the current implementation. Wrap the entire handler body (inside `withAuth` callback) in a try-catch:

```typescript
return withAuth(req, async (_req, session) => {
  try {
    // ... existing code ...
  } catch (err) {
    console.error('[SSE] Stream error:', err);
    return error('SSE_ERROR', 'Failed to establish event stream', 500);
  }
});
```

Details:
- Wrap from the `const params = ...` line through the final `return new Response(stream, ...)` in try-catch.
- In the catch block: log the error with `console.error`, return an error response using the imported `error` function.
- Do NOT change the existing logic inside the try block. Keep all existing code exactly as-is.
- Ensure the `error` import from `@/shared/utils/api-response` is already present (it is).

### 3. Review and Verify Adoption Engine Services

Read each adoption engine service file. Most are already fully implemented with AI enhancements from Phase 2. For each file:

**`activation-service.ts`**: Fully implemented. No changes needed unless you find bugs. Verify the 5-phase, 15-task activation checklist works correctly.

**`aha-moment-service.ts`**: AI-enhanced. Verify it:
- Has 5 predefined aha moments with retention correlations.
- `checkAhaMomentProgress` uses `generateJSON` for personalized guidance.
- Falls back to static messages on AI failure.
- No changes needed unless you find bugs.

**`coaching-service.ts`**: AI-enhanced. Verify it:
- `generateRecommendations` uses `generateText` for personalized tips.
- Falls back to default descriptions on AI failure.
- No changes needed unless you find bugs.

**`playbook-service.ts`**: AI-enhanced. Verify it:
- `generatePersonalizedPlaybook` uses `generateJSON` to create custom playbooks.
- Falls back to default playbook on AI failure.
- No changes needed unless you find bugs.

**`reengagement-service.ts`**: AI-enhanced. Verify it:
- `checkForReengagementTriggers` detects 4 trigger types (USAGE_DROP, FEATURE_ABANDONMENT, STREAK_BREAK, INACTIVE).
- `generateReengagementMessage` uses `generateText` for personalized messages.
- Falls back to static messages on AI failure.
- No changes needed unless you find bugs.

**`time-saved-service.ts`**: Fully implemented. Verify it:
- `recordTimeSaved` creates entries.
- `getTimeSavedSummary` aggregates by category/day, calculates streak and projections.
- `calculateStreak` counts consecutive days.
- No changes needed unless you find bugs.

If any service has actual bugs or missing functionality (not just placeholder data), fix them. If all services are working correctly, make no changes to them.

### 4. Write Tests

**`tests/unit/knowledge/embedding-search.test.ts`**:
Mock `@/lib/db` and `@/lib/ai`. Test the new `semanticSearch` function:
1. `semanticSearch` returns keyword results when query is empty
2. `semanticSearch` calls AI to re-rank results and returns re-ranked order
3. `semanticSearch` falls back to keyword results when AI re-ranking fails
4. `semanticSearch` handles zero results gracefully

**`tests/unit/engines/adoption-activation.test.ts`**:
Test the activation service (no AI/Prisma mocks needed):
1. `initializeChecklist` creates checklist with 5 phases and 15 tasks
2. `getChecklist` returns existing checklist or initializes new one
3. `completeTask` marks task complete and updates phase status
4. `completeTask` updates overall progress percentage
5. `getCurrentPhase` returns the phase matching the current day range

## Acceptance Criteria

- [ ] `search-service.ts` exports a new `semanticSearch` function alongside existing `search`.
- [ ] Existing `search` function is completely unchanged.
- [ ] `semanticSearch` calls keyword search first, then uses AI for re-ranking.
- [ ] `semanticSearch` gracefully falls back to keyword results on AI failure.
- [ ] `events/stream/route.ts` has try-catch wrapping the SSE stream creation.
- [ ] SSE error handling logs the error and returns a proper error response.
- [ ] All adoption engine services are verified as working. Only changed if bugs found.
- [ ] `tests/unit/knowledge/embedding-search.test.ts` has 4+ test cases and passes.
- [ ] `tests/unit/engines/adoption-activation.test.ts` has 5+ test cases and passes.
- [ ] No modifications to `jest.config.ts`, `package.json`, `tsconfig.json`, or `prisma/schema.prisma`.
- [ ] No modifications to any file outside Owned Paths.
- [ ] Existing tests still pass: `npx jest tests/unit/knowledge/search-service.test.ts tests/unit/engines/adoption-coaching.test.ts --passWithNoTests`.
- [ ] Keep all existing function signatures/exports so consumers don't break.

## Implementation Steps

1. Read all Context files listed above.
2. **search-service.ts**:
   a. Read the existing code carefully.
   b. Add `semanticSearch` function after the existing `search` function.
   c. Implement AI re-ranking: take top 20 keyword results, send titles/excerpts to AI, get ordered IDs back, re-sort.
   d. Add error handling with fallback to keyword results.
   e. Export `semanticSearch` alongside existing exports.
3. **events/stream/route.ts**:
   a. Read the current implementation.
   b. Wrap the handler body in try-catch.
   c. Add console.error and error response in catch block.
4. **Adoption engine services**:
   a. Read each file carefully.
   b. Verify all exports work as documented.
   c. Only make changes if you find actual bugs or missing implementations.
5. **Tests**:
   a. Create `tests/unit/knowledge/embedding-search.test.ts` testing `semanticSearch`.
   b. Create `tests/unit/engines/adoption-activation.test.ts` testing activation service.
6. Run tests: `npx jest tests/unit/knowledge/embedding-search.test.ts tests/unit/engines/adoption-activation.test.ts --passWithNoTests`.
7. Run existing tests to verify no regressions: `npx jest tests/unit/knowledge/search-service.test.ts tests/unit/engines/adoption-coaching.test.ts --passWithNoTests`.
8. Fix any failures.

## Tests Required

Create and verify:
```bash
npx jest tests/unit/knowledge/embedding-search.test.ts tests/unit/engines/adoption-activation.test.ts --passWithNoTests
```

Also verify no regressions:
```bash
npx jest tests/unit/knowledge tests/unit/engines --passWithNoTests
```

## Commit Strategy

**Commit 1:** `feat: add semantic search with AI re-ranking to knowledge search service`
- Files: `src/modules/knowledge/services/search-service.ts`

**Commit 2:** `fix: add try-catch error handling to SSE stream endpoint`
- Files: `src/app/api/events/stream/route.ts`

**Commit 3:** `chore: verify and audit adoption engine services`
- Files: Any adoption engine files that needed fixes (may be empty if no bugs found)

**Commit 4:** `test: add embedding-search unit tests`
- Files: `tests/unit/knowledge/embedding-search.test.ts`

**Commit 5:** `test: add adoption-activation unit tests`
- Files: `tests/unit/engines/adoption-activation.test.ts`

**Commit 6:** `chore: verify all existing tests pass with no regressions`
- No file changes; verification-only commit. Skip this commit if no changes were needed.
