import { generateText } from '@/lib/ai';
import { prisma } from '@/lib/db';
import type { JobDataMap, JobResult } from '../jobs';
import { JobType } from '../jobs';

const REPORT_PROMPTS: Record<string, string> = {
  WEEKLY_SUMMARY:
    'Generate a weekly summary report from the following data. Include key metrics, highlights, and recommendations.',
  FINANCIAL:
    'Generate a financial report from the following data. Include income, expenses, balance, and trends.',
  PRODUCTIVITY:
    'Generate a productivity report from the following data. Include task completion rates, response times, and efficiency metrics.',
  INBOX_DIGEST:
    'Generate an inbox digest from the following messages. Summarize key threads, action items, and priority items.',
};

async function queryReportData(
  reportType: string,
  entityId: string,
  dateRange: { from: string; to: string }
): Promise<string> {
  const where = {
    entityId,
    createdAt: {
      gte: new Date(dateRange.from),
      lte: new Date(dateRange.to),
    },
  };

  switch (reportType) {
    case 'WEEKLY_SUMMARY':
    case 'PRODUCTIVITY': {
      const [messages, tasks] = await Promise.all([
        prisma.message.count({ where }),
        prisma.task.findMany({
          where,
          select: { title: true, status: true, priority: true },
          take: 100,
        }),
      ]);
      return JSON.stringify({ messageCount: messages, tasks });
    }
    case 'FINANCIAL': {
      const invoices = await prisma.financialRecord.findMany({
        where,
        select: { amount: true, status: true, dueDate: true },
        take: 100,
      });
      return JSON.stringify({ invoices });
    }
    case 'INBOX_DIGEST': {
      const messages = await prisma.message.findMany({
        where,
        select: { subject: true, senderId: true, body: true, createdAt: true },
        take: 50,
        orderBy: { createdAt: 'desc' },
      });
      return JSON.stringify({ messages });
    }
    default:
      return '{}';
  }
}

export async function processReportJob(
  data: JobDataMap[typeof JobType.REPORT_GENERATE]
): Promise<JobResult> {
  const start = Date.now();

  try {
    const reportData = await queryReportData(
      data.reportType,
      data.entityId,
      data.dateRange
    );

    const basePrompt = REPORT_PROMPTS[data.reportType] ?? 'Generate a report from the following data.';
    const prompt = `${basePrompt}\n\nFormat: ${data.format}\nDate Range: ${data.dateRange.from} to ${data.dateRange.to}\n\nData:\n${reportData}`;

    const content = await generateText(prompt, {
      maxTokens: 2048,
      temperature: 0.5,
    });

    const document = await prisma.document.create({
      data: {
        title: `${data.reportType} Report`,
        content,
        type: data.reportType,
        entityId: data.entityId,
      },
    });

    return {
      success: true,
      message: `Report generated: ${data.reportType}`,
      data: { documentId: document.id, reportType: data.reportType },
      processingTimeMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ReportProcessor] Failed to generate report:', message);
    throw err;
  }
}
