import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRole } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { JobType } from '@/lib/queue/jobs';
import { enqueueJob, getJobQueue } from '@/lib/queue/jobs/registry';

const jobTypeValues = Object.values(JobType) as [string, ...string[]];

const enqueueSchema = z.object({
  type: z.enum(jobTypeValues),
  data: z.record(z.string(), z.unknown()),
  delay: z.number().int().positive().optional(),
});

export async function GET(req: NextRequest) {
  return withRole(req, ['admin'], async (req) => {
    try {
      const { searchParams } = new URL(req.url);
      const status = searchParams.get('status') ?? 'completed';
      const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);
      const offset = parseInt(searchParams.get('offset') ?? '0', 10);

      const queue = getJobQueue();

      let jobs;
      switch (status) {
        case 'waiting':
          jobs = await queue.getJobs(['waiting'], offset, offset + limit - 1);
          break;
        case 'active':
          jobs = await queue.getJobs(['active'], offset, offset + limit - 1);
          break;
        case 'failed':
          jobs = await queue.getJobs(['failed'], offset, offset + limit - 1);
          break;
        case 'completed':
        default:
          jobs = await queue.getJobs(['completed'], offset, offset + limit - 1);
          break;
      }

      const jobList = jobs.map((job) => ({
        id: job.id,
        type: job.name,
        status,
        data: job.data,
        createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
        processedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
        finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
        attemptsMade: job.attemptsMade,
      }));

      return success({ jobs: jobList, total: jobList.length, status, limit, offset });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[JobsAPI] GET failed:', message);
      return error('INTERNAL_ERROR', 'Failed to fetch jobs', 500);
    }
  });
}

export async function POST(req: NextRequest) {
  return withRole(req, ['admin'], async (req) => {
    try {
      const body = await req.json();
      const parsed = enqueueSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid job payload', 400, {
          issues: parsed.error.issues,
        });
      }

      const { type, data, delay } = parsed.data;
      const jobId = await enqueueJob(
        type as JobType,
        data as Parameters<typeof enqueueJob>[1],
        delay ? { delay } : undefined
      );

      return success({ jobId, type, status: 'queued' }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[JobsAPI] POST failed:', message);
      return error('INTERNAL_ERROR', 'Failed to enqueue job', 500);
    }
  });
}
