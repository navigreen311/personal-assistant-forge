const mockQueueInstance = {
  add: jest.fn().mockResolvedValue({ id: 'job-123' }),
  getJobs: jest.fn().mockResolvedValue([]),
};

jest.mock('bullmq', () => {
  const mockWorkerInstance = {
    on: jest.fn(),
    close: jest.fn(),
  };
  return {
    Worker: jest.fn().mockReturnValue(mockWorkerInstance),
    Queue: jest.fn().mockReturnValue(mockQueueInstance),
    Job: jest.fn(),
  };
});

jest.mock('@/lib/queue/connection', () => ({
  getRedisUrl: jest.fn().mockReturnValue('redis://localhost:6379'),
}));

jest.mock('@/lib/queue/processors/email-processor', () => ({
  processEmailJob: jest.fn().mockResolvedValue({ success: true, message: 'ok', processingTimeMs: 1 }),
}));
jest.mock('@/lib/queue/processors/sms-processor', () => ({
  processSmsJob: jest.fn().mockResolvedValue({ success: true, message: 'ok', processingTimeMs: 1 }),
}));
jest.mock('@/lib/queue/processors/ai-triage-processor', () => ({
  processAITriageJob: jest.fn().mockResolvedValue({ success: true, message: 'ok', processingTimeMs: 1 }),
}));
jest.mock('@/lib/queue/processors/workflow-processor', () => ({
  processWorkflowStepJob: jest.fn().mockResolvedValue({ success: true, message: 'ok', processingTimeMs: 1 }),
}));
jest.mock('@/lib/queue/processors/report-processor', () => ({
  processReportJob: jest.fn().mockResolvedValue({ success: true, message: 'ok', processingTimeMs: 1 }),
}));
jest.mock('@/lib/queue/processors/calendar-sync-processor', () => ({
  processCalendarSyncJob: jest.fn().mockResolvedValue({ success: true, message: 'ok', processingTimeMs: 1 }),
}));
jest.mock('@/lib/queue/processors/invoice-processor', () => ({
  processInvoiceJob: jest.fn().mockResolvedValue({ success: true, message: 'ok', processingTimeMs: 1 }),
}));
jest.mock('@/lib/queue/processors/backup-processor', () => ({
  processBackupJob: jest.fn().mockResolvedValue({ success: true, message: 'ok', processingTimeMs: 1 }),
}));
jest.mock('@/lib/queue/processors/notification-processor', () => ({
  processNotificationJob: jest.fn().mockResolvedValue({ success: true, message: 'ok', processingTimeMs: 1 }),
}));

import { Worker, Queue } from 'bullmq';
import { createJobWorker, enqueueJob } from '@/lib/queue/jobs/registry';
import { JobType, QUEUE_NAME, DEFAULT_JOB_OPTIONS } from '@/lib/queue/jobs';
import { processEmailJob } from '@/lib/queue/processors/email-processor';
import { processAITriageJob } from '@/lib/queue/processors/ai-triage-processor';

const MockWorker = Worker as jest.MockedClass<typeof Worker>;
const MockQueue = Queue as jest.MockedClass<typeof Queue>;

describe('createJobWorker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a BullMQ Worker with the correct queue name', () => {
    createJobWorker();

    expect(MockWorker).toHaveBeenCalledWith(
      QUEUE_NAME,
      expect.any(Function),
      expect.objectContaining({
        connection: { url: 'redis://localhost:6379' },
        concurrency: 5,
      })
    );
  });

  it('should route EMAIL_SEND jobs to email processor', async () => {
    createJobWorker();

    // Get the processor function passed to the Worker constructor
    const processorFn = MockWorker.mock.calls[0][1] as (job: { name: string; data: unknown }) => Promise<unknown>;

    await processorFn({
      name: JobType.EMAIL_SEND,
      data: { to: 'test@test.com', subject: 'Hi', body: 'Hello', entityId: 'e1' },
    });

    expect(processEmailJob).toHaveBeenCalledWith({
      to: 'test@test.com',
      subject: 'Hi',
      body: 'Hello',
      entityId: 'e1',
    });
  });

  it('should route AI_TRIAGE jobs to AI triage processor', async () => {
    createJobWorker();

    const processorFn = MockWorker.mock.calls[0][1] as (job: { name: string; data: unknown }) => Promise<unknown>;

    await processorFn({
      name: JobType.AI_TRIAGE,
      data: { messageId: 'msg-1', entityId: 'e1' },
    });

    expect(processAITriageJob).toHaveBeenCalledWith({
      messageId: 'msg-1',
      entityId: 'e1',
    });
  });

  it('should throw for unknown job types', async () => {
    createJobWorker();

    const processorFn = MockWorker.mock.calls[0][1] as (job: { name: string; data: unknown }) => Promise<unknown>;

    await expect(
      processorFn({ name: 'UNKNOWN_JOB', data: {} })
    ).rejects.toThrow('Unknown job type: UNKNOWN_JOB');
  });
});

describe('enqueueJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should add job to queue with correct type and data', async () => {
    const data = {
      to: 'test@test.com',
      subject: 'Test',
      body: 'Hello',
      entityId: 'e1',
    };

    await enqueueJob(JobType.EMAIL_SEND, data);

    expect(mockQueueInstance.add).toHaveBeenCalledWith(
      JobType.EMAIL_SEND,
      data,
      expect.objectContaining({
        attempts: DEFAULT_JOB_OPTIONS.attempts,
        backoff: DEFAULT_JOB_OPTIONS.backoff,
      })
    );
  });

  it('should apply default job options', async () => {
    await enqueueJob(JobType.SMS_SEND, {
      to: '+1234567890',
      body: 'Hi',
      entityId: 'e1',
    });

    expect(mockQueueInstance.add).toHaveBeenCalledWith(
      JobType.SMS_SEND,
      expect.any(Object),
      expect.objectContaining({
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 2000 },
      })
    );
  });

  it('should pass through custom delay and priority', async () => {
    await enqueueJob(
      JobType.EMAIL_SEND,
      { to: 'a@b.com', subject: 'X', body: 'Y', entityId: 'e1' },
      { delay: 5000, priority: 1 }
    );

    expect(mockQueueInstance.add).toHaveBeenCalledWith(
      JobType.EMAIL_SEND,
      expect.any(Object),
      expect.objectContaining({
        delay: 5000,
        priority: 1,
      })
    );
  });

  it('should return the job ID', async () => {
    const jobId = await enqueueJob(JobType.EMAIL_SEND, {
      to: 'a@b.com',
      subject: 'X',
      body: 'Y',
      entityId: 'e1',
    });

    expect(jobId).toBe('job-123');
  });
});
