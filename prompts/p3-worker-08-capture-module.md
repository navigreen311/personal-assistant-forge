# Worker 08: Complete Capture Module

## Branch

`ai-feature/p3-w08-capture-module`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to modifying files within these paths. Do NOT touch any files outside these directories:

- `src/modules/capture/services/batch-capture.ts`
- `src/modules/capture/services/ocr-service.ts`
- `src/modules/capture/services/screenshot-service.ts`
- `src/modules/capture/services/routing-service.ts`
- `src/modules/capture/services/capture-service.ts`
- `src/modules/capture/services/offline-queue.ts`
- `tests/unit/capture/batch-capture.test.ts`
- `tests/unit/capture/ocr-service.test.ts`
- `tests/unit/capture/screenshot-service.test.ts`

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
   - `KnowledgeEntry` -- has `title`, `content`, `type` (NOTE, ARTICLE, REFERENCE, SNIPPET, etc.), `source`, `sourceUrl`, `tags` (String[]), `userId`, `entityId`, `metadata` (JSON).
   - `Task` -- has `title`, `description`, `status`, `priority`, `tags` (String[]), `userId`, `entityId`, `metadata` (JSON).
   - `Document` -- has `title`, `type`, `content`, `status`, `entityId`, `metadata` (JSON).
4. **`src/modules/capture/types.ts`** -- All capture module types: `CaptureItem`, `CaptureSource`, `CaptureContentType`, `BatchCaptureSession`, `RoutingResult`, `RoutingRule`, `RoutingCondition`, `RoutingAction`, `SuggestedAction`, `CaptureLatencyMetrics`, `CaptureMetadata`.
5. **`src/modules/capture/services/batch-capture.ts`** -- Class-based `BatchCaptureService` with `startBatchSession`, `addToBatch`, `completeBatch`, `getBatchStatus`. Uses in-memory Map for sessions. Delegates to `captureService.createCapture()` and `captureService.processCapture()` in `completeBatch`. Already functional but uses in-memory storage.
6. **`src/modules/capture/services/ocr-service.ts`** -- Class-based `OCRService` with `extractTextFromImage` (returns hardcoded mock data based on type), `parseBusinessCard` (regex-based), `parseReceipt` (regex-based), `enhanceOCRWithAI` (already uses `generateJSON` for AI-enhanced post-processing). Mock data needs replacement with real AI extraction.
7. **`src/modules/capture/services/screenshot-service.ts`** -- Class-based `ScreenshotService` with `analyzeScreenshot` (treats imageData as text), `extractFromClipboard`, `extractActions` (regex-based pattern extraction for emails, phones, action items, dates, URLs). No AI, no Prisma.
8. **`src/modules/capture/services/routing-service.ts`** -- Class-based `RoutingService` with rule-based routing + AI fallback via `generateJSON`. Has default rules for EMAIL_FORWARD, CAMERA_SCAN, action verbs, VOICE captures. Already functional with AI fallback.
9. **`src/modules/capture/services/capture-service.ts`** -- Class-based `CaptureService` with `createCapture`, `processCapture`, `classifyCaptureWithAI` (uses `generateJSON`), `listCaptures`, `archiveCapture`. Uses in-memory Map. Routes via `routingService.routeCapture()`.
10. **`src/modules/capture/services/offline-queue.ts`** -- Class-based `OfflineQueue` with `enqueueOfflineCapture`, `syncQueue`, `getQueueSize`, `getQueuedItems`. Uses in-memory array. Has processor callback pattern.
11. **Existing test files**: `tests/unit/capture/batch-capture.test.ts`, `tests/unit/capture/capture-service.test.ts`, `tests/unit/capture/offline-queue.test.ts`, `tests/unit/capture/routing-service.test.ts` -- Read these to understand existing test patterns.

## Requirements

### 1. batch-capture.ts: Implement real storage for batch processing

**Read the file first** -- already has a working implementation that delegates to `captureService`.

#### Specific modifications:

a. **Add Prisma import**:
```typescript
import { prisma } from '@/lib/db';
```

b. **Add validation to `addToBatch`**:
- Validate that `rawContent` is non-empty and `source` is a valid `CaptureSource`.
- Throw descriptive errors for invalid inputs.
- Add optional `contentType` parameter to `addToBatch` (default: `'TEXT'`) so callers can specify the type of content being batched.

c. **Enhance `completeBatch` to store results**:
- After processing all items, store a batch summary in `prisma.document.create()` with `type: 'BATCH_CAPTURE'`:
  ```typescript
  await prisma.document.create({
    data: {
      title: `Batch Capture ${session.id}`,
      entityId: session.userId, // or appropriate entityId
      type: 'BATCH_CAPTURE',
      content: JSON.stringify({
        sessionId: session.id,
        itemCount: processedItems.length,
        successCount: processedItems.filter(i => i.status !== 'FAILED').length,
        failedCount: processedItems.filter(i => i.status === 'FAILED').length,
        processedAt: new Date().toISOString(),
      }),
      status: 'APPROVED',
    },
  });
  ```

d. **Keep existing class structure and exports** -- `batchCaptureService` singleton and `BatchCaptureService` class.

### 2. ocr-service.ts: Replace mock data with AI-powered text extraction

**Read the file first** -- currently returns hardcoded mock data in `extractTextFromImage` but has AI enhancement in `enhanceOCRWithAI`.

#### Specific modifications:

a. **Rewrite `extractTextFromImage`**:
- Instead of returning hardcoded mock data, use AI (`generateText`) to describe/extract text from the image data.
- Since we cannot actually process binary image data via the AI SDK text endpoint, implement a realistic flow:
  - If `imageData` starts with `data:image` or is a URL, note it as an image reference.
  - Use `generateText` with a prompt asking to extract text content from the description/metadata.
  - For actual OCR, add a comment noting where Tesseract.js or Cloud Vision would plug in.
  - Return the AI-extracted text with appropriate confidence.
- **Fallback**: If AI fails, use the existing pattern-based extraction as fallback.

```typescript
async extractTextFromImage(
  imageData: string,
  type: 'BUSINESS_CARD' | 'RECEIPT' | 'WHITEBOARD' | 'GENERAL',
): Promise<OCRResult> {
  // If imageData is actual text content (e.g., from clipboard), process directly
  if (!imageData.startsWith('data:image') && !imageData.startsWith('http')) {
    // Treat as raw text -- enhance with AI
    return this.enhanceOCRWithAI(imageData, type);
  }

  // For image URLs/data URIs, stub the actual OCR call
  // Production: const rawText = await tesseract.recognize(imageData);
  // For now, use AI to generate structured extraction from whatever metadata is available
  try {
    const result = await generateText(
      `Extract and return the text content from this ${type.toLowerCase().replace('_', ' ')} image. Image reference: ${imageData.substring(0, 200)}. Return only the extracted text.`,
      {
        maxTokens: 512,
        temperature: 0.1,
        system: 'You are an OCR text extraction service. Return only the text you would expect to find in this type of document. Be precise.',
      }
    );
    return { text: result, confidence: 0.7 };
  } catch {
    // Fallback to placeholder
    return { text: `[OCR pending: ${type}]`, confidence: 0.3 };
  }
}
```

b. **Enhance `parseBusinessCard`** with AI fallback:
- Keep the existing regex-based extraction as the primary method.
- Add AI fallback when regex extraction yields incomplete results (e.g., no name or no email found):
```typescript
async parseBusinessCard(ocrResult: string): Promise<BusinessCardResult> {
  // Try regex first
  const regexResult = this.parseBusinessCardRegex(ocrResult);

  // If regex found name + at least one contact method, return it
  if (regexResult.name && (regexResult.email || regexResult.phone)) {
    return regexResult;
  }

  // AI fallback for complex cards
  try {
    return await generateJSON<BusinessCardResult>(
      `Extract contact information from this business card text:\n"${ocrResult}"\n\nReturn JSON with: name, email, phone, company, title (all optional strings)`,
      { maxTokens: 256, temperature: 0.1, system: 'Extract business card information precisely.' }
    );
  } catch {
    return regexResult;
  }
}
```
- Rename the current `parseBusinessCard` to `parseBusinessCardRegex` (private method).

c. **Enhance `parseReceipt`** with AI fallback (same pattern as business card).

d. **Keep `enhanceOCRWithAI` as-is** -- already uses `generateJSON`.

### 3. screenshot-service.ts: Add Document storage and AI-enhanced analysis

**Read the file first** -- uses regex-based pattern extraction, no storage, no AI.

#### Specific modifications:

a. **Add imports**:
```typescript
import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';
```

b. **Enhance `analyzeScreenshot`**:
- After extracting text and actions with the existing regex method, store metadata in Prisma:
```typescript
async analyzeScreenshot(imageData: string, entityId?: string): Promise<{
  documentId: string;
  extractedText: string;
  suggestedActions: SuggestedAction[];
}> {
  const extractedText = imageData; // In production, OCR would extract text
  const suggestedActions = this.extractActions(extractedText);

  // Store screenshot metadata
  const doc = await prisma.document.create({
    data: {
      title: `Screenshot ${new Date().toISOString()}`,
      entityId: entityId ?? '',
      type: 'SCREENSHOT',
      content: extractedText.substring(0, 5000),
      metadata: {
        capturedAt: new Date().toISOString(),
        suggestedActions: suggestedActions.map(a => ({ type: a.type, confidence: a.confidence })),
      },
      status: 'DRAFT',
    },
  });

  return { documentId: doc.id, extractedText, suggestedActions };
}
```

c. **Add AI-enhanced action extraction**:
```typescript
async analyzeScreenshotWithAI(text: string): Promise<SuggestedAction[]> {
  try {
    const result = await generateJSON<{ actions: SuggestedAction[] }>(
      `Analyze this text captured from a screenshot and suggest actions.

Text: "${text.substring(0, 2000)}"

Return JSON with "actions" array. Each action has: type (CREATE_CONTACT, CREATE_TASK, CREATE_EVENT, ADD_NOTE), data (object with relevant fields), confidence (0-1).`,
      {
        maxTokens: 512,
        temperature: 0.3,
        system: 'You are a screenshot analysis assistant. Identify actionable items from captured text.',
      }
    );
    return result.actions ?? [];
  } catch {
    return this.extractActions(text);
  }
}
```

d. **Keep existing `extractActions` private method** as regex-based fallback.

e. **Keep `extractFromClipboard`** working but have it also call the AI method when available.

### 4. routing-service.ts: Enhance with real storage destinations

**Read the file first** -- already has rule-based routing + AI fallback via `generateJSON`.

#### Specific modifications:

a. **Add Prisma import** (if not already present):
```typescript
import { prisma } from '@/lib/db';
```

b. **Add `routeAndStore` method** that both routes and stores the capture to the correct destination model:
```typescript
async routeAndStore(capture: CaptureItem): Promise<RoutingResult & { storedId?: string }> {
  const result = await this.routeCapture(capture);

  try {
    let storedId: string | undefined;

    switch (result.targetType) {
      case 'TASK': {
        const task = await prisma.task.create({
          data: {
            title: capture.processedContent?.substring(0, 100) ?? capture.rawContent.substring(0, 100),
            description: capture.processedContent ?? capture.rawContent,
            status: 'TODO',
            priority: result.priority ?? 'MEDIUM',
            userId: capture.userId,
            entityId: result.entityId,
            tags: ['from_capture'],
            metadata: { captureId: capture.id, source: capture.source },
          },
        });
        storedId = task.id;
        break;
      }
      case 'NOTE': {
        const entry = await prisma.knowledgeEntry.create({
          data: {
            title: `Captured: ${new Date().toISOString()}`,
            content: capture.processedContent ?? capture.rawContent,
            type: 'NOTE',
            source: capture.source,
            userId: capture.userId,
            entityId: result.entityId,
            tags: ['from_capture'],
            metadata: { captureId: capture.id },
          },
        });
        storedId = entry.id;
        break;
      }
      case 'CONTACT': {
        // Store as a document for later contact creation review
        const doc = await prisma.document.create({
          data: {
            title: 'Captured Contact Info',
            entityId: result.entityId,
            type: 'CONTACT_CAPTURE',
            content: capture.processedContent ?? capture.rawContent,
            status: 'DRAFT',
            metadata: { captureId: capture.id, source: capture.source },
          },
        });
        storedId = doc.id;
        break;
      }
      case 'EVENT': {
        const doc = await prisma.document.create({
          data: {
            title: 'Captured Event Info',
            entityId: result.entityId,
            type: 'EVENT_CAPTURE',
            content: capture.processedContent ?? capture.rawContent,
            status: 'DRAFT',
            metadata: { captureId: capture.id, source: capture.source },
          },
        });
        storedId = doc.id;
        break;
      }
      case 'EXPENSE': {
        const doc = await prisma.document.create({
          data: {
            title: 'Captured Expense',
            entityId: result.entityId,
            type: 'EXPENSE_CAPTURE',
            content: capture.processedContent ?? capture.rawContent,
            status: 'DRAFT',
            metadata: { captureId: capture.id, source: capture.source },
          },
        });
        storedId = doc.id;
        break;
      }
      default: {
        // Default: store as KnowledgeEntry NOTE
        const entry = await prisma.knowledgeEntry.create({
          data: {
            title: `Captured: ${new Date().toISOString()}`,
            content: capture.processedContent ?? capture.rawContent,
            type: 'NOTE',
            source: capture.source,
            userId: capture.userId,
            entityId: result.entityId,
            tags: ['from_capture'],
            metadata: { captureId: capture.id },
          },
        });
        storedId = entry.id;
      }
    }

    return { ...result, storedId };
  } catch (err) {
    // Storage failed but routing succeeded
    return result;
  }
}
```

c. **Keep all existing methods** (`routeCapture`, `evaluateConditions`, `addRoutingRule`, etc.) unchanged.

### 5. capture-service.ts: Ensure proper coordination

**Read the file first** -- already functional with AI classification and in-memory storage.

#### Specific modifications:

a. **Update `processCapture`** to use `routingService.routeAndStore()` instead of `routingService.routeCapture()`:
```typescript
// Change line 68 from:
const routingResult = await routingService.routeCapture(capture);
// To:
const routingResult = await routingService.routeAndStore(capture);
```
- This ensures captured items are actually persisted to the correct Prisma model.

b. **Keep all other methods** (`createCapture`, `classifyCaptureWithAI`, `listCaptures`, `archiveCapture`) as-is.

c. **The in-memory `captures` Map can remain** for fast lookup during processing. The real persistence happens via `routeAndStore`.

### 6. offline-queue.ts: Verify queue functionality

**Read the file first** -- already has a working queue implementation with processor callback.

#### Specific modifications:

a. **Add retry limit**: If an item has been retried more than 3 times, move it to a dead-letter queue:
```typescript
private deadLetterQueue: OfflineQueueItem[] = [];
private maxRetries = 3;
```

b. **Update `syncQueue`** to respect retry limit:
```typescript
if (item.retryCount >= this.maxRetries) {
  this.deadLetterQueue.push(item);
  failed++;
  continue;
}
```

c. **Add `getDeadLetterItems()` method**:
```typescript
getDeadLetterItems(): CaptureItem[] {
  return [...this.deadLetterQueue];
}
```

d. **Keep all existing exports and class structure**.

### 7. Write tests

Create/update test files for batch-capture, ocr-service, screenshot-service.

## Acceptance Criteria

1. `batch-capture.ts` validates inputs and stores batch summaries in Prisma Document model.
2. `ocr-service.ts` uses AI via `generateText`/`generateJSON` for text extraction instead of hardcoded mock data, with regex fallback.
3. `screenshot-service.ts` stores screenshot metadata in Prisma Document model and has AI-enhanced analysis.
4. `routing-service.ts` has a `routeAndStore` method that persists captures to the correct Prisma model based on routing target.
5. `capture-service.ts` uses `routeAndStore` to persist processed captures.
6. `offline-queue.ts` has dead-letter queue for items exceeding max retries.
7. All existing function signatures and exports are preserved.
8. AI imports come from `@/lib/ai`. Prisma imports come from `@/lib/db`.
9. `jest.config.ts`, `package.json`, `tsconfig.json`, and `prisma/schema.prisma` are NOT modified.
10. All tests pass: `npx jest tests/unit/capture/`.

## Implementation Steps

1. **Read all context files** listed above, including existing test files.
2. **Create branch**: `git checkout -b ai-feature/p3-w08-capture-module`
3. **Modify `ocr-service.ts`**: Replace mock data with AI extraction, enhance parseBusinessCard and parseReceipt with AI fallbacks.
4. **Modify `screenshot-service.ts`**: Add Prisma storage, add AI-enhanced analysis method.
5. **Modify `routing-service.ts`**: Add `routeAndStore` method with Prisma persistence per target type.
6. **Modify `capture-service.ts`**: Switch to `routeAndStore` in `processCapture`.
7. **Modify `batch-capture.ts`**: Add validation, store batch summaries in Prisma.
8. **Modify `offline-queue.ts`**: Add dead-letter queue and retry limit.
9. **Write/update tests** for batch-capture, ocr-service, screenshot-service.
10. **Type-check**: `npx tsc --noEmit`
11. **Run tests**: `npx jest tests/unit/capture/`
12. **Commit** with conventional commits.

## Tests Required

### `tests/unit/capture/batch-capture.test.ts` (update existing)
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    document: { create: jest.fn() },
  },
}));
jest.mock('@/modules/capture/services/capture-service', () => ({
  captureService: {
    createCapture: jest.fn(),
    processCapture: jest.fn(),
  },
}));

describe('BatchCaptureService', () => {
  it('should start a new batch session with ACTIVE status');
  it('should add items to an active batch session');
  it('should reject adding items to a non-active session');
  it('should validate non-empty rawContent');
  it('should process all items and store batch summary on complete');
  it('should mark individual items as FAILED on processing error');
  it('should store batch summary Document with item counts');
});
```

### `tests/unit/capture/ocr-service.test.ts` (create new)
```typescript
jest.mock('@/lib/ai', () => ({
  generateText: jest.fn(),
  generateJSON: jest.fn(),
}));

describe('OCRService', () => {
  describe('extractTextFromImage', () => {
    it('should use AI to enhance raw text input');
    it('should stub OCR for image data URIs with AI description');
    it('should return low-confidence fallback on AI failure');
  });

  describe('parseBusinessCard', () => {
    it('should extract name, email, phone from standard format');
    it('should use AI fallback for incomplete regex results');
    it('should handle cards with only email');
    it('should handle cards with only phone');
  });

  describe('parseReceipt', () => {
    it('should extract vendor, total, date, items');
    it('should use AI fallback for unusual receipt formats');
  });

  describe('enhanceOCRWithAI', () => {
    it('should call generateJSON with raw text and document type');
    it('should return cleaned text with structured data on success');
    it('should fallback to raw text on AI failure');
  });
});
```

### `tests/unit/capture/screenshot-service.test.ts` (create new)
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    document: { create: jest.fn() },
  },
}));
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

describe('ScreenshotService', () => {
  describe('analyzeScreenshot', () => {
    it('should extract actions from text using regex patterns');
    it('should store screenshot metadata in Prisma Document');
    it('should return document ID with analysis results');
  });

  describe('analyzeScreenshotWithAI', () => {
    it('should call generateJSON for AI-powered action extraction');
    it('should fallback to regex extraction on AI failure');
  });

  describe('extractFromClipboard', () => {
    it('should detect email addresses as CREATE_CONTACT actions');
    it('should detect phone numbers as CREATE_CONTACT actions');
    it('should detect action items as CREATE_TASK actions');
    it('should detect URLs as ADD_NOTE actions');
  });
});
```

## Commit Strategy

Make atomic commits in this order:

1. `feat(capture): replace OCR mock data with AI-powered text extraction`
   - Files: `src/modules/capture/services/ocr-service.ts`
2. `feat(capture): add Prisma storage and AI analysis to screenshot service`
   - Files: `src/modules/capture/services/screenshot-service.ts`
3. `feat(capture): add routeAndStore with Prisma persistence to routing service`
   - Files: `src/modules/capture/services/routing-service.ts`
4. `feat(capture): wire capture service to use routeAndStore for persistence`
   - Files: `src/modules/capture/services/capture-service.ts`, `src/modules/capture/services/batch-capture.ts`
5. `feat(capture): add dead-letter queue and retry limit to offline queue`
   - Files: `src/modules/capture/services/offline-queue.ts`
6. `test(capture): add tests for batch-capture, ocr-service, screenshot-service`
   - Files: `tests/unit/capture/batch-capture.test.ts`, `tests/unit/capture/ocr-service.test.ts`, `tests/unit/capture/screenshot-service.test.ts`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
