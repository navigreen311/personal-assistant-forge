import { sendSMS } from '@/lib/integrations/sms/client';
import { prisma } from '@/lib/db';
import type { JobDataMap, JobResult } from '../jobs';
import { JobType } from '../jobs';

export async function processSmsJob(
  data: JobDataMap[typeof JobType.SMS_SEND]
): Promise<JobResult> {
  const start = Date.now();

  try {
    const sid = await sendSMS({
      to: data.to,
      body: data.body,
    });

    await prisma.actionLog.create({
      data: {
        actor: 'SYSTEM',
        actionType: 'SMS_SEND',
        target: `entity:${data.entityId}/sms:${data.to}`,
        reason: `Sent SMS to ${data.to}`,
        blastRadius: 'LOW',
        reversible: false,
        status: sid ? 'EXECUTED' : 'FAILED',
      },
    });

    if (!sid) {
      throw new Error('SMS client returned failure');
    }

    return {
      success: true,
      message: `SMS sent to ${data.to}`,
      data: { to: data.to, sid },
      processingTimeMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[SMSProcessor] Failed to send SMS:', message);
    throw err;
  }
}
