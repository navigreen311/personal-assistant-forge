# Worker 06: AI Communication Hub + CRM (M4)

## Branch: ai-feature/w06-communication

## Owned Paths (ONLY modify these)

You MUST only create or modify files within these directories. Do NOT touch anything outside them.

```
src/modules/communication/services/       # Business logic services
src/modules/communication/types/           # Module-specific TypeScript types
src/modules/communication/components/      # React components for communication UI
src/modules/communication/api/             # Module-internal API helpers / validation
src/app/api/contacts/                      # Next.js API routes for contact CRM
src/app/(dashboard)/communication/         # Dashboard pages: drafting, broadcasts
src/app/(dashboard)/contacts/              # Dashboard pages: contact profiles, CRM
tests/unit/communication/                  # All unit tests for this worker
```

## Context (read these first, do NOT modify)

Read and internalize these files before writing any code. They define the shared contracts.

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project-wide dev process, commit conventions, done criteria |
| `src/shared/types/index.ts` | Immutable shared types: `Contact`, `Commitment`, `ContactPreferences`, `Message`, `Tone`, `MessageChannel`, `Sensitivity`, `ApiResponse`, `ApiError`, `ApiMeta` |
| `prisma/schema.prisma` | Database schema: `Contact`, `Message`, `Entity` models with their fields and relations |
| `src/shared/utils/api-response.ts` | API helpers: `success<T>()`, `error()`, `paginated<T>()` -- use these in every route handler |
| `src/lib/db/index.ts` | Prisma client singleton: `import { prisma } from '@/lib/db'` |
| `package.json` | Stack: Next.js 16, React 19, Prisma 7, Zod 4, date-fns 4, Jest 30, ts-jest |
| `tsconfig.json` | Path aliases: `@/` maps to `src/` |

## Requirements

### 1. Intelligent Drafting Engine

Build a service that generates multi-variant message drafts with tone control.

**Service file:** `src/modules/communication/services/drafting-engine.ts`

```typescript
// Core interface to implement
export interface DraftRequest {
  recipientId: string;          // Contact ID
  entityId: string;             // Which entity is sending
  channel: MessageChannel;      // EMAIL, SMS, SLACK, etc.
  intent: string;               // What the message should accomplish
  tone: Tone;                   // FIRM, DIPLOMATIC, WARM, DIRECT, etc.
  context?: string;             // Additional context / background
  replyToMessageId?: string;    // If replying to an existing thread
}

export interface DraftVariant {
  id: string;
  label: string;                // e.g., "Direct Approach", "Diplomatic Approach"
  subject?: string;             // For email
  body: string;
  tone: Tone;
  wordCount: number;
  readingLevel: string;         // e.g., "Grade 8", "Professional"
  complianceFlags: string[];    // Any legal/compliance issues detected
}

export interface DraftResponse {
  variants: DraftVariant[];     // 2-3 strategic options
  recipientProfile: RecipientAnalysis;
  powerDynamicNote?: string;    // Advisory on power balance
}
```

Implement these functions:
- `generateDrafts(request: DraftRequest): Promise<DraftResponse>` -- Produces 2-3 variant drafts
- `adaptToAudience(draft: string, contact: Contact): string` -- Adjusts language based on recipient profile
- `analyzePowerDynamics(senderId: string, recipientId: string): Promise<PowerDynamicAnalysis>` -- Returns whether sender is in a position of authority, peer, or subordinate
- `scanCompliance(draft: string, complianceProfile: ComplianceProfile[]): ComplianceScanResult` -- Checks for legal/compliance issues

**Service file:** `src/modules/communication/services/tone-analyzer.ts`

```typescript
export interface ToneAnalysis {
  detectedTone: Tone;
  confidence: number;           // 0-1
  suggestions: string[];        // How to shift tone if needed
  formality: number;            // 0-10 scale
  assertiveness: number;        // 0-10 scale
  empathy: number;              // 0-10 scale
}

export function analyzeTone(text: string): ToneAnalysis;
export function shiftTone(text: string, targetTone: Tone): string;
```

### 2. Relationship Intelligence CRM

**Service file:** `src/modules/communication/services/relationship-intelligence.ts`

Implement:
- `calculateRelationshipScore(contactId: string): Promise<number>` -- Score 0-100 based on interaction frequency, recency, sentiment, commitment fulfillment
- `getRelationshipGraph(entityId: string): Promise<RelationshipNode[]>` -- Returns nodes and edges for visualization
- `detectGhosting(contactId: string): Promise<GhostingAnalysis>` -- Identifies contacts who have gone silent beyond their typical cadence
- `suggestReengagement(contactId: string): Promise<ReengagementStrategy>` -- Generates re-engagement message suggestions

**Types file:** `src/modules/communication/types/index.ts`

```typescript
export interface RelationshipNode {
  contactId: string;
  name: string;
  score: number;
  connectionStrength: 'STRONG' | 'MODERATE' | 'WEAK' | 'DORMANT';
  lastInteraction: Date | null;
  interactionCount: number;
  edges: RelationshipEdge[];
}

export interface RelationshipEdge {
  targetContactId: string;
  relationship: string;          // "colleague", "client", "vendor", etc.
  strength: number;
}

export interface GhostingAnalysis {
  isGhosting: boolean;
  daysSinceLastContact: number;
  averageCadenceDays: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  suggestedAction: string;
}

export interface ReengagementStrategy {
  approach: string;
  suggestedMessage: string;
  bestChannel: MessageChannel;
  bestTime: string;
}

export interface RecipientAnalysis {
  preferredTone: Tone;
  preferredChannel: MessageChannel;
  responseRate: number;
  averageResponseTime: string;
  topTopics: string[];
}

export interface PowerDynamicAnalysis {
  dynamic: 'AUTHORITY' | 'PEER' | 'SUBORDINATE' | 'CLIENT' | 'VENDOR';
  recommendation: string;
}

export interface ComplianceScanResult {
  passed: boolean;
  flags: ComplianceFlag[];
}

export interface ComplianceFlag {
  severity: 'WARNING' | 'ERROR';
  rule: string;
  excerpt: string;
  suggestion: string;
}

export interface FollowUpCadence {
  contactId: string;
  frequency: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY';
  nextDue: Date;
  escalationAfterMisses: number;
  isOverdue: boolean;
}

export interface BroadcastRequest {
  entityId: string;
  recipientIds: string[];
  template: string;
  mergeFields: Record<string, string>[];
  channel: MessageChannel;
  scheduledAt?: Date;
}

export interface BroadcastResult {
  totalSent: number;
  totalFailed: number;
  failures: { contactId: string; reason: string }[];
}
```

### 3. Follow-Up Cadence Engine

**Service file:** `src/modules/communication/services/cadence-engine.ts`

Implement:
- `setCadence(contactId: string, frequency: string): Promise<FollowUpCadence>` -- Set follow-up frequency for a contact
- `getOverdueFollowUps(entityId: string): Promise<FollowUpCadence[]>` -- Return all overdue follow-ups
- `escalateFollowUp(contactId: string): Promise<void>` -- Escalate after N missed follow-ups (change tone, channel, or flag for human review)
- `getNextFollowUps(entityId: string, days: number): Promise<FollowUpCadence[]>` -- Upcoming follow-ups in next N days

### 4. Commitment Tracker

**Service file:** `src/modules/communication/services/commitment-tracker.ts`

Implement:
- `addCommitment(contactId: string, commitment: Omit<Commitment, 'id' | 'createdAt'>): Promise<Commitment>` -- Record a promise
- `getOpenCommitments(entityId: string, direction?: 'TO' | 'FROM'): Promise<Commitment[]>` -- All open promises
- `markFulfilled(commitmentId: string): Promise<void>`
- `getOverdueCommitments(entityId: string): Promise<Commitment[]>` -- Broken/overdue promises

### 5. Broadcast Management

**Service file:** `src/modules/communication/services/broadcast-manager.ts`

Implement:
- `sendBroadcast(request: BroadcastRequest): Promise<BroadcastResult>` -- Send templated messages with merge fields
- `renderTemplate(template: string, mergeFields: Record<string, string>): string` -- Replace `{{fieldName}}` placeholders
- `validateRecipients(recipientIds: string[]): Promise<{ valid: string[]; invalid: string[] }>` -- Check for doNotContact, missing channels

### 6. API Routes

Create these Next.js API route handlers using the App Router convention:

| Route File | Method | Path | Purpose |
|------------|--------|------|---------|
| `src/app/api/contacts/route.ts` | GET | `/api/contacts` | List contacts with pagination, filtering by entityId, tags |
| `src/app/api/contacts/route.ts` | POST | `/api/contacts` | Create new contact |
| `src/app/api/contacts/[id]/route.ts` | GET | `/api/contacts/:id` | Get single contact with full profile |
| `src/app/api/contacts/[id]/route.ts` | PUT | `/api/contacts/:id` | Update contact |
| `src/app/api/contacts/[id]/route.ts` | DELETE | `/api/contacts/:id` | Soft-delete contact |
| `src/app/api/contacts/[id]/relationship-score/route.ts` | GET | `/api/contacts/:id/relationship-score` | Get computed relationship score |
| `src/app/api/contacts/[id]/cadence/route.ts` | GET | `/api/contacts/:id/cadence` | Get follow-up cadence |
| `src/app/api/contacts/[id]/cadence/route.ts` | PUT | `/api/contacts/:id/cadence` | Set follow-up cadence |
| `src/app/api/contacts/[id]/commitments/route.ts` | GET | `/api/contacts/:id/commitments` | List commitments for contact |
| `src/app/api/contacts/[id]/commitments/route.ts` | POST | `/api/contacts/:id/commitments` | Add commitment |

All routes MUST:
- Use Zod for request body validation
- Use `success()`, `error()`, `paginated()` from `@/shared/utils/api-response`
- Use `prisma` from `@/lib/db`
- Wrap in try/catch returning `error('INTERNAL_ERROR', ...)` on failure
- Return proper HTTP status codes (200, 201, 400, 404, 500)

### 7. Dashboard Pages

**Communication drafting page:** `src/app/(dashboard)/communication/page.tsx`
- Draft composer form with tone selector (dropdown of all `Tone` values)
- Recipient selector
- Intent/purpose text field
- Channel selector
- "Generate Drafts" button
- Draft variants display with side-by-side comparison
- Compliance flags display
- Power dynamics advisory note

**Contacts CRM page:** `src/app/(dashboard)/contacts/page.tsx`
- Contact list with search, filter by tags, sort by relationship score
- Contact detail panel (click to expand)
- Relationship score badge (color-coded: green > 70, yellow 40-70, red < 40)
- Commitment list per contact
- Follow-up cadence status indicator
- Ghosting warning badges

**Components to create in `src/modules/communication/components/`:**
- `DraftComposer.tsx` -- Main drafting form
- `DraftVariantCard.tsx` -- Single draft variant display
- `ToneSelector.tsx` -- Dropdown for Tone enum
- `ContactList.tsx` -- Paginated contact list
- `ContactDetailPanel.tsx` -- Expanded contact view
- `RelationshipBadge.tsx` -- Color-coded score badge
- `CommitmentList.tsx` -- List of commitments with status
- `CadenceIndicator.tsx` -- Follow-up status dot
- `GhostingWarning.tsx` -- Warning badge for ghosted contacts
- `BroadcastComposer.tsx` -- Broadcast template and merge field editor

All components must be client components (`'use client'`) that use Tailwind CSS for styling. No external UI libraries.

## Acceptance Criteria

- [ ] All 5 services compile without errors
- [ ] All 10 API routes return correct `ApiResponse<T>` shapes
- [ ] Zod validation rejects malformed requests with descriptive error messages
- [ ] Drafting engine produces 2-3 variants per request
- [ ] Relationship score calculation uses at least 3 signals (frequency, recency, sentiment)
- [ ] Ghosting detection compares days-since-contact against average cadence
- [ ] Compliance scanner checks for at least 5 common patterns (PII, threats, promises, regulated terms, confidential markers)
- [ ] Follow-up cadence correctly identifies overdue contacts
- [ ] Broadcast template rendering replaces all merge fields
- [ ] Dashboard pages render without errors
- [ ] All unit tests pass with `npx jest tests/unit/communication/`
- [ ] No imports from other worker-owned paths (no cross-module dependencies)

## Implementation Steps

1. **Read context files** -- `src/shared/types/index.ts`, `prisma/schema.prisma`, `src/shared/utils/api-response.ts`, `src/lib/db/index.ts`
2. **Create types** -- `src/modules/communication/types/index.ts` with all module-specific interfaces
3. **Build core services** (in order):
   a. `tone-analyzer.ts` (no DB dependency, pure functions)
   b. `drafting-engine.ts` (depends on tone-analyzer)
   c. `relationship-intelligence.ts` (depends on prisma)
   d. `commitment-tracker.ts` (depends on prisma)
   e. `cadence-engine.ts` (depends on prisma)
   f. `broadcast-manager.ts` (depends on prisma, drafting-engine)
4. **Build API routes** -- All 10 route files with Zod schemas
5. **Build components** -- All 10 React components
6. **Build dashboard pages** -- Communication page and Contacts page
7. **Write tests** -- Unit tests for all services
8. **Verify** -- `npx tsc --noEmit`, `npx jest tests/unit/communication/`, `npx next build`

## Tests

Create these test files in `tests/unit/communication/`:

| Test File | What It Tests |
|-----------|---------------|
| `drafting-engine.test.ts` | `generateDrafts` returns 2-3 variants, each variant has valid tone, compliance scan detects PII |
| `tone-analyzer.test.ts` | `analyzeTone` correctly identifies FIRM vs WARM vs DIPLOMATIC, `shiftTone` changes output tone |
| `relationship-intelligence.test.ts` | Score calculation with various signal combinations, ghosting detection thresholds |
| `commitment-tracker.test.ts` | Add/fulfill/overdue commitment flows |
| `cadence-engine.test.ts` | Overdue detection, escalation logic, next-follow-ups ordering |
| `broadcast-manager.test.ts` | Template rendering with merge fields, recipient validation filtering doNotContact |

Each test file must:
- Mock `prisma` using `jest.mock('@/lib/db')`
- Use `describe/it` blocks with descriptive names
- Test both success and error paths
- Use `expect(...).toEqual()` / `expect(...).toThrow()` assertions
- Import types from `@/shared/types` and `@/modules/communication/types`

## Commit Strategy

Use Conventional Commits. Commit after each logical unit is complete and compiling.

```
feat(communication): add module-specific types and interfaces
feat(communication): implement tone analyzer service
feat(communication): implement drafting engine with multi-variant support
feat(communication): implement relationship intelligence service
feat(communication): implement commitment tracker service
feat(communication): implement cadence engine with escalation
feat(communication): implement broadcast manager with merge fields
feat(communication): add contact CRUD API routes with Zod validation
feat(communication): add relationship-score, cadence, commitment API routes
feat(communication): add communication dashboard components
feat(communication): add contacts CRM dashboard page
test(communication): add unit tests for all services
chore(communication): verify build and final cleanup
```
