# Worker 10: Complete Communication Module + Dashboard + Tests

## Branch

`ai-feature/p3-w10-communication-module`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to modifying files within these paths. Do NOT touch any files outside these directories:

- `src/modules/communication/services/broadcast-manager.ts`
- `src/modules/communication/services/cadence-engine.ts`
- `src/modules/communication/services/commitment-tracker.ts`
- `src/modules/communication/services/drafting-engine.ts`
- `src/modules/communication/services/relationship-intelligence.ts`
- `src/modules/communication/services/tone-analyzer.ts`
- `src/app/(dashboard)/communication/page.tsx`
- `tests/unit/communication/broadcast-manager.test.ts`
- `tests/unit/communication/cadence-engine.test.ts`
- `tests/unit/communication/tone-analyzer.test.ts`

### Do NOT modify

- `jest.config.ts`
- `package.json`
- `tsconfig.json`
- `prisma/schema.prisma`
- Any files outside the owned paths above

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

1. **`src/lib/ai/index.ts`** -- Exports `generateText(prompt, options?)`, `generateJSON<T>(prompt, options?)`, `chat(messages, options?)`, `streamText(prompt, options?)`.
2. **`src/lib/db/index.ts`** -- Exports `prisma` client instance.
3. **`prisma/schema.prisma`** -- Key models for this worker:
   - `Message` -- has `channel`, `senderId`, `recipientId`, `entityId`, `body`, `subject`, `triageScore`, `sensitivity`, `draftStatus`, `attachments` (JSON), `createdAt`.
   - `Contact` -- has `name`, `email`, `phone`, `tags` (String[]), `preferences` (JSON), `commitments` (JSON), `relationshipScore`, `lastTouch`, `entityId`.
   - `Notification` -- has `type`, `title`, `message`, `priority`, `userId`, `entityId`, `metadata` (JSON).
4. **`src/modules/communication/types.ts`** -- All communication types: `BroadcastRequest`, `BroadcastResult`, `FollowUpCadence`, `CadenceFrequency`, `ToneAnalysis`, `RelationshipNode`, `GhostingAnalysis`, `ReengagementStrategy`.
5. **`src/shared/types/index.ts`** -- Shared types: `Message`, `Tone`, `Sensitivity`, `MessageChannel`, `Contact`.
6. **`src/lib/integrations/email/workflows.ts`** -- Email workflow functions for sending emails.
7. **`src/lib/integrations/sms/workflows.ts`** -- SMS workflow functions for sending text messages.
8. **`src/modules/communication/services/broadcast-manager.ts`** -- Already uses Prisma. Has `renderTemplate`, `validateRecipients`, `sendBroadcast`. Sends broadcasts by creating Message records. Functional but lacks email/SMS integration.
9. **`src/modules/communication/services/cadence-engine.ts`** -- Already uses Prisma. Has `setCadence`, `getOverdueFollowUps`, `escalateFollowUp`, `getNextFollowUps`. Stores cadence info in Contact.preferences. Functional.
10. **`src/modules/communication/services/commitment-tracker.ts`** -- Was AI-enhanced in Phase 2. Has `extractCommitmentsFromText` (uses `generateJSON`), `addCommitment`, `getCommitments`, `updateCommitmentStatus`, `extractAndSaveCommitments`. Already functional with AI.
11. **`src/modules/communication/services/drafting-engine.ts`** -- Was AI-enhanced in Phase 2. Has multi-variant draft generation with `generateText`, tone analysis via `generateJSON`, compliance scanning (regex-based). Already functional with AI.
12. **`src/modules/communication/services/relationship-intelligence.ts`** -- Uses Prisma. Has `calculateRelationshipScore` (4-signal scoring), `getRelationshipGraph`, `detectGhosting`, `suggestReengagement`. Functional but no AI -- all rule-based.
13. **`src/modules/communication/services/tone-analyzer.ts`** -- Pure functions. Has `analyzeTone` (keyword-based), `shiftTone` (prefix/suffix transformation). No AI, no Prisma.
14. **`src/app/(dashboard)/communication/page.tsx`** -- Currently shows two tabs: "Draft Composer" and "Broadcast". Uses `DraftComposer` and `BroadcastComposer` client components. No data fetching -- components may handle their own.
15. **Existing test files**: Read `tests/unit/communication/*.test.ts` to understand existing patterns.
16. **`src/modules/communication/components/`** -- Client components used by the dashboard page.

## Requirements

### 1. broadcast-manager.ts: Add email/SMS workflow integration and scheduling

**Read the file first** -- already uses Prisma for message creation and recipient validation.

#### Specific modifications:

a. **Add email/SMS integration imports**:
```typescript
import { sendEmailWorkflow } from '@/lib/integrations/email/workflows';
import { sendSmsWorkflow } from '@/lib/integrations/sms/workflows';
```
Read the workflow files first to understand their function signatures.

b. **Enhance `sendBroadcast`** to actually dispatch via email/SMS:
- After creating the Message record in Prisma, trigger the appropriate workflow:
```typescript
if (channel === 'EMAIL') {
  try {
    // Look up contact's email
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { email: true, name: true },
    });
    if (contact?.email) {
      await sendEmailWorkflow({
        to: contact.email,
        subject: `Broadcast: ${template.slice(0, 50)}`,
        body,
      });
    }
  } catch {
    // Email send failed -- message is still recorded
  }
} else if (channel === 'SMS') {
  try {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { phone: true, name: true },
    });
    if (contact?.phone) {
      await sendSmsWorkflow({
        to: contact.phone,
        body,
      });
    }
  } catch {
    // SMS send failed -- message is still recorded
  }
}
```
Note: Read the actual workflow function signatures to match parameters correctly. The above is illustrative.

c. **Add broadcast scheduling support**:
```typescript
export async function scheduleBroadcast(
  request: BroadcastRequest & { scheduledAt: Date }
): Promise<{ broadcastId: string; scheduledAt: Date }> {
  // Store the broadcast as a pending Document for later execution
  const doc = await prisma.document.create({
    data: {
      title: `Scheduled Broadcast`,
      entityId: request.entityId,
      type: 'SCHEDULED_BROADCAST',
      content: JSON.stringify(request),
      status: 'DRAFT',
      metadata: {
        scheduledAt: request.scheduledAt.toISOString(),
        recipientCount: request.recipientIds.length,
      },
    },
  });

  return { broadcastId: doc.id, scheduledAt: request.scheduledAt };
}
```

d. **Add `getBroadcastHistory` function**:
```typescript
export async function getBroadcastHistory(
  entityId: string,
  limit = 20
): Promise<Array<{ id: string; subject: string; totalSent: number; sentAt: Date }>> {
  const messages = await prisma.message.findMany({
    where: {
      entityId,
      subject: { startsWith: 'Broadcast:' },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, subject: true, createdAt: true },
  });

  // Group by subject to get broadcast counts
  const grouped = new Map<string, { id: string; subject: string; totalSent: number; sentAt: Date }>();
  for (const msg of messages) {
    const key = msg.subject ?? '';
    if (!grouped.has(key)) {
      grouped.set(key, { id: msg.id, subject: key, totalSent: 0, sentAt: msg.createdAt });
    }
    grouped.get(key)!.totalSent += 1;
  }

  return Array.from(grouped.values());
}
```

e. **Keep all existing exports** and add new ones.

### 2. cadence-engine.ts: Add reminder trigger via Notification model

**Read the file first** -- already uses Prisma Contact, fully functional.

#### Specific modifications:

a. **Add Notification creation for overdue cadences**:
```typescript
export async function triggerCadenceReminders(entityId: string): Promise<number> {
  const overdue = await getOverdueFollowUps(entityId);
  let triggered = 0;

  for (const cadence of overdue) {
    const contact = await prisma.contact.findUnique({
      where: { id: cadence.contactId },
      select: { name: true, entityId: true },
    });

    if (!contact) continue;

    // Check if we already sent a reminder for this cadence period
    const existing = await prisma.notification.findFirst({
      where: {
        entityId,
        type: 'cadence_reminder',
        metadata: {
          path: ['contactId'],
          equals: cadence.contactId,
        },
        createdAt: { gte: cadence.nextDue },
      },
    });

    if (existing) continue; // Already reminded

    await prisma.notification.create({
      data: {
        type: 'cadence_reminder',
        title: `Follow up with ${contact.name}`,
        message: `${contact.name} is overdue for a ${cadence.frequency.toLowerCase()} follow-up. Last contact: ${cadence.nextDue.toLocaleDateString()}.`,
        priority: cadence.isOverdue ? 'HIGH' : 'MEDIUM',
        entityId,
        userId: entityId, // Will be resolved to actual userId
        metadata: {
          contactId: cadence.contactId,
          frequency: cadence.frequency,
          nextDue: cadence.nextDue.toISOString(),
        },
      },
    });

    triggered++;
  }

  return triggered;
}
```

b. **Add `getCadenceStatus` for a single contact**:
```typescript
export async function getCadenceStatus(contactId: string): Promise<FollowUpCadence | null> {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) return null;

  const { frequency, escalationAfterMisses } = parseCadencePreferences(contact.preferences);
  if (!frequency) return null;

  const nextDue = computeNextDue(contact.lastTouch, frequency);

  return {
    contactId,
    frequency,
    nextDue,
    escalationAfterMisses: escalationAfterMisses ?? 3,
    isOverdue: isBefore(nextDue, new Date()),
  };
}
```

c. **Keep all existing exports** and add new ones.

### 3. commitment-tracker.ts: Verify Phase 2 AI wiring

**Read the file first** -- was AI-enhanced in Phase 2.

#### Specific verifications (no changes expected):

a. Verify `extractCommitmentsFromText` calls `generateJSON` from `@/lib/ai`.
b. Verify `extractAndSaveCommitments` properly calls `extractCommitmentsFromText` then `addCommitment`.
c. Verify commitments are stored in `Contact.commitments` JSON field via Prisma.
d. If any of the above are missing or broken, fix them while keeping existing exports.

### 4. drafting-engine.ts: Verify Phase 2 AI wiring

**Read the file first** -- was AI-enhanced in Phase 2.

#### Specific verifications (no changes expected):

a. Verify draft variant generation uses `generateText` from `@/lib/ai`.
b. Verify tone analysis uses `generateJSON` from `@/lib/ai`.
c. Verify compliance scanning remains regex-based (NOT AI).
d. If any of the above are missing or broken, fix them while keeping existing exports.

### 5. relationship-intelligence.ts: Add AI-powered insights

**Read the file first** -- uses Prisma, fully functional but no AI.

#### Specific modifications:

a. **Add AI import**:
```typescript
import { generateJSON } from '@/lib/ai';
```

b. **Add `getRelationshipInsights` function**:
```typescript
export async function getRelationshipInsights(contactId: string): Promise<{
  healthScore: number;
  riskFactors: string[];
  opportunities: string[];
  suggestedActions: string[];
}> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: { messages: { take: 20, orderBy: { createdAt: 'desc' } }, calls: { take: 10, orderBy: { createdAt: 'desc' } } },
  });

  if (!contact) throw new Error(`Contact not found: ${contactId}`);

  const score = await calculateRelationshipScore(contactId);
  const ghosting = await detectGhosting(contactId);

  try {
    const result = await generateJSON<{
      riskFactors: string[];
      opportunities: string[];
      suggestedActions: string[];
    }>(`Analyze this contact relationship and provide insights.

Contact: ${contact.name}
Relationship score: ${score}/100
Days since last contact: ${ghosting.daysSinceLastContact}
Average communication cadence: ${ghosting.averageCadenceDays} days
Ghosting risk: ${ghosting.riskLevel}
Recent messages: ${(contact.messages as unknown[])?.length ?? 0}
Recent calls: ${(contact.calls as unknown[])?.length ?? 0}
Tags: ${contact.tags.join(', ')}
Commitments: ${JSON.stringify(contact.commitments).substring(0, 500)}

Return JSON with:
- riskFactors: array of risks to this relationship
- opportunities: array of opportunities to strengthen the relationship
- suggestedActions: array of specific next steps to take`, {
      maxTokens: 512,
      temperature: 0.5,
      system: 'You are a relationship management advisor. Provide practical, specific insights for maintaining professional relationships.',
    });

    return {
      healthScore: score,
      ...result,
    };
  } catch {
    return {
      healthScore: score,
      riskFactors: ghosting.riskLevel === 'HIGH' ? ['Contact has gone silent'] : [],
      opportunities: [],
      suggestedActions: [ghosting.suggestedAction],
    };
  }
}
```

c. **Add `getContactsNeedingAttention` function**:
```typescript
export async function getContactsNeedingAttention(
  entityId: string,
  limit = 10
): Promise<Array<{ contactId: string; name: string; score: number; reason: string }>> {
  const contacts = await prisma.contact.findMany({
    where: { entityId },
    select: { id: true, name: true, relationshipScore: true, lastTouch: true },
    orderBy: { relationshipScore: 'asc' },
    take: limit * 2, // Get more than we need so we can filter
  });

  const now = new Date();
  const results: Array<{ contactId: string; name: string; score: number; reason: string }> = [];

  for (const contact of contacts) {
    if (results.length >= limit) break;

    const daysSinceTouch = contact.lastTouch
      ? differenceInDays(now, contact.lastTouch)
      : 999;

    let reason = '';
    if (daysSinceTouch > 30) {
      reason = `No contact in ${daysSinceTouch} days`;
    } else if (contact.relationshipScore < 30) {
      reason = `Low relationship score: ${contact.relationshipScore}/100`;
    } else {
      continue; // Does not need attention
    }

    results.push({
      contactId: contact.id,
      name: contact.name,
      score: contact.relationshipScore,
      reason,
    });
  }

  return results;
}
```

d. **Keep all existing exports** and add new ones.

### 6. tone-analyzer.ts: Add AI-powered tone analysis

**Read the file first** -- pure keyword-based functions, no AI.

#### Specific modifications:

a. **Add AI import**:
```typescript
import { generateJSON } from '@/lib/ai';
```

b. **Add `analyzeToneWithAI` function** (separate from existing `analyzeTone`):
```typescript
export async function analyzeToneWithAI(text: string): Promise<ToneAnalysis> {
  if (!text || text.trim().length === 0) {
    return analyzeTone(text); // Use keyword-based for empty/short text
  }

  try {
    const result = await generateJSON<{
      detectedTone: string;
      confidence: number;
      formality: number;
      assertiveness: number;
      empathy: number;
      suggestions: string[];
    }>(`Analyze the tone of this text.

Text: "${text.substring(0, 2000)}"

Return JSON with:
- detectedTone: one of FIRM, DIPLOMATIC, WARM, DIRECT, CASUAL, FORMAL, EMPATHETIC, AUTHORITATIVE
- confidence: 0-1
- formality: 1-10
- assertiveness: 1-10
- empathy: 1-10
- suggestions: array of tone improvement suggestions`, {
      maxTokens: 256,
      temperature: 0.2,
      system: 'You are a communication tone analyst. Analyze text tone accurately with precise metrics.',
    });

    return {
      detectedTone: result.detectedTone as Tone,
      confidence: result.confidence,
      formality: result.formality,
      assertiveness: result.assertiveness,
      empathy: result.empathy,
      suggestions: result.suggestions,
    };
  } catch {
    return analyzeTone(text); // Fallback to keyword-based
  }
}
```

c. **Add `shiftToneWithAI` function**:
```typescript
export async function shiftToneWithAI(text: string, targetTone: Tone): Promise<string> {
  if (!text || text.trim().length === 0) {
    return text;
  }

  try {
    const result = await generateText(
      `Rewrite the following text to match the ${targetTone} tone. Preserve the original meaning and key information.

Original text: "${text}"

Return ONLY the rewritten text, nothing else.`,
      {
        maxTokens: 1024,
        temperature: 0.6,
        system: `You are a professional writing assistant. Rewrite text to match the specified tone:
- FIRM: Clear expectations, direct language
- DIPLOMATIC: Balanced, considerate, seeking mutual ground
- WARM: Friendly, appreciative, positive
- DIRECT: Concise, no filler, action-oriented
- CASUAL: Relaxed, conversational
- FORMAL: Professional, structured, proper
- EMPATHETIC: Understanding, supportive, compassionate
- AUTHORITATIVE: Commanding, decisive, policy-like`,
      }
    );

    return result || shiftTone(text, targetTone);
  } catch {
    return shiftTone(text, targetTone); // Fallback to rule-based
  }
}
```

d. **Keep all existing exports** (`analyzeTone`, `shiftTone`) unchanged -- they remain as fast, deterministic fallbacks. Add the new AI variants as additional exports.

### 7. communication/page.tsx: Wire to real APIs and add cadence/relationship tabs

**Read the file first** -- currently has two tabs (Draft Composer, Broadcast).

#### Specific modifications:

a. **Add additional tabs** for Cadence and Relationships:
```typescript
type Tab = 'drafting' | 'broadcast' | 'cadence' | 'relationships';
```

b. **Add data fetching for cadence and relationships**:
```typescript
const [overdueFollowUps, setOverdueFollowUps] = useState([]);
const [contactsNeedingAttention, setContactsNeedingAttention] = useState([]);
const [broadcastHistory, setBroadcastHistory] = useState([]);

useEffect(() => {
  async function fetchData() {
    try {
      const [cadenceRes, attentionRes, historyRes] = await Promise.all([
        fetch('/api/communication/cadence/overdue'),
        fetch('/api/communication/relationships/attention'),
        fetch('/api/communication/broadcast/history'),
      ]);
      // Parse and set state
    } catch (err) {
      console.error('Failed to fetch communication data:', err);
    }
  }
  fetchData();
}, []);
```

c. **Add cadence tab content**: Display overdue follow-ups as a list with contact name, frequency, days overdue.

d. **Add relationships tab content**: Display contacts needing attention with score, reason, and suggested action.

e. **Add broadcast history section** under the Broadcast tab showing recent broadcasts.

## Acceptance Criteria

1. `broadcast-manager.ts` triggers email/SMS workflows after creating Message records.
2. `broadcast-manager.ts` has `scheduleBroadcast` and `getBroadcastHistory` functions.
3. `cadence-engine.ts` has `triggerCadenceReminders` that creates Notifications and `getCadenceStatus`.
4. `commitment-tracker.ts` AI wiring is verified as functional (extractCommitmentsFromText uses generateJSON).
5. `drafting-engine.ts` AI wiring is verified as functional (uses generateText and generateJSON).
6. `relationship-intelligence.ts` has `getRelationshipInsights` using AI and `getContactsNeedingAttention`.
7. `tone-analyzer.ts` has `analyzeToneWithAI` and `shiftToneWithAI` using `generateJSON`/`generateText`, with keyword-based fallbacks.
8. `communication/page.tsx` has 4 tabs (drafting, broadcast, cadence, relationships) and fetches real data.
9. All existing function signatures and exports are preserved.
10. AI imports come from `@/lib/ai`. Prisma imports come from `@/lib/db`.
11. `jest.config.ts`, `package.json`, `tsconfig.json`, and `prisma/schema.prisma` are NOT modified.
12. All tests pass: `npx jest tests/unit/communication/`.

## Implementation Steps

1. **Read all context files** listed above, including existing test files and workflow files.
2. **Create branch**: `git checkout -b ai-feature/p3-w10-communication-module`
3. **Modify `broadcast-manager.ts`**: Add email/SMS workflow dispatch, scheduleBroadcast, getBroadcastHistory.
4. **Modify `cadence-engine.ts`**: Add triggerCadenceReminders and getCadenceStatus.
5. **Verify `commitment-tracker.ts`**: Read and confirm AI wiring. Fix if broken.
6. **Verify `drafting-engine.ts`**: Read and confirm AI wiring. Fix if broken.
7. **Modify `relationship-intelligence.ts`**: Add getRelationshipInsights (AI) and getContactsNeedingAttention.
8. **Modify `tone-analyzer.ts`**: Add analyzeToneWithAI and shiftToneWithAI.
9. **Modify `communication/page.tsx`**: Add cadence and relationships tabs, wire to APIs.
10. **Write/update tests** for broadcast-manager, cadence-engine, tone-analyzer.
11. **Type-check**: `npx tsc --noEmit`
12. **Run tests**: `npx jest tests/unit/communication/`
13. **Commit** with conventional commits.

## Tests Required

### `tests/unit/communication/broadcast-manager.test.ts` (update existing)
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    contact: { findMany: jest.fn(), findUnique: jest.fn() },
    message: { create: jest.fn(), findMany: jest.fn() },
    document: { create: jest.fn() },
  },
}));
jest.mock('@/lib/integrations/email/workflows', () => ({
  sendEmailWorkflow: jest.fn(),
}));
jest.mock('@/lib/integrations/sms/workflows', () => ({
  sendSmsWorkflow: jest.fn(),
}));

describe('broadcast-manager', () => {
  describe('renderTemplate', () => {
    it('should replace merge fields in template');
    it('should leave unreplaced fields as-is');
  });

  describe('validateRecipients', () => {
    it('should mark doNotContact recipients as invalid');
    it('should mark recipients with no channels as invalid');
    it('should return found contacts as valid');
  });

  describe('sendBroadcast', () => {
    it('should create Message records for valid recipients');
    it('should trigger email workflow for EMAIL channel');
    it('should trigger SMS workflow for SMS channel');
    it('should count failures for invalid recipients');
    it('should continue on individual send failures');
  });

  describe('scheduleBroadcast', () => {
    it('should create Document with type SCHEDULED_BROADCAST');
    it('should store scheduled time in metadata');
  });

  describe('getBroadcastHistory', () => {
    it('should query messages with Broadcast: subject prefix');
    it('should group by subject for deduplication');
  });
});
```

### `tests/unit/communication/cadence-engine.test.ts` (update existing)
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    contact: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    notification: { create: jest.fn(), findFirst: jest.fn() },
  },
}));

describe('cadence-engine', () => {
  describe('setCadence', () => {
    it('should validate frequency values');
    it('should store cadence in contact preferences');
    it('should calculate next due date based on lastTouch');
    it('should throw for invalid contact');
  });

  describe('getOverdueFollowUps', () => {
    it('should return contacts past their cadence due date');
    it('should skip contacts without cadence set');
    it('should mark as overdue when nextDue is in the past');
  });

  describe('triggerCadenceReminders', () => {
    it('should create Notifications for overdue contacts');
    it('should skip contacts already reminded');
    it('should set HIGH priority for overdue cadences');
    it('should return count of triggered reminders');
  });

  describe('getCadenceStatus', () => {
    it('should return cadence info for a contact');
    it('should return null for contacts without cadence');
    it('should calculate isOverdue correctly');
  });

  describe('escalateFollowUp', () => {
    it('should set escalated flag in contact preferences');
    it('should include escalation timestamp');
  });
});
```

### `tests/unit/communication/tone-analyzer.test.ts` (update existing)
```typescript
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
  generateText: jest.fn(),
}));

describe('tone-analyzer', () => {
  describe('analyzeTone', () => {
    it('should detect FIRM tone from firm keywords');
    it('should detect WARM tone from warm keywords');
    it('should detect CASUAL tone from casual keywords');
    it('should return DIRECT as default for neutral text');
    it('should return 0 confidence for empty text');
  });

  describe('analyzeToneWithAI', () => {
    it('should call generateJSON with text content');
    it('should return AI-detected tone with metrics');
    it('should fallback to keyword-based on AI failure');
    it('should use keyword-based for empty text');
  });

  describe('shiftTone', () => {
    it('should add WARM prefix and suffix');
    it('should add FORMAL prefix and expand contractions');
    it('should add CASUAL prefix and contract words');
    it('should strip existing greetings before shifting');
  });

  describe('shiftToneWithAI', () => {
    it('should call generateText to rewrite with target tone');
    it('should preserve original meaning');
    it('should fallback to rule-based on AI failure');
    it('should return empty text unchanged');
  });
});
```

## Commit Strategy

Make atomic commits in this order:

1. `feat(communication): add email/SMS workflow dispatch and scheduling to broadcast manager`
   - Files: `src/modules/communication/services/broadcast-manager.ts`
2. `feat(communication): add cadence reminder notifications and status queries`
   - Files: `src/modules/communication/services/cadence-engine.ts`
3. `feat(communication): verify AI wiring in commitment tracker and drafting engine`
   - Files: `src/modules/communication/services/commitment-tracker.ts`, `src/modules/communication/services/drafting-engine.ts`
4. `feat(communication): add AI-powered relationship insights and attention detection`
   - Files: `src/modules/communication/services/relationship-intelligence.ts`
5. `feat(communication): add AI-powered tone analysis and tone shifting`
   - Files: `src/modules/communication/services/tone-analyzer.ts`
6. `feat(communication): wire dashboard with cadence and relationships tabs`
   - Files: `src/app/(dashboard)/communication/page.tsx`
7. `test(communication): add tests for broadcast-manager, cadence-engine, tone-analyzer`
   - Files: `tests/unit/communication/broadcast-manager.test.ts`, `tests/unit/communication/cadence-engine.test.ts`, `tests/unit/communication/tone-analyzer.test.ts`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
