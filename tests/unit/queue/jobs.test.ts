import { JobType, QUEUE_NAME, DEFAULT_JOB_OPTIONS } from '@/lib/queue/jobs';
import type { JobDataMap, JobResult } from '@/lib/queue/jobs';

describe('JobType enum', () => {
  it('should contain all 9 job types', () => {
    const types = Object.values(JobType);
    expect(types).toHaveLength(9);
    expect(types).toContain('EMAIL_SEND');
    expect(types).toContain('SMS_SEND');
    expect(types).toContain('AI_TRIAGE');
    expect(types).toContain('WORKFLOW_STEP');
    expect(types).toContain('REPORT_GENERATE');
    expect(types).toContain('CALENDAR_SYNC');
    expect(types).toContain('INVOICE_PROCESS');
    expect(types).toContain('BACKUP_RUN');
    expect(types).toContain('NOTIFICATION_PUSH');
  });

  it('should have matching data interfaces for each type', () => {
    // Type-level test: ensures JobDataMap has an entry for each JobType
    const emailData: JobDataMap[JobType.EMAIL_SEND] = {
      to: 'test@example.com',
      subject: 'Test',
      body: '<p>Hello</p>',
      entityId: 'e1',
    };
    expect(emailData.to).toBe('test@example.com');

    const smsData: JobDataMap[JobType.SMS_SEND] = {
      to: '+1234567890',
      body: 'Hello',
      entityId: 'e1',
    };
    expect(smsData.to).toBe('+1234567890');

    const triageData: JobDataMap[JobType.AI_TRIAGE] = {
      messageId: 'm1',
      entityId: 'e1',
    };
    expect(triageData.messageId).toBe('m1');

    const workflowData: JobDataMap[JobType.WORKFLOW_STEP] = {
      executionId: 'ex1',
      nodeId: 'n1',
      input: {},
    };
    expect(workflowData.executionId).toBe('ex1');

    const reportData: JobDataMap[JobType.REPORT_GENERATE] = {
      reportType: 'WEEKLY_SUMMARY',
      entityId: 'e1',
      dateRange: { from: '2024-01-01', to: '2024-01-07' },
      format: 'PDF',
    };
    expect(reportData.reportType).toBe('WEEKLY_SUMMARY');

    const calendarData: JobDataMap[JobType.CALENDAR_SYNC] = {
      entityId: 'e1',
      provider: 'GOOGLE',
      direction: 'PULL',
    };
    expect(calendarData.provider).toBe('GOOGLE');

    const invoiceData: JobDataMap[JobType.INVOICE_PROCESS] = {
      invoiceId: 'inv1',
      entityId: 'e1',
      action: 'CREATE',
    };
    expect(invoiceData.action).toBe('CREATE');

    const backupData: JobDataMap[JobType.BACKUP_RUN] = {
      entityId: 'e1',
      scope: 'FULL',
      destination: 's3://bucket',
    };
    expect(backupData.scope).toBe('FULL');

    const notifData: JobDataMap[JobType.NOTIFICATION_PUSH] = {
      userId: 'u1',
      title: 'Test',
      body: 'Hello',
      channel: 'WEB_PUSH',
    };
    expect(notifData.channel).toBe('WEB_PUSH');
  });
});

describe('Queue constants', () => {
  it('should export a valid QUEUE_NAME', () => {
    expect(QUEUE_NAME).toBe('pa-forge-jobs');
  });

  it('should export DEFAULT_JOB_OPTIONS with correct values', () => {
    expect(DEFAULT_JOB_OPTIONS.attempts).toBe(3);
    expect(DEFAULT_JOB_OPTIONS.backoff).toEqual({ type: 'exponential', delay: 2000 });
    expect(DEFAULT_JOB_OPTIONS.removeOnComplete).toEqual({ count: 500 });
    expect(DEFAULT_JOB_OPTIONS.removeOnFail).toEqual({ count: 2000 });
  });
});
