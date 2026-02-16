# Worker 09: Complete Voice + VoiceForge Modules

## Branch

`ai-feature/p3-w09-voice-voiceforge`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to modifying files within these paths. Do NOT touch any files outside these directories:

- `src/modules/voice/services/command-parser.ts`
- `src/modules/voice/services/stt-service.ts`
- `src/modules/voice/services/wake-word-service.ts`
- `src/modules/voice/services/voiceforge-handoff.ts`
- `src/modules/voiceforge/services/campaign-service.ts`
- `src/modules/voiceforge/services/conversational-intel.ts`
- `src/modules/voiceforge/services/inbound-agent.ts`
- `src/modules/voiceforge/services/number-manager.ts`
- `src/modules/voiceforge/services/outbound-agent.ts`
- `src/modules/voiceforge/services/persona-service.ts`
- `src/modules/voiceforge/services/script-engine.ts`
- `src/lib/voice/mock-provider.ts`
- `src/lib/voice/consent-manager.ts`
- `tests/unit/voice/wake-word-service.test.ts`
- `tests/unit/voiceforge/number-manager.test.ts`
- `tests/unit/voiceforge/conversational-intel.test.ts`

### Do NOT modify

- `jest.config.ts`
- `package.json`
- `tsconfig.json`
- `prisma/schema.prisma`
- `src/lib/voice/types.ts`
- `src/lib/voice/index.ts`
- Any files outside the owned paths above

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

1. **`src/lib/ai/index.ts`** -- Exports `generateText(prompt, options?)`, `generateJSON<T>(prompt, options?)`, `chat(messages, options?)`, `streamText(prompt, options?)`.
2. **`src/lib/db/index.ts`** -- Exports `prisma` client instance.
3. **`prisma/schema.prisma`** -- Key models for this worker:
   - `Call` -- has `entityId`, `contactId`, `direction` (INBOUND/OUTBOUND), `personaId`, `scriptId`, `outcome`, `duration`, `sentiment`, `actionItems` (JSON), `transcript`, `createdAt`.
   - `Document` -- has `title`, `type`, `content`, `status`, `entityId`, `metadata` (JSON). Used for campaign, persona, script, number storage via custom type values.
   - `Contact` -- has `name`, `phone`, `entityId`, etc.
   - `Entity` -- has `phoneNumbers` (String[]).
   - `ConsentReceipt` -- has `actionId`, `description`, `reason`, `impacted` (String[]), `reversible`, `confidence`.
4. **`src/lib/voice/types.ts`** -- Voice infrastructure types: `VoiceProvider`, `ProvisionedNumber`, `OutboundCallConfig`, `CallSession`, `CallStatus`, `ConsentCheck`.
5. **`src/lib/voice/mock-provider.ts`** -- `MockVoiceProvider` class implementing `VoiceProvider`. Has `provisionNumber`, `releaseNumber`, `initiateCall`, `getCallStatus`. Uses simulated delays and random phone generation.
6. **`src/lib/voice/consent-manager.ts`** -- `checkConsentRequirements` (state law checker), `recordConsent`, `verifyConsent`, `revokeConsent`. All use Prisma.
7. **`src/modules/voice/types.ts`** -- Voice module types: `ParsedVoiceCommand`, `VoiceIntent`, `VoiceCommandDefinition`, `ExtractedEntity`, `VoiceSession`, `STTConfig`, `STTProvider`, `WakeWordConfig`, `VoiceForgeHandoff`.
8. **`src/modules/voice/services/command-parser.ts`** -- Fully implemented with AI-first parsing via `parseIntentWithAI` (uses `generateJSON`) and regex fallback. Has `CommandParser` class with built-in commands, entity extraction, keyword fallback. Already complete.
9. **`src/modules/voice/services/stt-service.ts`** -- `STTService` with pluggable provider interface, `BrowserSTTProvider` default, session management. AI already wired into `endSession` for transcript post-processing via `generateText`. Already complete.
10. **`src/modules/voice/services/wake-word-service.ts`** -- `WakeWordService` placeholder. Has `initialize`, `startListening`, `stopListening`, `onWakeWordDetected`, `simulateDetection`. Config management works; actual detection is stubbed.
11. **`src/modules/voice/services/voiceforge-handoff.ts`** -- `VoiceForgeHandoffService` with in-memory Map. Has `initiateHandoff`, `getHandoffStatus`, `cancelHandoff`. No Prisma, no AI.
12. **`src/modules/voiceforge/services/campaign-service.ts`** -- Uses Prisma Document model. Fully implemented: `createCampaign`, `getCampaign`, `listCampaigns`, `startCampaign`, `pauseCampaign`, `stopCampaign`, `updateStats`, `checkStopConditions`, `getNextContacts`, `analyzeCampaignPerformance` (AI via `generateJSON`). Already complete.
13. **`src/modules/voiceforge/services/conversational-intel.ts`** -- Has `analyzeCall`, `calculateSentiment` (keyword-based), `extractKeyInfo` (regex), `checkCompliance` (keyword), `generateSummary` (rule-based), `calculateTalkRatio`. No AI -- all rule/regex-based.
14. **`src/modules/voiceforge/services/inbound-agent.ts`** -- Uses Prisma. Has `handleInboundCall`, `screenCaller`, `routeCall`, `isAfterHours`, `saveInboundConfig`, `getInboundConfig`. Already functional.
15. **`src/modules/voiceforge/services/number-manager.ts`** -- Uses Prisma Document model + MockVoiceProvider. Has `provisionNumber`, `releaseNumber`, `getNumber`, `listNumbers`, `assignPersona`, `assignInboundConfig`. Already functional.
16. **`src/modules/voiceforge/services/outbound-agent.ts`** -- Uses Prisma + MockVoiceProvider + consent-manager. Has `initiateOutboundCall`, `detectVoicemail` (stub), `dropVoicemail` (stub), `checkGuardrails`. Already functional but uses random simulation for outcomes.
17. **`src/modules/voiceforge/services/persona-service.ts`** -- Uses Prisma Document model. Fully implemented: `createPersona`, `getPersona`, `listPersonas`, `updatePersona`, `addConsentEntry`, `revokeConsent`, `validateConsentChain`, `suggestPersonaTraits` (AI via `generateJSON`). Already complete.
18. **`src/modules/voiceforge/services/script-engine.ts`** -- Uses Prisma Document model + AI. Has CRUD, `executeScript`, branch evaluation, `generateDynamicResponse` (uses `generateText`), `generateScriptFromDescription` (uses `generateJSON`). Already complete.
19. **Existing test files**: Read `tests/unit/voice/*.test.ts` and `tests/unit/voiceforge/*.test.ts` to understand existing patterns and mocking strategies.

## Requirements

### 1. command-parser.ts: Verify and enhance

**Read the file first** -- already fully implemented with AI-first parsing.

#### Specific modifications:

a. **Verify AI + regex merge logic**: The `mergeEntities` method should properly deduplicate entities. Test that when AI and regex both extract the same entity, the AI version takes precedence.

b. **Add confidence thresholding**: If AI returns entities with confidence below 0.3, drop them to avoid noise:
```typescript
private mergeEntities(
  aiEntities: ExtractedEntity[],
  regexEntities: ExtractedEntity[],
): ExtractedEntity[] {
  const merged = new Map<string, ExtractedEntity>();

  for (const entity of regexEntities) {
    const key = `${entity.type}:${entity.value}`;
    merged.set(key, entity);
  }

  for (const entity of aiEntities) {
    if (entity.confidence < 0.3) continue; // Drop low-confidence AI entities
    const key = `${entity.type}:${entity.value}`;
    merged.set(key, entity);
  }

  return Array.from(merged.values());
}
```

c. **Keep all existing exports** -- `commandParser`, `CommandParser`, `extractEntities`.

### 2. stt-service.ts: Verify and enhance error handling

**Read the file first** -- already complete with AI transcription enhancement.

#### Specific modifications:

a. **Add session timeout handling**: If a session has been in LISTENING state for more than 5 minutes, auto-end it:
```typescript
private readonly SESSION_TIMEOUT_MS = 5 * 60 * 1000;

private checkSessionTimeout(session: VoiceSession): boolean {
  const elapsed = Date.now() - session.startedAt.getTime();
  return elapsed > this.SESSION_TIMEOUT_MS;
}
```

b. **Enhance `processAudioChunk`** to check for timeout:
```typescript
if (this.checkSessionTimeout(session)) {
  return this.endSession(sessionId).then(s => ({
    interim: s.transcript ?? '',
    isFinal: true,
  }));
}
```

c. **Keep all existing exports** -- `sttService`, `STTService`, `DEFAULT_STT_CONFIG`.

### 3. wake-word-service.ts: Implement config management with persistence

**Read the file first** -- placeholder with config management and simulated detection.

#### Specific modifications:

a. **Add config persistence**: Store wake word config so it survives restarts:
```typescript
private configHistory: Array<{ config: WakeWordConfig; setAt: Date }> = [];
```

b. **Add `updateConfig` method**:
```typescript
async updateConfig(updates: Partial<WakeWordConfig>): Promise<WakeWordConfig> {
  const wasListening = this.isListening;
  if (wasListening) await this.stopListening();

  this.config = { ...this.config, ...updates };
  this.configHistory.push({ config: { ...this.config }, setAt: new Date() });

  if (wasListening) await this.startListening();
  return this.config;
}
```

c. **Add sensitivity validation** in `initialize`:
```typescript
if (config.sensitivity < 0 || config.sensitivity > 1) {
  throw new Error('Sensitivity must be between 0 and 1');
}
```

d. **Add `processAudioFrame` method** for the detection interface:
```typescript
processAudioFrame(frame: Float32Array): boolean {
  if (!this.isListening || !this.config.enabled) return false;

  // Placeholder: In production, this would feed the audio frame to the
  // wake word detection model and return true if the wake phrase is detected.
  // For now, this is a no-op that returns false.
  // Production: return this.detector.process(frame);
  return false;
}
```

e. **Add `getConfigHistory` method** for debugging:
```typescript
getConfigHistory(): Array<{ config: WakeWordConfig; setAt: Date }> {
  return [...this.configHistory];
}
```

f. **Keep all existing exports** -- `wakeWordService`, `WakeWordService`, `DEFAULT_WAKE_WORD_CONFIG`.

### 4. voiceforge-handoff.ts: Add Prisma persistence and Call model integration

**Read the file first** -- uses in-memory Map, no Prisma.

#### Specific modifications:

a. **Add Prisma import**:
```typescript
import { prisma } from '@/lib/db';
```

b. **Update `initiateHandoff`** to create a Call record:
```typescript
async initiateHandoff(params: InitiateHandoffParams): Promise<VoiceForgeHandoff> {
  const handoff: VoiceForgeHandoff = {
    id: uuidv4(),
    voiceSessionId: params.voiceSessionId,
    contactId: params.contactId,
    entityId: params.entityId,
    phoneNumber: params.phoneNumber,
    context: params.context,
    scriptHints: params.scriptHints ?? [],
    status: 'PENDING',
  };

  this.handoffs.set(handoff.id, handoff);

  // Create a Call record to track the telephony handoff
  try {
    await prisma.call.create({
      data: {
        entityId: params.entityId,
        contactId: params.contactId,
        direction: 'OUTBOUND',
        outcome: 'CONNECTED',
        duration: 0,
        actionItems: [],
        transcript: `Handoff context: ${params.context}`,
      },
    });
  } catch {
    // Call record creation failed -- handoff can still proceed
  }

  return handoff;
}
```

c. **Update `cancelHandoff`** to update the Call record:
```typescript
async cancelHandoff(handoffId: string): Promise<void> {
  const handoff = this.handoffs.get(handoffId);
  if (!handoff) throw new Error(`Handoff "${handoffId}" not found`);
  if (handoff.status === 'ACTIVE') throw new Error('Cannot cancel an active handoff');

  handoff.status = 'FAILED';
  // No Call update needed -- the call was never connected
}
```

d. **Keep existing exports** -- `voiceForgeHandoffService`, `VoiceForgeHandoffService`.

### 5. campaign-service.ts: Verify completeness

**Read the file first** -- already fully implemented with Prisma + AI.

#### No modifications needed. This service is complete. Verify by reading and confirming:
- CRUD operations use Prisma Document model
- `analyzeCampaignPerformance` uses `generateJSON`
- `checkStopConditions` handles all condition types
- `updateStats` correctly recalculates averages

### 6. conversational-intel.ts: Add AI-powered analysis

**Read the file first** -- currently all rule/regex-based with no AI.

#### Specific modifications:

a. **Add AI import**:
```typescript
import { generateJSON } from '@/lib/ai';
```

b. **Add `analyzeCallWithAI` method** for comprehensive AI analysis:
```typescript
export async function analyzeCallWithAI(
  callId: string,
  segments: TranscriptSegment[]
): Promise<CallAnalysis> {
  // First get rule-based analysis as baseline
  const baseAnalysis = await analyzeCall(callId, segments);

  // Enhance with AI
  try {
    const fullTranscript = segments.map(s => `[${s.speaker}] ${s.text}`).join('\n');

    const aiResult = await generateJSON<{
      sentimentScore: number;
      topics: string[];
      actionItems: string[];
      keyInsights: string[];
      overallTone: string;
      followUpRecommendation: string;
    }>(`Analyze this call transcript and provide insights.

Transcript:
${fullTranscript.substring(0, 3000)}

Return JSON with:
- sentimentScore: -1.0 to 1.0
- topics: array of discussion topics
- actionItems: array of action items identified
- keyInsights: array of key observations
- overallTone: one of POSITIVE, NEUTRAL, NEGATIVE, MIXED
- followUpRecommendation: what should happen next`, {
      maxTokens: 512,
      temperature: 0.3,
      system: 'You are a call analysis specialist. Extract actionable insights from call transcripts. Be concise and specific.',
    });

    // Merge AI insights into base analysis
    baseAnalysis.overallSentiment = aiResult.sentimentScore ?? baseAnalysis.overallSentiment;
    baseAnalysis.summary.actionItems = [
      ...baseAnalysis.summary.actionItems,
      ...aiResult.actionItems.filter(ai => !baseAnalysis.summary.actionItems.includes(ai)),
    ];
    baseAnalysis.summary.keyPoints = [
      ...baseAnalysis.summary.keyPoints,
      ...aiResult.keyInsights,
    ];
    if (aiResult.followUpRecommendation) {
      baseAnalysis.summary.followUpNeeded = true;
      baseAnalysis.summary.followUpReason = aiResult.followUpRecommendation;
      baseAnalysis.summary.nextSteps = [aiResult.followUpRecommendation];
    }

    return baseAnalysis;
  } catch {
    return baseAnalysis; // Fallback to rule-based analysis
  }
}
```

c. **Enhance `calculateSentiment`** with AI fallback for longer texts:
```typescript
export async function calculateSentimentWithAI(text: string): Promise<number> {
  if (text.split(/\s+/).length < 20) {
    // Short text: use keyword approach
    return calculateSentiment(text);
  }

  try {
    const result = await generateJSON<{ sentiment: number }>(
      `Rate the sentiment of this text on a scale of -1.0 (very negative) to 1.0 (very positive). Return JSON: { "sentiment": number }\n\nText: "${text.substring(0, 1000)}"`,
      { maxTokens: 64, temperature: 0.1, system: 'You are a sentiment analysis expert. Return only the JSON.' }
    );
    return Math.max(-1, Math.min(1, result.sentiment));
  } catch {
    return calculateSentiment(text);
  }
}
```

d. **Keep all existing exports** and add new ones.

### 7. inbound-agent.ts: Verify and enhance

**Read the file first** -- already uses Prisma and is functional.

#### Specific modifications:

a. **Add AI intent detection for incoming calls**: After screening the caller, use AI to detect the caller's likely intent based on historical call data:
```typescript
import { generateJSON } from '@/lib/ai';

async function detectCallerIntent(
  contactId: string | null,
  entityId: string
): Promise<string | undefined> {
  if (!contactId) return undefined;

  try {
    const recentCalls = await prisma.call.findMany({
      where: { contactId, entityId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { outcome: true, actionItems: true, transcript: true },
    });

    if (recentCalls.length === 0) return undefined;

    const result = await generateJSON<{ intent: string }>(
      `Based on this caller's recent call history, predict the likely intent of their new call.

Recent calls:
${recentCalls.map((c: { outcome: string | null; transcript: string | null }) => `- Outcome: ${c.outcome}, Transcript: ${(c.transcript ?? '').substring(0, 200)}`).join('\n')}

Return JSON with "intent": one of INQUIRY, FOLLOW_UP, COMPLAINT, SCHEDULING, SUPPORT, SALES, UNKNOWN`,
      { maxTokens: 128, temperature: 0.3, system: 'Predict call intent from historical patterns.' }
    );

    return result.intent;
  } catch {
    return undefined;
  }
}
```

b. **Wire intent into `handleInboundCall`**: Pass detected intent to `routeCall` via callerInfo.

c. **Keep all existing exports**.

### 8. number-manager.ts: Verify completeness

**Read the file first** -- already uses Prisma + MockVoiceProvider.

#### No modifications needed. This service is complete. Verify:
- Uses Prisma Document with `type: 'MANAGED_NUMBER'`
- Delegates provisioning/release to MockVoiceProvider
- Has `assignPersona` and `assignInboundConfig`

### 9. outbound-agent.ts: Enhance with real campaign integration

**Read the file first** -- uses random simulation for call outcomes.

#### Specific modifications:

a. **Add campaign-service integration**: Import and use campaign stats update:
```typescript
import { updateStats } from '@/modules/voiceforge/services/campaign-service';
```

b. **Add `initiateOutboundCallForCampaign` method** that updates campaign stats:
```typescript
export async function initiateOutboundCallForCampaign(
  request: OutboundCallRequest & { campaignId: string }
): Promise<OutboundCallResult> {
  const result = await initiateOutboundCall(request);

  // Update campaign stats
  try {
    await updateStats(request.campaignId, {
      outcome: result.outcome as OutboundCallResult['outcome'],
      duration: result.duration,
      sentiment: result.sentiment ?? 0,
    });
  } catch {
    // Stats update failed -- call still succeeded
  }

  return result;
}
```

c. **Keep all existing exports**.

### 10. persona-service.ts: Verify completeness

**Read the file first** -- already fully implemented with Prisma + AI.

#### No modifications needed. Verify:
- Uses Prisma Document with `type: 'VOICE_PERSONA'`
- `suggestPersonaTraits` uses `generateJSON`
- Consent chain management is complete

### 11. script-engine.ts: Verify completeness

**Read the file first** -- already uses Prisma + AI.

#### No modifications needed. Verify:
- Uses Prisma Document with `type: 'CALL_SCRIPT'`
- `generateDynamicResponse` uses `generateText`
- `generateScriptFromDescription` uses `generateJSON`

### 12. mock-provider.ts: Add proper provider interface structure

**Read the file first** -- implements `VoiceProvider` interface with mock behavior.

#### Specific modifications:

a. **Add `TwilioProviderStub` class** clearly labeled as a production stub:
```typescript
/**
 * Twilio Voice Provider Stub
 * Production implementation would use @twilio-sdk/voice.
 * This stub provides the correct interface shape for type-checking
 * and development without requiring Twilio credentials.
 */
export class TwilioProviderStub implements VoiceProvider {
  name = 'twilio';

  async provisionNumber(areaCode: string): Promise<ProvisionedNumber> {
    throw new Error('Twilio provider not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
  }

  async releaseNumber(phoneNumber: string): Promise<void> {
    throw new Error('Twilio provider not configured.');
  }

  async initiateCall(config: OutboundCallConfig): Promise<CallSession> {
    throw new Error('Twilio provider not configured.');
  }

  async getCallStatus(callSid: string): Promise<CallStatus> {
    throw new Error('Twilio provider not configured.');
  }
}
```

b. **Add `ElevenLabsProviderStub` class** for TTS:
```typescript
/**
 * ElevenLabs TTS Provider Stub
 * Production implementation would use @elevenlabs/api.
 */
export class ElevenLabsProviderStub {
  name = 'elevenlabs';

  async generateSpeech(text: string, voiceId: string): Promise<ArrayBuffer> {
    throw new Error('ElevenLabs provider not configured. Set ELEVENLABS_API_KEY.');
  }

  async listVoices(): Promise<Array<{ id: string; name: string }>> {
    throw new Error('ElevenLabs provider not configured.');
  }
}
```

c. **Add `createVoiceProvider` factory function**:
```typescript
export function createVoiceProvider(type: 'mock' | 'twilio' = 'mock'): VoiceProvider {
  switch (type) {
    case 'twilio':
      return new TwilioProviderStub();
    case 'mock':
    default:
      return new MockVoiceProvider();
  }
}
```

d. **Keep `MockVoiceProvider` exactly as-is** -- it is the default development provider.

### 13. consent-manager.ts: Verify completeness

**Read the file first** -- already uses Prisma and is functional.

#### No modifications needed. Verify:
- `checkConsentRequirements` checks two-party consent states
- `recordConsent`, `verifyConsent`, `revokeConsent` use Prisma ConsentReceipt

### 14. Write tests

Create/update test files for wake-word-service, number-manager, conversational-intel.

## Acceptance Criteria

1. `command-parser.ts` drops low-confidence AI entities (below 0.3).
2. `stt-service.ts` has session timeout handling.
3. `wake-word-service.ts` has `updateConfig`, `processAudioFrame`, sensitivity validation, config history.
4. `voiceforge-handoff.ts` creates Call records on handoff via Prisma.
5. `conversational-intel.ts` has `analyzeCallWithAI` and `calculateSentimentWithAI` using `generateJSON`.
6. `inbound-agent.ts` has AI-based caller intent detection.
7. `outbound-agent.ts` has `initiateOutboundCallForCampaign` with stats integration.
8. `mock-provider.ts` has `TwilioProviderStub`, `ElevenLabsProviderStub`, and `createVoiceProvider` factory.
9. Services already complete (campaign, persona, script-engine, number-manager) are verified but not modified.
10. All existing function signatures and exports are preserved.
11. AI imports come from `@/lib/ai`. Prisma imports come from `@/lib/db`.
12. `jest.config.ts`, `package.json`, `tsconfig.json`, and `prisma/schema.prisma` are NOT modified.
13. All tests pass: `npx jest tests/unit/voice/ tests/unit/voiceforge/`.

## Implementation Steps

1. **Read all context files** listed above, including existing test files.
2. **Create branch**: `git checkout -b ai-feature/p3-w09-voice-voiceforge`
3. **Modify `command-parser.ts`**: Add confidence thresholding to mergeEntities.
4. **Modify `stt-service.ts`**: Add session timeout handling.
5. **Modify `wake-word-service.ts`**: Add updateConfig, processAudioFrame, sensitivity validation, config history.
6. **Modify `voiceforge-handoff.ts`**: Add Prisma Call record creation on handoff.
7. **Modify `conversational-intel.ts`**: Add analyzeCallWithAI and calculateSentimentWithAI.
8. **Modify `inbound-agent.ts`**: Add AI-based caller intent detection.
9. **Modify `outbound-agent.ts`**: Add initiateOutboundCallForCampaign with campaign stats.
10. **Modify `mock-provider.ts`**: Add TwilioProviderStub, ElevenLabsProviderStub, createVoiceProvider factory.
11. **Write/update tests** for wake-word-service, number-manager, conversational-intel.
12. **Type-check**: `npx tsc --noEmit`
13. **Run tests**: `npx jest tests/unit/voice/ tests/unit/voiceforge/`
14. **Commit** with conventional commits.

## Tests Required

### `tests/unit/voice/wake-word-service.test.ts` (create new)
```typescript
import { WakeWordService, DEFAULT_WAKE_WORD_CONFIG } from '@/modules/voice/services/wake-word-service';

describe('WakeWordService', () => {
  let service: WakeWordService;

  beforeEach(() => {
    service = new WakeWordService();
  });

  describe('initialize', () => {
    it('should set config from provided values');
    it('should reject sensitivity below 0');
    it('should reject sensitivity above 1');
  });

  describe('startListening', () => {
    it('should set isListening to true when enabled');
    it('should not start when disabled');
    it('should not start when already listening');
  });

  describe('stopListening', () => {
    it('should set isListening to false');
    it('should be idempotent');
  });

  describe('updateConfig', () => {
    it('should update config and restart listening if was listening');
    it('should update config without restarting if was not listening');
    it('should record config change in history');
  });

  describe('simulateDetection', () => {
    it('should call all registered callbacks');
    it('should handle no registered callbacks gracefully');
  });

  describe('processAudioFrame', () => {
    it('should return false when not listening');
    it('should return false when disabled');
  });

  describe('getConfigHistory', () => {
    it('should return empty array initially');
    it('should record config changes');
  });
});
```

### `tests/unit/voiceforge/number-manager.test.ts` (update existing)
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    document: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  },
}));
jest.mock('@/lib/voice/mock-provider', () => ({
  MockVoiceProvider: jest.fn().mockImplementation(() => ({
    provisionNumber: jest.fn().mockResolvedValue({
      phoneNumber: '+15551234567',
      sid: 'PN123',
      region: 'US-555',
      capabilities: ['VOICE', 'SMS'],
      monthlyRate: 1.5,
      provisionedAt: new Date(),
    }),
    releaseNumber: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('number-manager', () => {
  describe('provisionNumber', () => {
    it('should call provider to provision and store in Prisma Document');
    it('should set document type to MANAGED_NUMBER');
    it('should return deserialized ManagedNumber');
  });

  describe('releaseNumber', () => {
    it('should call provider to release and update document status');
    it('should throw when number not found');
  });

  describe('listNumbers', () => {
    it('should query documents with MANAGED_NUMBER type');
    it('should filter by entityId');
  });

  describe('assignPersona', () => {
    it('should update document content with personaId');
    it('should throw when number not found');
  });
});
```

### `tests/unit/voiceforge/conversational-intel.test.ts` (update existing)
```typescript
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

describe('conversational-intel', () => {
  describe('calculateSentiment', () => {
    it('should return positive score for positive words');
    it('should return negative score for negative words');
    it('should return 0 for neutral text');
    it('should clamp score between -1 and 1');
  });

  describe('extractKeyInfo', () => {
    it('should extract email addresses');
    it('should extract phone numbers');
    it('should extract dates');
    it('should extract dollar amounts');
  });

  describe('checkCompliance', () => {
    it('should detect HIPAA keywords as violations');
    it('should detect GDPR keywords as warnings');
    it('should return empty for non-matching profiles');
  });

  describe('analyzeCallWithAI', () => {
    it('should call generateJSON with transcript content');
    it('should merge AI insights into base analysis');
    it('should fallback to rule-based analysis on AI failure');
    it('should add AI action items to summary');
  });

  describe('calculateSentimentWithAI', () => {
    it('should use keyword approach for short text');
    it('should call generateJSON for longer text');
    it('should fallback to keyword approach on AI failure');
  });

  describe('calculateTalkRatio', () => {
    it('should return correct agent/caller percentages');
    it('should return zeros for empty segments');
  });
});
```

## Commit Strategy

Make atomic commits in this order:

1. `feat(voice): add confidence thresholding to command parser entity merge`
   - Files: `src/modules/voice/services/command-parser.ts`
2. `feat(voice): add session timeout handling to STT service`
   - Files: `src/modules/voice/services/stt-service.ts`
3. `feat(voice): implement wake word config management and audio frame interface`
   - Files: `src/modules/voice/services/wake-word-service.ts`
4. `feat(voice): add Prisma Call record to voiceforge handoff`
   - Files: `src/modules/voice/services/voiceforge-handoff.ts`
5. `feat(voiceforge): add AI-powered call analysis and sentiment to conversational intel`
   - Files: `src/modules/voiceforge/services/conversational-intel.ts`
6. `feat(voiceforge): add AI intent detection to inbound agent and campaign integration to outbound`
   - Files: `src/modules/voiceforge/services/inbound-agent.ts`, `src/modules/voiceforge/services/outbound-agent.ts`
7. `feat(voiceforge): add Twilio and ElevenLabs provider stubs with factory function`
   - Files: `src/lib/voice/mock-provider.ts`
8. `test(voice): add tests for wake-word, number-manager, conversational-intel`
   - Files: `tests/unit/voice/wake-word-service.test.ts`, `tests/unit/voiceforge/number-manager.test.ts`, `tests/unit/voiceforge/conversational-intel.test.ts`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
