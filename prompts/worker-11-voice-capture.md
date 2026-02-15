# Worker 11: Voice Interface & Ubiquitous Capture (M11 + M25)

## Branch: ai-feature/w11-voice-capture

Create and check out the branch `ai-feature/w11-voice-capture` from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside these directories:

- `src/modules/voice/services/` -- Voice processing services (STT, wake word, command parsing)
- `src/modules/voice/types/` -- Voice-specific TypeScript types
- `src/modules/voice/components/` -- Voice UI components (mic button, waveform, transcript overlay)
- `src/modules/voice/api/` -- Voice module internal API helpers
- `src/modules/voice/tests/` -- Voice module co-located tests
- `src/modules/capture/services/` -- Capture processing services (OCR, screenshot, routing)
- `src/modules/capture/types/` -- Capture-specific TypeScript types
- `src/modules/capture/components/` -- Capture UI components (quick-capture bar, share sheet)
- `src/modules/capture/api/` -- Capture module internal API helpers
- `src/modules/capture/tests/` -- Capture module co-located tests
- `src/app/api/capture/` -- Next.js API routes for capture endpoints
- `src/app/(dashboard)/capture/` -- Next.js page routes for capture UI
- `tests/unit/voice/` -- Voice unit tests
- `tests/unit/capture/` -- Capture unit tests

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files. They define the project contracts:

1. **`prisma/schema.prisma`** -- All 16 Prisma models. Note the `Message`, `Task`, `Contact`, `Call` models you will reference. Voice captures become Messages or Tasks.
2. **`src/shared/types/index.ts`** -- All shared types. Key types for you: `Task`, `Message`, `Contact`, `MessageChannel` (includes `'VOICE'`), `WorkflowTrigger` (includes `'VOICE'`), `Priority`, `TaskStatus`, `Sensitivity`, `ActionActor`, `ActionLog`, `BlastRadius`.
3. **`src/shared/utils/api-response.ts`** -- Use `success()`, `error()`, `paginated()` for all API route responses.
4. **`src/lib/db/index.ts`** -- Import `prisma` from `@/lib/db` for all database operations.
5. **`package.json`** -- Current dependencies include `zod` for validation, `uuid` for IDs, `date-fns` for date parsing.
6. **`tsconfig.json`** -- Path alias `@/*` maps to `./src/*`.
7. **`CLAUDE.md`** -- Project conventions: Conventional Commits, modular files, no `any` types.

## Requirements

### 1. Voice Module Types (`src/modules/voice/types/index.ts`)

Define all voice-specific types:

```typescript
export interface VoiceSession {
  id: string;
  userId: string;
  entityId: string;
  status: 'LISTENING' | 'PROCESSING' | 'COMPLETED' | 'ERROR';
  audioFormat: 'webm' | 'wav' | 'ogg' | 'mp3';
  sampleRate: number;
  startedAt: Date;
  endedAt?: Date;
  transcript?: string;
  confidence?: number; // 0-1
  parsedCommand?: ParsedVoiceCommand;
}

export interface ParsedVoiceCommand {
  intent: VoiceIntent;
  confidence: number;
  entities: ExtractedEntity[];
  rawTranscript: string;
  normalizedText: string;
}

export type VoiceIntent =
  | 'ADD_TASK'
  | 'SCHEDULE_MEETING'
  | 'DRAFT_EMAIL'
  | 'WHATS_NEXT'
  | 'ADD_NOTE'
  | 'CALL_CONTACT'
  | 'SET_REMINDER'
  | 'SEARCH'
  | 'CREATE_CONTACT'
  | 'LOG_EXPENSE'
  | 'DICTATE'
  | 'UNKNOWN';

export interface ExtractedEntity {
  type: 'PERSON' | 'DATE' | 'TIME' | 'DURATION' | 'MONEY' | 'LOCATION' | 'PRIORITY' | 'PROJECT' | 'TAG';
  value: string;
  normalized?: string; // e.g., "tomorrow" -> "2026-02-16"
  confidence: number;
}

export interface VoiceCommandDefinition {
  intent: VoiceIntent;
  patterns: string[]; // regex or keyword patterns
  examples: string[];
  handler: string; // service method name
  requiresConfirmation: boolean;
}

export interface STTConfig {
  provider: 'browser' | 'whisper' | 'deepgram' | 'assemblyai';
  language: string;
  model?: string;
  enablePunctuation: boolean;
  enableSpeakerDiarization: boolean;
  interimResults: boolean;
}

export interface WakeWordConfig {
  enabled: boolean;
  phrase: string; // e.g., "Hey Forge"
  sensitivity: number; // 0-1
  provider: 'browser' | 'porcupine' | 'custom';
}

export interface VoiceForgeHandoff {
  id: string;
  voiceSessionId: string;
  contactId: string;
  entityId: string;
  phoneNumber: string;
  context: string; // summary of conversation context to pass
  scriptHints: string[];
  status: 'PENDING' | 'CONNECTING' | 'ACTIVE' | 'COMPLETED' | 'FAILED';
}
```

### 2. Capture Module Types (`src/modules/capture/types/index.ts`)

```typescript
export type CaptureSource =
  | 'VOICE'
  | 'SCREENSHOT'
  | 'CLIPBOARD'
  | 'SHARE_SHEET'
  | 'BROWSER_EXTENSION'
  | 'EMAIL_FORWARD'
  | 'SMS_BRIDGE'
  | 'DESKTOP_TRAY'
  | 'CAMERA_SCAN'
  | 'MANUAL';

export type CaptureContentType =
  | 'TEXT'
  | 'IMAGE'
  | 'AUDIO'
  | 'URL'
  | 'DOCUMENT'
  | 'BUSINESS_CARD'
  | 'RECEIPT'
  | 'WHITEBOARD'
  | 'SCREENSHOT';

export interface CaptureItem {
  id: string;
  userId: string;
  entityId?: string;
  source: CaptureSource;
  contentType: CaptureContentType;
  rawContent: string; // original text, base64 image, audio URL, etc.
  processedContent?: string; // extracted/transcribed text
  metadata: CaptureMetadata;
  routingResult?: RoutingResult;
  status: 'PENDING' | 'PROCESSING' | 'ROUTED' | 'FAILED' | 'ARCHIVED';
  offlineCreatedAt?: Date; // when captured offline
  syncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CaptureMetadata {
  sourceApp?: string;
  sourceUrl?: string;
  deviceInfo?: string;
  geolocation?: { lat: number; lng: number };
  ocrConfidence?: number;
  transcriptionConfidence?: number;
  processingTimeMs?: number;
}

export interface RoutingResult {
  targetType: 'TASK' | 'CONTACT' | 'NOTE' | 'EVENT' | 'MESSAGE' | 'EXPENSE';
  targetId?: string; // ID of created entity
  entityId: string;
  projectId?: string;
  priority?: 'P0' | 'P1' | 'P2';
  confidence: number;
  appliedRules: string[]; // rule IDs that matched
}

export interface RoutingRule {
  id: string;
  name: string;
  conditions: RoutingCondition[];
  actions: RoutingAction;
  priority: number; // higher = evaluated first
  isActive: boolean;
}

export interface RoutingCondition {
  field: 'source' | 'contentType' | 'content' | 'sender' | 'keyword';
  operator: 'equals' | 'contains' | 'matches' | 'startsWith';
  value: string;
}

export interface RoutingAction {
  targetType: RoutingResult['targetType'];
  entityId?: string;
  projectId?: string;
  priority?: 'P0' | 'P1' | 'P2';
  tags?: string[];
}

export interface BatchCaptureSession {
  id: string;
  userId: string;
  items: CaptureItem[];
  status: 'ACTIVE' | 'COMPLETED';
  startedAt: Date;
  completedAt?: Date;
}

export interface OfflineSyncQueue {
  items: CaptureItem[];
  lastSyncAttempt?: Date;
  retryCount: number;
}

export interface CaptureLatencyMetrics {
  captureToProcessedMs: number;
  processedToRoutedMs: number;
  totalMs: number;
  source: CaptureSource;
  contentType: CaptureContentType;
  timestamp: Date;
}
```

### 3. Voice Services

#### `src/modules/voice/services/stt-service.ts` -- Speech-to-Text Service

- `startSession(userId: string, entityId: string, config?: Partial<STTConfig>): Promise<VoiceSession>` -- Initialize a voice session.
- `processAudioChunk(sessionId: string, chunk: ArrayBuffer): Promise<{ interim: string; isFinal: boolean }>` -- Handle streaming audio. Use the Web Speech API as the default browser provider. Provide a plug-in interface for Whisper/Deepgram/AssemblyAI via a `STTProvider` interface.
- `endSession(sessionId: string): Promise<VoiceSession>` -- Finalize transcript, calculate confidence, return complete session.
- `getTranscript(sessionId: string): Promise<string>` -- Return current transcript.
- Store active sessions in a `Map<string, VoiceSession>` in memory (server-side sessions for dev; note: production would use Redis).

#### `src/modules/voice/services/wake-word-service.ts` -- Wake Word Detection (Placeholder)

- `initialize(config: WakeWordConfig): Promise<void>` -- Set up wake word detection.
- `startListening(): Promise<void>` -- Begin monitoring microphone input for wake phrase.
- `stopListening(): Promise<void>` -- Stop wake word detection.
- `onWakeWordDetected(callback: () => void): void` -- Register callback.
- Implementation: Placeholder that logs "Wake word detection would activate here" with the configured phrase. Include comments explaining where Picovoice Porcupine or a custom ML model would integrate.

#### `src/modules/voice/services/command-parser.ts` -- Voice Command Library

- `parseCommand(transcript: string): Promise<ParsedVoiceCommand>` -- Parse natural language into structured commands.
- `registerCommand(definition: VoiceCommandDefinition): void` -- Add new voice commands at runtime.
- `getAvailableCommands(): VoiceCommandDefinition[]` -- List all registered commands.
- Built-in command library (register these at module initialization):
  - **"Add task [description]"** -- intent: ADD_TASK, extract title + optional due date/priority/project
  - **"Schedule meeting with [person] [time]"** -- intent: SCHEDULE_MEETING, extract contact + datetime
  - **"Draft email to [person] about [subject]"** -- intent: DRAFT_EMAIL, extract recipient + subject
  - **"What's next?"** / **"What should I work on?"** -- intent: WHATS_NEXT
  - **"Add note [content]"** -- intent: ADD_NOTE
  - **"Call [person/place]"** -- intent: CALL_CONTACT, triggers VoiceForge handoff
  - **"Set reminder [description] [time]"** -- intent: SET_REMINDER
  - **"Log expense [amount] for [category]"** -- intent: LOG_EXPENSE
  - **"Search for [query]"** -- intent: SEARCH
  - **"Create contact [name]"** -- intent: CREATE_CONTACT
- Use regex pattern matching with fallback to keyword extraction. Entity extraction should identify PERSON, DATE, TIME, MONEY, PRIORITY from the transcript.

#### `src/modules/voice/services/voiceforge-handoff.ts` -- VoiceForge Telephony Handoff

- `initiateHandoff(params: { voiceSessionId: string; contactId: string; entityId: string; context: string }): Promise<VoiceForgeHandoff>` -- Prepare handoff to VoiceForge telephony system.
- `getHandoffStatus(handoffId: string): Promise<VoiceForgeHandoff>` -- Check handoff status.
- `cancelHandoff(handoffId: string): Promise<void>` -- Cancel a pending handoff.
- Implementation: This is a bridge service. It packages voice session context (transcript, detected contact, entity brand kit) and prepares a payload for VoiceForge. The actual telephony call is NOT implemented here -- it creates a handoff record and would emit an event for VoiceForge to pick up.

### 4. Capture Services

#### `src/modules/capture/services/capture-service.ts` -- Core Capture Ingestion

- `createCapture(params: { userId: string; source: CaptureSource; contentType: CaptureContentType; rawContent: string; entityId?: string; metadata?: Partial<CaptureMetadata> }): Promise<CaptureItem>` -- Create a new capture item.
- `processCapture(captureId: string): Promise<CaptureItem>` -- Process raw content (OCR for images, transcription for audio, text extraction for URLs).
- `getCaptureById(captureId: string): Promise<CaptureItem | null>` -- Retrieve a capture.
- `listCaptures(userId: string, filters?: { source?: CaptureSource; status?: string; entityId?: string }, page?: number, pageSize?: number): Promise<{ data: CaptureItem[]; total: number }>` -- List with filtering.
- `archiveCapture(captureId: string): Promise<void>` -- Archive a processed capture.
- `getCaptureMetrics(userId: string): Promise<CaptureLatencyMetrics[]>` -- Return latency metrics.
- Track latency at each stage (capture -> processed -> routed) and store as `CaptureLatencyMetrics`.

#### `src/modules/capture/services/routing-service.ts` -- Auto-Routing Engine

- `routeCapture(capture: CaptureItem): Promise<RoutingResult>` -- Apply routing rules to determine where a capture should go.
- `addRoutingRule(rule: Omit<RoutingRule, 'id'>): RoutingRule` -- Add a new routing rule.
- `getRoutingRules(): RoutingRule[]` -- List all active routing rules.
- `updateRoutingRule(id: string, updates: Partial<RoutingRule>): RoutingRule` -- Update a rule.
- `deleteRoutingRule(id: string): void` -- Remove a rule.
- `evaluateConditions(capture: CaptureItem, conditions: RoutingCondition[]): boolean` -- Check if all conditions match.
- Default routing rules (registered at initialization):
  - "If source is EMAIL_FORWARD and contains invoice/receipt keywords -> EXPENSE"
  - "If source is CAMERA_SCAN and contentType is BUSINESS_CARD -> CONTACT"
  - "If content contains action verbs (need to, must, should, deadline) -> TASK"
  - "If source is VOICE and intent matches -> delegate to voice command handler"
- Rules are evaluated in priority order; first match wins.

#### `src/modules/capture/services/ocr-service.ts` -- Document Scanning / OCR (Placeholder)

- `extractTextFromImage(imageData: string, type: 'BUSINESS_CARD' | 'RECEIPT' | 'WHITEBOARD' | 'GENERAL'): Promise<{ text: string; confidence: number; structuredData?: Record<string, string> }>` -- Extract text from image data.
- `parseBusinessCard(ocrResult: string): Promise<{ name?: string; email?: string; phone?: string; company?: string; title?: string }>` -- Structured extraction from business card text.
- `parseReceipt(ocrResult: string): Promise<{ vendor?: string; amount?: number; date?: string; items?: string[] }>` -- Structured extraction from receipt text.
- Implementation: Placeholder that returns mock structured data. Include comments for where Tesseract.js, Google Vision API, or AWS Textract would integrate.

#### `src/modules/capture/services/screenshot-service.ts` -- Screenshot Intelligence

- `analyzeScreenshot(imageData: string): Promise<{ extractedText: string; suggestedActions: SuggestedAction[] }>` -- Extract data from screenshot and suggest actions.
- `SuggestedAction` type: `{ type: 'CREATE_TASK' | 'CREATE_CONTACT' | 'ADD_NOTE' | 'CREATE_EVENT'; data: Record<string, string>; confidence: number }`.
- `extractFromClipboard(clipboardContent: string): Promise<SuggestedAction[]>` -- Parse clipboard text for actionable content (names, dates, action items, URLs).
- Implementation: Placeholder with pattern-based extraction for emails, phone numbers, dates, URLs, action verbs.

#### `src/modules/capture/services/offline-queue.ts` -- Offline Capture Queue

- `enqueueOfflineCapture(capture: Omit<CaptureItem, 'id' | 'status' | 'createdAt' | 'updatedAt'>): void` -- Store capture for later sync.
- `getQueueSize(): number` -- Return number of pending items.
- `getQueuedItems(): CaptureItem[]` -- Return all queued items.
- `syncQueue(): Promise<{ synced: number; failed: number }>` -- Attempt to process all queued items. On failure, increment retry count and keep in queue.
- `clearQueue(): void` -- Remove all items.
- Storage: Use an in-memory array for dev. Include comments explaining that production would use IndexedDB (client) or Redis (server).

#### `src/modules/capture/services/batch-capture.ts` -- Batch Capture

- `startBatchSession(userId: string): BatchCaptureSession` -- Begin a rapid-fire capture session ("I have 5 things").
- `addToBatch(sessionId: string, rawContent: string, source?: CaptureSource): CaptureItem` -- Add an item to the active batch.
- `completeBatch(sessionId: string): Promise<CaptureItem[]>` -- Process all items in the batch, route them, and return results.
- `getBatchStatus(sessionId: string): BatchCaptureSession | null` -- Check batch session status.

### 5. Voice UI Components

#### `src/modules/voice/components/VoiceCaptureButton.tsx`
- Floating microphone button (fixed position, bottom-right).
- States: idle (mic icon), listening (pulsing animation with waveform), processing (spinner), error (red).
- On press: starts voice session. On release or silence detection: ends session.
- Shows interim transcript in a small overlay above the button.
- Uses Tailwind for all styling. No external CSS.

#### `src/modules/voice/components/VoiceCommandOverlay.tsx`
- Full-screen semi-transparent overlay that appears during active voice session.
- Shows: current transcript (live), detected intent, extracted entities, confidence meter.
- Action buttons: confirm, cancel, edit transcript.
- Keyboard shortcut: Escape to cancel.

#### `src/modules/voice/components/VoiceCommandList.tsx`
- Displays available voice commands in a help panel.
- Groups by category (Task Management, Communication, Calendar, Finance, Navigation).
- Shows example phrases for each command.

### 6. Capture UI Components

#### `src/modules/capture/components/QuickCaptureBar.tsx`
- Always-visible capture bar (top of dashboard or command-K style modal).
- Input field with auto-detect: text, URL paste, image paste.
- Source indicator icons (voice, camera, clipboard, email, etc.).
- Submit routes through capture-service -> routing-service.

#### `src/modules/capture/components/CaptureInbox.tsx`
- List view of all pending/recent captures.
- Columns: source icon, content preview, detected type, routing suggestion, status, timestamp.
- Bulk actions: approve routing, re-route, archive, delete.
- Filter by source, status, date range.

#### `src/modules/capture/components/RoutingRuleEditor.tsx`
- Form to create/edit routing rules.
- Condition builder: field selector, operator selector, value input.
- Action configurator: target type, entity, project, priority, tags.
- Priority ordering via drag-and-drop (or up/down buttons).
- Test rule against sample input.

#### `src/modules/capture/components/CaptureMetricsDashboard.tsx`
- Shows capture latency metrics: average time from capture to routed.
- Breakdown by source and content type.
- Bar chart placeholder (use simple Tailwind-based bars, no charting library required).
- Counters: total captures today, auto-routed %, manual routing needed %.

### 7. API Routes

#### `src/app/api/capture/route.ts` -- POST: Create capture, GET: List captures
```typescript
// POST /api/capture
// Body: { source, contentType, rawContent, entityId?, metadata? }
// Response: ApiResponse<CaptureItem>

// GET /api/capture?source=VOICE&status=PENDING&page=1&pageSize=20
// Response: ApiResponse<CaptureItem[]> with pagination meta
```

#### `src/app/api/capture/[id]/route.ts` -- GET: Get capture, PATCH: Update, DELETE: Archive
```typescript
// GET /api/capture/:id -> ApiResponse<CaptureItem>
// PATCH /api/capture/:id -> Body: { entityId?, status? } -> ApiResponse<CaptureItem>
// DELETE /api/capture/:id -> archives capture -> ApiResponse<{ archived: true }>
```

#### `src/app/api/capture/process/route.ts` -- POST: Process a pending capture
```typescript
// POST /api/capture/process
// Body: { captureId }
// Response: ApiResponse<CaptureItem> (with processedContent and routingResult)
```

#### `src/app/api/capture/batch/route.ts` -- POST: Start batch, PUT: Add to batch, PATCH: Complete batch
```typescript
// POST /api/capture/batch -> start batch session -> ApiResponse<BatchCaptureSession>
// PUT /api/capture/batch -> Body: { sessionId, rawContent, source? } -> ApiResponse<CaptureItem>
// PATCH /api/capture/batch -> Body: { sessionId } -> complete and route all -> ApiResponse<CaptureItem[]>
```

#### `src/app/api/capture/rules/route.ts` -- CRUD for routing rules
```typescript
// GET /api/capture/rules -> ApiResponse<RoutingRule[]>
// POST /api/capture/rules -> Body: RoutingRule (without id) -> ApiResponse<RoutingRule>
// PUT /api/capture/rules -> Body: { id, ...updates } -> ApiResponse<RoutingRule>
// DELETE /api/capture/rules -> Body: { id } -> ApiResponse<{ deleted: true }>
```

#### `src/app/api/capture/metrics/route.ts` -- GET: Capture latency metrics
```typescript
// GET /api/capture/metrics?userId=xxx -> ApiResponse<CaptureLatencyMetrics[]>
```

### 8. Dashboard Pages

#### `src/app/(dashboard)/capture/page.tsx` -- Capture Inbox Page
- Renders `CaptureInbox` component as the main view.
- Includes `QuickCaptureBar` at the top.
- Side panel for `CaptureMetricsDashboard`.

#### `src/app/(dashboard)/capture/rules/page.tsx` -- Routing Rules Management
- Renders `RoutingRuleEditor` with list of existing rules.
- Ability to create, edit, delete, and reorder rules.

#### `src/app/(dashboard)/capture/layout.tsx` -- Capture Section Layout
- Shared layout with navigation tabs: Inbox, Rules, Metrics.
- Floating `VoiceCaptureButton` visible on all capture pages.

## Acceptance Criteria

1. All TypeScript types compile without errors (`npx tsc --noEmit`).
2. Voice command parser correctly identifies all 11 built-in intents with at least 2 example phrases each.
3. Capture service creates, processes, and routes captures through the full pipeline.
4. Routing engine evaluates rules in priority order and applies first-match routing.
5. Batch capture correctly handles multi-item rapid-fire sessions.
6. Offline queue stores items and replays them on sync.
7. All API routes return proper `ApiResponse<T>` format using `success()`, `error()`, `paginated()`.
8. All API routes validate input with Zod schemas.
9. UI components use Tailwind only -- no external CSS or UI library imports.
10. All components are typed with proper Props interfaces.
11. VoiceForge handoff creates properly structured handoff records.
12. Capture latency metrics track timing at each pipeline stage.
13. No modifications to shared types, api-response, db/index, or prisma schema.
14. All unit tests pass.
15. No `any` types anywhere in the codebase.

## Implementation Steps

1. **Read context files**: Read `prisma/schema.prisma`, `src/shared/types/index.ts`, `src/shared/utils/api-response.ts`, `src/lib/db/index.ts`, `package.json`, `tsconfig.json`.
2. **Create branch**: `git checkout -b ai-feature/w11-voice-capture`
3. **Create voice types**: `src/modules/voice/types/index.ts`
4. **Create capture types**: `src/modules/capture/types/index.ts`
5. **Implement STT service**: `src/modules/voice/services/stt-service.ts`
6. **Implement wake word service**: `src/modules/voice/services/wake-word-service.ts`
7. **Implement command parser**: `src/modules/voice/services/command-parser.ts` with all 11 built-in commands.
8. **Implement VoiceForge handoff**: `src/modules/voice/services/voiceforge-handoff.ts`
9. **Implement capture service**: `src/modules/capture/services/capture-service.ts`
10. **Implement routing service**: `src/modules/capture/services/routing-service.ts` with default rules.
11. **Implement OCR placeholder**: `src/modules/capture/services/ocr-service.ts`
12. **Implement screenshot service**: `src/modules/capture/services/screenshot-service.ts`
13. **Implement offline queue**: `src/modules/capture/services/offline-queue.ts`
14. **Implement batch capture**: `src/modules/capture/services/batch-capture.ts`
15. **Build voice UI components**: `VoiceCaptureButton`, `VoiceCommandOverlay`, `VoiceCommandList`.
16. **Build capture UI components**: `QuickCaptureBar`, `CaptureInbox`, `RoutingRuleEditor`, `CaptureMetricsDashboard`.
17. **Create API routes**: All 6 route files under `src/app/api/capture/`.
18. **Create dashboard pages**: `capture/page.tsx`, `capture/rules/page.tsx`, `capture/layout.tsx`.
19. **Write tests**: All test files.
20. **Type-check**: `npx tsc --noEmit`
21. **Run tests**: `npx jest tests/unit/voice/ tests/unit/capture/`

## Tests

### `tests/unit/voice/command-parser.test.ts`
```typescript
describe('CommandParser', () => {
  describe('parseCommand', () => {
    it('should parse "Add task review Q4 financials" as ADD_TASK intent');
    it('should parse "Schedule meeting with Dr. Martinez tomorrow at 3pm" as SCHEDULE_MEETING');
    it('should parse "Draft email to Bobby about the downtown project" as DRAFT_EMAIL');
    it('should parse "What\'s next?" as WHATS_NEXT intent');
    it('should parse "Call the nursing facility" as CALL_CONTACT');
    it('should parse "Set reminder to follow up Friday" as SET_REMINDER');
    it('should parse "Log expense $45.50 for office supplies" as LOG_EXPENSE');
    it('should parse "Search for HIPAA compliance docs" as SEARCH');
    it('should return UNKNOWN for unrecognizable input');
    it('should extract PERSON entities from transcript');
    it('should extract DATE entities like "tomorrow", "next Monday"');
    it('should extract MONEY entities like "$45.50"');
    it('should extract PRIORITY entities like "high priority", "P0"');
  });

  describe('registerCommand', () => {
    it('should add a custom command definition');
    it('should recognize custom command patterns after registration');
  });

  describe('getAvailableCommands', () => {
    it('should return all 11 built-in commands');
    it('should include custom commands after registration');
  });
});
```

### `tests/unit/voice/stt-service.test.ts`
```typescript
describe('STTService', () => {
  describe('startSession', () => {
    it('should create a new voice session with LISTENING status');
    it('should use default STT config when none provided');
    it('should store session in active sessions map');
  });

  describe('endSession', () => {
    it('should update session status to COMPLETED');
    it('should set endedAt timestamp');
    it('should return final transcript and confidence');
    it('should throw for non-existent session');
  });

  describe('getTranscript', () => {
    it('should return current transcript for active session');
    it('should throw for non-existent session');
  });
});
```

### `tests/unit/voice/voiceforge-handoff.test.ts`
```typescript
describe('VoiceForgeHandoff', () => {
  describe('initiateHandoff', () => {
    it('should create a handoff record with PENDING status');
    it('should include voice session context in handoff');
    it('should resolve contact phone number');
  });

  describe('cancelHandoff', () => {
    it('should update status to FAILED for pending handoffs');
    it('should throw for already-active handoffs');
  });
});
```

### `tests/unit/capture/capture-service.test.ts`
```typescript
describe('CaptureService', () => {
  describe('createCapture', () => {
    it('should create a capture with PENDING status');
    it('should generate a unique ID');
    it('should set createdAt timestamp');
    it('should accept optional metadata');
  });

  describe('processCapture', () => {
    it('should update status to PROCESSING then ROUTED');
    it('should call routing service after processing');
    it('should track processing latency');
    it('should handle processing errors gracefully');
  });

  describe('listCaptures', () => {
    it('should filter by source');
    it('should filter by status');
    it('should paginate results');
  });
});
```

### `tests/unit/capture/routing-service.test.ts`
```typescript
describe('RoutingService', () => {
  describe('routeCapture', () => {
    it('should apply rules in priority order');
    it('should return first matching rule result');
    it('should route email forwards with invoice keywords to EXPENSE');
    it('should route camera scans of business cards to CONTACT');
    it('should route content with action verbs to TASK');
    it('should handle no matching rules gracefully');
  });

  describe('evaluateConditions', () => {
    it('should match equals conditions');
    it('should match contains conditions');
    it('should match regex patterns');
    it('should require all conditions to match (AND logic)');
  });

  describe('addRoutingRule', () => {
    it('should add rule and assign ID');
    it('should maintain priority ordering');
  });
});
```

### `tests/unit/capture/offline-queue.test.ts`
```typescript
describe('OfflineQueue', () => {
  describe('enqueueOfflineCapture', () => {
    it('should add item to the queue');
    it('should increment queue size');
  });

  describe('syncQueue', () => {
    it('should process all queued items');
    it('should return count of synced and failed items');
    it('should remove successfully synced items');
    it('should retain failed items with incremented retry count');
  });

  describe('clearQueue', () => {
    it('should remove all items from queue');
    it('should reset queue size to 0');
  });
});
```

### `tests/unit/capture/batch-capture.test.ts`
```typescript
describe('BatchCapture', () => {
  describe('startBatchSession', () => {
    it('should create session with ACTIVE status');
    it('should initialize empty items array');
  });

  describe('addToBatch', () => {
    it('should add item to the session');
    it('should default source to VOICE');
    it('should throw for non-existent session');
  });

  describe('completeBatch', () => {
    it('should process and route all items');
    it('should update session status to COMPLETED');
    it('should return all processed items');
    it('should handle empty batch gracefully');
  });
});
```

## Commit Strategy

Make atomic commits in this order:

1. `feat(voice): add voice module types for sessions, commands, STT, and VoiceForge handoff`
   - Files: `src/modules/voice/types/index.ts`
2. `feat(capture): add capture module types for items, routing, batch, offline queue, and metrics`
   - Files: `src/modules/capture/types/index.ts`
3. `feat(voice): implement STT service with pluggable provider interface`
   - Files: `src/modules/voice/services/stt-service.ts`
4. `feat(voice): implement wake word detection placeholder service`
   - Files: `src/modules/voice/services/wake-word-service.ts`
5. `feat(voice): implement voice command parser with 11 built-in intents`
   - Files: `src/modules/voice/services/command-parser.ts`
6. `feat(voice): implement VoiceForge telephony handoff bridge service`
   - Files: `src/modules/voice/services/voiceforge-handoff.ts`
7. `feat(capture): implement core capture ingestion and processing service`
   - Files: `src/modules/capture/services/capture-service.ts`
8. `feat(capture): implement auto-routing engine with default rules`
   - Files: `src/modules/capture/services/routing-service.ts`
9. `feat(capture): implement OCR and screenshot intelligence placeholder services`
   - Files: `src/modules/capture/services/ocr-service.ts`, `src/modules/capture/services/screenshot-service.ts`
10. `feat(capture): implement offline queue and batch capture services`
    - Files: `src/modules/capture/services/offline-queue.ts`, `src/modules/capture/services/batch-capture.ts`
11. `feat(voice): add voice UI components (capture button, command overlay, command list)`
    - Files: `src/modules/voice/components/VoiceCaptureButton.tsx`, `VoiceCommandOverlay.tsx`, `VoiceCommandList.tsx`
12. `feat(capture): add capture UI components (quick bar, inbox, rule editor, metrics dashboard)`
    - Files: `src/modules/capture/components/QuickCaptureBar.tsx`, `CaptureInbox.tsx`, `RoutingRuleEditor.tsx`, `CaptureMetricsDashboard.tsx`
13. `feat(capture): add API routes for capture CRUD, processing, batch, rules, and metrics`
    - Files: `src/app/api/capture/route.ts`, `[id]/route.ts`, `process/route.ts`, `batch/route.ts`, `rules/route.ts`, `metrics/route.ts`
14. `feat(capture): add dashboard pages for capture inbox and routing rules`
    - Files: `src/app/(dashboard)/capture/page.tsx`, `rules/page.tsx`, `layout.tsx`
15. `test(voice): add unit tests for command parser, STT service, and VoiceForge handoff`
    - Files: `tests/unit/voice/*.test.ts`
16. `test(capture): add unit tests for capture service, routing, offline queue, and batch capture`
    - Files: `tests/unit/capture/*.test.ts`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
