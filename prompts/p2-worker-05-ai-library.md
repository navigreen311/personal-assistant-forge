# Worker 05: AI Client Library Enhancement

## Branch

`ai-feature/p2-w05-ai-library`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside this list:

- `src/lib/ai/prompts.ts` (create)
- `src/lib/ai/templates.ts` (create)
- `src/lib/ai/retry.ts` (create)
- `src/lib/ai/usage.ts` (create)
- `tests/unit/ai/prompts.test.ts` (create)
- `tests/unit/ai/retry.test.ts` (create)
- `tests/unit/ai/usage.test.ts` (create)
- `tests/unit/ai/templates.test.ts` (create)

**DO NOT modify:**
- `jest.config.ts`
- `package.json`
- `src/lib/ai/client.ts` (already exists -- read only)
- `src/lib/ai/index.ts` (already exists -- read only)
- Any files in `src/app/`, `src/components/`, `src/shared/`, `prisma/`

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

1. **`src/lib/ai/client.ts`** -- The existing AI client with `generateText()`, `generateJSON<T>()`, `chat()`, `streamText()` functions. Uses Anthropic SDK with `claude-sonnet-4-5-20250929` as default model. Exports `AIMessage` and `AIOptions` types. Understand the function signatures -- your utilities will wrap and extend these.
2. **`src/lib/ai/index.ts`** -- Barrel export re-exporting everything from client.ts. Do NOT modify this file. Other modules import from `@/lib/ai`.
3. **`src/shared/types/index.ts`** -- All type definitions including `Tone`, `Priority`, `Sensitivity`, `AutonomyLevel`, `DocumentType`, `MessageChannel`, etc. Your prompt templates will reference these types.
4. **`tsconfig.json`** -- Path aliases: `@/*` maps to `./src/*`.
5. **`package.json`** -- Dependencies include `@anthropic-ai/sdk@^0.74.0`, `zod@^4.3.6`. DevDependencies include `jest@^30.2.0`, `ts-jest@^29.4.6`.

## Requirements

### 1. Prompt Template System (`src/lib/ai/prompts.ts`)

Create a type-safe prompt template system with variable interpolation:

```typescript
/**
 * Prompt template with type-safe variable interpolation.
 *
 * Usage:
 *   const template = createPrompt('triage-email', {
 *     subject: 'Meeting tomorrow',
 *     body: 'Hi Marcus...',
 *     senderName: 'Dr. Martinez',
 *   });
 *   // Returns the interpolated prompt string
 */
```

**Template registry -- define these prompt templates:**

| Template ID | Variables | Purpose |
|-------------|-----------|---------|
| `triage-email` | `subject`, `body`, `senderName`, `senderEmail`, `userPreferences` | Classify email priority (P0/P1/P2), extract intent, suggest action |
| `draft-reply` | `originalMessage`, `senderName`, `tone`, `keyPoints`, `constraints` | Draft a reply to a message in the specified tone |
| `summarize-document` | `documentText`, `documentType`, `maxLength`, `focusAreas` | Summarize a document with focus on specific areas |
| `extract-tasks` | `sourceText`, `sourceType`, `existingTasks` | Extract actionable tasks from text (meeting notes, emails, etc.) |
| `schedule-suggestion` | `eventDescription`, `participants`, `duration`, `availability`, `preferences` | Suggest optimal meeting times based on availability |
| `decision-brief` | `question`, `context`, `options`, `criteria`, `stakeholders` | Generate a structured decision brief with pros/cons analysis |
| `research-report` | `topic`, `scope`, `existingKnowledge`, `requiredSections` | Generate a research report outline or full report |
| `tone-adjustment` | `originalText`, `currentTone`, `targetTone`, `context` | Rewrite text to match a different communication tone |

**Implementation:**

```typescript
// Type for template variable definitions
interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  template: string;          // The prompt string with {{variable}} placeholders
  variables: string[];       // Required variable names
  optionalVariables?: string[]; // Optional variable names (replaced with empty string if not provided)
  systemPrompt?: string;     // Optional system prompt to pair with this template
}

// Registry of all templates
const PROMPT_TEMPLATES: Record<string, PromptTemplate> = { ... };

// Create an interpolated prompt from a template
export function createPrompt(templateId: string, variables: Record<string, string>): string;

// Get a template definition (for introspection)
export function getTemplate(templateId: string): PromptTemplate | undefined;

// List all available templates
export function listTemplates(): PromptTemplate[];

// Validate that all required variables are provided
export function validateVariables(templateId: string, variables: Record<string, string>): { valid: boolean; missing: string[] };

// Get the system prompt for a template (if any)
export function getSystemPrompt(templateId: string): string | undefined;
```

**Template content requirements:**

Each template must be well-crafted and production-quality:

**`triage-email` template example:**
```
You are an AI executive assistant triaging incoming email.

Analyze the following email and provide a structured assessment:

Subject: {{subject}}
From: {{senderName}} <{{senderEmail}}>

Body:
{{body}}

User preferences: {{userPreferences}}

Respond with JSON:
{
  "priority": "P0" | "P1" | "P2",
  "intent": "INQUIRY" | "REQUEST" | "UPDATE" | "URGENT" | "FYI" | "SPAM",
  "summary": "one-line summary",
  "suggestedAction": "reply" | "archive" | "delegate" | "schedule" | "flag",
  "suggestedReplyPoints": ["point1", "point2"],
  "requiresHumanReview": true/false,
  "reasoning": "brief explanation of triage decision"
}
```

Each template should:
- Start with a clear role/context instruction
- Include all variable placeholders using `{{variableName}}` syntax
- Specify the expected output format (JSON where applicable)
- Be thorough but concise
- Account for edge cases in the instructions

### 2. System Prompt Templates (`src/lib/ai/templates.ts`)

Create module-specific system prompt personas:

```typescript
/**
 * System prompt templates define the AI persona for each module.
 * These are passed as the `system` parameter to AI calls.
 */

export interface SystemTemplate {
  id: string;
  moduleName: string;
  persona: string;          // The system prompt text
  constraints: string[];    // Key behavioral constraints
  outputFormat?: string;    // Default output format instruction
}

const SYSTEM_TEMPLATES: Record<string, SystemTemplate> = { ... };

export function getSystemTemplate(moduleId: string): SystemTemplate | undefined;
export function listSystemTemplates(): SystemTemplate[];
export function buildSystemPrompt(moduleId: string, overrides?: Partial<SystemTemplate>): string;
```

**Define system templates for these module personas:**

| Module ID | Persona Name | Key Traits |
|-----------|-------------|------------|
| `inbox-assistant` | Inbox Assistant | Triage specialist, understands email etiquette, respects sensitivity levels, aware of VIP contacts |
| `calendar-planner` | Calendar Planner | Schedule optimizer, understands meeting types, respects focus hours and meeting-free days |
| `task-manager` | Task Manager | Priority-aware, dependency-tracking, deadline-conscious, workload-balancing |
| `project-advisor` | Project Advisor | Milestone tracker, risk identifier, health status monitor, stakeholder communicator |
| `finance-advisor` | Finance Advisor | Budget-conscious, invoice tracker, expense categorizer, compliance-aware (SOX, SEC) |
| `knowledge-curator` | Knowledge Curator | Information organizer, SOP writer, learning path designer, search optimizer |
| `communication-coach` | Communication Coach | Tone-aware, channel-appropriate, relationship-sensitive, cultural-aware |
| `voiceforge-director` | VoiceForge Director | Call script writer, persona designer, campaign strategist, compliance-aware |
| `workflow-architect` | Workflow Architect | Automation designer, trigger optimizer, error handler, efficiency maximizer |
| `decision-analyst` | Decision Analyst | Framework applier (RAPID, DACI), bias checker, options evaluator, risk assessor |
| `security-guardian` | Security Guardian | Threat assessor, compliance checker, audit logger, access controller |
| `wellness-advisor` | Wellness Advisor | Health-conscious, stress-aware, work-life balance, habit tracker |
| `travel-coordinator` | Travel Coordinator | Itinerary planner, preference rememberer, budget-aware, logistics optimizer |
| `crisis-responder` | Crisis Responder | Calm under pressure, escalation expert, communication coordinator, rapid action planner |

Each persona system prompt should:
- Define the AI's role and expertise clearly
- Establish behavioral boundaries (what it should and should not do)
- Reference the user's preferences where applicable (e.g., autonomy level, tone preferences)
- Include compliance/sensitivity awareness where relevant
- Be 100-300 words (concise but comprehensive)

### 3. Retry Wrapper (`src/lib/ai/retry.ts`)

Create a retry utility with exponential backoff for AI API calls:

```typescript
/**
 * Error classification for AI API errors.
 */
export type AIErrorType = 'rate-limit' | 'server-error' | 'bad-request' | 'auth-error' | 'timeout' | 'unknown';

export interface RetryOptions {
  maxRetries?: number;       // default: 3
  baseDelayMs?: number;      // default: 1000
  maxDelayMs?: number;       // default: 30000
  backoffMultiplier?: number; // default: 2
  retryableErrors?: AIErrorType[]; // default: ['rate-limit', 'server-error', 'timeout']
  onRetry?: (error: Error, attempt: number, delayMs: number) => void; // callback on each retry
}

/**
 * Classify an error from the Anthropic SDK into an AIErrorType.
 */
export function classifyError(error: unknown): AIErrorType;

/**
 * Calculate delay for a given retry attempt with exponential backoff and jitter.
 */
export function calculateDelay(attempt: number, options: RetryOptions): number;

/**
 * Wrap an async function with retry logic.
 *
 * Usage:
 *   const result = await withRetry(() => generateText('Hello'), { maxRetries: 3 });
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T>;
```

**Error classification rules:**

```typescript
function classifyError(error: unknown): AIErrorType {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const statusCode = (error as any).status || (error as any).statusCode;

    // Rate limit: 429 or rate limit message
    if (statusCode === 429 || message.includes('rate limit') || message.includes('too many requests')) {
      return 'rate-limit';
    }

    // Server error: 5xx
    if (statusCode >= 500 && statusCode < 600) {
      return 'server-error';
    }

    // Auth error: 401, 403
    if (statusCode === 401 || statusCode === 403) {
      return 'auth-error';
    }

    // Bad request: 400, 422
    if (statusCode === 400 || statusCode === 422 || message.includes('invalid')) {
      return 'bad-request';
    }

    // Timeout
    if (message.includes('timeout') || message.includes('timed out') || message.includes('ETIMEDOUT')) {
      return 'timeout';
    }
  }

  return 'unknown';
}
```

**Retry logic requirements:**
- Exponential backoff: delay = `baseDelayMs * (backoffMultiplier ^ attempt)` capped at `maxDelayMs`.
- Add jitter: random value between 0 and 25% of the calculated delay.
- Only retry `retryableErrors` (default: rate-limit, server-error, timeout). Do NOT retry bad-request or auth-error.
- Call `onRetry` callback before each retry (useful for logging).
- After exhausting retries, throw the last error with additional context (retry count, error type).
- Use `setTimeout` via a promise for delays (not busy-waiting).

**Rate limit special handling:**
- If the error includes a `Retry-After` header value (Anthropic includes this), use that value instead of calculated backoff.
- Access via `(error as any).headers?.['retry-after']`.

### 4. Usage Tracking (`src/lib/ai/usage.ts`)

Create a token usage tracking and cost estimation system:

```typescript
/**
 * Model pricing (per million tokens, in USD).
 * Updated as of 2025.
 */
export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4-5-20250929': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-haiku-3-5-20241022': { inputPerMillion: 0.80, outputPerMillion: 4 },
  'claude-opus-4-20250514': { inputPerMillion: 15, outputPerMillion: 75 },
  // Add more models as needed
};

/**
 * Single usage record from an AI API call.
 */
export interface UsageRecord {
  id: string;
  timestamp: Date;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  moduleId: string;         // Which module made the call (e.g., 'inbox', 'calendar')
  templateId?: string;      // Which prompt template was used
  userId: string;
  entityId?: string;
  durationMs: number;       // How long the API call took
  success: boolean;
  errorType?: string;
}

/**
 * Aggregated usage summary.
 */
export interface UsageSummary {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  averageLatencyMs: number;
  successRate: number;
  byModel: Record<string, { calls: number; tokens: number; costUsd: number }>;
  byModule: Record<string, { calls: number; tokens: number; costUsd: number }>;
}

/**
 * Estimate cost for a given token usage.
 */
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number;

/**
 * Create a usage record from an API response.
 */
export function createUsageRecord(params: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  moduleId: string;
  templateId?: string;
  userId: string;
  entityId?: string;
  durationMs: number;
  success: boolean;
  errorType?: string;
}): UsageRecord;

/**
 * In-memory usage tracker (for the current process).
 * In production, this would be backed by a database or analytics service.
 */
export class UsageTracker {
  private records: UsageRecord[] = [];

  /** Record a new usage entry */
  record(record: UsageRecord): void;

  /** Get all records */
  getRecords(): UsageRecord[];

  /** Get records filtered by time range */
  getRecordsByRange(start: Date, end: Date): UsageRecord[];

  /** Get records filtered by module */
  getRecordsByModule(moduleId: string): UsageRecord[];

  /** Get records filtered by user */
  getRecordsByUser(userId: string): UsageRecord[];

  /** Generate an aggregated summary */
  getSummary(records?: UsageRecord[]): UsageSummary;

  /** Get the total cost for a time period */
  getCostForPeriod(start: Date, end: Date): number;

  /** Check if a user is approaching a budget limit */
  checkBudget(userId: string, budgetUsd: number): { withinBudget: boolean; usedUsd: number; remainingUsd: number };

  /** Clear all records (for testing) */
  clear(): void;
}

/** Singleton instance */
export const usageTracker = new UsageTracker();

/**
 * Estimate tokens from text (rough approximation).
 * ~4 characters per token for English text.
 */
export function estimateTokens(text: string): number;
```

**Implementation requirements:**
- `estimateCost`: Look up model in `MODEL_PRICING`. If model not found, use Claude Sonnet pricing as default. Return cost in USD with 6 decimal places.
- `createUsageRecord`: Generate a unique ID (use `crypto.randomUUID()` or a simple counter), calculate cost, create the full record.
- `UsageTracker.getSummary`: Calculate aggregates including success rate (`successfulCalls / totalCalls`), average latency, and breakdowns by model and module.
- `estimateTokens`: Rough estimate using `Math.ceil(text.length / 4)`. This is approximate -- actual token counts come from the API response.
- The `UsageTracker` is in-memory for now. Add a comment noting that production use should persist to database (ActionLog table or dedicated analytics).
- All monetary values should use `number` type with appropriate precision. Note in comments that production should use integer cents to avoid floating-point issues.

### 5. Tests

Create comprehensive tests for all new modules.

#### `tests/unit/ai/prompts.test.ts`

```typescript
describe('Prompt Templates', () => {
  describe('createPrompt', () => {
    it('should interpolate variables into template');
    it('should throw if template ID does not exist');
    it('should throw if required variable is missing');
    it('should replace optional variables with empty string if not provided');
    it('should handle multiple occurrences of the same variable');
    it('should not modify text that looks like a variable but is not in the template');
  });

  describe('getTemplate', () => {
    it('should return template definition for valid ID');
    it('should return undefined for invalid ID');
  });

  describe('listTemplates', () => {
    it('should return all registered templates');
    it('should include at least 8 templates');
  });

  describe('validateVariables', () => {
    it('should return valid=true when all required variables provided');
    it('should return valid=false with missing variable names');
    it('should not require optional variables');
  });

  describe('getSystemPrompt', () => {
    it('should return system prompt for templates that have one');
    it('should return undefined for templates without system prompt');
  });
});
```

#### `tests/unit/ai/retry.test.ts`

```typescript
describe('Retry Logic', () => {
  describe('classifyError', () => {
    it('should classify 429 status as rate-limit');
    it('should classify 500 status as server-error');
    it('should classify 503 status as server-error');
    it('should classify 401 status as auth-error');
    it('should classify 400 status as bad-request');
    it('should classify timeout message as timeout');
    it('should classify unknown errors as unknown');
    it('should handle non-Error objects');
  });

  describe('calculateDelay', () => {
    it('should return baseDelayMs for attempt 0');
    it('should increase exponentially with each attempt');
    it('should not exceed maxDelayMs');
    it('should include jitter (result varies between calls)');
  });

  describe('withRetry', () => {
    it('should return result on first success');
    it('should retry on rate-limit error');
    it('should retry on server-error');
    it('should NOT retry on bad-request error');
    it('should NOT retry on auth-error');
    it('should stop retrying after maxRetries');
    it('should call onRetry callback before each retry');
    it('should throw the last error after exhausting retries');
    it('should respect custom retryableErrors option');
  });
});
```

Use `jest.useFakeTimers()` and `jest.advanceTimersByTime()` to test delays without actual waiting. Mock the async function passed to `withRetry`.

#### `tests/unit/ai/usage.test.ts`

```typescript
describe('Usage Tracking', () => {
  describe('estimateCost', () => {
    it('should calculate cost for claude-sonnet-4-5-20250929');
    it('should calculate cost for claude-opus-4-20250514');
    it('should use default pricing for unknown models');
    it('should return 0 for 0 tokens');
  });

  describe('estimateTokens', () => {
    it('should estimate ~1 token per 4 characters');
    it('should return 0 for empty string');
    it('should round up');
  });

  describe('createUsageRecord', () => {
    it('should create a record with all fields populated');
    it('should calculate estimated cost');
    it('should generate a unique ID');
  });

  describe('UsageTracker', () => {
    it('should record and retrieve usage records');
    it('should filter records by time range');
    it('should filter records by module');
    it('should filter records by user');

    describe('getSummary', () => {
      it('should calculate total tokens and cost');
      it('should calculate average latency');
      it('should calculate success rate');
      it('should break down by model');
      it('should break down by module');
      it('should handle empty records');
    });

    describe('checkBudget', () => {
      it('should return within budget when usage is low');
      it('should return not within budget when limit exceeded');
      it('should only count records for the specified user');
    });

    it('should clear all records');
  });
});
```

#### `tests/unit/ai/templates.test.ts`

```typescript
describe('System Templates', () => {
  describe('getSystemTemplate', () => {
    it('should return template for inbox-assistant');
    it('should return template for calendar-planner');
    it('should return template for finance-advisor');
    it('should return undefined for invalid module ID');
  });

  describe('listSystemTemplates', () => {
    it('should return at least 14 templates');
    it('should have unique IDs');
  });

  describe('buildSystemPrompt', () => {
    it('should return the persona text for a valid module');
    it('should apply overrides to the base template');
    it('should throw for invalid module ID');
  });
});
```

## Acceptance Criteria

1. **Prompt templates work**: `createPrompt('triage-email', { subject: '...', ... })` returns an interpolated prompt string with all variables replaced.
2. **All 8 prompt templates defined**: triage-email, draft-reply, summarize-document, extract-tasks, schedule-suggestion, decision-brief, research-report, tone-adjustment.
3. **System templates work**: `getSystemTemplate('inbox-assistant')` returns a valid persona definition.
4. **All 14 system templates defined**: One for each module persona listed above.
5. **Retry logic works**: `withRetry(() => apiCall())` retries on rate-limit and server-error, does not retry on bad-request.
6. **Error classification works**: All HTTP status codes and error message patterns are correctly classified.
7. **Usage tracking works**: `usageTracker.record(...)` stores records, `usageTracker.getSummary()` returns correct aggregates.
8. **Cost estimation works**: `estimateCost('claude-sonnet-4-5-20250929', 1000, 500)` returns the correct USD value.
9. **All tests pass**: `npx jest tests/unit/ai/` runs all 4 test files and all tests pass.
10. **No TypeScript errors**: `npx tsc --noEmit` succeeds.
11. **No modifications to client.ts or index.ts**: The existing AI client and barrel export are untouched.
12. **No `any` types**: All functions are fully typed with proper TypeScript types.

## Implementation Steps

1. **Read context files**: Read `src/lib/ai/client.ts`, `src/lib/ai/index.ts`, `src/shared/types/index.ts`, `tsconfig.json`, `package.json`.
2. **Create branch**: `git checkout -b ai-feature/p2-w05-ai-library`
3. **Create `src/lib/ai/prompts.ts`**: Implement the prompt template system with all 8 templates.
4. **Create `src/lib/ai/templates.ts`**: Implement the system prompt templates for all 14 module personas.
5. **Create `src/lib/ai/retry.ts`**: Implement the retry wrapper with error classification and exponential backoff.
6. **Create `src/lib/ai/usage.ts`**: Implement the usage tracker with cost estimation.
7. **Create tests**: Write all 4 test files.
8. **Run tests**: `npx jest tests/unit/ai/` -- all tests must pass.
9. **Type-check**: `npx tsc --noEmit`.
10. **Commit**: Use conventional commits.

## Tests Required

All tests listed in section 5 above. Run with:

```bash
npx jest tests/unit/ai/ --verbose
```

Expected: All tests pass. No skipped or pending tests.

## Commit Strategy

Make atomic commits in this order:

1. `feat(ai): add prompt template system with 8 production templates`
   - Files: `src/lib/ai/prompts.ts`
2. `feat(ai): add system prompt templates for 14 module personas`
   - Files: `src/lib/ai/templates.ts`
3. `feat(ai): add retry wrapper with exponential backoff and error classification`
   - Files: `src/lib/ai/retry.ts`
4. `feat(ai): add token usage tracking and cost estimation`
   - Files: `src/lib/ai/usage.ts`
5. `test(ai): add comprehensive tests for prompts, templates, retry, and usage`
   - Files: `tests/unit/ai/prompts.test.ts`, `tests/unit/ai/templates.test.ts`, `tests/unit/ai/retry.test.ts`, `tests/unit/ai/usage.test.ts`

After all commits, verify with `git log --oneline` that the history is clean and descriptive. Then run:
```bash
npx jest tests/unit/ai/ --verbose
npx tsc --noEmit
```
Both must succeed.
