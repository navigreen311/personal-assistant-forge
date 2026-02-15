# Worker 10: VoiceForge AI Engine (VF)

## Branch: ai-feature/w10-voiceforge

## Owned Paths (ONLY modify these)

You MUST only create or modify files within these directories. Do NOT touch anything outside them.

```
src/modules/voiceforge/services/           # Business logic services
src/modules/voiceforge/types/              # Module-specific TypeScript types
src/modules/voiceforge/components/         # React components for VoiceForge UI
src/modules/voiceforge/api/               # Module-internal API helpers / validation
src/app/api/voice/                         # Next.js API routes for voice operations
src/app/(dashboard)/voiceforge/            # Dashboard pages for VoiceForge
src/lib/voice/                             # Low-level voice infrastructure utilities
tests/unit/voiceforge/                     # All unit tests for this worker
```

## Context (read these first, do NOT modify)

Read and internalize these files before writing any code. They define the shared contracts.

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project-wide dev process, commit conventions, done criteria |
| `src/shared/types/index.ts` | Immutable shared types: `Call`, `CallDirection`, `CallOutcome`, `Entity`, `Contact`, `ConsentStatus`, `ConsentReceipt`, `ActionLog`, `ApiResponse`, `ApiError`, `ApiMeta` |
| `prisma/schema.prisma` | Database schema: `Call` model (id, entityId, contactId, direction, personaId, scriptId, outcome, transcript, recordingUrl, sentiment, duration, actionItems), `ConsentReceipt`, `Entity`, `Contact` |
| `src/shared/utils/api-response.ts` | API helpers: `success<T>()`, `error()`, `paginated<T>()` |
| `src/lib/db/index.ts` | Prisma client singleton: `import { prisma } from '@/lib/db'` |
| `package.json` | Stack: Next.js 16, React 19, Prisma 7, Zod 4, date-fns 4, Jest 30, ts-jest |
| `tsconfig.json` | Path aliases: `@/` maps to `src/` |

## Requirements

### 1. Voice Infrastructure Utilities

**File:** `src/lib/voice/types.ts`

```typescript
export interface VoiceProvider {
  name: string;
  provisionNumber(areaCode: string): Promise<ProvisionedNumber>;
  releaseNumber(phoneNumber: string): Promise<void>;
  initiateCall(config: OutboundCallConfig): Promise<CallSession>;
  getCallStatus(callSid: string): Promise<CallStatus>;
}

export interface ProvisionedNumber {
  phoneNumber: string;
  sid: string;
  region: string;
  capabilities: ('VOICE' | 'SMS' | 'MMS')[];
  monthlyRate: number;
  provisionedAt: Date;
}

export interface OutboundCallConfig {
  from: string;
  to: string;
  personaId: string;
  scriptId?: string;
  maxDuration: number;           // seconds
  recordCall: boolean;
  consentRequired: boolean;
}

export interface CallSession {
  callSid: string;
  status: CallStatus;
  startedAt: Date;
}

export type CallStatus = 'QUEUED' | 'RINGING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'NO_ANSWER' | 'BUSY' | 'CANCELLED';
```

**File:** `src/lib/voice/mock-provider.ts`

Implement a mock voice provider for development/testing:
- `MockVoiceProvider` class implementing `VoiceProvider` interface
- All methods return realistic mock data with configurable delays
- `provisionNumber` generates fake phone numbers in format `+1XXXXXXXXXX`
- `initiateCall` returns a mock CallSession with a UUID as callSid
- `getCallStatus` returns configurable status

**File:** `src/lib/voice/consent-manager.ts`

```typescript
export interface ConsentCheck {
  allowed: boolean;
  reason: string;
  consentType: 'ONE_PARTY' | 'TWO_PARTY' | 'UNKNOWN';
  jurisdiction: string;
  recordingAllowed: boolean;
}
```

Implement:
- `checkConsentRequirements(callerState: string, recipientState: string): ConsentCheck` -- Determines one-party vs two-party consent based on US state laws (hardcode the 12 two-party consent states: CA, CT, FL, IL, MD, MA, MI, MT, NV, NH, PA, WA)
- `recordConsent(callId: string, contactId: string, consentType: string): Promise<ConsentReceipt>` -- Store consent receipt in DB
- `verifyConsent(callId: string): Promise<{ valid: boolean; receipt: ConsentReceipt | null }>`
- `revokeConsent(receiptId: string): Promise<void>`

### 2. Outbound Voice Agent Service

**Service file:** `src/modules/voiceforge/services/outbound-agent.ts`

```typescript
export interface OutboundCallRequest {
  entityId: string;
  contactId: string;
  personaId: string;
  scriptId?: string;
  purpose: string;
  maxDuration?: number;          // seconds, default 300
  recordCall?: boolean;          // default true
  guardrails: CallGuardrails;
}

export interface CallGuardrails {
  maxCommitments: number;        // Max promises the AI can make
  forbiddenTopics: string[];
  escalationTriggers: string[];  // Words/phrases that trigger human handoff
  complianceProfile: string[];   // HIPAA, GDPR, etc.
  maxSilenceSeconds: number;     // Hang up after N seconds silence
}

export interface OutboundCallResult {
  callId: string;
  outcome: CallOutcome;
  duration: number;
  voicemailDropped: boolean;
  commitmentsMade: string[];
  actionItems: string[];
  nextSteps: string[];
  sentiment: number;             // -1 to 1
  escalated: boolean;
  escalationReason?: string;
}
```

Implement:
- `initiateOutboundCall(request: OutboundCallRequest): Promise<OutboundCallResult>` -- Orchestrate: check consent, get persona, load script, initiate call via provider, log outcome
- `detectVoicemail(callSid: string): Promise<boolean>` -- Placeholder: returns false (real implementation would use audio analysis)
- `dropVoicemail(callSid: string, personaId: string, message: string): Promise<void>` -- Placeholder for voicemail drop
- `checkGuardrails(transcript: string, guardrails: CallGuardrails): GuardrailCheckResult` -- Scan for forbidden topics and escalation triggers

```typescript
export interface GuardrailCheckResult {
  passed: boolean;
  violations: { rule: string; excerpt: string; severity: 'WARNING' | 'BLOCK' }[];
  shouldEscalate: boolean;
  escalationReason?: string;
}
```

### 3. Inbound Voice Agent Service

**Service file:** `src/modules/voiceforge/services/inbound-agent.ts`

```typescript
export interface InboundConfig {
  entityId: string;
  phoneNumber: string;
  greeting: string;
  personaId: string;
  routingRules: RoutingRule[];
  afterHoursConfig: AfterHoursConfig;
  spamFilterEnabled: boolean;
  vipContactIds: string[];
}

export interface RoutingRule {
  id: string;
  condition: string;             // "department=sales", "intent=support", "vip=true"
  destination: string;           // Phone number, voicemail, or "AI_HANDLE"
  priority: number;
}

export interface AfterHoursConfig {
  enabled: boolean;
  message: string;
  businessHours: { day: number; start: string; end: string }[];
  voicemailEnabled: boolean;
  urgentEscalationNumber?: string;
}

export interface InboundCallResult {
  callId: string;
  callerNumber: string;
  callerContactId?: string;      // Matched contact or null
  isSpam: boolean;
  isVIP: boolean;
  routedTo: string;
  intakeData?: Record<string, string>;  // Form data collected
  afterHours: boolean;
  duration: number;
}
```

Implement:
- `handleInboundCall(phoneNumber: string, callerNumber: string): Promise<InboundCallResult>` -- Lookup config, screen caller, route intelligently
- `screenCaller(callerNumber: string, entityId: string): Promise<{ isSpam: boolean; isVIP: boolean; contact: Contact | null }>` -- Match against contacts, check VIP list, basic spam detection (placeholder)
- `routeCall(config: InboundConfig, callerInfo: { isVIP: boolean; isSpam: boolean; intent?: string }): string` -- Apply routing rules by priority
- `isAfterHours(config: AfterHoursConfig): boolean` -- Check current time against business hours
- `collectIntakeForm(fields: string[]): Promise<Record<string, string>>` -- Placeholder: returns empty record

### 4. Call Scripting Engine

**Service file:** `src/modules/voiceforge/services/script-engine.ts`

```typescript
export interface CallScript {
  id: string;
  entityId: string;
  name: string;
  description: string;
  nodes: ScriptNode[];
  startNodeId: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  createdAt: Date;
  updatedAt: Date;
}

export interface ScriptNode {
  id: string;
  type: 'SPEAK' | 'LISTEN' | 'BRANCH' | 'TRANSFER' | 'END' | 'COLLECT_INFO';
  content: string;               // What to say, or prompt for listening
  branches: ScriptBranch[];
  escalationTrigger?: boolean;
  collectField?: string;         // Field name if type=COLLECT_INFO
  nextNodeId?: string;           // Default next node
  metadata?: Record<string, unknown>;
}

export interface ScriptBranch {
  condition: string;             // "intent=interested", "sentiment<-0.5", "keyword=cancel"
  targetNodeId: string;
  label: string;
}

export interface ScriptExecution {
  scriptId: string;
  callId: string;
  currentNodeId: string;
  visitedNodes: string[];
  collectedData: Record<string, string>;
  startedAt: Date;
}
```

Implement:
- `createScript(data: Omit<CallScript, 'id' | 'version' | 'createdAt' | 'updatedAt'>): Promise<CallScript>`
- `getScript(id: string): Promise<CallScript | null>`
- `listScripts(entityId: string): Promise<CallScript[]>`
- `startExecution(scriptId: string, callId: string): Promise<ScriptExecution>` -- Initialize at startNodeId
- `advanceNode(execution: ScriptExecution, input: string): ScriptExecution` -- Evaluate branches, move to next node
- `evaluateBranch(branch: ScriptBranch, input: string, context: Record<string, string>): boolean` -- Simple keyword/condition matching
- `validateScript(script: CallScript): { valid: boolean; errors: string[] }` -- Check for unreachable nodes, missing startNodeId, cycles

### 5. Persona Library

**Service file:** `src/modules/voiceforge/services/persona-service.ts`

```typescript
export interface VoicePersona {
  id: string;
  entityId: string;
  name: string;
  description: string;
  voiceConfig: VoiceConfig;
  personality: PersonalityConfig;
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  consentChain: ConsentChainEntry[];
  createdAt: Date;
  updatedAt: Date;
}

export interface VoiceConfig {
  provider: string;              // e.g., "elevenlabs", "openai", "mock"
  voiceId: string;
  speed: number;                 // 0.5 - 2.0
  pitch: number;                 // 0.5 - 2.0
  language: string;
  accent?: string;
}

export interface PersonalityConfig {
  defaultTone: string;
  formality: number;             // 0-10
  empathy: number;               // 0-10
  assertiveness: number;         // 0-10
  humor: number;                 // 0-10
  vocabulary: 'SIMPLE' | 'MODERATE' | 'ADVANCED';
}

export interface ConsentChainEntry {
  id: string;
  grantedBy: string;            // Who authorized this voice clone
  grantedAt: Date;
  scope: string;                 // What the consent covers
  status: ConsentStatus;
  revokedAt?: Date;
  watermarkId?: string;          // Audio watermark identifier
}
```

Implement:
- `createPersona(data: Omit<VoicePersona, 'id' | 'createdAt' | 'updatedAt'>): Promise<VoicePersona>`
- `getPersona(id: string): Promise<VoicePersona | null>`
- `listPersonas(entityId: string): Promise<VoicePersona[]>`
- `updatePersona(id: string, data: Partial<VoicePersona>): Promise<VoicePersona>`
- `addConsentEntry(personaId: string, entry: Omit<ConsentChainEntry, 'id'>): Promise<ConsentChainEntry>`
- `revokeConsent(personaId: string, entryId: string): Promise<void>` -- Set status to REVOKED, mark revokedAt
- `validateConsentChain(personaId: string): Promise<{ valid: boolean; issues: string[] }>` -- Check all entries are GRANTED, not expired
- `generateWatermarkId(): string` -- UUID-based watermark for audio tracking

### 6. Conversational Intelligence Service

**Service file:** `src/modules/voiceforge/services/conversational-intel.ts`

```typescript
export interface TranscriptSegment {
  speaker: 'AGENT' | 'CALLER';
  text: string;
  startTime: number;             // seconds
  endTime: number;
  sentiment: number;             // -1 to 1
  confidence: number;            // 0-1
}

export interface CallAnalysis {
  callId: string;
  transcript: TranscriptSegment[];
  overallSentiment: number;
  sentimentTimeline: { time: number; sentiment: number }[];
  keyInfoExtracted: ExtractedInfo[];
  complianceIssues: ComplianceIssue[];
  summary: CallSummary;
  talkRatio: { agent: number; caller: number };  // percentages
}

export interface ExtractedInfo {
  type: 'NAME' | 'EMAIL' | 'PHONE' | 'ADDRESS' | 'DATE' | 'AMOUNT' | 'DECISION' | 'ACTION_ITEM';
  value: string;
  confidence: number;
  segmentIndex: number;
}

export interface ComplianceIssue {
  type: string;
  description: string;
  severity: 'INFO' | 'WARNING' | 'VIOLATION';
  segmentIndex: number;
  excerpt: string;
}

export interface CallSummary {
  oneLineSummary: string;
  keyPoints: string[];
  actionItems: string[];
  followUpNeeded: boolean;
  followUpReason?: string;
  nextSteps: string[];
}
```

Implement:
- `analyzeCall(callId: string, segments: TranscriptSegment[]): Promise<CallAnalysis>` -- Full analysis pipeline
- `calculateSentiment(text: string): number` -- Placeholder: basic positive/negative word counting returning -1 to 1
- `extractKeyInfo(segments: TranscriptSegment[]): ExtractedInfo[]` -- Regex-based extraction of emails, phone numbers, dates, dollar amounts
- `checkCompliance(segments: TranscriptSegment[], profile: string[]): ComplianceIssue[]` -- Check for compliance keywords per profile
- `generateSummary(segments: TranscriptSegment[], extractedInfo: ExtractedInfo[]): CallSummary` -- Create structured summary
- `calculateTalkRatio(segments: TranscriptSegment[]): { agent: number; caller: number }` -- Duration-based talk ratio

### 7. Campaign Management

**Service file:** `src/modules/voiceforge/services/campaign-service.ts`

```typescript
export interface Campaign {
  id: string;
  entityId: string;
  name: string;
  description: string;
  personaId: string;
  scriptId: string;
  targetContactIds: string[];
  schedule: CampaignSchedule;
  stopConditions: StopCondition[];
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'STOPPED';
  stats: CampaignStats;
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignSchedule {
  startDate: Date;
  endDate?: Date;
  callWindowStart: string;       // "09:00"
  callWindowEnd: string;         // "17:00"
  timezone: string;
  maxCallsPerDay: number;
  retryAttempts: number;
  retryDelayHours: number;
}

export interface StopCondition {
  type: 'MAX_CALLS' | 'MAX_CONNECTS' | 'DATE' | 'CONVERSION_TARGET' | 'NEGATIVE_SENTIMENT';
  threshold: number | string;
}

export interface CampaignStats {
  totalTargeted: number;
  totalCalled: number;
  totalConnected: number;
  totalVoicemail: number;
  totalNoAnswer: number;
  totalInterested: number;
  totalNotInterested: number;
  averageSentiment: number;
  averageDuration: number;
  conversionRate: number;
}
```

Implement:
- `createCampaign(data: Omit<Campaign, 'id' | 'stats' | 'createdAt' | 'updatedAt'>): Promise<Campaign>`
- `getCampaign(id: string): Promise<Campaign | null>`
- `listCampaigns(entityId: string): Promise<Campaign[]>`
- `startCampaign(id: string): Promise<Campaign>` -- Set status to ACTIVE
- `pauseCampaign(id: string): Promise<Campaign>` -- Set status to PAUSED
- `stopCampaign(id: string): Promise<Campaign>` -- Set status to STOPPED
- `updateStats(id: string, callResult: OutboundCallResult): Promise<CampaignStats>` -- Increment appropriate counters
- `checkStopConditions(campaign: Campaign): { shouldStop: boolean; reason: string | null }` -- Evaluate all stop conditions
- `getNextContacts(campaignId: string, limit: number): Promise<string[]>` -- Return contact IDs not yet called

### 8. Number Management Service

**Service file:** `src/modules/voiceforge/services/number-manager.ts`

```typescript
export interface ManagedNumber {
  id: string;
  entityId: string;
  phoneNumber: string;
  label: string;                 // "Main Office", "Sales Line", etc.
  provider: string;
  capabilities: ('VOICE' | 'SMS' | 'MMS')[];
  status: 'ACTIVE' | 'SUSPENDED' | 'RELEASED';
  monthlyRate: number;
  assignedPersonaId?: string;
  inboundConfigId?: string;
  provisionedAt: Date;
}
```

Implement:
- `provisionNumber(entityId: string, areaCode: string, label: string): Promise<ManagedNumber>` -- Provision via provider, store record
- `releaseNumber(numberId: string): Promise<void>` -- Release via provider, update status
- `listNumbers(entityId: string): Promise<ManagedNumber[]>`
- `assignPersona(numberId: string, personaId: string): Promise<ManagedNumber>`
- `assignInboundConfig(numberId: string, configId: string): Promise<ManagedNumber>`

### 9. API Routes

Create these Next.js API route handlers matching the blueprint:

| Route File | Method | Path | Purpose |
|------------|--------|------|---------|
| `src/app/api/voice/calls/outbound/route.ts` | POST | `/api/voice/calls/outbound` | Initiate outbound call |
| `src/app/api/voice/calls/inbound/config/route.ts` | GET | `/api/voice/calls/inbound/config` | Get inbound config for a number |
| `src/app/api/voice/calls/inbound/config/route.ts` | POST | `/api/voice/calls/inbound/config` | Set inbound config |
| `src/app/api/voice/calls/[id]/route.ts` | GET | `/api/voice/calls/:id` | Get call details |
| `src/app/api/voice/calls/[id]/transcript/route.ts` | GET | `/api/voice/calls/:id/transcript` | Get call transcript |
| `src/app/api/voice/calls/[id]/summary/route.ts` | GET | `/api/voice/calls/:id/summary` | Get call summary/analysis |
| `src/app/api/voice/campaigns/route.ts` | GET | `/api/voice/campaigns` | List campaigns |
| `src/app/api/voice/campaigns/route.ts` | POST | `/api/voice/campaigns` | Create campaign |
| `src/app/api/voice/campaigns/[id]/route.ts` | GET | `/api/voice/campaigns/:id` | Get campaign with stats |
| `src/app/api/voice/campaigns/[id]/route.ts` | PUT | `/api/voice/campaigns/:id` | Update campaign (start/pause/stop) |
| `src/app/api/voice/numbers/route.ts` | GET | `/api/voice/numbers` | List managed numbers |
| `src/app/api/voice/numbers/provision/route.ts` | POST | `/api/voice/numbers/provision` | Provision new number |
| `src/app/api/voice/numbers/[id]/route.ts` | DELETE | `/api/voice/numbers/:id` | Release number |
| `src/app/api/voice/persona/route.ts` | GET | `/api/voice/persona` | List personas |
| `src/app/api/voice/persona/route.ts` | POST | `/api/voice/persona` | Create persona |
| `src/app/api/voice/persona/[id]/route.ts` | GET | `/api/voice/persona/:id` | Get persona with consent chain |
| `src/app/api/voice/persona/[id]/route.ts` | PUT | `/api/voice/persona/:id` | Update persona |
| `src/app/api/voice/persona/clone/route.ts` | POST | `/api/voice/persona/clone` | Clone persona with consent |
| `src/app/api/voice/scripts/route.ts` | GET | `/api/voice/scripts` | List scripts |
| `src/app/api/voice/scripts/route.ts` | POST | `/api/voice/scripts` | Create script |
| `src/app/api/voice/scripts/[id]/route.ts` | GET | `/api/voice/scripts/:id` | Get script |
| `src/app/api/voice/scripts/[id]/route.ts` | PUT | `/api/voice/scripts/:id` | Update script |
| `src/app/api/voice/scripts/[id]/validate/route.ts` | POST | `/api/voice/scripts/:id/validate` | Validate script (check for errors) |

All routes MUST:
- Use Zod for request body / query parameter validation
- Use `success()`, `error()`, `paginated()` from `@/shared/utils/api-response`
- Use `prisma` from `@/lib/db`
- Wrap in try/catch returning `error('INTERNAL_ERROR', ...)` on failure
- Return proper HTTP status codes (200, 201, 400, 404, 500)

Store calls in the `Call` table. Store personas, scripts, campaigns, numbers, and inbound configs in the `Document` table with `type` discriminator or in a JSON structure within the `content` field. Use `ConsentReceipt` table for consent records.

### 10. Dashboard Pages

**VoiceForge hub page:** `src/app/(dashboard)/voiceforge/page.tsx`
- Active campaigns summary cards
- Recent calls list with outcome badges
- Number inventory quick view
- Persona gallery

**Call management page:** `src/app/(dashboard)/voiceforge/calls/page.tsx`
- Call history table with columns: Date, Direction, Contact, Duration, Outcome, Sentiment
- Filter by direction, outcome, date range
- Click to view transcript and analysis

**Script builder page:** `src/app/(dashboard)/voiceforge/scripts/page.tsx`
- Script list with status badges
- Script flow editor: visual node list with branch indicators
- "New Script" form with node builder
- Script validation results panel

**Campaign management page:** `src/app/(dashboard)/voiceforge/campaigns/page.tsx`
- Campaign list with status and stats
- Campaign detail view with progress (contacted/total)
- Start/Pause/Stop controls
- Stats dashboard: connection rate, sentiment, conversion

**Persona management page:** `src/app/(dashboard)/voiceforge/personas/page.tsx`
- Persona cards with voice config details
- Consent chain timeline view
- "Create Persona" form

**Components to create in `src/modules/voiceforge/components/`:**
- `CampaignCard.tsx` -- Campaign summary with stats
- `CampaignStatsPanel.tsx` -- Detailed campaign statistics
- `CampaignControls.tsx` -- Start/Pause/Stop buttons
- `CallHistoryTable.tsx` -- Sortable call list
- `CallDetailPanel.tsx` -- Full call details with transcript
- `TranscriptView.tsx` -- Speaker-labeled transcript display
- `SentimentTimeline.tsx` -- Sentiment over time visualization
- `ScriptNodeList.tsx` -- Visual script flow
- `ScriptNodeEditor.tsx` -- Edit single script node
- `ScriptBranchEditor.tsx` -- Edit branch conditions
- `ScriptValidationPanel.tsx` -- Validation results display
- `PersonaCard.tsx` -- Persona display card
- `PersonaForm.tsx` -- Create/edit persona form
- `ConsentChainTimeline.tsx` -- Visual consent history
- `NumberInventory.tsx` -- Phone number list with status
- `OutboundCallForm.tsx` -- Initiate outbound call form
- `InboundConfigForm.tsx` -- Configure inbound settings
- `GuardrailsEditor.tsx` -- Edit call guardrails
- `OutcomeBadge.tsx` -- Color-coded call outcome badge

All components must be client components (`'use client'`) using Tailwind CSS. No external UI libraries.

## Acceptance Criteria

- [ ] Mock voice provider returns realistic data and implements VoiceProvider interface
- [ ] Consent manager correctly identifies 12 two-party consent states
- [ ] Consent chain validation catches REVOKED and EXPIRED entries
- [ ] Outbound agent checks consent before initiating calls
- [ ] Guardrail checker detects forbidden topics and escalation triggers
- [ ] Inbound agent correctly routes VIP, spam, and after-hours calls
- [ ] Script validator detects unreachable nodes and missing start node
- [ ] Script execution correctly advances through branching logic
- [ ] Conversational intelligence extracts emails, phone numbers, dates, and amounts via regex
- [ ] Talk ratio calculation uses duration-based math (not segment count)
- [ ] Campaign stop conditions correctly evaluate all condition types
- [ ] Campaign stats correctly increment on call results
- [ ] All 23 API routes return correct `ApiResponse<T>` shapes
- [ ] Zod validation rejects malformed requests
- [ ] Dashboard pages render without errors
- [ ] All unit tests pass with `npx jest tests/unit/voiceforge/`
- [ ] No imports from other worker-owned paths

## Implementation Steps

1. **Read context files** -- `src/shared/types/index.ts`, `prisma/schema.prisma`, `src/shared/utils/api-response.ts`, `src/lib/db/index.ts`
2. **Create types** -- `src/modules/voiceforge/types/index.ts` with all module-specific interfaces
3. **Build voice infrastructure** (in `src/lib/voice/`):
   a. `types.ts` (interfaces for VoiceProvider, ProvisionedNumber, etc.)
   b. `mock-provider.ts` (MockVoiceProvider implementing VoiceProvider)
   c. `consent-manager.ts` (consent checking, recording, revocation)
4. **Build core services** (in order):
   a. `persona-service.ts` (CRUD + consent chain)
   b. `script-engine.ts` (CRUD + execution + validation)
   c. `number-manager.ts` (provision/release/assign)
   d. `outbound-agent.ts` (depends on persona, script, consent, provider)
   e. `inbound-agent.ts` (depends on persona, number-manager)
   f. `conversational-intel.ts` (transcript analysis, no external deps)
   g. `campaign-service.ts` (depends on outbound-agent)
5. **Build API routes** -- All 23 route files with Zod schemas
6. **Build components** -- All 19 React components
7. **Build dashboard pages** -- Hub, calls, scripts, campaigns, personas pages
8. **Write tests** -- Unit tests for all services
9. **Verify** -- `npx tsc --noEmit`, `npx jest tests/unit/voiceforge/`, `npx next build`

## Tests

Create these test files in `tests/unit/voiceforge/`:

| Test File | What It Tests |
|-----------|---------------|
| `consent-manager.test.ts` | Two-party state detection (CA, FL, IL, etc.), one-party default, consent recording and verification, revocation flow |
| `outbound-agent.test.ts` | Consent check before call, guardrail violation detection, voicemail detection placeholder, call result logging |
| `inbound-agent.test.ts` | VIP detection, spam filtering, after-hours routing, routing rule priority order |
| `script-engine.test.ts` | Script validation (unreachable nodes, missing start), execution advancement, branch condition evaluation, COLLECT_INFO node handling |
| `persona-service.test.ts` | CRUD operations, consent chain validation (all GRANTED = valid, any REVOKED = invalid), watermark ID generation |
| `conversational-intel.test.ts` | Email regex extraction, phone regex extraction, date extraction, dollar amount extraction, talk ratio calculation, sentiment placeholder |
| `campaign-service.test.ts` | Stats incrementing (connect, voicemail, no-answer), stop condition evaluation (MAX_CALLS, CONVERSION_TARGET, NEGATIVE_SENTIMENT), next contacts selection |
| `number-manager.test.ts` | Provision flow, release flow, persona assignment, listing by entity |

Regex test cases for conversational intelligence:
- Email: "Send it to john@example.com please" -> extracts "john@example.com"
- Phone: "Call me at 512-555-1234" -> extracts "512-555-1234"
- Amount: "The total is $1,500.00" -> extracts "$1,500.00"
- Date: "Let's schedule for March 15, 2026" -> extracts "March 15, 2026"

Consent test cases:
- Caller in TX (one-party), recipient in TX -> recording allowed without two-party consent
- Caller in TX (one-party), recipient in CA (two-party) -> two-party consent required
- Caller in CA, recipient in CA -> two-party consent required

Each test file must:
- Mock `prisma` using `jest.mock('@/lib/db')`
- Mock voice provider using the MockVoiceProvider
- Use `describe/it` blocks with descriptive names
- Test both success and error paths
- Import types from `@/shared/types` and `@/modules/voiceforge/types`

## Commit Strategy

Use Conventional Commits. Commit after each logical unit is complete and compiling.

```
feat(voiceforge): add module-specific types and interfaces
feat(voiceforge): implement voice infrastructure types and mock provider
feat(voiceforge): implement consent manager with state law detection
feat(voiceforge): implement persona service with consent chain
feat(voiceforge): implement call scripting engine with validation
feat(voiceforge): implement number management service
feat(voiceforge): implement outbound voice agent with guardrails
feat(voiceforge): implement inbound voice agent with routing
feat(voiceforge): implement conversational intelligence service
feat(voiceforge): implement campaign management with stop conditions
feat(voiceforge): add outbound, inbound, and call API routes
feat(voiceforge): add campaign and number API routes
feat(voiceforge): add persona and script API routes
feat(voiceforge): add VoiceForge dashboard components
feat(voiceforge): add VoiceForge dashboard pages
test(voiceforge): add unit tests for all services
chore(voiceforge): verify build and final cleanup
```
