# Worker 06: Email Templates & SMS Workflows

## Branch: ai-feature/p2-w06-email-sms

Create and check out the branch `ai-feature/p2-w06-email-sms` from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside these directories:

- `src/lib/integrations/email/templates.ts`
- `src/lib/integrations/email/workflows.ts`
- `src/lib/integrations/sms/templates.ts`
- `src/lib/integrations/sms/workflows.ts`
- `tests/unit/integrations/` (all test files within)

**DO NOT modify these files:**
- `src/lib/integrations/email/client.ts` -- the email client is owned by another worker
- `src/lib/integrations/sms/client.ts` -- the SMS client is owned by another worker
- `jest.config.ts` -- shared config, do not modify
- `package.json` -- shared config, do not modify

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

1. **`prisma/schema.prisma`** -- Understand the Entity, User, Contact, Task, CalendarEvent, Message, and FinancialRecord models. Templates will reference fields from these models.
2. **`src/shared/types/index.ts`** -- All TypeScript type definitions. Template variables must align with these types.
3. **`src/lib/integrations/email/client.ts`** -- Understand the email client interface. Your workflows will call methods from this client. Import from here but do not modify it.
4. **`src/lib/integrations/sms/client.ts`** -- Understand the SMS client interface. Your workflows will call methods from this client. Import from here but do not modify it.
5. **`package.json`** -- Check available dependencies. Do NOT add new dependencies.
6. **`tsconfig.json`** -- Path alias `@/*` maps to `./src/*`.

## Requirements

### 1. Email Templates (`src/lib/integrations/email/templates.ts`)

Create a template engine with typed, renderable email templates. Each template should have a unique identifier, subject line generator, and HTML/plain-text body generator.

```typescript
// src/lib/integrations/email/templates.ts

export interface EmailTemplate<TData = Record<string, unknown>> {
  id: string;
  name: string;
  subject: (data: TData) => string;
  html: (data: TData) => string;
  text: (data: TData) => string;
}

// Template data types
export interface WelcomeData {
  userName: string;
  entityName: string;
  loginUrl: string;
}

export interface PasswordResetData {
  userName: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export interface TaskReminderData {
  userName: string;
  taskTitle: string;
  taskPriority: string;
  dueDate: string;
  taskUrl: string;
  entityName: string;
}

export interface InvoiceSentData {
  recipientName: string;
  invoiceNumber: string;
  amount: string;
  currency: string;
  dueDate: string;
  invoiceUrl: string;
  entityName: string;
}

export interface DailyDigestData {
  userName: string;
  date: string;
  entityName: string;
  tasksDueToday: Array<{ title: string; priority: string; url: string }>;
  upcomingMeetings: Array<{ title: string; time: string; url: string }>;
  unreadMessages: number;
  pendingApprovals: number;
  overdueItems: number;
}

export interface AlertNotificationData {
  userName: string;
  alertType: 'urgent' | 'warning' | 'info';
  title: string;
  message: string;
  actionUrl?: string;
  entityName: string;
  timestamp: string;
}

export interface MeetingPrepData {
  userName: string;
  meetingTitle: string;
  meetingTime: string;
  attendees: Array<{ name: string; role?: string }>;
  agenda?: string[];
  relatedDocuments?: Array<{ title: string; url: string }>;
  entityName: string;
}

// Helper: wrap HTML body in a consistent layout with header, footer, branding
export function wrapInLayout(bodyHtml: string, options?: { entityName?: string; unsubscribeUrl?: string }): string;

// Helper: render a template with data, returning { subject, html, text }
export function renderTemplate<TData>(template: EmailTemplate<TData>, data: TData): {
  subject: string;
  html: string;
  text: string;
};

// Template registry
export const emailTemplates: {
  welcome: EmailTemplate<WelcomeData>;
  passwordReset: EmailTemplate<PasswordResetData>;
  taskReminder: EmailTemplate<TaskReminderData>;
  invoiceSent: EmailTemplate<InvoiceSentData>;
  dailyDigest: EmailTemplate<DailyDigestData>;
  alertNotification: EmailTemplate<AlertNotificationData>;
  meetingPrep: EmailTemplate<MeetingPrepData>;
};

// Lookup a template by ID
export function getEmailTemplate(templateId: string): EmailTemplate | undefined;
```

**Template Implementation Guidelines:**
- Each template must produce valid HTML email markup (use inline CSS, table-based layout for compatibility).
- Each template must also produce a plain-text fallback.
- HTML should include a consistent header (app name/logo placeholder) and footer (unsubscribe link placeholder, company info).
- Use template literal interpolation -- no external template engine dependency.
- Sanitize user-provided data in HTML output (escape HTML entities to prevent XSS in email clients).
- The `dailyDigest` template should handle empty arrays gracefully (show "No items" messages).
- The `alertNotification` template should have distinct visual styling per alertType (red for urgent, yellow for warning, blue for info).

### 2. Email Workflows (`src/lib/integrations/email/workflows.ts`)

Create workflow functions that orchestrate email sending operations:

```typescript
// src/lib/integrations/email/workflows.ts

export interface ScheduledEmail {
  id: string;
  templateId: string;
  to: string;
  data: Record<string, unknown>;
  scheduledAt: Date;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  createdAt: Date;
}

export interface BatchEmailJob {
  id: string;
  templateId: string;
  recipients: Array<{ email: string; data: Record<string, unknown> }>;
  status: 'queued' | 'processing' | 'completed' | 'partial_failure';
  totalCount: number;
  sentCount: number;
  failedCount: number;
  startedAt?: Date;
  completedAt?: Date;
}

export interface BounceRecord {
  email: string;
  type: 'hard' | 'soft';
  reason: string;
  bouncedAt: Date;
  originalMessageId?: string;
}

export interface UnsubscribeRecord {
  email: string;
  entityId: string;
  reason?: string;
  unsubscribedAt: Date;
  categories: string[]; // which email categories they unsubscribed from
}

// Schedule an email for future delivery
export async function scheduleEmail(params: {
  templateId: string;
  to: string;
  data: Record<string, unknown>;
  scheduledAt: Date;
}): Promise<ScheduledEmail>;

// Cancel a scheduled email
export async function cancelScheduledEmail(emailId: string): Promise<boolean>;

// Process all pending scheduled emails that are due
export async function processScheduledEmails(): Promise<{
  processed: number;
  sent: number;
  failed: number;
}>;

// Send emails in batch with rate limiting
export async function sendBatchEmails(params: {
  templateId: string;
  recipients: Array<{ email: string; data: Record<string, unknown> }>;
  rateLimit?: number; // emails per second, default 10
  concurrency?: number; // parallel sends, default 3
}): Promise<BatchEmailJob>;

// Handle a bounce notification
export async function handleBounce(params: {
  email: string;
  type: 'hard' | 'soft';
  reason: string;
  messageId?: string;
}): Promise<void>;

// Check if an email address has bounced (hard bounce = suppress)
export function isEmailSuppressed(email: string): boolean;

// Handle an unsubscribe request
export async function handleUnsubscribe(params: {
  email: string;
  entityId: string;
  categories?: string[];
  reason?: string;
}): Promise<void>;

// Check if a recipient has unsubscribed from a category
export function isUnsubscribed(email: string, entityId: string, category?: string): boolean;

// Get bounce and unsubscribe statistics for an entity
export function getDeliverabilityStats(entityId: string): {
  totalBounces: number;
  hardBounces: number;
  softBounces: number;
  unsubscribes: number;
  suppressedAddresses: string[];
};
```

**Workflow Implementation Guidelines:**
- Use in-memory stores (Map/Set) for scheduled emails, bounces, and unsubscribes. These are placeholders until a persistent queue is added.
- `processScheduledEmails` should check the current time against `scheduledAt` and send due emails.
- `sendBatchEmails` should respect the rate limit using a simple delay mechanism and process in configurable concurrency.
- Hard bounces should permanently suppress the email address. Soft bounces should be tracked but not suppress after a single occurrence.
- Unsubscribe handling should be per-entity and optionally per-category.
- All workflow functions should handle errors gracefully and not throw on individual send failures during batch operations.

### 3. SMS Templates (`src/lib/integrations/sms/templates.ts`)

Create SMS templates optimized for character limits:

```typescript
// src/lib/integrations/sms/templates.ts

export interface SmsTemplate<TData = Record<string, unknown>> {
  id: string;
  name: string;
  render: (data: TData) => string;
  maxLength: number; // SMS segment limit consideration
}

export interface VerificationCodeData {
  code: string;
  expiresInMinutes: number;
}

export interface TaskAlertData {
  taskTitle: string;
  priority: string;
  action: string; // e.g., "is now overdue", "was assigned to you"
  entityName: string;
}

export interface MeetingReminderData {
  meetingTitle: string;
  startTime: string;
  location?: string;
  minutesUntil: number;
}

export interface CrisisAlertData {
  entityName: string;
  alertLevel: 'critical' | 'high' | 'medium';
  summary: string;
  actionRequired: string;
  callbackNumber?: string;
}

// Helper: truncate message to fit SMS segment limits
export function truncateToSmsLimit(message: string, maxLength?: number): string;

// Helper: render an SMS template with data
export function renderSmsTemplate<TData>(template: SmsTemplate<TData>, data: TData): string;

// Template registry
export const smsTemplates: {
  verificationCode: SmsTemplate<VerificationCodeData>;
  taskAlert: SmsTemplate<TaskAlertData>;
  meetingReminder: SmsTemplate<MeetingReminderData>;
  crisisAlert: SmsTemplate<CrisisAlertData>;
};

// Lookup a template by ID
export function getSmsTemplate(templateId: string): SmsTemplate | undefined;
```

**SMS Template Guidelines:**
- SMS messages must be concise. Standard SMS segment is 160 characters (GSM-7) or 70 characters (UCS-2 for unicode).
- Default maxLength to 160 characters.
- `truncateToSmsLimit` should add an ellipsis if truncation occurs.
- Templates should frontload the most important information.
- Verification code template should be simple and direct: "[AppName] Your code is: 123456. Expires in 10 min."
- Crisis alert should lead with the severity and entity name.

### 4. SMS Workflows (`src/lib/integrations/sms/workflows.ts`)

Create SMS workflow functions:

```typescript
// src/lib/integrations/sms/workflows.ts

export interface SmsDeliveryRecord {
  id: string;
  to: string;
  templateId: string;
  message: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'undelivered';
  sentAt?: Date;
  deliveredAt?: Date;
  failureReason?: string;
  segments: number;
}

export interface SmsOptOutRecord {
  phoneNumber: string;
  entityId: string;
  optedOutAt: Date;
  reason?: string;
}

// Send an SMS using a template
export async function sendTemplatedSms<TData>(params: {
  to: string;
  templateId: string;
  data: TData;
  entityId: string;
}): Promise<SmsDeliveryRecord>;

// Track delivery status update (webhook callback)
export async function updateDeliveryStatus(params: {
  messageId: string;
  status: 'delivered' | 'failed' | 'undelivered';
  timestamp: Date;
  failureReason?: string;
}): Promise<void>;

// Get delivery history for a phone number
export function getDeliveryHistory(phoneNumber: string, limit?: number): SmsDeliveryRecord[];

// Handle opt-out (STOP keyword)
export async function handleOptOut(params: {
  phoneNumber: string;
  entityId: string;
  reason?: string;
}): Promise<void>;

// Handle opt-in (START keyword)
export async function handleOptIn(params: {
  phoneNumber: string;
  entityId: string;
}): Promise<void>;

// Check if a phone number has opted out
export function isOptedOut(phoneNumber: string, entityId: string): boolean;

// Get opt-out statistics for an entity
export function getOptOutStats(entityId: string): {
  totalOptOuts: number;
  optedOutNumbers: string[];
};

// Calculate SMS segment count for a message
export function calculateSegments(message: string): number;
```

**SMS Workflow Guidelines:**
- Use in-memory stores (Map/Set) for delivery records and opt-outs. These are placeholders until a persistent store is added.
- `sendTemplatedSms` should check opt-out status before sending and return a failed record if opted out.
- Opt-out handling must be immediate and reliable -- this is a compliance requirement (TCPA).
- `calculateSegments` should account for GSM-7 (160 char) vs UCS-2 (70 char) encoding based on message content.
- Delivery records should be stored with timestamps for audit trail purposes.

## Acceptance Criteria

1. All 7 email templates render valid HTML and plain-text output with no undefined variables.
2. Email HTML output uses inline CSS and table-based layout for email client compatibility.
3. `wrapInLayout` produces consistent branding around any email body.
4. `renderTemplate` correctly substitutes all template variables.
5. Scheduled email workflow can schedule, cancel, and process pending emails.
6. Batch email sending respects rate limits and handles individual failures gracefully.
7. Bounce handling correctly suppresses hard-bounced addresses.
8. Unsubscribe management works per-entity and per-category.
9. All 4 SMS templates render messages within the 160-character limit (or specified maxLength).
10. SMS opt-out/opt-in handling is immediate and blocks sends to opted-out numbers.
11. SMS segment calculation correctly differentiates GSM-7 and UCS-2 encoding.
12. All files compile without TypeScript errors (`npx tsc --noEmit`).
13. All unit tests pass (`npx jest tests/unit/integrations/`).
14. No modifications to `email/client.ts`, `sms/client.ts`, `jest.config.ts`, or `package.json`.

## Implementation Steps

1. **Read context files**: Read `prisma/schema.prisma`, `src/shared/types/index.ts`, `src/lib/integrations/email/client.ts`, `src/lib/integrations/sms/client.ts`, `package.json`, `tsconfig.json`.
2. **Create branch**: `git checkout -b ai-feature/p2-w06-email-sms`
3. **Create `src/lib/integrations/email/templates.ts`**: Implement all 7 email templates with HTML/text rendering, layout wrapper, and template registry.
4. **Create `src/lib/integrations/email/workflows.ts`**: Implement scheduled sending, batch processing, bounce handling, and unsubscribe management.
5. **Create `src/lib/integrations/sms/templates.ts`**: Implement all 4 SMS templates with character-limit-aware rendering.
6. **Create `src/lib/integrations/sms/workflows.ts`**: Implement delivery tracking, opt-out/opt-in handling, and segment calculation.
7. **Create tests**: Write comprehensive unit tests for all template rendering and workflow logic.
8. **Type-check**: Run `npx tsc --noEmit` to verify no TypeScript errors.
9. **Run tests**: Execute `npx jest tests/unit/integrations/` and verify all pass.
10. **Commit** with conventional commit messages.

## Tests Required

Create the following test files in `tests/unit/integrations/`:

### `tests/unit/integrations/email-templates.test.ts`
```typescript
describe('Email Templates', () => {
  describe('renderTemplate', () => {
    it('should render welcome template with all variables substituted');
    it('should render password-reset template with expiry info');
    it('should render task-reminder template with priority styling');
    it('should render invoice-sent template with formatted currency');
    it('should render daily-digest template with task and meeting lists');
    it('should render daily-digest template gracefully with empty arrays');
    it('should render alert-notification with correct styling per alert type');
    it('should render meeting-prep template with attendees and agenda');
  });

  describe('wrapInLayout', () => {
    it('should wrap body HTML in header and footer');
    it('should include entity name when provided');
    it('should include unsubscribe link when provided');
  });

  describe('getEmailTemplate', () => {
    it('should return template by ID');
    it('should return undefined for unknown template ID');
  });

  describe('HTML safety', () => {
    it('should escape HTML entities in user-provided data');
    it('should not produce broken HTML tags');
  });
});
```

### `tests/unit/integrations/email-workflows.test.ts`
```typescript
describe('Email Workflows', () => {
  describe('scheduleEmail', () => {
    it('should create a scheduled email with pending status');
    it('should set default maxAttempts');
  });

  describe('cancelScheduledEmail', () => {
    it('should cancel a pending scheduled email');
    it('should return false for non-existent email');
    it('should return false for already-sent email');
  });

  describe('processScheduledEmails', () => {
    it('should send emails that are due');
    it('should not send emails scheduled for the future');
    it('should track failed attempts');
  });

  describe('sendBatchEmails', () => {
    it('should send to all recipients');
    it('should track sent and failed counts');
    it('should skip suppressed email addresses');
  });

  describe('handleBounce', () => {
    it('should record hard bounce and suppress email');
    it('should record soft bounce without suppressing');
  });

  describe('isEmailSuppressed', () => {
    it('should return true for hard-bounced emails');
    it('should return false for non-bounced emails');
  });

  describe('handleUnsubscribe / isUnsubscribed', () => {
    it('should record unsubscribe for entity');
    it('should check unsubscribe status correctly');
    it('should handle category-specific unsubscribes');
  });
});
```

### `tests/unit/integrations/sms-templates.test.ts`
```typescript
describe('SMS Templates', () => {
  describe('renderSmsTemplate', () => {
    it('should render verification-code template within character limit');
    it('should render task-alert template with priority and action');
    it('should render meeting-reminder template with time and location');
    it('should render crisis-alert template with severity prefix');
  });

  describe('truncateToSmsLimit', () => {
    it('should not truncate messages within limit');
    it('should truncate and add ellipsis for long messages');
    it('should respect custom maxLength');
  });

  describe('getSmsTemplate', () => {
    it('should return template by ID');
    it('should return undefined for unknown ID');
  });

  describe('calculateSegments (from workflows)', () => {
    it('should return 1 for messages under 160 chars (GSM-7)');
    it('should return 2 for messages between 161-306 chars (GSM-7)');
    it('should use UCS-2 limits for messages with unicode characters');
  });
});
```

### `tests/unit/integrations/sms-workflows.test.ts`
```typescript
describe('SMS Workflows', () => {
  describe('sendTemplatedSms', () => {
    it('should send SMS and return delivery record');
    it('should refuse to send to opted-out numbers');
    it('should calculate segment count correctly');
  });

  describe('updateDeliveryStatus', () => {
    it('should update status of existing delivery record');
    it('should record failure reason on failed delivery');
  });

  describe('handleOptOut / handleOptIn', () => {
    it('should mark phone number as opted out');
    it('should block sends after opt-out');
    it('should allow sends after opt-in');
  });

  describe('isOptedOut', () => {
    it('should return true for opted-out numbers');
    it('should return false for active numbers');
    it('should scope opt-out to entity');
  });

  describe('getDeliveryHistory', () => {
    it('should return delivery records for a phone number');
    it('should respect limit parameter');
    it('should return empty array for unknown number');
  });
});
```

Mock the email and SMS clients in tests. Do NOT require live API connections for unit tests.

## Commit Strategy

Make atomic commits in this order:

1. `feat(email): add email templates with HTML/text rendering for 7 notification types`
   - Files: `src/lib/integrations/email/templates.ts`
2. `feat(email): add email workflows for scheduling, batching, bounces, and unsubscribes`
   - Files: `src/lib/integrations/email/workflows.ts`
3. `feat(sms): add SMS templates for verification, alerts, reminders, and crisis notifications`
   - Files: `src/lib/integrations/sms/templates.ts`
4. `feat(sms): add SMS workflows for delivery tracking, opt-out handling, and segment calculation`
   - Files: `src/lib/integrations/sms/workflows.ts`
5. `test(integrations): add unit tests for email and SMS templates and workflows`
   - Files: `tests/unit/integrations/*.test.ts`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
