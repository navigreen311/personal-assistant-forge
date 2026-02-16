import { processEmailJob } from '@/lib/queue/processors/email-processor';

jest.mock('@/lib/integrations/email/client', () => ({
  sendEmail: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    actionLog: { create: jest.fn() },
  },
}));

import { sendEmail } from '@/lib/integrations/email/client';
import { prisma } from '@/lib/db';

const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;
const mockActionLogCreate = prisma.actionLog.create as jest.MockedFunction<
  typeof prisma.actionLog.create
>;

describe('processEmailJob', () => {
  const jobData = {
    to: 'user@example.com',
    subject: 'Test Subject',
    body: '<p>Hello</p>',
    entityId: 'entity-123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call email client with correct parameters', async () => {
    mockSendEmail.mockResolvedValue(true);
    mockActionLogCreate.mockResolvedValue({} as never);

    await processEmailJob(jobData);

    expect(mockSendEmail).toHaveBeenCalledWith({
      to: 'user@example.com',
      subject: 'Test Subject',
      html: '<p>Hello</p>',
      replyTo: undefined,
    });
  });

  it('should log the send via actionLog', async () => {
    mockSendEmail.mockResolvedValue(true);
    mockActionLogCreate.mockResolvedValue({} as never);

    await processEmailJob(jobData);

    expect(mockActionLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actor: 'SYSTEM',
        actionType: 'EMAIL_SEND',
        target: 'entity:entity-123/email:user@example.com',
        status: 'EXECUTED',
      }),
    });
  });

  it('should return success result on successful send', async () => {
    mockSendEmail.mockResolvedValue(true);
    mockActionLogCreate.mockResolvedValue({} as never);

    const result = await processEmailJob(jobData);

    expect(result.success).toBe(true);
    expect(result.message).toContain('user@example.com');
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should return failure result and rethrow on client error', async () => {
    mockSendEmail.mockResolvedValue(false);
    mockActionLogCreate.mockResolvedValue({} as never);

    await expect(processEmailJob(jobData)).rejects.toThrow('Email client returned failure');

    expect(mockActionLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'FAILED',
      }),
    });
  });
});
