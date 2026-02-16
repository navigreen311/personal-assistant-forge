import { processSmsJob } from '@/lib/queue/processors/sms-processor';

jest.mock('@/lib/integrations/sms/client', () => ({
  sendSMS: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    actionLog: { create: jest.fn() },
  },
}));

import { sendSMS } from '@/lib/integrations/sms/client';
import { prisma } from '@/lib/db';

const mockSendSMS = sendSMS as jest.MockedFunction<typeof sendSMS>;
const mockActionLogCreate = prisma.actionLog.create as jest.MockedFunction<
  typeof prisma.actionLog.create
>;

describe('processSmsJob', () => {
  const jobData = {
    to: '+1234567890',
    body: 'Hello from PAF',
    entityId: 'entity-123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call SMS client with to and body', async () => {
    mockSendSMS.mockResolvedValue('SM123');
    mockActionLogCreate.mockResolvedValue({} as never);

    await processSmsJob(jobData);

    expect(mockSendSMS).toHaveBeenCalledWith({
      to: '+1234567890',
      body: 'Hello from PAF',
    });
  });

  it('should log the send via actionLog', async () => {
    mockSendSMS.mockResolvedValue('SM123');
    mockActionLogCreate.mockResolvedValue({} as never);

    await processSmsJob(jobData);

    expect(mockActionLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actor: 'SYSTEM',
        actionType: 'SMS_SEND',
        target: 'entity:entity-123/sms:+1234567890',
        status: 'EXECUTED',
      }),
    });
  });

  it('should return success result', async () => {
    mockSendSMS.mockResolvedValue('SM123');
    mockActionLogCreate.mockResolvedValue({} as never);

    const result = await processSmsJob(jobData);

    expect(result.success).toBe(true);
    expect(result.message).toContain('+1234567890');
    expect(result.data).toEqual({ to: '+1234567890', sid: 'SM123' });
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should handle send failure', async () => {
    mockSendSMS.mockResolvedValue(null);
    mockActionLogCreate.mockResolvedValue({} as never);

    await expect(processSmsJob(jobData)).rejects.toThrow('SMS client returned failure');
  });
});
