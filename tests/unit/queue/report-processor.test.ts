import { processReportJob } from '@/lib/queue/processors/report-processor';

jest.mock('@/lib/ai', () => ({
  generateText: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    message: { count: jest.fn(), findMany: jest.fn() },
    task: { findMany: jest.fn() },
    invoice: { findMany: jest.fn() },
    document: { create: jest.fn() },
  },
}));

import { generateText } from '@/lib/ai';
import { prisma } from '@/lib/db';

const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>;
const mockDocumentCreate = prisma.document.create as jest.MockedFunction<
  typeof prisma.document.create
>;
const mockMessageCount = prisma.message.count as jest.MockedFunction<
  typeof prisma.message.count
>;
const mockMessageFindMany = prisma.message.findMany as jest.MockedFunction<
  typeof prisma.message.findMany
>;
const mockTaskFindMany = prisma.task.findMany as jest.MockedFunction<
  typeof prisma.task.findMany
>;
const mockInvoiceFindMany = prisma.invoice.findMany as jest.MockedFunction<
  typeof prisma.invoice.findMany
>;

describe('processReportJob', () => {
  const baseJobData = {
    entityId: 'entity-123',
    dateRange: { from: '2024-01-01', to: '2024-01-07' },
    format: 'PDF' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateText.mockResolvedValue('Generated report content');
    mockDocumentCreate.mockResolvedValue({ id: 'doc-1' } as never);
  });

  it('should query relevant data based on reportType', async () => {
    mockMessageCount.mockResolvedValue(10 as never);
    mockTaskFindMany.mockResolvedValue([] as never);

    await processReportJob({ ...baseJobData, reportType: 'WEEKLY_SUMMARY' });

    expect(mockMessageCount).toHaveBeenCalled();
    expect(mockTaskFindMany).toHaveBeenCalled();
  });

  it('should call generateText with a prompt including the data', async () => {
    mockMessageCount.mockResolvedValue(5 as never);
    mockTaskFindMany.mockResolvedValue([
      { title: 'Task 1', status: 'DONE', priority: 'HIGH' },
    ] as never);

    await processReportJob({ ...baseJobData, reportType: 'WEEKLY_SUMMARY' });

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.stringContaining('weekly summary'),
      expect.objectContaining({ maxTokens: 2048, temperature: 0.5 })
    );
  });

  it('should store generated report as a document in Prisma', async () => {
    mockMessageCount.mockResolvedValue(0 as never);
    mockTaskFindMany.mockResolvedValue([] as never);

    await processReportJob({ ...baseJobData, reportType: 'WEEKLY_SUMMARY' });

    expect(mockDocumentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'WEEKLY_SUMMARY Report',
        content: 'Generated report content',
        type: 'WEEKLY_SUMMARY',
        entityId: 'entity-123',
      }),
    });
  });

  it('should return success with document ID', async () => {
    mockMessageCount.mockResolvedValue(0 as never);
    mockTaskFindMany.mockResolvedValue([] as never);

    const result = await processReportJob({ ...baseJobData, reportType: 'WEEKLY_SUMMARY' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({ documentId: 'doc-1', reportType: 'WEEKLY_SUMMARY' })
    );
  });

  it('should handle different report types (WEEKLY_SUMMARY, FINANCIAL, etc.)', async () => {
    // Test FINANCIAL report
    mockInvoiceFindMany.mockResolvedValue([{ amount: 100, status: 'PAID' }] as never);

    await processReportJob({ ...baseJobData, reportType: 'FINANCIAL' });

    expect(mockInvoiceFindMany).toHaveBeenCalled();
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.stringContaining('financial'),
      expect.any(Object)
    );

    jest.clearAllMocks();
    mockGenerateText.mockResolvedValue('Digest content');
    mockDocumentCreate.mockResolvedValue({ id: 'doc-2' } as never);

    // Test INBOX_DIGEST report
    mockMessageFindMany.mockResolvedValue([
      { subject: 'Test', from: 'a@b.com', body: 'Hi', createdAt: new Date() },
    ] as never);

    await processReportJob({ ...baseJobData, reportType: 'INBOX_DIGEST' });

    expect(mockMessageFindMany).toHaveBeenCalled();
  });
});
