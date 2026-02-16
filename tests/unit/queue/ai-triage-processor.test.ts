import { processAITriageJob } from '@/lib/queue/processors/ai-triage-processor';

jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    message: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { generateJSON } from '@/lib/ai';
import { prisma } from '@/lib/db';

const mockGenerateJSON = generateJSON as jest.MockedFunction<typeof generateJSON>;
const mockMessageFindUnique = prisma.message.findUnique as jest.MockedFunction<
  typeof prisma.message.findUnique
>;
const mockMessageUpdate = prisma.message.update as jest.MockedFunction<
  typeof prisma.message.update
>;

describe('processAITriageJob', () => {
  const jobData = {
    messageId: 'msg-123',
    entityId: 'entity-456',
  };

  const mockMessage = {
    id: 'msg-123',
    subject: 'Urgent: Server down',
    from: 'ops@company.com',
    body: 'Our production server is unresponsive. Please help immediately.',
    threadId: 'thread-1',
  };

  const mockTriageResult = {
    urgency: 9,
    intent: 'request',
    category: 'support',
    flags: ['time-sensitive', 'escalation-needed'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch message from database by messageId', async () => {
    mockMessageFindUnique.mockResolvedValue(mockMessage as never);
    mockGenerateJSON.mockResolvedValue(mockTriageResult);
    mockMessageUpdate.mockResolvedValue({} as never);

    await processAITriageJob(jobData);

    expect(mockMessageFindUnique).toHaveBeenCalledWith({
      where: { id: 'msg-123' },
    });
  });

  it('should call generateJSON with a prompt containing message body and subject', async () => {
    mockMessageFindUnique.mockResolvedValue(mockMessage as never);
    mockGenerateJSON.mockResolvedValue(mockTriageResult);
    mockMessageUpdate.mockResolvedValue({} as never);

    await processAITriageJob(jobData);

    expect(mockGenerateJSON).toHaveBeenCalledWith(
      expect.stringContaining('Urgent: Server down'),
      expect.objectContaining({ maxTokens: 512, temperature: 0.3 })
    );
    expect(mockGenerateJSON).toHaveBeenCalledWith(
      expect.stringContaining('Our production server is unresponsive'),
      expect.any(Object)
    );
  });

  it('should update the message record with triage score and intent', async () => {
    mockMessageFindUnique.mockResolvedValue(mockMessage as never);
    mockGenerateJSON.mockResolvedValue(mockTriageResult);
    mockMessageUpdate.mockResolvedValue({} as never);

    await processAITriageJob(jobData);

    expect(mockMessageUpdate).toHaveBeenCalledWith({
      where: { id: 'msg-123' },
      data: {
        triageScore: 9,
        intent: 'request',
      },
    });
  });

  it('should return triage result in JobResult', async () => {
    mockMessageFindUnique.mockResolvedValue(mockMessage as never);
    mockGenerateJSON.mockResolvedValue(mockTriageResult);
    mockMessageUpdate.mockResolvedValue({} as never);

    const result = await processAITriageJob(jobData);

    expect(result.success).toBe(true);
    expect(result.message).toContain('msg-123');
    expect(result.data).toEqual(
      expect.objectContaining({
        urgency: 9,
        intent: 'request',
        category: 'support',
      })
    );
  });

  it('should handle missing message gracefully', async () => {
    mockMessageFindUnique.mockResolvedValue(null);

    const result = await processAITriageJob(jobData);

    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
    expect(mockGenerateJSON).not.toHaveBeenCalled();
  });

  it('should handle AI API failure gracefully', async () => {
    mockMessageFindUnique.mockResolvedValue(mockMessage as never);
    mockGenerateJSON.mockRejectedValue(new Error('AI API error'));

    await expect(processAITriageJob(jobData)).rejects.toThrow('AI API error');
  });
});
