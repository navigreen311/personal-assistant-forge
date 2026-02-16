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

export type JobData<T extends JobType> = JobDataMap[T];

export interface JobResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  processingTimeMs: number;
}

export const QUEUE_NAME = 'pa-forge-jobs';

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 2000 },
};
