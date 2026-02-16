import { generateJSON } from '@/lib/ai';
import { prisma } from '@/lib/db';
import type { JobDataMap, JobResult } from '../jobs';
import { JobType } from '../jobs';

interface TriageResult {
  urgency: number;
  intent: string;
  category: string;
  flags: string[];
}

export async function processAITriageJob(
  data: JobDataMap[typeof JobType.AI_TRIAGE]
): Promise<JobResult> {
  const start = Date.now();

  const message = await prisma.message.findUnique({
    where: { id: data.messageId },
  });

  if (!message) {
    return {
      success: false,
      message: `Message ${data.messageId} not found`,
      processingTimeMs: Date.now() - start,
    };
  }

  try {
    const prompt = `Analyze the following message and provide a triage assessment.

Subject: ${message.subject ?? 'N/A'}
From: ${message.senderId ?? 'Unknown'}
Body: ${message.body ?? ''}
Thread ID: ${message.threadId ?? 'N/A'}

Respond with a JSON object containing:
- urgency: number from 1-10 (10 = most urgent)
- intent: string describing the sender's intent (e.g. "request", "complaint", "inquiry", "follow-up")
- category: string category (e.g. "support", "billing", "feedback", "spam")
- flags: array of string flags for notable aspects (e.g. ["time-sensitive", "escalation-needed"])`;

    const triageResult = await generateJSON<TriageResult>(prompt, {
      maxTokens: 512,
      temperature: 0.3,
    });

    await prisma.message.update({
      where: { id: data.messageId },
      data: {
        triageScore: triageResult.urgency,
        intent: triageResult.intent,
      },
    });

    return {
      success: true,
      message: `Triaged message ${data.messageId}`,
      data: triageResult as unknown as Record<string, unknown>,
      processingTimeMs: Date.now() - start,
    };
  } catch (err) {
    const message_str = err instanceof Error ? err.message : 'Unknown error';
    console.error('[AITriageProcessor] Failed to triage message:', message_str);
    throw err;
  }
}
