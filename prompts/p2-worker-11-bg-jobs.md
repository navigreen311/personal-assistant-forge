# Worker 11: Background Job Definitions & Queue Wiring

## Branch

`ai-feature/p2-w11-bg-jobs`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside these directories:

- `src/lib/queue/jobs/` (create -- job type definitions, registry)
- `src/lib/queue/processors/` (create -- per-job-type processor files)
- `src/app/api/jobs/route.ts` (create -- admin job management endpoint)
- `tests/unit/queue/` (create -- unit tests for processors and registry)

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

1. **`src/lib/queue/connection.ts`** -- Shared IORedis connection factory. Use `getRedisConnection()` or `createRedisConnection()` for BullMQ connections. Use `getRedisUrl()` when passing connection config to BullMQ constructors.
2. **`src/lib/queue/scheduler.ts`** -- Cron-based workflow trigger scheduler using BullMQ repeat. Shows the pattern for creating queues with `getRedisUrl()`.
3. **`src/lib/queue/workflow-queue.ts`** -- Workflow execution queue. Shows BullMQ `Queue` usage patterns including `defaultJobOptions` with retry, backoff, and cleanup settings.
4. **`src/lib/queue/workflow-worker.ts`** -- Workflow execution worker. Shows how to create a `Worker` with concurrency, error/completion event handlers, and Prisma-based processing.
5. **`src/lib/integrations/email/client.ts`** -- Email integration client. Import and call for EMAIL_SEND jobs.
6. **`src/lib/integrations/sms/client.ts`** -- SMS integration client. Import and call for SMS_SEND jobs.
7. **`src/lib/ai/index.ts`** -- AI client exports: `generateText`, `generateJSON`, `chat`, `streamText`. Use `generateJSON` for AI_TRIAGE jobs and `generateText` for REPORT_GENERATE jobs.
8. **`src/shared/middleware/auth.ts`** -- Auth middleware: `withAuth`, `withRole`, `withEntityAccess`. Use `withRole(['admin'], handler)` for the jobs API route.
9. **`src/shared/utils/api-response.ts`** -- Use `success()`, `error()`, `paginated()` for all API responses.
10. **`src/lib/db/index.ts`** -- Import `prisma` from here for database operations.
11. **`package.json`** -- Available libraries: `bullmq`, `ioredis`, `zod`, `uuid`.

### DO NOT modify these existing queue files

- `src/lib/queue/connection.ts` -- already exists, working
- `src/lib/queue/scheduler.ts` -- already exists, working
- `src/lib/queue/workflow-queue.ts` -- already exists, working
- `src/lib/queue/workflow-worker.ts` -- already exists, working

### Do NOT modify

- `jest.config.ts`
- `package.json`

## Requirements

### 1. Job Type Definitions (`src/lib/queue/jobs/index.ts`)

Define an enum and associated type map for all background job types:

```typescript
export enum JobType {
  EMAIL_SEND = 'EMAIL_SEND',
  SMS_SEND = 'SMS_SEND',
  AI_TRIAGE = 'AI_TRIAGE',
  WORKFLOW_STEP = 'WORKFLOW_STEP',
  REPORT_GENERATE = 'REPORT_GENERATE',
  CALENDAR_SYNC = 'CALENDAR_SYNC',
  INVOICE_PROCESS = 'INVOICE_PROCESS',
  BACKUP_RUN = 'BACKUP_RUN',
  NOTIFICATION_PUSH = 'NOTIFICATION_PUSH',
}

// Type-safe job data payloads
export interface JobDataMap {
  [JobType.EMAIL_SEND]: {
    to: string;
    subject: string;
    body: string;
    entityId: string;
    replyToMessageId?: string;
    attachments?: { name: string; url: string }[];
  };
  [JobType.SMS_SEND]: {
    to: string;
    body: string;
    entityId: string;
    contactId?: string;
  };
  [JobType.AI_TRIAGE]: {
    messageId: string;
    entityId: string;
  };
  [JobType.WORKFLOW_STEP]: {
    executionId: string;
    nodeId: string;
    input: Record<string, unknown>;
  };
  [JobType.REPORT_GENERATE]: {
    reportType: 'WEEKLY_SUMMARY' | 'FINANCIAL' | 'PRODUCTIVITY' | 'INBOX_DIGEST';
    entityId: string;
    dateRange: { from: string; to: string };
    format: 'PDF' | 'JSON' | 'HTML';
  };
  [JobType.CALENDAR_SYNC]: {
    entityId: string;
    provider: 'GOOGLE' | 'OUTLOOK' | 'CALDAV';
    direction: 'PULL' | 'PUSH' | 'BIDIRECTIONAL';
  };
  [JobType.INVOICE_PROCESS]: {
    invoiceId: string;
    entityId: string;
    action: 'CREATE' | 'SEND' | 'RECONCILE';
  };
  [JobType.BACKUP_RUN]: {
    entityId: string;
    scope: 'FULL' | 'INCREMENTAL';
    destination: string;
  };
  [JobType.NOTIFICATION_PUSH]: {
    userId: string;
    title: string;
    body: string;
    channel: 'WEB_PUSH' | 'EMAIL' | 'IN_APP';
    data?: Record<string, unknown>;
  };
}

// Helper type for extracting job data by type
export type JobData<T extends JobType> = JobDataMap[T];

// Job result type
export interface JobResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  processingTimeMs: number;
}
```

Also export a `QUEUE_NAME` constant (e.g., `'pa-forge-jobs'`) and a `DEFAULT_JOB_OPTIONS` object with sensible defaults (3 attempts, exponential backoff at 2s, removeOnComplete 500, removeOnFail 2000).

### 2. Processors (`src/lib/queue/processors/`)

Create one processor file per job type. Each processor exports a single async function that takes job data and returns a `JobResult`.

#### `email-processor.ts`
- Import the email integration client from `@/lib/integrations/email/client`
- Call the client's send method with `to`, `subject`, `body`, `attachments`
- Log the send via `prisma.actionLog.create()` with actor `'SYSTEM'`
- Return success/failure result

#### `sms-processor.ts`
- Import the SMS integration client from `@/lib/integrations/sms/client`
- Call the client's send method with `to`, `body`
- Log via `prisma.actionLog.create()`
- Return success/failure result

#### `ai-triage-processor.ts`
- Import `generateJSON` from `@/lib/ai`
- Fetch the message from Prisma by `messageId`
- Build a prompt that includes the message body, subject, sender info, and thread context
- Call `generateJSON<TriageResult>()` to get urgency score, intent, category, flags
- Update the message record in Prisma with the triage score and intent
- Return the triage result

#### `workflow-processor.ts`
- This is a thin wrapper that delegates to the existing workflow execution logic
- Import `enqueueStepExecution` from `@/lib/queue/workflow-queue` if needed
- Process the step by looking up the execution and node, then running the action
- Log execution via `prisma.actionLog.create()`

#### `report-processor.ts`
- Import `generateText` from `@/lib/ai`
- Based on `reportType`, query relevant data from Prisma (messages, tasks, events, finances)
- Build a prompt asking AI to generate a structured report from the data
- Call `generateText()` with the prompt
- Store the report in `prisma.document.create()` with type matching the report type
- Return success with the document ID

#### `calendar-sync-processor.ts`
- Placeholder processor -- log the sync attempt, return success
- In the future this will connect to calendar provider APIs
- For now: query events from Prisma for the entity, simulate sync, log result

#### `invoice-processor.ts`
- Look up invoice from Prisma by `invoiceId`
- Based on `action`: CREATE generates invoice document, SEND queues an EMAIL_SEND job, RECONCILE updates status
- Log via `prisma.actionLog.create()`

#### `backup-processor.ts`
- Placeholder processor -- log the backup attempt with scope and destination
- In the future this will connect to storage provider APIs
- Return success with timestamp

#### `notification-processor.ts`
- Based on `channel`: WEB_PUSH logs a push event, EMAIL enqueues an EMAIL_SEND job, IN_APP creates a notification record
- Log via `prisma.actionLog.create()`

### 3. Job Registry (`src/lib/queue/jobs/registry.ts`)

Register all processors with a BullMQ `Worker`:

```typescript
import { Worker, Job } from 'bullmq';
import { getRedisUrl } from '../connection';
import { JobType, QUEUE_NAME, type JobDataMap, type JobResult } from './index';
// import each processor...

const processorMap: Record<JobType, (data: any) => Promise<JobResult>> = {
  [JobType.EMAIL_SEND]: processEmailJob,
  [JobType.SMS_SEND]: processSmsJob,
  [JobType.AI_TRIAGE]: processAITriageJob,
  [JobType.WORKFLOW_STEP]: processWorkflowStepJob,
  [JobType.REPORT_GENERATE]: processReportJob,
  [JobType.CALENDAR_SYNC]: processCalendarSyncJob,
  [JobType.INVOICE_PROCESS]: processInvoiceJob,
  [JobType.BACKUP_RUN]: processBackupJob,
  [JobType.NOTIFICATION_PUSH]: processNotificationJob,
};

export function createJobWorker(concurrency = 5): Worker {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const processor = processorMap[job.name as JobType];
      if (!processor) throw new Error(`Unknown job type: ${job.name}`);
      return processor(job.data);
    },
    { connection: { url: getRedisUrl() }, concurrency }
  );

  worker.on('failed', (job, err) => {
    console.error(`[JobWorker] ${job?.name} ${job?.id} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    console.log(`[JobWorker] ${job.name} ${job.id} completed`);
  });

  return worker;
}
```

Also export a helper function to enqueue any job type-safely:

```typescript
import { Queue } from 'bullmq';

let queue: Queue | null = null;
function getJobQueue(): Queue { /* lazy init with QUEUE_NAME and getRedisUrl() */ }

export async function enqueueJob<T extends JobType>(
  type: T,
  data: JobDataMap[T],
  options?: { delay?: number; priority?: number; jobId?: string }
): Promise<string> {
  const job = await getJobQueue().add(type, data, {
    ...DEFAULT_JOB_OPTIONS,
    ...options,
  });
  return job.id ?? '';
}
```

### 4. Admin API Route (`src/app/api/jobs/route.ts`)

```typescript
// GET  /api/jobs -- List recent jobs with status (admin only)
// POST /api/jobs -- Manually enqueue a job (admin only)
```

- **GET**: Use `withRole(req, ['admin'], handler)` for auth. Query the BullMQ queue for jobs by status (waiting, active, completed, failed). Support query params: `status`, `limit` (default 50), `offset`. Return job list with id, type, status, data, timestamps.
- **POST**: Use `withRole(req, ['admin'], handler)` for auth. Validate body with Zod: `{ type: JobType, data: Record<string, unknown>, delay?: number }`. Call `enqueueJob()` from the registry. Return the created job ID.
- Use `success()` and `error()` from `api-response.ts`.

## Acceptance Criteria

1. `JobType` enum contains all 9 job types with type-safe data payloads.
2. Each processor file handles its job type, calling the appropriate integration client or AI function.
3. `ai-triage-processor.ts` calls `generateJSON` from `@/lib/ai` with a proper prompt.
4. `report-processor.ts` calls `generateText` from `@/lib/ai` to generate report content.
5. `createJobWorker()` creates a BullMQ worker that routes jobs to the correct processor.
6. `enqueueJob()` provides type-safe job enqueueing.
7. The `/api/jobs` route is protected with `withRole(['admin'])`.
8. No existing files in `src/lib/queue/` are modified.
9. `jest.config.ts` and `package.json` are NOT modified.
10. All unit tests pass.

## Implementation Steps

1. **Read context files**: Read all files listed in the Context section above.
2. **Create branch**: `git checkout -b ai-feature/p2-w11-bg-jobs`
3. **Create `src/lib/queue/jobs/index.ts`**: Job type enum, data map interfaces, queue constants.
4. **Create processor files** in `src/lib/queue/processors/`: One file per job type (9 files total).
5. **Create `src/lib/queue/jobs/registry.ts`**: Worker creation, processor routing, type-safe enqueue helper.
6. **Create `src/app/api/jobs/route.ts`**: Admin-only GET/POST route with auth and validation.
7. **Create unit tests** in `tests/unit/queue/`.
8. **Type-check**: `npx tsc --noEmit`
9. **Run tests**: `npx jest tests/unit/queue/`
10. **Commit** with conventional commits.

## Tests Required

Create test files in `tests/unit/queue/`:

### `tests/unit/queue/jobs.test.ts`
```typescript
describe('JobType enum', () => {
  it('should contain all 9 job types');
  it('should have matching data interfaces for each type');
});
```

### `tests/unit/queue/email-processor.test.ts`
```typescript
// Mock: @/lib/integrations/email/client, @/lib/db
describe('processEmailJob', () => {
  it('should call email client with correct parameters');
  it('should log the send via actionLog');
  it('should return success result on successful send');
  it('should return failure result and rethrow on client error');
});
```

### `tests/unit/queue/sms-processor.test.ts`
```typescript
// Mock: @/lib/integrations/sms/client, @/lib/db
describe('processSmsJob', () => {
  it('should call SMS client with to and body');
  it('should log the send via actionLog');
  it('should return success result');
  it('should handle send failure');
});
```

### `tests/unit/queue/ai-triage-processor.test.ts`
```typescript
// Mock: @/lib/ai, @/lib/db
describe('processAITriageJob', () => {
  it('should fetch message from database by messageId');
  it('should call generateJSON with a prompt containing message body and subject');
  it('should update the message record with triage score and intent');
  it('should return triage result in JobResult');
  it('should handle missing message gracefully');
  it('should handle AI API failure gracefully');
});
```

### `tests/unit/queue/report-processor.test.ts`
```typescript
// Mock: @/lib/ai, @/lib/db
describe('processReportJob', () => {
  it('should query relevant data based on reportType');
  it('should call generateText with a prompt including the data');
  it('should store generated report as a document in Prisma');
  it('should return success with document ID');
  it('should handle different report types (WEEKLY_SUMMARY, FINANCIAL, etc.)');
});
```

### `tests/unit/queue/registry.test.ts`
```typescript
// Mock: bullmq, all processors
describe('createJobWorker', () => {
  it('should create a BullMQ Worker with the correct queue name');
  it('should route EMAIL_SEND jobs to email processor');
  it('should route AI_TRIAGE jobs to AI triage processor');
  it('should throw for unknown job types');
});

describe('enqueueJob', () => {
  it('should add job to queue with correct type and data');
  it('should apply default job options');
  it('should pass through custom delay and priority');
  it('should return the job ID');
});
```

### `tests/unit/queue/jobs-api.test.ts`
```typescript
// Mock: auth middleware, registry
describe('GET /api/jobs', () => {
  it('should require admin role');
  it('should return list of jobs with status');
  it('should filter by status query param');
  it('should respect limit and offset');
});

describe('POST /api/jobs', () => {
  it('should require admin role');
  it('should validate job type');
  it('should enqueue job and return job ID');
  it('should reject invalid job type');
});
```

## Commit Strategy

Make atomic commits in this order:

1. `feat(queue): add job type definitions and data payload interfaces`
   - Files: `src/lib/queue/jobs/index.ts`
2. `feat(queue): add job processors for email, sms, ai-triage, workflow, and report`
   - Files: `src/lib/queue/processors/email-processor.ts`, `sms-processor.ts`, `ai-triage-processor.ts`, `workflow-processor.ts`, `report-processor.ts`
3. `feat(queue): add job processors for calendar-sync, invoice, backup, and notification`
   - Files: `src/lib/queue/processors/calendar-sync-processor.ts`, `invoice-processor.ts`, `backup-processor.ts`, `notification-processor.ts`
4. `feat(queue): add job registry with worker creation and type-safe enqueue`
   - Files: `src/lib/queue/jobs/registry.ts`
5. `feat(queue): add admin-only jobs API route with auth`
   - Files: `src/app/api/jobs/route.ts`
6. `test(queue): add unit tests for processors, registry, and jobs API`
   - Files: All files in `tests/unit/queue/`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
