import { sendEmail } from '@/lib/integrations/email/client';
import { prisma } from '@/lib/db';
import type { JobDataMap, JobResult } from '../jobs';
import { JobType } from '../jobs';

export async function processEmailJob(
  data: JobDataMap[typeof JobType.EMAIL_SEND]
): Promise<JobResult> {
  const start = Date.now();

  try {
    const sent = await sendEmail({
      to: data.to,
      subject: data.subject,
      html: data.body,
      replyTo: data.replyToMessageId,
    });

    await prisma.actionLog.create({
      data: {
        actor: 'SYSTEM',
        actionType: 'EMAIL_SEND',
        target: `entity:${data.entityId}/email:${data.to}`,
        reason: `Sent email: ${data.subject}`,
        blastRadius: 'LOW',
        reversible: false,
        status: sent ? 'EXECUTED' : 'FAILED',
      },
    });

    if (!sent) {
      throw new Error('Email client returned failure');
    }

    return {
      success: true,
      message: `Email sent to ${data.to}`,
      data: { to: data.to, subject: data.subject },
      processingTimeMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[EmailProcessor] Failed to send email:', message);
    throw err;
  }
}
