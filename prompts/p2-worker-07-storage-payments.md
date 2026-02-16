# Worker 07: File Storage Workflows & Payment Webhooks

## Branch: ai-feature/p2-w07-storage-payments

Create and check out the branch `ai-feature/p2-w07-storage-payments` from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside these directories:

- `src/lib/integrations/storage/uploads.ts`
- `src/lib/integrations/storage/documents.ts`
- `src/lib/integrations/payments/webhooks.ts`
- `src/lib/integrations/payments/subscriptions.ts`
- `src/app/api/webhooks/stripe/route.ts`
- `src/app/api/uploads/route.ts`
- `tests/unit/storage/` (all test files within)
- `tests/unit/payments/` (all test files within)

**DO NOT modify these files:**
- `src/lib/integrations/storage/client.ts` -- the storage client is owned by another worker
- `src/lib/integrations/payments/client.ts` -- the payments client is owned by another worker
- `jest.config.ts` -- shared config, do not modify
- `package.json` -- shared config, do not modify

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

1. **`prisma/schema.prisma`** -- Understand the Document, Entity, User, and FinancialRecord models. Uploads will create Document records. Payments will reference FinancialRecord.
2. **`src/shared/types/index.ts`** -- All TypeScript type definitions. Your code must align with these types.
3. **`src/shared/utils/api-response.ts`** -- Use `success()`, `error()` helpers for all API responses.
4. **`src/lib/integrations/storage/client.ts`** -- Understand the storage client interface (S3/compatible). Import from here but do not modify it.
5. **`src/lib/integrations/payments/client.ts`** -- Understand the Stripe client interface. Import from here but do not modify it.
6. **`src/shared/middleware/auth.ts`** -- Auth middleware for protecting API routes. Import `withAuth` for protected endpoints.
7. **`package.json`** -- Check available dependencies. Do NOT add new dependencies.
8. **`tsconfig.json`** -- Path alias `@/*` maps to `./src/*`.

## Requirements

### 1. File Upload Handler (`src/lib/integrations/storage/uploads.ts`)

Create a comprehensive file upload service:

```typescript
// src/lib/integrations/storage/uploads.ts

export interface UploadConfig {
  maxFileSizeBytes: number; // default: 10 * 1024 * 1024 (10MB)
  allowedMimeTypes: string[];
  allowedExtensions: string[];
}

export const DEFAULT_UPLOAD_CONFIG: UploadConfig = {
  maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
  allowedMimeTypes: [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv',
  ],
  allowedExtensions: [
    '.jpg', '.jpeg', '.png', '.gif', '.webp',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx',
    '.txt', '.csv',
  ],
};

export interface UploadResult {
  key: string;         // S3 object key
  fileName: string;    // original file name
  mimeType: string;
  sizeBytes: number;
  url: string;         // access URL (presigned or CDN)
  checksum: string;    // SHA-256 hash of file content
}

export interface UploadValidationError {
  field: string;
  message: string;
}

// Validate a file before uploading
export function validateFile(
  file: { name: string; size: number; type: string },
  config?: Partial<UploadConfig>
): { valid: boolean; errors: UploadValidationError[] };

// Generate a unique S3 key for a file
// Format: {entityId}/{category}/{year}/{month}/{uuid}-{sanitized-filename}
export function generateStorageKey(params: {
  entityId: string;
  category: 'documents' | 'images' | 'attachments' | 'exports';
  fileName: string;
}): string;

// Sanitize a filename (remove special chars, limit length)
export function sanitizeFileName(fileName: string): string;

// Calculate SHA-256 checksum of file content
export async function calculateChecksum(content: Buffer | ArrayBuffer): Promise<string>;

// Virus scan placeholder -- returns clean for now, interface ready for ClamAV integration
export async function scanForVirus(content: Buffer | ArrayBuffer): Promise<{
  clean: boolean;
  threat?: string;
}>;

// Process a multipart file upload
export async function processUpload(params: {
  file: File | Blob;
  fileName: string;
  mimeType: string;
  entityId: string;
  userId: string;
  category?: 'documents' | 'images' | 'attachments' | 'exports';
  config?: Partial<UploadConfig>;
}): Promise<UploadResult>;

// Delete a file from storage
export async function deleteUpload(key: string): Promise<boolean>;

// Get a temporary access URL for a file (presigned URL)
export async function getAccessUrl(key: string, expiresInSeconds?: number): Promise<string>;
```

**Upload Implementation Guidelines:**
- `validateFile` must check file size, MIME type, and extension against the config.
- `generateStorageKey` must produce URL-safe, unique keys using UUID and date-based directory structure.
- `sanitizeFileName` must strip path traversal characters (`..`, `/`, `\`), special characters, and limit to 255 characters.
- `scanForVirus` is a placeholder that always returns `{ clean: true }` but has the correct interface for future ClamAV/cloud scanning integration.
- `processUpload` should: validate the file, scan for viruses, calculate checksum, generate storage key, upload to storage client, and return the result.
- All functions should throw descriptive errors on failure with specific error codes.

### 2. Document Storage Service (`src/lib/integrations/storage/documents.ts`)

Create a document management layer on top of raw file storage:

```typescript
// src/lib/integrations/storage/documents.ts

export interface DocumentVersion {
  version: number;
  storageKey: string;
  sizeBytes: number;
  checksum: string;
  uploadedBy: string;
  uploadedAt: Date;
  changelog?: string;
}

export interface DocumentMetadata {
  id: string;
  entityId: string;
  title: string;
  description?: string;
  mimeType: string;
  category: string;
  tags: string[];
  currentVersion: number;
  versions: DocumentVersion[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// Create a new document record with its first version
export async function createDocument(params: {
  entityId: string;
  title: string;
  description?: string;
  category: string;
  tags?: string[];
  file: { key: string; sizeBytes: number; checksum: string; mimeType: string };
  userId: string;
}): Promise<DocumentMetadata>;

// Upload a new version of an existing document
export async function addDocumentVersion(params: {
  documentId: string;
  file: { key: string; sizeBytes: number; checksum: string };
  userId: string;
  changelog?: string;
}): Promise<DocumentVersion>;

// Get document metadata including version history
export async function getDocument(documentId: string): Promise<DocumentMetadata | null>;

// List documents for an entity with optional filters
export async function listDocuments(params: {
  entityId: string;
  category?: string;
  tags?: string[];
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ documents: DocumentMetadata[]; total: number }>;

// Get a download URL for a specific version of a document
export async function getDocumentDownloadUrl(
  documentId: string,
  version?: number
): Promise<string | null>;

// Soft-delete a document (mark as deleted, don't remove files)
export async function deleteDocument(documentId: string, userId: string): Promise<boolean>;

// Update document metadata (title, description, tags)
export async function updateDocumentMetadata(
  documentId: string,
  updates: Partial<{ title: string; description: string; tags: string[]; category: string }>
): Promise<DocumentMetadata | null>;
```

**Document Service Guidelines:**
- Use in-memory Map for document storage as a placeholder until Prisma Document model integration.
- Version numbers auto-increment starting from 1.
- `getDocumentDownloadUrl` should return the URL for the latest version if no version is specified.
- `deleteDocument` should soft-delete (set a deletedAt timestamp) rather than removing the files.
- `listDocuments` should support pagination and filtering by category, tags, and text search on title/description.

### 3. Stripe Webhook Handler (`src/lib/integrations/payments/webhooks.ts`)

Create a Stripe webhook processing system:

```typescript
// src/lib/integrations/payments/webhooks.ts

export interface WebhookEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  processedAt?: Date;
  status: 'received' | 'processed' | 'failed' | 'ignored';
  error?: string;
}

export type StripeEventType =
  | 'invoice.paid'
  | 'invoice.payment_failed'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'checkout.session.completed'
  | 'payment_intent.succeeded'
  | 'payment_intent.payment_failed';

export type WebhookHandler = (event: WebhookEvent) => Promise<void>;

// Verify Stripe webhook signature
export function verifyWebhookSignature(params: {
  payload: string | Buffer;
  signature: string;
  secret: string;
}): { valid: boolean; event?: Record<string, unknown>; error?: string };

// Register a handler for a specific event type
export function registerHandler(eventType: StripeEventType, handler: WebhookHandler): void;

// Process a webhook event (route to registered handler)
export async function processWebhookEvent(event: WebhookEvent): Promise<{
  status: 'processed' | 'failed' | 'ignored';
  error?: string;
}>;

// Idempotency check -- has this event already been processed?
export function isEventProcessed(eventId: string): boolean;

// Mark an event as processed
export function markEventProcessed(eventId: string): void;

// Built-in handlers (registered by default):

// Handle invoice.paid: update FinancialRecord status to PAID, log action
export async function handleInvoicePaid(event: WebhookEvent): Promise<void>;

// Handle invoice.payment_failed: update record, create alert notification
export async function handleInvoicePaymentFailed(event: WebhookEvent): Promise<void>;

// Handle customer.subscription.updated: update subscription status, plan details
export async function handleSubscriptionUpdated(event: WebhookEvent): Promise<void>;

// Handle customer.subscription.deleted: mark subscription as cancelled, trigger notifications
export async function handleSubscriptionDeleted(event: WebhookEvent): Promise<void>;

// Handle checkout.session.completed: provision access, create subscription record
export async function handleCheckoutCompleted(event: WebhookEvent): Promise<void>;

// Get webhook processing history
export function getWebhookHistory(limit?: number): WebhookEvent[];
```

**Webhook Implementation Guidelines:**
- `verifyWebhookSignature` should compute the expected signature using HMAC-SHA256 of the payload with the webhook secret, then compare with the provided signature using timing-safe comparison.
- Use in-memory Map for processed event IDs (idempotency) and event history.
- Each handler should be wrapped in try/catch so a single handler failure does not crash the webhook endpoint.
- `processWebhookEvent` should check idempotency first, then route to the registered handler, and finally mark as processed.
- Unknown event types should be marked as 'ignored', not 'failed'.
- Default handlers should be registered at module load time.

### 4. Subscription Management (`src/lib/integrations/payments/subscriptions.ts`)

Create subscription lifecycle management:

```typescript
// src/lib/integrations/payments/subscriptions.ts

export interface Plan {
  id: string;
  name: string;
  tier: 'free' | 'starter' | 'professional' | 'enterprise';
  priceMonthly: number;   // in cents
  priceYearly: number;    // in cents
  features: string[];
  limits: {
    entities: number;
    contacts: number;
    storageGb: number;
    apiCallsPerMonth: number;
    workflowsActive: number;
  };
}

export interface Subscription {
  id: string;
  userId: string;
  entityId: string;
  planId: string;
  status: 'active' | 'past_due' | 'cancelled' | 'trialing' | 'paused';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageMeter {
  entityId: string;
  metric: string;
  count: number;
  limit: number;
  periodStart: Date;
  periodEnd: Date;
}

// Available plans
export const PLANS: Plan[];

// Get a plan by ID or tier
export function getPlan(planIdOrTier: string): Plan | undefined;

// Get the current subscription for a user/entity
export async function getSubscription(entityId: string): Promise<Subscription | null>;

// Create a new subscription (after checkout)
export async function createSubscription(params: {
  userId: string;
  entityId: string;
  planId: string;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  trialDays?: number;
}): Promise<Subscription>;

// Upgrade or downgrade a subscription
export async function changePlan(params: {
  subscriptionId: string;
  newPlanId: string;
  immediate?: boolean; // if true, change now; if false, change at period end
}): Promise<Subscription>;

// Cancel a subscription
export async function cancelSubscription(params: {
  subscriptionId: string;
  immediate?: boolean; // if true, cancel now; if false, cancel at period end
  reason?: string;
}): Promise<Subscription>;

// Resume a cancelled subscription (if not yet expired)
export async function resumeSubscription(subscriptionId: string): Promise<Subscription>;

// Check if an entity has access to a feature based on their plan
export function hasFeatureAccess(entityId: string, feature: string): boolean;

// Check if an entity is within their usage limits
export function isWithinLimits(entityId: string, metric: string): boolean;

// Record usage for metering
export async function recordUsage(params: {
  entityId: string;
  metric: string;
  count?: number; // default 1
}): Promise<UsageMeter>;

// Get usage summary for an entity
export function getUsageSummary(entityId: string): UsageMeter[];
```

**Subscription Guidelines:**
- Define 4 plans: Free (0/0), Starter ($29/$290/yr), Professional ($79/$790/yr), Enterprise ($199/$1990/yr).
- Each plan should have differentiated limits for entities, contacts, storage, API calls, and active workflows.
- Use in-memory Map for subscriptions and usage meters as a placeholder.
- `changePlan` should validate that the new plan is different from the current one.
- `cancelSubscription` with `immediate: false` should set `cancelAtPeriodEnd: true` but keep the subscription active until period end.
- `hasFeatureAccess` should check the entity's plan features array.
- `isWithinLimits` should compare current usage against the plan's limits.
- Usage meters should reset at the start of each billing period.

### 5. API Routes

#### Upload Route (`src/app/api/uploads/route.ts`)

```typescript
// POST /api/uploads
// Content-Type: multipart/form-data
// Protected: requires auth
// Body: file (File), entityId (string), category? (string), title? (string), description? (string), tags? (string, comma-separated)
// Response: ApiResponse<UploadResult & { documentId: string }>
//
// Steps:
// 1. Authenticate request with withAuth
// 2. Parse multipart form data
// 3. Validate file (size, type, extension)
// 4. Process upload (scan, checksum, store)
// 5. Create document record
// 6. Return upload result with document ID
```

#### Stripe Webhook Route (`src/app/api/webhooks/stripe/route.ts`)

```typescript
// POST /api/webhooks/stripe
// NOT auth-protected (Stripe calls this endpoint)
// Headers: stripe-signature (required)
// Body: raw JSON payload from Stripe
// Response: { received: true } or error
//
// Steps:
// 1. Read raw body
// 2. Extract stripe-signature header
// 3. Verify webhook signature using STRIPE_WEBHOOK_SECRET env var
// 4. Parse event and check idempotency
// 5. Route to appropriate handler
// 6. Return 200 { received: true } regardless of handler outcome (Stripe expects 200)
// 7. Log errors but do not return them to Stripe (security)
```

## Acceptance Criteria

1. File upload validation correctly rejects oversized files, invalid MIME types, and invalid extensions.
2. `generateStorageKey` produces unique, URL-safe keys with proper directory structure.
3. `sanitizeFileName` prevents path traversal and removes special characters.
4. `processUpload` orchestrates validate, scan, checksum, store in correct order.
5. Document service supports version tracking with auto-incrementing version numbers.
6. Document listing supports pagination, category filtering, and tag filtering.
7. Stripe webhook signature verification uses timing-safe comparison.
8. Webhook processing is idempotent (duplicate events are ignored).
9. All 5 default Stripe event handlers are registered and functional.
10. Subscription plans have correct limits and pricing.
11. Plan upgrade/downgrade correctly updates subscription state.
12. Usage metering tracks and enforces limits.
13. Upload API route handles multipart form data and returns document metadata.
14. Stripe webhook route verifies signature and returns 200 to Stripe.
15. All files compile without TypeScript errors (`npx tsc --noEmit`).
16. All unit tests pass.
17. No modifications to `storage/client.ts`, `payments/client.ts`, `jest.config.ts`, or `package.json`.

## Implementation Steps

1. **Read context files**: Read `prisma/schema.prisma`, `src/shared/types/index.ts`, `src/shared/utils/api-response.ts`, `src/lib/integrations/storage/client.ts`, `src/lib/integrations/payments/client.ts`, `src/shared/middleware/auth.ts`, `package.json`, `tsconfig.json`.
2. **Create branch**: `git checkout -b ai-feature/p2-w07-storage-payments`
3. **Create `src/lib/integrations/storage/uploads.ts`**: Implement file validation, key generation, checksum, virus scan placeholder, and upload processing.
4. **Create `src/lib/integrations/storage/documents.ts`**: Implement document version tracking, metadata management, and listing.
5. **Create `src/lib/integrations/payments/webhooks.ts`**: Implement signature verification, event routing, idempotency, and default handlers.
6. **Create `src/lib/integrations/payments/subscriptions.ts`**: Implement plans, subscription lifecycle, and usage metering.
7. **Create `src/app/api/uploads/route.ts`**: Implement multipart upload endpoint.
8. **Create `src/app/api/webhooks/stripe/route.ts`**: Implement Stripe webhook endpoint.
9. **Create tests**: Write unit tests for all modules.
10. **Type-check**: Run `npx tsc --noEmit` to verify no TypeScript errors.
11. **Run tests**: Execute `npx jest tests/unit/storage/ tests/unit/payments/` and verify all pass.
12. **Commit** with conventional commit messages.

## Tests Required

Create the following test files:

### `tests/unit/storage/uploads.test.ts`
```typescript
describe('File Upload', () => {
  describe('validateFile', () => {
    it('should accept valid image files');
    it('should accept valid PDF files');
    it('should reject files exceeding 10MB');
    it('should reject disallowed MIME types (e.g., application/exe)');
    it('should reject disallowed extensions (e.g., .exe, .sh)');
    it('should use custom config when provided');
  });

  describe('generateStorageKey', () => {
    it('should produce key with entityId prefix');
    it('should include category in path');
    it('should include year/month directories');
    it('should include UUID for uniqueness');
    it('should sanitize the filename in the key');
  });

  describe('sanitizeFileName', () => {
    it('should remove path traversal sequences');
    it('should remove special characters');
    it('should preserve file extension');
    it('should limit filename length to 255 characters');
    it('should handle filenames with spaces');
  });

  describe('calculateChecksum', () => {
    it('should return consistent SHA-256 hash for same content');
    it('should return different hashes for different content');
  });

  describe('scanForVirus', () => {
    it('should return clean: true (placeholder)');
  });

  describe('processUpload', () => {
    it('should validate, scan, hash, and upload in sequence');
    it('should return complete UploadResult');
    it('should reject invalid files before uploading');
  });
});
```

### `tests/unit/storage/documents.test.ts`
```typescript
describe('Document Storage', () => {
  describe('createDocument', () => {
    it('should create document with version 1');
    it('should store metadata correctly');
  });

  describe('addDocumentVersion', () => {
    it('should increment version number');
    it('should preserve previous versions');
    it('should update currentVersion');
  });

  describe('getDocument', () => {
    it('should return document with version history');
    it('should return null for non-existent document');
  });

  describe('listDocuments', () => {
    it('should return paginated results');
    it('should filter by category');
    it('should filter by tags');
  });

  describe('deleteDocument', () => {
    it('should soft-delete (not remove files)');
    it('should return false for non-existent document');
  });
});
```

### `tests/unit/payments/webhooks.test.ts`
```typescript
describe('Stripe Webhooks', () => {
  describe('verifyWebhookSignature', () => {
    it('should return valid: true for correct signature');
    it('should return valid: false for incorrect signature');
    it('should return valid: false for missing signature');
  });

  describe('processWebhookEvent', () => {
    it('should route event to registered handler');
    it('should return ignored for unknown event types');
    it('should skip already-processed events (idempotency)');
    it('should return failed status when handler throws');
  });

  describe('handleInvoicePaid', () => {
    it('should update financial record status');
  });

  describe('handleSubscriptionUpdated', () => {
    it('should update subscription details');
  });

  describe('handleSubscriptionDeleted', () => {
    it('should mark subscription as cancelled');
  });

  describe('handleCheckoutCompleted', () => {
    it('should create new subscription');
  });
});
```

### `tests/unit/payments/subscriptions.test.ts`
```typescript
describe('Subscriptions', () => {
  describe('getPlan', () => {
    it('should return plan by ID');
    it('should return plan by tier name');
    it('should return undefined for unknown plan');
  });

  describe('createSubscription', () => {
    it('should create subscription with correct status');
    it('should set trial period when specified');
  });

  describe('changePlan', () => {
    it('should upgrade subscription plan');
    it('should downgrade subscription plan');
    it('should reject change to same plan');
  });

  describe('cancelSubscription', () => {
    it('should cancel immediately when immediate: true');
    it('should set cancelAtPeriodEnd when immediate: false');
  });

  describe('resumeSubscription', () => {
    it('should resume a pending-cancellation subscription');
    it('should reject resuming an already-cancelled subscription');
  });

  describe('recordUsage / isWithinLimits', () => {
    it('should track usage counts');
    it('should return true when within limits');
    it('should return false when limit exceeded');
  });
});
```

Mock the storage and payments clients in tests. Do NOT require live API connections.

## Commit Strategy

Make atomic commits in this order:

1. `feat(storage): add file upload handler with validation, checksum, and virus scan placeholder`
   - Files: `src/lib/integrations/storage/uploads.ts`
2. `feat(storage): add document storage service with version tracking and metadata`
   - Files: `src/lib/integrations/storage/documents.ts`
3. `feat(payments): add Stripe webhook handler with signature verification and event routing`
   - Files: `src/lib/integrations/payments/webhooks.ts`
4. `feat(payments): add subscription management with plans, upgrades, and usage metering`
   - Files: `src/lib/integrations/payments/subscriptions.ts`
5. `feat(api): add upload and Stripe webhook API routes`
   - Files: `src/app/api/uploads/route.ts`, `src/app/api/webhooks/stripe/route.ts`
6. `test(storage): add unit tests for file uploads and document storage`
   - Files: `tests/unit/storage/*.test.ts`
7. `test(payments): add unit tests for webhooks and subscriptions`
   - Files: `tests/unit/payments/*.test.ts`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
