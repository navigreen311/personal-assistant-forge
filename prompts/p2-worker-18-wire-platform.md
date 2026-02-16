# Worker 18: Wire AI & Auth into Platform Modules (Delegation, Attention, Onboarding, Admin, Documents, Developer)

## Branch

`ai-feature/p2-w18-wire-platform`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to modifying files within these paths. Do NOT touch any files outside these directories:

```
src/modules/delegation/                # Delegation module services and components
src/modules/attention/                 # Attention Governor module services and components
src/modules/onboarding/                # Onboarding module services and components
src/modules/admin/                     # Enterprise Admin module services and components
src/modules/documents/                 # Document Studio module services and components
src/modules/developer/                 # Developer Platform module services and components
src/app/api/delegation/                # API routes for delegation
src/app/api/attention/                 # API routes for attention (if they exist)
src/app/api/admin/                     # API routes for admin
src/app/api/documents/                 # API routes for documents
src/app/api/developer/                 # API routes for developer platform (if they exist)
tests/unit/platform/                   # Unit tests (modify existing or add new)
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
| `src/shared/types/index.ts` | Immutable shared types (includes `UserRole`, `AutonomyLevel`, `BrandKit`, `DocumentType`, etc.) |
| `src/shared/utils/api-response.ts` | API helpers: `success<T>()`, `error()`, `paginated<T>()` |
| `src/lib/db/index.ts` | Prisma client singleton |
| `src/modules/delegation/types.ts` | Delegation types (DelegationTask, ContextPack, DelegationScore, etc.) |
| `src/modules/attention/types.ts` | Attention types (AttentionBudget, NotificationItem, DNDConfig, etc.) |
| `src/modules/onboarding/types.ts` | Onboarding types (OnboardingWizard, PersonalityCalibration, ToneTrainingSample, etc.) |
| `src/modules/admin/types.ts` | Admin types (OrgPolicy, SSOConfig, DLPRule, etc.) |
| `src/modules/documents/types.ts` | Documents types (DocumentTemplate, DocumentGeneration, Redline, etc.) |
| `src/modules/developer/types.ts` | Developer types (PluginDefinition, WebhookConfig, PluginSecurityReview, etc.) |
| `tsconfig.json` | Path aliases: `@/` maps to `src/` |

## Requirements

### 1. Wire AI into Delegation Services

Import where needed:
```typescript
import { generateText, generateJSON } from '@/lib/ai';
```

#### `src/modules/delegation/services/delegation-service.ts`
- `buildContextPack()` should use `generateText()` to produce the `summary` field. Build a prompt that includes the task details, related documents, and relevant messages. The AI should produce a concise context summary for the delegate.
- Use temperature 0.5 for balanced, informative summaries.

#### `src/modules/delegation/services/delegation-inbox-service.ts`
- `generateDelegationInbox()` should use `generateJSON()` to score and rank delegation candidates. Build a prompt that includes the user's tasks with priorities, available delegates and their strengths, and ask the AI to identify the best delegation opportunities with reasoning.
- `getDailySuggestions()` should use `generateText()` to produce the `reason` field explaining why each task is delegatable.

#### `src/modules/delegation/services/delegation-scoring-service.ts`
- `calculateScore()` is primarily math-based -- leave the scoring formula. But if there are text-based performance summaries or category descriptions, wire those to `generateText()`.

### 2. Wire AI into Attention Services

#### `src/modules/attention/services/priority-router.ts`
- `routeNotification()` should use `generateJSON()` to enhance priority classification for ambiguous notifications. When the priority is not explicitly set, call the AI with the notification title and body to classify priority (P0/P1/P2).
- Use temperature 0.2 for consistent classification.

#### `src/modules/attention/services/notification-bundler.ts`
- `bundleNotifications()` should use `generateText()` to produce intelligent bundle titles that summarize the grouped notifications. Instead of generic "3 Slack messages", produce "3 Slack messages about Project Alpha launch".
- `getDigest()` should use `generateText()` to produce a digest summary paragraph at the top of the digest.

#### `src/modules/attention/services/notification-learning-service.ts`
- `getSuggestions()` should use `generateJSON()` to produce personalized suggestions. Build a prompt with the user's notification patterns (open rates, response times, preferred times per source) and ask the AI for actionable notification management suggestions.

### 3. Wire AI into Onboarding Services

#### `src/modules/onboarding/services/calibration-service.ts`
- `completeCalibration()` should use `generateJSON()` to analyze the calibration responses and produce an AI personality profile. Build a prompt with the user's communication style, decision speed, detail preference, risk tolerance, and autonomy comfort settings. Ask the AI to synthesize these into behavioral preferences and recommendations for the assistant's behavior.

#### `src/modules/onboarding/services/tone-training-service.ts`
- `generateSample()` should use `generateText()` to produce sample messages for the user to rate. Build a prompt with the context (e.g., "draft a polite follow-up email to a client") and the user's existing calibration data. The AI should produce a message matching the user's approximate style.
- `applyTraining()` should use `generateJSON()` to synthesize all rated samples into a tone profile. Build a prompt with all samples, their ratings, and adjustments, and ask the AI to produce a structured tone profile.

### 4. Wire AI into Document Services

#### `src/modules/documents/services/document-generation-service.ts`
- `generateDocument()` should use `generateText()` to enhance template-based generation. After rendering the template with variable substitution, pass the result to `generateText()` for smart formatting, coherence improvements, and content suggestions.
- If `citationsEnabled` is true, use `generateJSON()` to produce citation recommendations for claims in the document.
- Use temperature 0.6 for document generation (creative but controlled).

#### `src/modules/documents/services/template-service.ts`
- If there are content suggestion features, wire them to `generateText()`.

#### `src/modules/documents/services/versioning-service.ts`
- `generateRedline()` is primarily a diff operation -- leave as-is. But if there is a summary or description of changes, wire that to `generateText()`.

### 5. Wire AI into Developer Services

#### `src/modules/developer/services/security-review-service.ts`
- `conductReview()` should use `generateJSON()` to perform an AI-assisted security review. Build a prompt that includes the plugin's permissions, entry point description, and configuration schema. Ask the AI to:
  - Verify permissions are minimal (principle of least privilege)
  - Check for dangerous patterns (network access, file system access, credential access)
  - Assess isolation enforcement
  - Produce findings with severity levels
- Use temperature 0.1 for security analysis (maximum consistency).

#### `src/modules/developer/services/webhook-service.ts`
- If there are debugging suggestions for failed webhook events, wire to `generateText()`. Build a prompt with the event, response status, and error body, and ask the AI for debugging suggestions.

### 6. Apply Auth to Admin Routes with `withRole(['ADMIN'])`

Admin routes require the ADMIN role. Import:
```typescript
import { withAuth, withRole } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
```

Transform ALL routes in `src/app/api/admin/` to use `withRole()`:
```typescript
export async function GET(request: NextRequest) {
  return withRole(request, ['ADMIN'], async (req, session) => {
    try {
      // ... handler logic
      return success(result);
    } catch (err) {
      return error('INTERNAL_ERROR', '...', 500);
    }
  });
}
```

Admin route files to protect:
- `src/app/api/admin/policies/route.ts`
- `src/app/api/admin/dlp/route.ts`
- `src/app/api/admin/dlp/check/route.ts`
- `src/app/api/admin/ediscovery/route.ts`
- `src/app/api/admin/sso/route.ts`

### 7. Apply Auth to All Other Platform Routes

Wrap ALL route handlers in the remaining platform API directories with `withAuth()`:

- `src/app/api/delegation/` (all routes: CRUD, approve, inbox, scores)
- `src/app/api/documents/` (all routes: templates, generate, versions, redline, sign, brand-kit)
- `src/app/api/developer/` (all routes, if they exist)
- `src/app/api/attention/` (all routes, if they exist)

Where routes operate on entity-scoped data, use `withEntityAccess()` instead.

Where routes accept `userId` as a query parameter, prefer `session.userId` from auth context.

## Acceptance Criteria

- [ ] Delegation context pack uses AI to generate summaries
- [ ] Delegation inbox uses AI for intelligent task scoring and delegation reasoning
- [ ] Priority routing uses AI for ambiguous notification classification
- [ ] Notification bundling uses AI for intelligent bundle titles
- [ ] Notification learning uses AI for personalized management suggestions
- [ ] Onboarding calibration uses AI to synthesize personality profiles
- [ ] Tone training uses AI to generate sample messages and synthesize tone profiles
- [ ] Document generation uses AI for smart formatting and content enhancement
- [ ] Plugin security review uses AI for automated security analysis
- [ ] ALL admin routes use `withRole(['ADMIN'])` -- returns 403 for non-admin users
- [ ] ALL delegation routes use `withAuth()`
- [ ] ALL document routes use `withAuth()`
- [ ] ALL developer routes use `withAuth()` (if they exist)
- [ ] All AI calls have error handling with graceful fallbacks
- [ ] All AI calls use appropriate temperature settings (0.1-0.2 for security/classification, 0.5-0.6 for generation, 0.7 for natural language)
- [ ] No modifications to `jest.config.ts` or `package.json`
- [ ] `npx tsc --noEmit` passes with no errors in owned paths
- [ ] Existing tests still pass: `npx jest tests/unit/platform/`

## Implementation Steps

1. **Read context files**: Read `src/lib/ai/client.ts`, `src/shared/middleware/auth.ts`, all service files in the 6 module directories, all route files in the corresponding API directories.
2. **Create branch**: `git checkout -b ai-feature/p2-w18-wire-platform`
3. **Wire AI into delegation services**: Context pack summaries, delegation inbox scoring, daily suggestion reasoning.
4. **Wire AI into attention services**: Priority classification, bundle titles, digest summaries, learning suggestions.
5. **Wire AI into onboarding services**: Calibration profiling, tone sample generation, tone profile synthesis.
6. **Wire AI into document services**: Smart formatting, content enhancement, citation suggestions.
7. **Wire AI into developer services**: Plugin security review, webhook debugging suggestions.
8. **Apply auth to admin routes**: `withRole(['ADMIN'])` for all `src/app/api/admin/` routes.
9. **Apply auth to delegation routes**: `withAuth()` for all `src/app/api/delegation/` routes.
10. **Apply auth to document routes**: `withAuth()` for all `src/app/api/documents/` routes.
11. **Apply auth to developer routes**: `withAuth()` for all `src/app/api/developer/` routes (if they exist).
12. **Apply auth to attention routes**: `withAuth()` for all `src/app/api/attention/` routes (if they exist).
13. **Update tests**: Mock `@/lib/ai` in existing tests. Add tests for AI integration points.
14. **Verify**: Run `npx tsc --noEmit`, `npx jest tests/unit/platform/`, `npx next build`.

## Tests Required

Update existing tests in `tests/unit/platform/` to mock the AI client:

```typescript
jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('AI-generated content'),
  generateJSON: jest.fn().mockResolvedValue({}),
  chat: jest.fn().mockResolvedValue('AI response'),
}));
```

Add or update these test cases:

### `tests/unit/platform/delegation-scoring.test.ts`
```typescript
describe('generateDelegationInbox (AI-powered)', () => {
  it('should call generateJSON with tasks and delegates data');
  it('should include delegate strengths in prompt');
  it('should return AI-scored delegation suggestions');
  it('should handle AI failure with fallback scoring');
});
```

### `tests/unit/platform/notification-bundler.test.ts`
```typescript
describe('bundleNotifications (AI-enhanced)', () => {
  it('should call generateText for intelligent bundle titles');
  it('should include notification content in prompt');
  it('should fall back to generic titles if AI fails');
});
```

### `tests/unit/platform/security-review.test.ts` (new)
```typescript
describe('conductReview (AI-powered)', () => {
  it('should call generateJSON with plugin permissions and config');
  it('should produce findings with severity levels');
  it('should use temperature 0.1 for security analysis');
  it('should flag excessive permissions');
  it('should handle AI failure gracefully');
});
```

### `tests/unit/platform/tone-training.test.ts` (new)
```typescript
describe('generateSample (AI-powered)', () => {
  it('should call generateText with context and calibration data');
  it('should produce a message matching approximate style');
  it('should handle AI failure gracefully');
});

describe('applyTraining (AI-powered)', () => {
  it('should call generateJSON with all samples and ratings');
  it('should produce structured tone profile');
  it('should handle AI failure gracefully');
});
```

### `tests/unit/platform/admin-auth.test.ts` (new)
```typescript
describe('Admin route auth', () => {
  it('should return 401 for unauthenticated requests');
  it('should return 403 for non-admin users');
  it('should allow admin users through');
});
```

Mock `@/lib/ai`, `@/lib/db`, and `@/shared/middleware/auth` in tests as needed.

## Commit Strategy

Use Conventional Commits. Commit after each logical unit is complete and compiling.

```
feat(delegation): wire AI into context pack summaries and delegation inbox scoring
feat(attention): wire AI into priority routing and notification bundling intelligence
feat(onboarding): wire AI into calibration analysis and tone training feedback
feat(documents): wire AI into document generation and smart formatting
feat(developer): wire AI into plugin security review and webhook debugging
feat(admin): apply withRole(['ADMIN']) to all admin API routes
feat(platform): apply withAuth to delegation, document, and developer API routes
test(platform): update tests with AI client mocks and new AI integration tests
test(platform): add admin auth enforcement tests
chore(platform): verify build and final cleanup
```

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
