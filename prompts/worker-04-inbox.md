# Worker 04: Unified Inbox & Triage Engine (M1)

## Branch: ai-feature/w04-inbox

Create and check out the branch `ai-feature/w04-inbox` from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside these directories:

- `src/modules/inbox/` (all files -- services, components, types)
- `src/app/api/inbox/` (all files -- API routes)
- `src/app/(dashboard)/inbox/` (all files -- UI pages)
- `tests/unit/inbox/` (all files)

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

1. **`prisma/schema.prisma`** -- The Message model: id, channel, senderId, recipientId, entityId, threadId, subject, body, triageScore (Int, default 5), intent, sensitivity, draftStatus, attachments (Json), createdAt, updatedAt. Indexed on entityId, threadId, triageScore. Related to Entity and Contact (via senderId). Also note the Contact model (has channels, commitments, preferences) and the Call model (has transcript, actionItems).
2. **`src/shared/types/index.ts`** -- The `Message`, `MessageChannel`, `Sensitivity`, `Tone`, `Attachment`, `Contact`, `ContactPreferences`, `ApiResponse`, `ApiMeta` types. Your code must conform to these exactly.
3. **`src/shared/utils/api-response.ts`** -- Use `success()`, `error()`, `paginated()` for all API responses.
4. **`src/lib/db/index.ts`** -- Import `prisma` from here for database operations.
5. **`package.json`** -- Available libraries: `zod` (validation), `date-fns` (date operations), `uuid` (ID generation).

### Dependencies on Other Workers

- **Auth (Worker 02)**: Your API routes will need authentication. Create a local `getCurrentUserId()` stub that returns a placeholder or reads from a header. This will be replaced when auth is integrated.
- **Entities (Worker 03)**: Your inbox operates within entity context. Accept `entityId` as a parameter and filter messages by it. Do not import from Worker 03's modules.
- **Database (Worker 01)**: Use Prisma client directly. If you need pagination helpers, implement them locally within your module.

## Requirements

### 1. Inbox Types (`src/modules/inbox/inbox.types.ts`)

```typescript
// src/modules/inbox/inbox.types.ts

import {
  Message, MessageChannel, Sensitivity, Tone, Contact, Attachment
} from '@/shared/types';

// --- Triage Types ---

export interface TriageResult {
  messageId: string;
  urgencyScore: number;          // 1-10
  intent: MessageIntent;
  sensitivity: Sensitivity;
  category: MessageCategory;
  suggestedPriority: 'P0' | 'P1' | 'P2';
  suggestedAction: SuggestedAction;
  reasoning: string;             // brief explanation of triage decision
  confidence: number;            // 0-1
  flags: TriageFlag[];
}

export type MessageIntent =
  | 'INQUIRY'        // asking a question
  | 'REQUEST'        // requesting an action
  | 'UPDATE'         // providing information
  | 'URGENT'         // time-sensitive matter
  | 'FYI'            // informational, no action needed
  | 'COMPLAINT'      // expressing dissatisfaction
  | 'FOLLOW_UP'      // following up on previous thread
  | 'INTRODUCTION'   // new contact/relationship
  | 'SCHEDULING'     // meeting/call scheduling
  | 'FINANCIAL'      // invoice, payment, billing
  | 'APPROVAL'       // requesting sign-off
  | 'SOCIAL';        // personal/social message

export type MessageCategory =
  | 'OPERATIONS'
  | 'SALES'
  | 'FINANCE'
  | 'LEGAL'
  | 'HR'
  | 'MARKETING'
  | 'SUPPORT'
  | 'PERSONAL'
  | 'COMPLIANCE'
  | 'EXECUTIVE';

export type SuggestedAction =
  | 'RESPOND_IMMEDIATELY'
  | 'RESPOND_TODAY'
  | 'RESPOND_THIS_WEEK'
  | 'DELEGATE'
  | 'ARCHIVE'
  | 'FLAG_FOR_REVIEW'
  | 'SCHEDULE_FOLLOW_UP'
  | 'NO_ACTION';

export interface TriageFlag {
  type: 'VIP_SENDER' | 'DEADLINE_MENTIONED' | 'MONEY_MENTIONED' | 'LEGAL_LANGUAGE' | 'PHI_DETECTED' | 'PII_DETECTED' | 'SENTIMENT_NEGATIVE' | 'THREAD_ESCALATION' | 'COMPLIANCE_RISK';
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

// --- Draft Types ---

export interface DraftRequest {
  messageId: string;             // the message to reply to
  entityId: string;
  tone?: Tone;                   // override entity default tone
  intent?: string;               // what the reply should accomplish
  constraints?: string[];        // things to avoid or include
  includeDisclaimer?: boolean;   // add compliance disclaimer
  maxLength?: number;            // character limit
}

export interface DraftResponse {
  messageId: string;
  draftBody: string;
  tone: Tone;
  confidenceScore: number;       // 0-1
  complianceNotes: string[];     // any compliance considerations
  suggestedSubject?: string;
  alternatives: {
    tone: Tone;
    body: string;
  }[];                           // 1-2 alternative drafts with different tones
}

// --- Inbox View Types ---

export interface InboxItem {
  message: Message;
  senderName: string;
  senderContact?: Contact;
  entityName: string;
  threadMessages?: Message[];    // other messages in same thread
  triageResult?: TriageResult;
  draft?: DraftResponse;
  isRead: boolean;
  isStarred: boolean;
  followUp?: FollowUpReminder;
}

export interface InboxFilters {
  entityId?: string;
  channel?: MessageChannel;
  minTriageScore?: number;
  maxTriageScore?: number;
  intent?: MessageIntent;
  category?: MessageCategory;
  sensitivity?: Sensitivity;
  dateFrom?: Date;
  dateTo?: Date;
  isRead?: boolean;
  isStarred?: boolean;
  search?: string;
  threadId?: string;
}

export interface InboxListParams extends InboxFilters {
  page?: number;
  pageSize?: number;
  sortBy?: 'triageScore' | 'createdAt' | 'channel';
  sortOrder?: 'asc' | 'desc';
}

export interface InboxStats {
  total: number;
  unread: number;
  urgent: number;               // triageScore >= 8
  needsResponse: number;        // intent is REQUEST or INQUIRY, no draft yet
  byChannel: Record<MessageChannel, number>;
  byCategory: Record<MessageCategory, number>;
  avgTriageScore: number;
}

// --- Follow-Up Types ---

export interface FollowUpReminder {
  id: string;
  messageId: string;
  entityId: string;
  reminderAt: Date;
  reason: string;
  status: 'PENDING' | 'COMPLETED' | 'SNOOZED' | 'CANCELLED';
  createdAt: Date;
}

export interface CreateFollowUpInput {
  messageId: string;
  entityId: string;
  reminderAt: Date;              // when to remind
  reason?: string;               // why follow-up is needed
}

// --- Batch Triage Types ---

export interface BatchTriageRequest {
  entityId: string;
  messageIds?: string[];         // specific messages, or all untriaged if empty
  maxMessages?: number;          // limit for batch processing (default 50)
}

export interface BatchTriageResult {
  processed: number;
  results: TriageResult[];
  summary: {
    urgent: number;
    needsResponse: number;
    canArchive: number;
    flagged: number;
  };
  processingTimeMs: number;
}

// --- Canned Response Types ---

export interface CannedResponse {
  id: string;
  name: string;
  entityId: string;
  channel: MessageChannel;
  category: string;
  subject?: string;
  body: string;
  variables: string[];           // e.g., ["{{contact_name}}", "{{company}}"]
  tone: Tone;
  usageCount: number;
  lastUsed?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCannedResponseInput {
  name: string;
  entityId: string;
  channel: MessageChannel;
  category: string;
  subject?: string;
  body: string;
  variables?: string[];
  tone: Tone;
}
```

### 2. Triage Service (`src/modules/inbox/triage.service.ts`)

The AI triage classification engine:

```typescript
// src/modules/inbox/triage.service.ts

export class TriageService {
  // Triage a single message
  async triageMessage(messageId: string, entityId: string): Promise<TriageResult>;

  // Batch triage multiple messages
  async batchTriage(request: BatchTriageRequest): Promise<BatchTriageResult>;

  // Re-triage (human overrides AI score, AI learns)
  async updateTriageScore(messageId: string, newScore: number, reason: string): Promise<TriageResult>;

  // Calculate urgency score based on multiple signals
  private calculateUrgencyScore(message: Message, sender?: Contact): number;

  // Extract intent from message body
  private classifyIntent(body: string, subject?: string): MessageIntent;

  // Detect sensitivity level
  private detectSensitivity(body: string, entityProfiles: string[]): Sensitivity;

  // Categorize message
  private categorizeMessage(body: string, intent: MessageIntent, entityType: string): MessageCategory;

  // Suggest action based on triage
  private suggestAction(score: number, intent: MessageIntent): SuggestedAction;

  // Detect flags (VIP, deadlines, money, legal, PHI, PII)
  private detectFlags(body: string, sender?: Contact): TriageFlag[];
}
```

**Urgency Scoring Algorithm (implement this logic):**

The score is 1-10. Calculate it from these weighted signals:

| Signal | Weight | Description |
|--------|--------|-------------|
| Sender VIP status | +2 | Contact has VIP tag |
| Sender relationship score | +0-1 | Score > 80 adds 1 |
| Explicit urgency words | +2 | "urgent", "ASAP", "emergency", "immediately", "critical" |
| Deadline mentioned | +1 | Date/time references in near future |
| Channel priority | +0-2 | VOICE=+2, SMS=+1, EMAIL=+0, SLACK=+0 |
| Thread escalation | +1 | Multiple messages in thread from same sender |
| Financial content | +1 | Money amounts, invoice, payment references |
| Legal language | +1 | "contract", "lawsuit", "compliance", "subpoena" |
| Compliance risk | +2 | PHI/PII detected in non-compliant channel |
| Time of day | -1 | Outside business hours (lower urgency) |

Base score is 3. Add/subtract signals. Cap at 1-10.

**Intent Classification (keyword + pattern matching):**
- URGENT: "urgent", "asap", "emergency", "immediately", "time-sensitive"
- REQUEST: "please", "could you", "would you", "need you to", "can you"
- INQUIRY: "?", "wondering", "question", "curious", "what is", "how do"
- FINANCIAL: "$", "invoice", "payment", "billing", "amount due"
- SCHEDULING: "meet", "call", "schedule", "calendar", "availability"
- FOLLOW_UP: "following up", "circling back", "checking in", "any update"
- COMPLAINT: "disappointed", "frustrated", "unacceptable", "issue with"
- APPROVAL: "approve", "sign off", "greenlight", "authorization"
- Default: "UPDATE" if contains factual statements, "FYI" otherwise

**Sensitivity Detection:**
- REGULATED: PHI patterns (medical record numbers, diagnosis codes, patient names with medical context)
- RESTRICTED: SSN patterns, credit card numbers, bank account numbers
- CONFIDENTIAL: salary mentions, legal strategy, acquisition targets
- INTERNAL: company-specific information
- PUBLIC: general information

**Flag Detection:**
- VIP_SENDER: sender's Contact has "VIP" tag
- DEADLINE_MENTIONED: date/time patterns within 7 days
- MONEY_MENTIONED: dollar amounts or financial keywords
- LEGAL_LANGUAGE: legal terminology
- PHI_DETECTED: medical information patterns
- PII_DETECTED: SSN, DOB, address patterns
- SENTIMENT_NEGATIVE: negative sentiment keywords
- THREAD_ESCALATION: 3+ messages in thread from same sender without response
- COMPLIANCE_RISK: PHI/PII in channel without proper compliance profile

### 3. Draft Service (`src/modules/inbox/draft.service.ts`)

```typescript
// src/modules/inbox/draft.service.ts

export class DraftService {
  // Generate a draft reply
  async generateDraft(request: DraftRequest): Promise<DraftResponse>;

  // Generate draft with canned response as base
  async generateFromTemplate(
    cannedResponseId: string,
    variables: Record<string, string>,
    customizations?: Partial<DraftRequest>
  ): Promise<DraftResponse>;

  // Refine an existing draft
  async refineDraft(
    draftBody: string,
    feedback: string,
    tone?: Tone
  ): Promise<DraftResponse>;

  // Apply tone to message body
  private applyTone(body: string, tone: Tone): string;

  // Generate compliance disclaimers
  private getDisclaimers(entityId: string): Promise<string[]>;
}
```

The draft service should produce realistic template-based responses. Since there is no LLM integration in this phase, use a rule-based approach:
- Match intent to response templates
- Apply tone adjustments (word choice, formality level)
- Insert contact name and relevant details
- Add compliance disclaimers when needed
- Generate 1-2 alternative drafts with different tones

### 4. Inbox Service (`src/modules/inbox/inbox.service.ts`)

```typescript
// src/modules/inbox/inbox.service.ts

export class InboxService {
  // List inbox items with filtering and pagination
  async listInbox(userId: string, params: InboxListParams): Promise<{
    items: InboxItem[];
    total: number;
    page: number;
    pageSize: number;
    stats: InboxStats;
  }>;

  // Get a single message with full thread context
  async getMessageDetail(messageId: string, userId: string): Promise<InboxItem | null>;

  // Get thread messages
  async getThread(threadId: string, entityId: string): Promise<Message[]>;

  // Mark message as read/unread
  async markAsRead(messageId: string, isRead: boolean): Promise<void>;

  // Star/unstar message
  async toggleStar(messageId: string): Promise<void>;

  // Send a draft (move from DRAFT to SENT)
  async sendDraft(messageId: string, userId: string): Promise<Message>;

  // Archive message
  async archiveMessage(messageId: string): Promise<void>;

  // Get inbox statistics
  async getInboxStats(userId: string, entityId?: string): Promise<InboxStats>;

  // Follow-up management
  async createFollowUp(input: CreateFollowUpInput): Promise<FollowUpReminder>;
  async listFollowUps(userId: string, entityId?: string): Promise<FollowUpReminder[]>;
  async completeFollowUp(followUpId: string): Promise<void>;
  async snoozeFollowUp(followUpId: string, newDate: Date): Promise<void>;

  // Canned response CRUD
  async createCannedResponse(input: CreateCannedResponseInput): Promise<CannedResponse>;
  async listCannedResponses(entityId: string, channel?: MessageChannel): Promise<CannedResponse[]>;
  async getCannedResponse(responseId: string): Promise<CannedResponse | null>;
  async updateCannedResponse(responseId: string, updates: Partial<CreateCannedResponseInput>): Promise<CannedResponse>;
  async deleteCannedResponse(responseId: string): Promise<void>;
}
```

### 5. Validation Schemas (`src/modules/inbox/inbox.validation.ts`)

Use Zod for all input validation:

```typescript
// src/modules/inbox/inbox.validation.ts

export const triageMessageSchema = z.object({
  messageId: z.string().min(1),
  entityId: z.string().min(1),
});

export const batchTriageSchema = z.object({
  entityId: z.string().min(1),
  messageIds: z.array(z.string()).optional(),
  maxMessages: z.number().int().positive().max(200).optional().default(50),
});

export const draftRequestSchema = z.object({
  messageId: z.string().min(1),
  entityId: z.string().min(1),
  tone: z.enum(['FIRM', 'DIPLOMATIC', 'WARM', 'DIRECT', 'CASUAL', 'FORMAL', 'EMPATHETIC', 'AUTHORITATIVE']).optional(),
  intent: z.string().optional(),
  constraints: z.array(z.string()).optional(),
  includeDisclaimer: z.boolean().optional(),
  maxLength: z.number().int().positive().optional(),
});

export const inboxListSchema = z.object({
  entityId: z.string().optional(),
  channel: z.enum(['EMAIL', 'SMS', 'SLACK', 'TEAMS', 'DISCORD', 'WHATSAPP', 'TELEGRAM', 'VOICE', 'MANUAL']).optional(),
  minTriageScore: z.coerce.number().int().min(1).max(10).optional(),
  maxTriageScore: z.coerce.number().int().min(1).max(10).optional(),
  intent: z.string().optional(),
  sensitivity: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'REGULATED']).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
  sortBy: z.enum(['triageScore', 'createdAt', 'channel']).optional().default('triageScore'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const createFollowUpSchema = z.object({
  messageId: z.string().min(1),
  entityId: z.string().min(1),
  reminderAt: z.coerce.date(),
  reason: z.string().optional(),
});

export const sendDraftSchema = z.object({
  messageId: z.string().min(1),
});

export const createCannedResponseSchema = z.object({
  name: z.string().min(1).max(100),
  entityId: z.string().min(1),
  channel: z.enum(['EMAIL', 'SMS', 'SLACK', 'TEAMS', 'DISCORD', 'WHATSAPP', 'TELEGRAM', 'VOICE', 'MANUAL']),
  category: z.string().min(1).max(50),
  subject: z.string().optional(),
  body: z.string().min(1).max(5000),
  variables: z.array(z.string()).optional(),
  tone: z.enum(['FIRM', 'DIPLOMATIC', 'WARM', 'DIRECT', 'CASUAL', 'FORMAL', 'EMPATHETIC', 'AUTHORITATIVE']),
});
```

### 6. API Routes (`src/app/api/inbox/`)

#### `src/app/api/inbox/route.ts`
```
GET /api/inbox               -- List inbox items (filtered, paginated)
                               Query params from InboxListParams
                               Response: ApiResponse<{ items: InboxItem[], stats: InboxStats }>
```

#### `src/app/api/inbox/[messageId]/route.ts`
```
GET    /api/inbox/:id        -- Get message detail with thread context
PATCH  /api/inbox/:id        -- Update message (mark read, star, archive)
DELETE /api/inbox/:id        -- Soft delete / archive message
```

#### `src/app/api/inbox/triage/route.ts`
```
POST /api/inbox/triage       -- Triage a single message
                               Body: { messageId, entityId }
                               Response: ApiResponse<TriageResult>
```

#### `src/app/api/inbox/triage/batch/route.ts`
```
POST /api/inbox/triage/batch -- Batch triage messages
                               Body: BatchTriageRequest
                               Response: ApiResponse<BatchTriageResult>
```

#### `src/app/api/inbox/draft/route.ts`
```
POST /api/inbox/draft        -- Generate a draft reply
                               Body: DraftRequest
                               Response: ApiResponse<DraftResponse>
```

#### `src/app/api/inbox/draft/refine/route.ts`
```
POST /api/inbox/draft/refine -- Refine an existing draft
                               Body: { draftBody, feedback, tone? }
                               Response: ApiResponse<DraftResponse>
```

#### `src/app/api/inbox/send/route.ts`
```
POST /api/inbox/send         -- Send (approve) a draft message
                               Body: { messageId }
                               Response: ApiResponse<Message>
```

#### `src/app/api/inbox/follow-up/route.ts`
```
GET  /api/inbox/follow-up    -- List pending follow-ups
POST /api/inbox/follow-up    -- Create a follow-up reminder
```

#### `src/app/api/inbox/follow-up/[followUpId]/route.ts`
```
PATCH  /api/inbox/follow-up/:id  -- Complete or snooze follow-up
DELETE /api/inbox/follow-up/:id  -- Cancel follow-up
```

#### `src/app/api/inbox/canned-responses/route.ts`
```
GET  /api/inbox/canned-responses          -- List canned responses
POST /api/inbox/canned-responses          -- Create canned response
```

#### `src/app/api/inbox/canned-responses/[responseId]/route.ts`
```
GET    /api/inbox/canned-responses/:id    -- Get canned response
PATCH  /api/inbox/canned-responses/:id    -- Update canned response
DELETE /api/inbox/canned-responses/:id    -- Delete canned response
```

#### `src/app/api/inbox/stats/route.ts`
```
GET /api/inbox/stats         -- Get inbox statistics
                               Query: entityId (optional)
                               Response: ApiResponse<InboxStats>
```

All routes must use the api-response helpers and return proper HTTP status codes.

### 7. UI Components (`src/modules/inbox/components/`)

#### InboxList (`src/modules/inbox/components/InboxList.tsx`)
- Scrollable list of InboxItem entries
- Each row shows: sender avatar placeholder, sender name, subject/preview, channel icon, triage score badge (color-coded: green 1-3, yellow 4-6, orange 7-8, red 9-10), timestamp, entity name badge
- Unread messages have bold text and left accent bar
- Starred messages show filled star icon
- Click to select and view detail
- Multi-select with checkboxes for batch operations
- "Select All" checkbox in header

#### InboxFilters (`src/modules/inbox/components/InboxFilters.tsx`)
- Channel filter dropdown (EMAIL, SMS, SLACK, etc.)
- Entity filter dropdown
- Urgency range slider (1-10)
- Date range picker (from/to)
- Intent filter dropdown
- Sensitivity filter dropdown
- Search input with debounce
- "Clear All Filters" button
- Active filter badges showing current filters

#### MessageDetail (`src/modules/inbox/components/MessageDetail.tsx`)
- Full message view with sender info, timestamp, channel badge
- Thread reconstruction: show all messages in thread chronologically
- Triage result display: urgency score, intent, category, flags
- Draft section: shows generated draft with edit capability
- Action buttons: Approve Draft, Edit Draft, Reject Draft, Reply, Forward, Archive
- Follow-up button with date picker
- Canned response quick-insert dropdown
- Compliance warnings displayed prominently if flagged

#### TriageScoreBadge (`src/modules/inbox/components/TriageScoreBadge.tsx`)
- Circular badge showing score 1-10
- Color coding: 1-3 green, 4-6 yellow, 7-8 orange, 9-10 red
- Tooltip showing reasoning on hover
- Size variants: small (for list), large (for detail view)

#### DraftEditor (`src/modules/inbox/components/DraftEditor.tsx`)
- Textarea with the draft body
- Tone selector dropdown
- "Regenerate" button
- "View Alternatives" expandable section showing alternative drafts
- Character count
- Compliance disclaimer toggle
- "Approve & Send" primary button
- "Save Draft" secondary button
- "Discard" tertiary button

#### BatchTriagePanel (`src/modules/inbox/components/BatchTriagePanel.tsx`)
- Panel for batch triage operations
- "Triage Selected" and "Triage All Untriaged" buttons
- Progress indicator during batch processing
- Results summary: urgent count, needs response, can archive
- Quick actions: "Archive All Low Priority", "Flag All Urgent"

#### FollowUpList (`src/modules/inbox/components/FollowUpList.tsx`)
- List of pending follow-ups sorted by reminderAt
- Each row: original message snippet, reminder date, reason, status
- Actions: Complete, Snooze (1 day, 3 days, 1 week), Cancel
- Overdue follow-ups highlighted in red

#### CannedResponseManager (`src/modules/inbox/components/CannedResponseManager.tsx`)
- List view of canned responses grouped by category
- Search/filter by name, channel, tone
- Create/edit modal with form
- Variable placeholder highlighting in preview
- Usage count display
- Quick-insert button for each response

### 8. UI Pages (`src/app/(dashboard)/inbox/`)

#### Inbox Main Page (`src/app/(dashboard)/inbox/page.tsx`)
- Two-panel layout: InboxList on left (40% width), MessageDetail on right (60% width)
- InboxFilters at top of list panel
- InboxStats summary bar above the list (total, unread, urgent counts)
- BatchTriagePanel accessible via toolbar button
- Empty state when no messages match filters
- Loading skeleton states
- Responsive: on mobile, show list only; tapping message opens detail as full page

#### Inbox Message Page (`src/app/(dashboard)/inbox/[messageId]/page.tsx`)
- Full-page message detail view (for mobile or direct linking)
- Back button to inbox list
- All MessageDetail features
- Thread navigation (previous/next message in thread)

#### Follow-Ups Page (`src/app/(dashboard)/inbox/follow-ups/page.tsx`)
- FollowUpList component full-page
- Filter by entity, status, date range
- Calendar view option showing follow-ups on a mini calendar

#### Canned Responses Page (`src/app/(dashboard)/inbox/canned-responses/page.tsx`)
- CannedResponseManager component full-page
- Entity selector to scope responses
- Import/export options (JSON)

### 9. Module Barrel Export (`src/modules/inbox/index.ts`)

```typescript
export { InboxService } from './inbox.service';
export { TriageService } from './triage.service';
export { DraftService } from './draft.service';
export * from './inbox.types';
export * from './inbox.validation';
```

## Acceptance Criteria

1. Triage service correctly scores messages 1-10 based on the documented algorithm.
2. Intent classification correctly identifies at least 8 intent types from message content.
3. Sensitivity detection identifies PHI, PII, and confidential content.
4. Flag detection catches VIP senders, deadlines, financial content, and compliance risks.
5. Batch triage processes up to 50 messages and returns summary statistics.
6. Draft generation produces contextually appropriate responses with tone matching.
7. Canned response variable substitution works correctly.
8. Inbox list supports all documented filter combinations.
9. Thread reconstruction groups messages by threadId in chronological order.
10. Follow-up CRUD operations work correctly with snooze functionality.
11. All API routes return `ApiResponse<T>` format with proper status codes.
12. All Zod validation schemas reject invalid input with descriptive errors.
13. UI components render without errors (verified via TypeScript compilation).
14. All unit tests pass.
15. No files created or modified outside owned paths.

## Implementation Steps

1. **Read context files**: Read `prisma/schema.prisma`, `src/shared/types/index.ts`, `src/shared/utils/api-response.ts`, `src/lib/db/index.ts`.
2. **Create branch**: `git checkout -b ai-feature/w04-inbox`
3. **Create `src/modules/inbox/inbox.types.ts`**: All triage, draft, inbox, follow-up, and canned response types.
4. **Create `src/modules/inbox/inbox.validation.ts`**: Zod schemas for all inputs.
5. **Create `src/modules/inbox/triage.service.ts`**: Urgency scoring algorithm, intent classification, sensitivity detection, flag detection.
6. **Create `src/modules/inbox/draft.service.ts`**: Template-based draft generation, tone application, disclaimer handling.
7. **Create `src/modules/inbox/inbox.service.ts`**: Inbox listing, message detail, thread reconstruction, follow-ups, canned responses.
8. **Create API routes**: All 12+ route files in `src/app/api/inbox/`.
9. **Create UI components**: InboxList, InboxFilters, MessageDetail, TriageScoreBadge, DraftEditor, BatchTriagePanel, FollowUpList, CannedResponseManager in `src/modules/inbox/components/`.
10. **Create UI pages**: Main inbox, message detail, follow-ups, canned responses in `src/app/(dashboard)/inbox/`.
11. **Create `src/modules/inbox/index.ts`**: Barrel export.
12. **Create tests** in `tests/unit/inbox/`.
13. **Type-check**: `npx tsc --noEmit`.
14. **Run tests**: `npx jest tests/unit/inbox/`.
15. **Commit** with conventional commits.

## Tests

Create test files in `tests/unit/inbox/`:

### `tests/unit/inbox/triage.service.test.ts`
```typescript
// Mock Prisma client

describe('TriageService', () => {
  describe('calculateUrgencyScore', () => {
    it('should return base score of 3 for neutral message');
    it('should add +2 for VIP sender');
    it('should add +1 for high relationship score sender (>80)');
    it('should add +2 for urgent keywords ("ASAP", "emergency")');
    it('should add +1 for deadline mentions within 7 days');
    it('should add +2 for VOICE channel');
    it('should add +1 for SMS channel');
    it('should add +1 for thread escalation (3+ unreplied messages)');
    it('should add +1 for financial content');
    it('should add +1 for legal language');
    it('should add +2 for compliance risk (PHI in non-HIPAA channel)');
    it('should subtract -1 for outside business hours');
    it('should cap score at 10');
    it('should floor score at 1');
    it('should handle combined signals correctly');
  });

  describe('classifyIntent', () => {
    it('should classify "Please send the report" as REQUEST');
    it('should classify "What is the status?" as INQUIRY');
    it('should classify "URGENT: server down" as URGENT');
    it('should classify "FYI - meeting moved" as FYI');
    it('should classify "Following up on our conversation" as FOLLOW_UP');
    it('should classify "Invoice #1234 attached" as FINANCIAL');
    it('should classify "Can we schedule a call?" as SCHEDULING');
    it('should classify "I am disappointed with the service" as COMPLAINT');
    it('should classify "Please approve the budget" as APPROVAL');
    it('should default to UPDATE for factual statements');
  });

  describe('detectSensitivity', () => {
    it('should detect REGULATED for medical record numbers');
    it('should detect RESTRICTED for SSN patterns');
    it('should detect CONFIDENTIAL for salary information');
    it('should return INTERNAL for general business content');
    it('should return PUBLIC for generic content');
  });

  describe('detectFlags', () => {
    it('should flag VIP_SENDER for VIP contacts');
    it('should flag DEADLINE_MENTIONED for near-future dates');
    it('should flag MONEY_MENTIONED for dollar amounts');
    it('should flag LEGAL_LANGUAGE for legal terms');
    it('should flag PHI_DETECTED for medical information');
    it('should flag PII_DETECTED for SSN/DOB patterns');
    it('should flag SENTIMENT_NEGATIVE for negative language');
    it('should return multiple flags for complex messages');
  });

  describe('triageMessage', () => {
    it('should return complete TriageResult with all fields');
    it('should update message triageScore in database');
    it('should update message intent in database');
  });

  describe('batchTriage', () => {
    it('should process multiple messages');
    it('should respect maxMessages limit');
    it('should return accurate summary counts');
    it('should measure processing time');
  });
});
```

### `tests/unit/inbox/draft.service.test.ts`
```typescript
describe('DraftService', () => {
  describe('generateDraft', () => {
    it('should generate reply for INQUIRY intent');
    it('should generate reply for REQUEST intent');
    it('should apply FORMAL tone when specified');
    it('should apply CASUAL tone when specified');
    it('should include disclaimer when requested');
    it('should provide alternative drafts with different tones');
    it('should respect maxLength constraint');
  });

  describe('generateFromTemplate', () => {
    it('should substitute variables in canned response');
    it('should handle missing variables gracefully');
  });

  describe('refineDraft', () => {
    it('should adjust tone based on feedback');
    it('should maintain core content while changing style');
  });
});
```

### `tests/unit/inbox/inbox.service.test.ts`
```typescript
describe('InboxService', () => {
  describe('listInbox', () => {
    it('should return paginated inbox items');
    it('should filter by channel');
    it('should filter by triage score range');
    it('should filter by entity');
    it('should filter by date range');
    it('should search by body/subject text');
    it('should sort by triage score descending by default');
    it('should include inbox stats in response');
  });

  describe('getMessageDetail', () => {
    it('should return message with thread context');
    it('should include sender contact info');
    it('should include triage result');
    it('should return null for non-existent message');
  });

  describe('getThread', () => {
    it('should return all messages in thread ordered by date');
    it('should return single message if no thread');
  });

  describe('followUp operations', () => {
    it('should create follow-up reminder');
    it('should list follow-ups sorted by date');
    it('should complete a follow-up');
    it('should snooze a follow-up to new date');
  });

  describe('cannedResponse operations', () => {
    it('should create canned response');
    it('should list canned responses filtered by entity');
    it('should list canned responses filtered by channel');
    it('should update canned response');
    it('should delete canned response');
    it('should increment usage count on use');
  });
});
```

### `tests/unit/inbox/inbox.validation.test.ts`
```typescript
describe('triageMessageSchema', () => {
  it('should accept valid triage input');
  it('should reject missing messageId');
  it('should reject missing entityId');
});

describe('inboxListSchema', () => {
  it('should accept valid list params');
  it('should apply defaults for page and pageSize');
  it('should reject triageScore out of 1-10 range');
  it('should coerce string dates to Date objects');
  it('should reject pageSize over 100');
});

describe('draftRequestSchema', () => {
  it('should accept valid draft request');
  it('should reject invalid tone values');
  it('should accept request without optional fields');
});

describe('createCannedResponseSchema', () => {
  it('should accept valid canned response input');
  it('should reject body over 5000 chars');
  it('should reject invalid channel values');
});
```

## Commit Strategy

Make atomic commits in this order:

1. `feat(inbox): add inbox types, validation schemas, and triage scoring engine`
   - Files: `inbox.types.ts`, `inbox.validation.ts`, `triage.service.ts`
2. `feat(inbox): add draft generation service with tone matching`
   - Files: `draft.service.ts`
3. `feat(inbox): add inbox service with listing, threading, follow-ups, and canned responses`
   - Files: `inbox.service.ts`, `index.ts`
4. `feat(inbox): add inbox API routes for triage, draft, send, follow-ups, and canned responses`
   - Files: All files in `src/app/api/inbox/`
5. `feat(inbox): add inbox UI components (list, filters, detail, draft editor, batch triage)`
   - Files: All files in `src/modules/inbox/components/`
6. `feat(inbox): add inbox UI pages (main inbox, message detail, follow-ups, canned responses)`
   - Files: All files in `src/app/(dashboard)/inbox/`
7. `test(inbox): add unit tests for triage scoring, draft generation, and inbox service`
   - Files: All files in `tests/unit/inbox/`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
