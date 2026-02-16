import { prisma } from '@/lib/db';
import type { JobDataMap, JobResult } from '../jobs';
import { JobType } from '../jobs';

export async function processNotificationJob(
  data: JobDataMap[typeof JobType.NOTIFICATION_PUSH]
): Promise<JobResult> {
  const start = Date.now();

  try {
    let resultData: Record<string, unknown> = {};

    switch (data.channel) {
      case 'WEB_PUSH': {
        console.log(
          `[NotificationProcessor] Web push to user ${data.userId}: ${data.title}`
        );
        resultData = { channel: 'WEB_PUSH', delivered: true };
        break;
      }
      case 'EMAIL': {
        const { enqueueJob } = await import('../jobs/registry');
        const jobId = await enqueueJob(JobType.EMAIL_SEND, {
          to: data.userId,
          subject: data.title,
          body: data.body,
          entityId: '',
        });
        resultData = { channel: 'EMAIL', emailJobId: jobId };
        break;
      }
      case 'IN_APP': {
        await prisma.notification.create({
          data: {
            userId: data.userId,
            title: data.title,
            body: data.body,
            data: data.data ?? {},
          },
        });
        resultData = { channel: 'IN_APP', stored: true };
        break;
      }
    }

    await prisma.actionLog.create({
      data: {
        actor: 'SYSTEM',
        actionType: 'NOTIFICATION_PUSH',
        target: `user:${data.userId}/channel:${data.channel}`,
        reason: `Notification: ${data.title}`,
        blastRadius: 'LOW',
        reversible: false,
        status: 'EXECUTED',
      },
    });

    return {
      success: true,
      message: `Notification sent via ${data.channel} to ${data.userId}`,
      data: resultData,
      processingTimeMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[NotificationProcessor] Failed:', message);
    throw err;
  }
}
