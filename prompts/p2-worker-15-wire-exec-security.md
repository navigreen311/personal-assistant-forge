# Worker 15: Wire AI & Auth into Execution + Security + VoiceForge + Voice/Capture

## Branch

`ai-feature/p2-w15-wire-exec-security`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to modifying files within these paths. Do NOT touch any files outside these directories:

- `src/modules/execution/services/` (modify existing -- simulation-engine.ts, runbook-service.ts)
- `src/modules/security/services/` (modify existing -- classification-service.ts, redaction-service.ts, audit-service.ts)
- `src/modules/voiceforge/services/` (modify existing -- script-engine.ts, persona-service.ts, campaign-service.ts)
- `src/modules/voice/services/` (modify existing -- command-parser.ts, stt-service.ts)
- `src/modules/capture/services/` (modify existing -- capture-service.ts, ocr-service.ts, routing-service.ts)
- `src/app/api/execution/` (modify existing -- all route.ts files to add withAuth)
- `src/app/api/voice/` (modify existing -- all route.ts files to add withAuth)
- `src/app/api/capture/` (modify existing -- all route.ts files to add withAuth)
- `tests/unit/execution/` (update existing tests if mocks change)
- `tests/unit/security/` (update existing tests if mocks change)
- `tests/unit/voiceforge/` (update existing tests if mocks change)
- `tests/unit/voice/` (update existing tests if mocks change)
- `tests/unit/capture/` (update existing tests if mocks change)

### Do NOT modify

- `jest.config.ts`
- `package.json`
- Any files outside the owned paths above

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

1. **`src/lib/ai/index.ts`** -- Exports `generateText(prompt, options?)`, `generateJSON<T>(prompt, options?)`, `chat(messages, options?)`, `streamText(prompt, options?)`. Options include `model`, `maxTokens`, `temperature`, `system`.
2. **`src/lib/ai/client.ts`** -- Full AI client implementation. `generateJSON` appends system instruction for JSON-only responses.
3. **`src/shared/middleware/auth.ts`** -- Three auth wrappers:
   - `withAuth(req, handler)` -- Validates JWT, passes `AuthSession` (userId, email, name, role, activeEntityId) to handler. Returns 401.
   - `withRole(req, roles, handler)` -- Checks role. Returns 403.
   - `withEntityAccess(req, entityId, handler)` -- Verifies entity ownership. Returns 403/404.
4. **`src/modules/execution/services/simulation-engine.ts`** -- Dry-run simulation engine. Uses a `simulators` map keyed by action type (CREATE_TASK, SEND_MESSAGE, DELETE_RECORD, TRIGGER_WORKFLOW, etc.). Each simulator returns `effects`, `sideEffects`, and `warnings`. Uses `scoreAction` from blast-radius-scorer and `estimateActionCost` from cost-estimator.
5. **`src/modules/execution/services/runbook-service.ts`** -- Runbook service. Read to determine current implementation.
6. **`src/modules/execution/services/blast-radius-scorer.ts`** -- Rule-based blast radius scoring. Keep as-is.
7. **`src/modules/security/services/classification-service.ts`** -- Data classification using regex patterns (SSN, credit card, medical records, etc.) and keyword lists (health terms, legal terms). Has `classifyContent`, `classifyDocument`, and pattern-matching functions.
8. **`src/modules/security/services/redaction-service.ts`** -- Redaction service. Read to determine current implementation.
9. **`src/modules/security/services/audit-service.ts`** -- Audit service. Read to determine current implementation.
10. **`src/modules/voiceforge/services/script-engine.ts`** -- Call scripting engine. CRUD for call scripts stored in `prisma.document`. Has `createScript`, `getScript`, `executeScript`, `evaluateBranch`.
11. **`src/modules/voiceforge/services/persona-service.ts`** -- Persona management. Read for AI integration points.
12. **`src/modules/voiceforge/services/campaign-service.ts`** -- Campaign management. Read for AI optimization points.
13. **`src/modules/voice/services/command-parser.ts`** -- Voice command parser using regex patterns for entity extraction (MONEY, PRIORITY, TIME, DURATION, DATE). Has `extractEntities`, `matchCommand`, `parseVoiceCommand`. All extraction is regex/keyword-based.
14. **`src/modules/voice/services/stt-service.ts`** -- Speech-to-text service. Read to determine if AI transcription enhancement exists.
15. **`src/modules/capture/services/capture-service.ts`** -- Capture service. Read for AI integration points.
16. **`src/modules/capture/services/ocr-service.ts`** -- OCR service. Read for AI text extraction.
17. **`src/modules/capture/services/routing-service.ts`** -- Capture routing service. Read for AI classification routing.
18. **`src/modules/execution/types/`** -- Execution types: `SimulationRequest`, `SimulationResult`, `SimulatedEffect`.
19. **`src/modules/security/types/`** -- Security types: `DataClassification`, `ClassificationResult`, `ComplianceFlag`.
20. **`src/modules/voiceforge/types/`** -- VoiceForge types: `CallScript`, `ScriptNode`, `ScriptExecution`.
21. **`src/modules/voice/types/`** -- Voice types: `ParsedVoiceCommand`, `VoiceIntent`, `VoiceCommandDefinition`, `ExtractedEntity`.
22. **`src/modules/capture/types/`** -- Capture types.
23. **`src/shared/types/index.ts`** -- Shared types.
24. **`prisma/schema.prisma`** -- Database models.

## Requirements

### 1. Execution Simulation Engine -- Wire AI (`src/modules/execution/services/simulation-engine.ts`)

**Read the file first** to understand the current rule-based simulation.

#### Specific modifications:

a. **Add import**:
```typescript
import { generateJSON } from '@/lib/ai';
```

b. **Add AI-powered side effect prediction**:
```typescript
async function predictSideEffectsWithAI(
  request: SimulationRequest,
  ruleBasedEffects: SimulatedEffect[]
): Promise<{
  additionalEffects: SimulatedEffect[];
  riskAssessment: string;
  recommendations: string[];
}> {
  return generateJSON(`Analyze this planned action and predict additional side effects.

Action: ${request.actionType}
Entity: ${request.entityId}
Parameters: ${JSON.stringify(request.parameters)}
Already-identified effects: ${JSON.stringify(ruleBasedEffects)}

Return JSON with:
- additionalEffects: array of {type, model, description, reversible} for effects not yet identified
- riskAssessment: brief assessment of overall risk
- recommendations: array of suggestions to reduce blast radius`, {
    maxTokens: 512,
    temperature: 0.3,
    system: 'You are a system operations risk analyst. Identify side effects of actions. Be thorough but realistic. Focus on non-obvious cascading effects.',
  });
}
```

c. **Integrate into the main simulation flow**:
- After the rule-based simulators run, call `predictSideEffectsWithAI` to find additional effects
- Merge AI-predicted effects with rule-based effects
- Add AI risk assessment to the simulation result
- Wrap in try/catch; proceed with rule-based results only on failure

d. **Keep all existing simulators** (simulateCreateTask, simulateSendMessage, etc.) intact.

### 2. Execution Runbook Service -- Wire AI (`src/modules/execution/services/runbook-service.ts`)

**Read the file first** to understand current implementation.

#### Modifications:

a. **Add import**:
```typescript
import { generateJSON, generateText } from '@/lib/ai';
```

b. **Add AI-powered runbook step generation**:
- If there is a method that generates or suggests runbook steps, wire `generateJSON` to produce context-aware steps
- Build a prompt including the action type, affected systems, and blast radius
- The AI should suggest pre-checks, execution steps, verification steps, and rollback procedures

c. **Add AI-powered runbook validation**:
- If there is a validation method, enhance it with AI to detect missing safety checks or steps that could fail

d. **Wrap in try/catch** with fallback to existing logic.

### 3. Security Classification Service -- Wire AI (`src/modules/security/services/classification-service.ts`)

**Read the file first** -- it currently uses regex patterns and keyword lists for classification.

#### Specific modifications:

a. **Add import**:
```typescript
import { generateJSON } from '@/lib/ai';
```

b. **Add AI-enhanced classification for ambiguous content**:
- Keep the existing regex-based pattern matching for deterministic PII/PHI detection (SSN, credit card, medical record patterns) -- these MUST remain regex-based for reliability
- Add an AI classification layer for content that passes regex checks but may contain contextual sensitive information:

```typescript
async function classifyAmbiguousContent(
  content: string,
  regexClassification: ClassificationResult
): Promise<ClassificationResult> {
  // Only call AI if regex classification returned INTERNAL or PUBLIC
  // (i.e., no deterministic PII/PHI was found, but content might still be sensitive)
  if (['RESTRICTED', 'REGULATED'].includes(regexClassification.classification)) {
    return regexClassification; // Trust deterministic detection
  }

  const aiResult = await generateJSON<{
    classification: string;
    confidence: number;
    reasoning: string;
    additionalFlags: Array<{ rule: string; severity: string; description: string }>;
  }>(`Analyze this content for sensitive information that pattern matching might miss.

Content: "${content.substring(0, 2000)}"
Pattern-based classification: ${regexClassification.classification}

Check for:
- Implicit references to protected health information
- Contextual financial data (not just dollar amounts)
- Trade secrets or competitive intelligence
- Personal information in narrative form
- Regulatory compliance implications

Return JSON with classification (PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED, REGULATED), confidence 0-1, reasoning, and any additional compliance flags.`, {
    maxTokens: 512,
    temperature: 0.2,
    system: 'You are a data classification specialist focused on regulatory compliance. Only escalate classification when you have high confidence. Never downgrade from a higher regex-based classification.',
  });

  // Only upgrade classification, never downgrade
  const classificationRank = { PUBLIC: 0, INTERNAL: 1, CONFIDENTIAL: 2, RESTRICTED: 3, REGULATED: 4 };
  const regexRank = classificationRank[regexClassification.classification as keyof typeof classificationRank] ?? 0;
  const aiRank = classificationRank[aiResult.classification as keyof typeof classificationRank] ?? 0;

  if (aiRank > regexRank && aiResult.confidence > 0.7) {
    return {
      ...regexClassification,
      classification: aiResult.classification as DataClassification,
      flags: [...regexClassification.flags, ...aiResult.additionalFlags],
    };
  }

  return regexClassification;
}
```

c. **Integrate into `classifyContent`** -- call `classifyAmbiguousContent` after regex classification.

d. **Keep all regex patterns intact** -- they are the first line of defense and must always run.

### 4. Security Redaction Service -- Wire AI (`src/modules/security/services/redaction-service.ts`)

**Read the file first** to understand current implementation.

#### Modifications:

- If redaction uses pattern matching, keep it as-is for deterministic PII/PHI redaction
- Add AI-powered contextual redaction for named entities and implicit references:
  - Use `generateJSON` to identify additional redaction targets in context
  - Example: "Dr. Smith discussed the patient's condition" -- AI can identify that "Dr. Smith" and "the patient's condition" may need redaction even without explicit PII patterns
- Wrap in try/catch; rely on regex-only redaction on failure

### 5. Security Audit Service -- Wire AI (`src/modules/security/services/audit-service.ts`)

**Read the file first** to understand current implementation.

#### Modifications:

- If there is anomaly detection logic, wire `generateJSON` for AI-powered anomaly analysis:
  - Feed recent audit log entries to AI
  - Ask AI to identify unusual patterns: access at odd hours, bulk operations, privilege escalation, etc.
  - Return structured anomaly alerts with severity and recommended actions
- If purely CRUD for audit logs, add an analysis method:

```typescript
export async function analyzeAuditTrail(
  entityId: string,
  timeWindow: { from: Date; to: Date }
): Promise<{
  anomalies: Array<{ description: string; severity: 'LOW' | 'MEDIUM' | 'HIGH'; events: string[] }>;
  summary: string;
  riskScore: number;
}> {
  // Query recent audit logs from Prisma
  // Feed to generateJSON for analysis
  // Fall back to empty result on failure
}
```

### 6. VoiceForge Script Engine -- Wire AI (`src/modules/voiceforge/services/script-engine.ts`)

**Read the file first** -- it manages call scripts with CRUD operations.

#### Modifications:

a. **Add import**:
```typescript
import { generateJSON, generateText } from '@/lib/ai';
```

b. **Add AI-powered script generation**:
```typescript
export async function generateScriptWithAI(
  entityId: string,
  params: {
    purpose: string;       // "appointment confirmation", "sales follow-up", etc.
    targetAudience: string;
    tone: string;
    maxDuration: number;   // minutes
    keyPoints: string[];
    complianceRequirements?: string[];
  }
): Promise<Omit<CallScript, 'id' | 'version' | 'createdAt' | 'updatedAt'>> {
  const result = await generateJSON<{
    name: string;
    description: string;
    nodes: Array<{
      id: string;
      type: string;
      content: string;
      branches: Array<{ condition: string; targetNodeId: string }>;
    }>;
    startNodeId: string;
  }>(`Generate a call script for the following scenario:

Purpose: ${params.purpose}
Target audience: ${params.targetAudience}
Tone: ${params.tone}
Max duration: ${params.maxDuration} minutes
Key points to cover: ${params.keyPoints.join(', ')}
Compliance requirements: ${params.complianceRequirements?.join(', ') ?? 'None specified'}

Generate a branching call script with:
- A greeting node
- Key discussion point nodes
- Decision branch nodes (e.g., "interested" vs "not interested")
- Objection handling nodes
- Closing/wrap-up node
- Each node has: id (unique string), type (GREETING, QUESTION, STATEMENT, BRANCH, OBJECTION_HANDLER, CLOSING), content (what to say), branches (array of {condition, targetNodeId})`, {
    maxTokens: 2048,
    temperature: 0.6,
    system: 'You are a professional call script writer. Create natural, conversational scripts that achieve their purpose while maintaining compliance.',
  });

  return {
    entityId,
    name: result.name,
    description: result.description,
    nodes: result.nodes,
    startNodeId: result.startNodeId,
    status: 'DRAFT',
  };
}
```

c. **Add AI-powered script optimization**:
```typescript
export async function optimizeScript(
  scriptId: string,
  performanceData: { completionRate: number; avgDuration: number; conversionRate: number; commonDropoffPoints: string[] }
): Promise<string[]> {
  // Fetch the script, send it with performance data to generateJSON
  // Return array of optimization suggestions
}
```

### 7. VoiceForge Persona Service -- Wire AI (`src/modules/voiceforge/services/persona-service.ts`)

**Read the file first** to understand persona management.

#### Modifications:

- If there is voice style selection or persona matching, wire `generateJSON` to select optimal voice characteristics based on campaign context and target audience
- If persona creation includes personality traits, use `generateJSON` to suggest traits based on brand description
- Wrap in try/catch with fallback

### 8. VoiceForge Campaign Service -- Wire AI (`src/modules/voiceforge/services/campaign-service.ts`)

**Read the file first** to understand campaign management.

#### Modifications:

- If there is call script optimization per campaign, wire AI for A/B script variant generation
- If there are campaign performance methods, add AI analysis for pattern detection
- Wrap in try/catch with fallback

### 9. Voice Command Parser -- Wire AI (`src/modules/voice/services/command-parser.ts`)

**Read the file first** -- it uses regex patterns for entity extraction and command matching.

#### Specific modifications:

a. **Add import**:
```typescript
import { generateJSON } from '@/lib/ai';
```

b. **Add AI-powered intent parsing**:
```typescript
async function parseIntentWithAI(
  transcript: string
): Promise<{
  intent: VoiceIntent;
  entities: ExtractedEntity[];
  confidence: number;
  action?: string;
}> {
  return generateJSON(`Parse this voice command transcript into a structured command.

Transcript: "${transcript}"

Return JSON with:
- intent: the user's intent (CREATE_TASK, SEND_MESSAGE, SCHEDULE_EVENT, SET_REMINDER, SEARCH, NAVIGATE, UPDATE_STATUS, DELETE, MAKE_CALL, DICTATE_NOTE, or ASK_QUESTION)
- entities: array of extracted entities, each with {type, value, originalText} where type is one of: PERSON, DATE, TIME, DURATION, MONEY, PRIORITY, PROJECT, LOCATION, PHONE_NUMBER, EMAIL, STATUS
- confidence: 0.0-1.0
- action: specific action string if identifiable (e.g., "call John at 3pm")`, {
    maxTokens: 512,
    temperature: 0.2,
    system: 'You are a voice command interpreter. Parse spoken language into structured commands. Be precise with entity extraction.',
  });
}
```

c. **Modify `parseVoiceCommand`** to use AI with fallback:
- Try AI parsing first
- If AI fails or confidence is below 0.5, fall back to regex-based parsing
- Merge AI-extracted entities with regex-extracted entities (union, prefer AI for conflicts)

d. **Keep all existing regex patterns** intact as fallback.

### 10. Voice STT Service -- Wire AI (`src/modules/voice/services/stt-service.ts`)

**Read the file first** to understand current transcription.

#### Modifications:

- If there is post-processing of transcription text, add AI enhancement:
  - Use `generateText` for grammar correction and punctuation
  - Use `generateJSON` for speaker diarization hints
- If purely a client wrapper for a third-party STT API, add error correction:
  - Pass raw transcription through AI for domain-specific correction
- Wrap in try/catch; return raw transcription on failure

### 11. Capture Services -- Wire AI

**Read each file first** to determine AI integration points.

#### `capture-service.ts`:
- If captures are processed/categorized, wire AI for auto-classification
- Use `generateJSON` to classify captured content (note, task, event, contact, receipt, etc.)

#### `ocr-service.ts`:
- If OCR output is post-processed, wire `generateText` for AI-enhanced text extraction
- Use AI to structure OCR output (e.g., extract fields from receipts, business cards)

#### `routing-service.ts`:
- If routing decisions are rule-based, add AI routing:
  - Use `generateJSON` to determine where a capture should be routed (inbox, tasks, calendar, knowledge, finance)
  - Include capture content, classification, and user preferences in the prompt

### 12. Apply Auth to All API Routes

Wrap every route handler in the owned API paths with `withAuth()`.

#### Pattern:

```typescript
import { withAuth } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      // Use session.userId, session.activeEntityId
    } catch (err) { /* ... */ }
  });
}
```

#### Routes to wrap:

**`src/app/api/execution/`** -- All route files including subdirectories (costs, gates, queue, rollback, runbooks, simulate, timeline). Use `withAuth` for all handlers. Use `withRole(['admin', 'operator'])` for destructive operations (rollback, queue management).

**`src/app/api/voice/`** -- All route files including subdirectories (calls, campaigns, numbers, persona, scripts). Use `withAuth` for all handlers.

**`src/app/api/capture/`** -- All route files including subdirectories ([id], batch, metrics, process, rules). Use `withAuth` for all handlers.

Note: There is no `src/app/api/security/` directory (security is managed through `src/app/api/admin/`). There is no `src/app/api/voiceforge/` directory (voiceforge routes are under `src/app/api/voice/`). Do NOT create new API route directories.

Enumerate all route files in the owned API directories by reading their contents first, then apply the auth wrapping pattern.

## Acceptance Criteria

1. `simulation-engine.ts` calls `generateJSON` for AI-powered side effect prediction alongside rule-based simulation.
2. `simulation-engine.ts` falls back to rule-based results only if AI fails.
3. `runbook-service.ts` uses AI for step generation/validation (if applicable methods exist).
4. `classification-service.ts` uses AI for contextual classification of ambiguous content while keeping regex-based PII/PHI detection intact.
5. `classification-service.ts` never downgrades a regex-based classification -- AI can only escalate.
6. `redaction-service.ts` uses AI for contextual entity redaction alongside pattern-based redaction.
7. `audit-service.ts` has AI-powered anomaly detection for audit trail analysis.
8. `script-engine.ts` has `generateScriptWithAI` for AI-powered call script generation.
9. `command-parser.ts` calls `generateJSON` for AI-powered voice command intent parsing with regex fallback.
10. Capture services use AI for classification, OCR enhancement, and routing.
11. All route handlers in `src/app/api/execution/`, `src/app/api/voice/`, `src/app/api/capture/` are wrapped with `withAuth()`.
12. No uses of `getCurrentUserId()` stubs remain in wrapped routes.
13. `jest.config.ts` and `package.json` are NOT modified.
14. All existing tests still pass (update mocks if needed).

## Implementation Steps

1. **Read all context files** listed above. Pay special attention to current implementation patterns, TODO comments, and placeholder annotations in every service file.
2. **Create branch**: `git checkout -b ai-feature/p2-w15-wire-exec-security`
3. **Modify `simulation-engine.ts`**: Add AI import, create `predictSideEffectsWithAI`, integrate into simulation flow.
4. **Read and modify `runbook-service.ts`**: Wire AI for step generation/validation.
5. **Modify `classification-service.ts`**: Add AI import, create `classifyAmbiguousContent`, integrate after regex classification.
6. **Read and modify `redaction-service.ts`**: Wire AI for contextual redaction.
7. **Read and modify `audit-service.ts`**: Wire AI for anomaly detection.
8. **Modify `script-engine.ts`**: Add AI imports, create `generateScriptWithAI` and `optimizeScript`.
9. **Read and modify `persona-service.ts`**: Wire AI for persona matching/generation.
10. **Read and modify `campaign-service.ts`**: Wire AI for script optimization.
11. **Modify `command-parser.ts`**: Add AI import, create `parseIntentWithAI`, update main parser.
12. **Read and modify `stt-service.ts`**: Wire AI for transcription enhancement.
13. **Read and modify capture services**: Wire AI into classification, OCR, and routing.
14. **Wrap execution API routes**: Add `withAuth` to all handlers in `src/app/api/execution/`.
15. **Wrap voice API routes**: Add `withAuth` to all handlers in `src/app/api/voice/`.
16. **Wrap capture API routes**: Add `withAuth` to all handlers in `src/app/api/capture/`.
17. **Update tests**: Update mocks in all relevant test directories.
18. **Type-check**: `npx tsc --noEmit`
19. **Run tests**: `npx jest tests/unit/execution/ tests/unit/security/ tests/unit/voiceforge/ tests/unit/voice/ tests/unit/capture/`
20. **Commit** with conventional commits.

## Tests Required

Update existing test files to mock the AI client:

### In `tests/unit/execution/` (update existing)
```typescript
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
  generateText: jest.fn(),
}));

describe('Simulation Engine with AI', () => {
  it('should call generateJSON for side effect prediction');
  it('should merge AI effects with rule-based effects');
  it('should proceed with rule-based results only when AI fails');
  it('should include AI risk assessment in result');
});

describe('Runbook Service with AI', () => {
  it('should use AI for step suggestions (if applicable)');
  it('should fall back to existing logic on AI failure');
});
```

### In `tests/unit/security/` (update existing)
```typescript
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

describe('Classification Service with AI', () => {
  it('should run regex classification first');
  it('should call AI only for INTERNAL/PUBLIC regex results');
  it('should NOT call AI for RESTRICTED/REGULATED regex results');
  it('should only escalate classification, never downgrade');
  it('should require AI confidence > 0.7 to escalate');
  it('should handle AI failure gracefully');
});

describe('Audit Service with AI', () => {
  it('should analyze audit trail for anomalies');
  it('should return structured anomaly alerts');
  it('should handle AI failure with empty result');
});
```

### In `tests/unit/voiceforge/` (update existing)
```typescript
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
  generateText: jest.fn(),
}));

describe('generateScriptWithAI', () => {
  it('should call generateJSON with script parameters');
  it('should return a valid CallScript structure');
  it('should include branching nodes in generated script');
  it('should respect compliance requirements in prompts');
});

describe('optimizeScript', () => {
  it('should analyze performance data and suggest improvements');
});
```

### In `tests/unit/voice/` (update existing)
```typescript
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

describe('Voice Command Parser with AI', () => {
  it('should call generateJSON for intent parsing');
  it('should extract entities from AI response');
  it('should fall back to regex parsing when AI fails');
  it('should fall back to regex parsing when AI confidence is low');
  it('should handle "Call John at 3pm" correctly via AI');
  it('should handle "Create a task for tomorrow" correctly via AI');
  it('should merge AI and regex entities preferring AI on conflict');
});
```

### In `tests/unit/capture/` (update existing)
```typescript
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
  generateText: jest.fn(),
}));

describe('Capture services with AI', () => {
  it('should classify captures using AI');
  it('should enhance OCR output using AI');
  it('should route captures based on AI classification');
  it('should fall back to rule-based routing on AI failure');
});
```

## Commit Strategy

Make atomic commits in this order:

1. `feat(execution): wire AI side effect prediction into simulation engine`
   - Files: `src/modules/execution/services/simulation-engine.ts`
2. `feat(execution): wire AI into runbook step generation`
   - Files: `src/modules/execution/services/runbook-service.ts`
3. `feat(security): wire AI contextual classification for ambiguous content`
   - Files: `src/modules/security/services/classification-service.ts`
4. `feat(security): wire AI contextual redaction and audit anomaly detection`
   - Files: `src/modules/security/services/redaction-service.ts`, `audit-service.ts`
5. `feat(voiceforge): add AI-powered script generation and optimization`
   - Files: `src/modules/voiceforge/services/script-engine.ts`, `persona-service.ts`, `campaign-service.ts`
6. `feat(voice): wire AI intent parsing into voice command parser`
   - Files: `src/modules/voice/services/command-parser.ts`, `stt-service.ts`
7. `feat(capture): wire AI into capture classification, OCR enhancement, and routing`
   - Files: `src/modules/capture/services/capture-service.ts`, `ocr-service.ts`, `routing-service.ts`
8. `feat(execution): apply withAuth to all execution API route handlers`
   - Files: All `route.ts` in `src/app/api/execution/`
9. `feat(voice): apply withAuth to all voice API route handlers`
   - Files: All `route.ts` in `src/app/api/voice/`
10. `feat(capture): apply withAuth to all capture API route handlers`
    - Files: All `route.ts` in `src/app/api/capture/`
11. `test(execution): update simulation and runbook tests with AI mocks`
    - Files: `tests/unit/execution/`
12. `test(security): update classification and audit tests with AI mocks`
    - Files: `tests/unit/security/`
13. `test(voiceforge): update script engine tests with AI mocks`
    - Files: `tests/unit/voiceforge/`
14. `test(voice): update command parser tests with AI mocks`
    - Files: `tests/unit/voice/`
15. `test(capture): update capture service tests with AI mocks`
    - Files: `tests/unit/capture/`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
