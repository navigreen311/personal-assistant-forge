jest.mock('@/shared/middleware/auth', () => ({
  withRole: jest.fn(),
}));

jest.mock('@/shared/utils/api-response', () => ({
  success: jest.fn((data: unknown, status = 200) => ({
    status,
    json: async () => ({ success: true, data }),
  })),
  error: jest.fn((code: string, message: string, status = 400) => ({
    status,
    json: async () => ({ success: false, error: { code, message } }),
  })),
}));

jest.mock('@/lib/queue/jobs/registry', () => ({
  enqueueJob: jest.fn().mockResolvedValue('job-456'),
  getJobQueue: jest.fn().mockReturnValue({
    getJobs: jest.fn().mockResolvedValue([
      {
        id: 'job-1',
        name: 'EMAIL_SEND',
        data: { to: 'test@test.com' },
        timestamp: Date.now(),
        processedOn: Date.now(),
        finishedOn: Date.now(),
        attemptsMade: 1,
      },
    ]),
  }),
}));

jest.mock('@/lib/queue/jobs', () => ({
  JobType: {
    EMAIL_SEND: 'EMAIL_SEND',
    SMS_SEND: 'SMS_SEND',
    AI_TRIAGE: 'AI_TRIAGE',
    WORKFLOW_STEP: 'WORKFLOW_STEP',
    REPORT_GENERATE: 'REPORT_GENERATE',
    CALENDAR_SYNC: 'CALENDAR_SYNC',
    INVOICE_PROCESS: 'INVOICE_PROCESS',
    BACKUP_RUN: 'BACKUP_RUN',
    NOTIFICATION_PUSH: 'NOTIFICATION_PUSH',
  },
}));

import { NextRequest } from 'next/server';
import { withRole } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { enqueueJob } from '@/lib/queue/jobs/registry';
import { GET, POST } from '@/app/api/jobs/route';

const mockWithRole = withRole as jest.MockedFunction<typeof withRole>;

function createRequest(url: string, options?: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), options as never);
}

describe('GET /api/jobs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // By default, withRole calls the handler
    mockWithRole.mockImplementation(async (_req, _roles, handler) => {
      return handler(_req, {
        userId: 'admin-1',
        email: 'admin@test.com',
        name: 'Admin',
        role: 'admin',
      });
    });
  });

  it('should require admin role', async () => {
    const req = createRequest('/api/jobs');
    await GET(req);

    expect(mockWithRole).toHaveBeenCalledWith(
      req,
      ['admin'],
      expect.any(Function)
    );
  });

  it('should return list of jobs with status', async () => {
    const req = createRequest('/api/jobs?status=completed');
    await GET(req);

    expect(success).toHaveBeenCalledWith(
      expect.objectContaining({
        jobs: expect.arrayContaining([
          expect.objectContaining({
            id: 'job-1',
            type: 'EMAIL_SEND',
          }),
        ]),
      })
    );
  });

  it('should filter by status query param', async () => {
    const req = createRequest('/api/jobs?status=waiting');
    await GET(req);

    expect(success).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'waiting',
      })
    );
  });

  it('should respect limit and offset', async () => {
    const req = createRequest('/api/jobs?limit=10&offset=5');
    await GET(req);

    expect(success).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 10,
        offset: 5,
      })
    );
  });
});

describe('POST /api/jobs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWithRole.mockImplementation(async (_req, _roles, handler) => {
      return handler(_req, {
        userId: 'admin-1',
        email: 'admin@test.com',
        name: 'Admin',
        role: 'admin',
      });
    });
  });

  it('should require admin role', async () => {
    const req = createRequest('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        type: 'EMAIL_SEND',
        data: { to: 'test@test.com', subject: 'Hi', body: 'Hello', entityId: 'e1' },
      }),
    });

    await POST(req);

    expect(mockWithRole).toHaveBeenCalledWith(
      req,
      ['admin'],
      expect.any(Function)
    );
  });

  it('should validate job type', async () => {
    const req = createRequest('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        type: 'EMAIL_SEND',
        data: { to: 'test@test.com' },
      }),
    });

    await POST(req);

    expect(enqueueJob).toHaveBeenCalledWith(
      'EMAIL_SEND',
      expect.any(Object),
      undefined
    );
  });

  it('should enqueue job and return job ID', async () => {
    const req = createRequest('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        type: 'SMS_SEND',
        data: { to: '+1234567890', body: 'Hi', entityId: 'e1' },
      }),
    });

    await POST(req);

    expect(success).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-456',
        type: 'SMS_SEND',
        status: 'queued',
      }),
      201
    );
  });

  it('should reject invalid job type', async () => {
    const req = createRequest('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        type: 'INVALID_TYPE',
        data: {},
      }),
    });

    await POST(req);

    expect(error).toHaveBeenCalledWith(
      'VALIDATION_ERROR',
      'Invalid job payload',
      400,
      expect.any(Object)
    );
  });
});
