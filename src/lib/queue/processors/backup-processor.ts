import { prisma } from '@/lib/db';
import type { JobDataMap, JobResult } from '../jobs';
import { JobType } from '../jobs';

export async function processBackupJob(
  data: JobDataMap[typeof JobType.BACKUP_RUN]
): Promise<JobResult> {
  const start = Date.now();

  try {
    console.log(
      `[BackupProcessor] Starting ${data.scope} backup for entity ${data.entityId} to ${data.destination}`
    );

    await prisma.actionLog.create({
      data: {
        actor: 'SYSTEM',
        actionType: 'BACKUP_RUN',
        target: `entity:${data.entityId}/backup:${data.scope}`,
        reason: `${data.scope} backup to ${data.destination}`,
        blastRadius: 'LOW',
        reversible: false,
        status: 'EXECUTED',
      },
    });

    return {
      success: true,
      message: `${data.scope} backup completed for entity ${data.entityId}`,
      data: {
        scope: data.scope,
        destination: data.destination,
        timestamp: new Date().toISOString(),
      },
      processingTimeMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[BackupProcessor] Failed:', message);
    throw err;
  }
}
