import { Worker, Queue, Job } from 'bullmq';
import { getRedisUrl } from '../connection';
import { JobType, QUEUE_NAME, DEFAULT_JOB_OPTIONS } from './index';
import type { JobDataMap, JobResult } from './index';
import { processEmailJob } from '../processors/email-processor';
import { processSmsJob } from '../processors/sms-processor';
import { processAITriageJob } from '../processors/ai-triage-processor';
import { processWorkflowStepJob } from '../processors/workflow-processor';
import { processReportJob } from '../processors/report-processor';
import { processCalendarSyncJob } from '../processors/calendar-sync-processor';
import { processInvoiceJob } from '../processors/invoice-processor';
import { processBackupJob } from '../processors/backup-processor';
import { processNotificationJob } from '../processors/notification-processor';

const processorMap: Record<JobType, (data: unknown) => Promise<JobResult>> = {
  [JobType.EMAIL_SEND]: processEmailJob as (data: unknown) => Promise<JobResult>,
  [JobType.SMS_SEND]: processSmsJob as (data: unknown) => Promise<JobResult>,
  [JobType.AI_TRIAGE]: processAITriageJob as (data: unknown) => Promise<JobResult>,
  [JobType.WORKFLOW_STEP]: processWorkflowStepJob as (data: unknown) => Promise<JobResult>,
  [JobType.REPORT_GENERATE]: processReportJob as (data: unknown) => Promise<JobResult>,
  [JobType.CALENDAR_SYNC]: processCalendarSyncJob as (data: unknown) => Promise<JobResult>,
  [JobType.INVOICE_PROCESS]: processInvoiceJob as (data: unknown) => Promise<JobResult>,
  [JobType.BACKUP_RUN]: processBackupJob as (data: unknown) => Promise<JobResult>,
  [JobType.NOTIFICATION_PUSH]: processNotificationJob as (data: unknown) => Promise<JobResult>,
};

export function createJobWorker(concurrency = 5): Worker {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const processor = processorMap[job.name as JobType];
      if (!processor) {
        throw new Error(`Unknown job type: ${job.name}`);
      }
      return processor(job.data);
    },
    {
      connection: { url: getRedisUrl() },
      concurrency,
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[JobWorker] ${job?.name} ${job?.id} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    console.log(`[JobWorker] ${job.name} ${job.id} completed`);
  });

  return worker;
}

let queue: Queue | null = null;

function getJobQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: { url: getRedisUrl() },
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }
  return queue;
}

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

export { getJobQueue };
