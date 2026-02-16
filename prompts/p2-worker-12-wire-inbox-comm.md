# Worker 12: Wire AI & Auth into Inbox + Communication + Entities

## Branch

`ai-feature/p2-w12-wire-inbox-comm`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to modifying files within these paths. Do NOT touch any files outside these directories:

- `src/modules/inbox/` (modify existing -- triage.service.ts, draft.service.ts)
- `src/modules/communication/services/` (modify existing -- drafting-engine.ts, commitment-tracker.ts)
- `src/modules/entities/` (modify existing -- entity.service.ts if auth-related stubs exist)
- `src/app/api/inbox/` (modify existing -- all route.ts files to add withAuth)
- `src/app/api/contacts/` (modify existing -- all route.ts files to add withAuth)
- `src/app/api/entities/` (modify existing -- all route.ts files to add withAuth/withEntityAccess)
- `tests/unit/inbox/` (update existing tests if mocks change)
- `tests/unit/communication/` (update existing tests if mocks change)

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
   - `withRole(req, roles, handler)` -- Wraps `withAuth`, checks `session.role` against allowed roles. Returns 403 if insufficient.
   - `withEntityAccess(req, entityId, handler)` -- Wraps `withAuth`, verifies entity belongs to user. Returns 403/404 on mismatch.
4. **`src/modules/inbox/triage.service.ts`** -- Current implementation uses keyword-based scoring (URGENT_KEYWORDS, REQUEST_KEYWORDS, etc.) and regex-based classification. The `calculateUrgencyScore`, `classifyIntent`, `detectSensitivity`, `categorizeMessage`, `suggestAction`, and `detectFlags` methods are all rule-based.
5. **`src/modules/inbox/draft.service.ts`** -- Current implementation uses template-based responses with tone configuration maps. `generateDraft` builds responses from templates, not AI.
6. **`src/modules/communication/services/drafting-engine.ts`** -- Multi-variant draft generator with compliance scanning. Uses rule-based tone analysis.
7. **`src/modules/communication/services/commitment-tracker.ts`** -- Tracks commitments in contact JSON fields. Currently has no AI extraction -- commitments are manually added.
8. **`src/modules/inbox/inbox.types.ts`** -- All triage, draft, inbox types including `TriageResult`, `DraftRequest`, `DraftResponse`.
9. **`src/shared/types/index.ts`** -- Shared types: `Message`, `Tone`, `Sensitivity`, `Contact`.
10. **`src/app/api/inbox/route.ts`** -- Current route pattern: uses `getCurrentUserId()` stub, no auth middleware. This is the pattern across all API routes that need wrapping.
11. **`prisma/schema.prisma`** -- Database models for Message, Contact, Entity.

## Requirements

### 1. Inbox Triage Service -- Wire AI (`src/modules/inbox/triage.service.ts`)

**Read the file first** to understand the current keyword-based implementation.

**What to change**: Replace the core classification methods with AI-augmented versions while keeping keyword-based scoring as a fast fallback.

#### Specific modifications:

a. **Add import at top of file**:
```typescript
import { generateJSON } from '@/lib/ai';
```

b. **Add AI-powered triage method** -- Create a new method `triageMessageWithAI` that calls `generateJSON` to get a comprehensive triage result:

```typescript
private async triageMessageWithAI(
  message: Message,
  sender?: Contact
): Promise<{
  urgencyScore: number;
  intent: MessageIntent;
  sensitivity: Sensitivity;
  category: MessageCategory;
  suggestedAction: SuggestedAction;
  reasoning: string;
  confidence: number;
  flags: TriageFlag[];
}> {
  const prompt = `Analyze this message and return a JSON triage result.

Message subject: ${message.subject ?? '(none)'}
Message body: ${message.body}
Channel: ${message.channel}
Sender: ${sender?.name ?? 'Unknown'} (${sender?.tags?.includes('VIP') ? 'VIP' : 'standard'})
Thread depth: ${/* count of messages in thread */}

Return JSON with these exact fields:
{
  "urgencyScore": <1-10 integer>,
  "intent": <one of: INQUIRY, REQUEST, UPDATE, URGENT, FYI, COMPLAINT, FOLLOW_UP, INTRODUCTION, SCHEDULING, FINANCIAL, APPROVAL, SOCIAL>,
  "sensitivity": <one of: PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED, REGULATED>,
  "category": <one of: OPERATIONS, SALES, FINANCE, LEGAL, HR, MARKETING, SUPPORT, PERSONAL, COMPLIANCE, EXECUTIVE>,
  "suggestedAction": <one of: RESPOND_IMMEDIATELY, RESPOND_TODAY, RESPOND_THIS_WEEK, DELEGATE, ARCHIVE, FLAG_FOR_REVIEW, SCHEDULE_FOLLOW_UP, NO_ACTION>,
  "reasoning": "<brief explanation of triage decision>",
  "confidence": <0.0-1.0 float>,
  "flags": [{"type": "<flag type>", "description": "<why flagged>", "severity": "<LOW|MEDIUM|HIGH>"}]
}`;

  return generateJSON(prompt, {
    maxTokens: 512,
    temperature: 0.3,
    system: 'You are a message triage analyst. Score urgency accurately. Be concise in reasoning.',
  });
}
```

c. **Modify `triageMessage`** to use AI with fallback:
- Try `triageMessageWithAI` first
- If AI call fails (network error, parse error), fall back to the existing keyword-based scoring
- Log whether AI or fallback was used
- Wrap AI call in try/catch

d. **Modify `batchTriage`** to use AI for each message:
- Process messages sequentially or in small batches (not all at once) to respect rate limits
- Use the AI-augmented `triageMessage` for each message in the batch

e. **Keep all existing keyword-based methods** (`calculateUrgencyScore`, `classifyIntent`, `detectSensitivity`, `categorizeMessage`, `suggestAction`, `detectFlags`) intact as fallback logic. Do not delete them.

### 2. Inbox Draft Service -- Wire AI (`src/modules/inbox/draft.service.ts`)

**Read the file first** to understand the current template-based implementation.

#### Specific modifications:

a. **Add import at top of file**:
```typescript
import { generateText, chat } from '@/lib/ai';
```

b. **Modify `generateDraft`** to use AI:
- Build a prompt that includes:
  - The original message body and subject
  - The sender's name and relationship context
  - The requested tone
  - Any constraints from `DraftRequest`
  - The entity's compliance disclaimers if `includeDisclaimer` is true
- Call `generateText(prompt, { maxTokens: 1024, temperature: 0.7, system: '...' })` to generate the draft body
- For alternative drafts, make additional calls with different tone instructions
- Keep the existing tone config as context for prompts (e.g., include formality level in the system prompt)
- Wrap in try/catch; fall back to template-based generation on failure

c. **Modify `refineDraft`** to use AI:
- Use `chat()` with a conversation:
  - User message: the current draft + feedback
  - System: instructions on how to refine based on tone and feedback
- Return the refined draft

d. **Keep `generateFromTemplate`** working as-is -- it handles canned responses with variable substitution, which does not need AI.

### 3. Communication Drafting Engine -- Wire AI (`src/modules/communication/services/drafting-engine.ts`)

**Read the file first** to understand the current multi-variant draft generation.

#### Specific modifications:

a. **Add import**:
```typescript
import { generateText, generateJSON } from '@/lib/ai';
```

b. **Wire AI into draft variant generation**: When generating draft variants, use `generateText` to produce the message body instead of template assembly. Include tone instructions, recipient analysis, and compliance context in the prompt.

c. **Wire AI into tone analysis**: If there is a method that analyzes or adjusts tone, call `generateJSON` to get a tone analysis result instead of returning a hardcoded tone profile.

d. **Keep compliance scanning rule-based** -- The regex-based compliance patterns (PII, PHI, legal language) should remain as-is because they need deterministic, reliable detection. AI should not replace compliance scanning.

### 4. Communication Commitment Tracker -- Wire AI (`src/modules/communication/services/commitment-tracker.ts`)

**Read the file first** -- it currently manages commitments that are manually added.

#### Specific modifications:

a. **Add import**:
```typescript
import { generateJSON } from '@/lib/ai';
```

b. **Add AI extraction function**:
```typescript
export async function extractCommitmentsFromText(
  text: string,
  contactId: string,
  entityId: string
): Promise<Commitment[]> {
  const result = await generateJSON<{
    commitments: Array<{
      description: string;
      direction: 'TO' | 'FROM';
      dueDate?: string;
      priority: 'LOW' | 'MEDIUM' | 'HIGH';
    }>;
  }>(`Analyze this message text and extract any commitments or promises made.

Text: "${text}"

Return JSON with a "commitments" array. Each commitment should have:
- description: what was promised
- direction: "TO" if the sender promised something to us, "FROM" if we promised something to them
- dueDate: ISO date string if a deadline was mentioned, null otherwise
- priority: LOW, MEDIUM, or HIGH based on importance`, {
    maxTokens: 512,
    temperature: 0.3,
    system: 'You are an expert at identifying commitments and promises in business communications. Be precise and only extract clear commitments, not vague intentions.',
  });

  return result.commitments.map((c) => ({
    id: uuidv4(),
    description: c.description,
    direction: c.direction,
    dueDate: c.dueDate ? new Date(c.dueDate) : undefined,
    priority: c.priority,
    status: 'OPEN' as const,
    createdAt: new Date(),
  }));
}
```

c. **Integrate AI extraction into existing flow**: Add a new exported function `extractAndSaveCommitments(text, contactId, entityId)` that calls `extractCommitmentsFromText` and then calls `addCommitment` for each extracted commitment.

### 5. Apply Auth to All API Routes

For every route handler in the owned API paths, wrap with the appropriate auth middleware.

#### Pattern for `withAuth` wrapping:

**Before** (current pattern):
```typescript
import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';

export async function GET(request: NextRequest) {
  try {
    const userId = getCurrentUserId();
    // ... handler logic
  } catch (err) { /* ... */ }
}
```

**After** (with auth):
```typescript
import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityAccess } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const userId = session.userId;
      // ... handler logic (replace getCurrentUserId() with session.userId)
    } catch (err) { /* ... */ }
  });
}
```

#### Routes to wrap:

**`src/app/api/inbox/`** -- All route files. Use `withAuth` for all handlers. Replace `getCurrentUserId()` calls with `session.userId`.

**`src/app/api/contacts/`** -- All route files. Use `withAuth` for list/create. Use `withEntityAccess` for entity-scoped contact operations.

**`src/app/api/entities/`** -- All route files. Use `withAuth` for list/create. Use `withEntityAccess` for `[entityId]` routes (pass the entityId from the route params).

#### Specific routes to check and wrap:
- `src/app/api/inbox/route.ts` (GET)
- `src/app/api/inbox/[messageId]/route.ts` (GET, PATCH, DELETE)
- `src/app/api/inbox/triage/route.ts` (POST)
- `src/app/api/inbox/triage/batch/route.ts` (POST)
- `src/app/api/inbox/draft/route.ts` (POST)
- `src/app/api/inbox/draft/refine/route.ts` (POST)
- `src/app/api/inbox/send/route.ts` (POST)
- `src/app/api/inbox/follow-up/route.ts` (GET, POST)
- `src/app/api/inbox/follow-up/[followUpId]/route.ts` (PATCH, DELETE)
- `src/app/api/inbox/canned-responses/route.ts` (GET, POST)
- `src/app/api/inbox/canned-responses/[responseId]/route.ts` (GET, PATCH, DELETE)
- `src/app/api/inbox/stats/route.ts` (GET)
- `src/app/api/contacts/route.ts` (GET, POST)
- `src/app/api/contacts/[id]/route.ts` (GET, PATCH, DELETE)
- `src/app/api/entities/route.ts` (GET, POST)
- `src/app/api/entities/[entityId]/route.ts` (GET, PATCH, DELETE)
- `src/app/api/entities/executive-view/route.ts` (GET)
- `src/app/api/entities/shared-contacts/route.ts` (GET)

## Acceptance Criteria

1. `triage.service.ts` calls `generateJSON` from `@/lib/ai` for AI-powered message triage.
2. `triage.service.ts` falls back to keyword-based scoring if AI call fails.
3. `draft.service.ts` calls `generateText` from `@/lib/ai` to generate draft replies.
4. `draft.service.ts` calls `chat` from `@/lib/ai` for draft refinement.
5. `draft.service.ts` falls back to template-based generation if AI call fails.
6. `drafting-engine.ts` uses AI for draft variant generation and tone analysis.
7. `commitment-tracker.ts` has a new `extractCommitmentsFromText` function using `generateJSON`.
8. All route handlers in `src/app/api/inbox/`, `src/app/api/contacts/`, `src/app/api/entities/` are wrapped with `withAuth()` or `withEntityAccess()`.
9. No uses of `getCurrentUserId()` remain in wrapped routes -- replaced with `session.userId`.
10. `jest.config.ts` and `package.json` are NOT modified.
11. All existing tests still pass (update mocks if needed for the AI client).

## Implementation Steps

1. **Read all context files** listed above. Pay special attention to the existing implementation patterns in each service file.
2. **Create branch**: `git checkout -b ai-feature/p2-w12-wire-inbox-comm`
3. **Modify `triage.service.ts`**: Add AI import, create `triageMessageWithAI`, update `triageMessage` to use AI with fallback, update `batchTriage`.
4. **Modify `draft.service.ts`**: Add AI imports, update `generateDraft` to call `generateText`, update `refineDraft` to call `chat`.
5. **Modify `drafting-engine.ts`**: Add AI imports, wire AI into variant generation and tone analysis.
6. **Modify `commitment-tracker.ts`**: Add AI import, create `extractCommitmentsFromText` and `extractAndSaveCommitments`.
7. **Wrap inbox API routes**: Add `withAuth` to all handlers in `src/app/api/inbox/`.
8. **Wrap contacts API routes**: Add `withAuth`/`withEntityAccess` to all handlers in `src/app/api/contacts/`.
9. **Wrap entities API routes**: Add `withAuth`/`withEntityAccess` to all handlers in `src/app/api/entities/`.
10. **Update tests**: Update mocks in `tests/unit/inbox/` and `tests/unit/communication/` to mock `@/lib/ai`.
11. **Type-check**: `npx tsc --noEmit`
12. **Run tests**: `npx jest tests/unit/inbox/ tests/unit/communication/`
13. **Commit** with conventional commits.

## Tests Required

Update existing test files to mock the AI client:

### In `tests/unit/inbox/triage.service.test.ts`
```typescript
// Add mock for @/lib/ai
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

// Add tests:
describe('triageMessageWithAI', () => {
  it('should call generateJSON with message context in prompt');
  it('should return AI-generated triage result');
  it('should include sender VIP status in prompt');
  it('should include thread context in prompt');
});

describe('triageMessage with AI fallback', () => {
  it('should use AI result when API call succeeds');
  it('should fall back to keyword scoring when AI call fails');
  it('should fall back to keyword scoring when JSON parse fails');
});
```

### In `tests/unit/inbox/draft.service.test.ts`
```typescript
jest.mock('@/lib/ai', () => ({
  generateText: jest.fn(),
  chat: jest.fn(),
}));

// Add tests:
describe('generateDraft with AI', () => {
  it('should call generateText with original message context');
  it('should include tone preference in prompt');
  it('should include constraints in prompt');
  it('should generate alternative drafts with different tones');
  it('should fall back to template generation on AI failure');
});

describe('refineDraft with AI', () => {
  it('should call chat with current draft and feedback');
  it('should return refined draft body');
});
```

### In `tests/unit/communication/` (update existing or create new)
```typescript
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
  generateText: jest.fn(),
}));

describe('extractCommitmentsFromText', () => {
  it('should call generateJSON with the message text');
  it('should parse commitments from AI response');
  it('should set status to OPEN for all extracted commitments');
  it('should handle AI response with empty commitments array');
  it('should handle AI API failure gracefully');
});
```

## Commit Strategy

Make atomic commits in this order:

1. `feat(inbox): wire AI triage scoring via generateJSON with keyword fallback`
   - Files: `src/modules/inbox/triage.service.ts`
2. `feat(inbox): wire AI draft generation via generateText and chat`
   - Files: `src/modules/inbox/draft.service.ts`
3. `feat(communication): wire AI into drafting engine variant generation`
   - Files: `src/modules/communication/services/drafting-engine.ts`
4. `feat(communication): add AI-powered commitment extraction from message text`
   - Files: `src/modules/communication/services/commitment-tracker.ts`
5. `feat(inbox): apply withAuth to all inbox API route handlers`
   - Files: All `route.ts` in `src/app/api/inbox/`
6. `feat(contacts): apply withAuth and withEntityAccess to contact API routes`
   - Files: All `route.ts` in `src/app/api/contacts/`
7. `feat(entities): apply withAuth and withEntityAccess to entity API routes`
   - Files: All `route.ts` in `src/app/api/entities/`
8. `test(inbox): update triage and draft tests with AI client mocks`
   - Files: `tests/unit/inbox/triage.service.test.ts`, `tests/unit/inbox/draft.service.test.ts`
9. `test(communication): add tests for AI commitment extraction`
   - Files: `tests/unit/communication/`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
