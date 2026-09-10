import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { recorder } from '@/lib/observability';
import { readWorkerHealth } from '@/lib/observability/worker-health';

/**
 * P-28 (T-013/T-025) — what this route gained, and what it deliberately did not.
 *
 * ============================================================================
 * ADDED: WORKER LIVENESS
 * ============================================================================
 *
 * Until now the only question this route could answer was "can this web process
 * reach Postgres?". The gap that mattered more: nothing anywhere could answer
 * "is anything consuming the queues?". A worker container that OOMs looks
 * identical from the web tier to one running perfectly, because
 * `POST /api/workflows/[id]/trigger` enqueues and returns 200 either way — the
 * exact failure P-11 found had been permanent since the repository was written.
 *
 * ============================================================================
 * ADDED: ERROR COUNTS, WITHOUT ERROR DETAIL
 * ============================================================================
 *
 * `src/middleware.ts` exempts `/api/health` from authentication, so this
 * response is world-readable. `errors` below therefore carries COUNTS ONLY —
 * how many of each kind of failure this process has seen in the last fifteen
 * minutes. No messages, no fingerprints, no stack traces, no model names: a
 * fingerprint like `prisma:attentionEvent.findMany:P2021` tells an anonymous
 * caller what tables exist and which are broken. All of that is available, one
 * click away, from `GET /api/admin/observability`, which requires an owner or
 * admin session.
 *
 * A count alone is enough for the thing an unauthenticated caller should be
 * able to do, which is alert. `prisma_query_error` going from 0 to 400 an hour
 * after a deploy is the entire signal; the detail is for whoever responds.
 *
 * ============================================================================
 * NOT CHANGED: THE HTTP STATUS CODE
 * ============================================================================
 *
 * A dead worker does NOT make this route return 503, and neither does a raised
 * error rate. This endpoint is what a load balancer and an orchestrator poll to
 * decide whether to send this process traffic, and both of those failures are
 * platform-wide: every replica would report them simultaneously, every replica
 * would be pulled out of rotation at once, and a degraded background tier would
 * become a total outage of the foreground one. The status code stays a
 * statement about THIS PROCESS's ability to serve a request, which is what the
 * database check already measured.
 *
 * The body says everything else, and the body is what an alert should read.
 */

interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: {
      status: 'ok' | 'error';
      latencyMs?: number;
      error?: string;
    };
    /**
     * 'unknown' means no worker has ever registered with this Redis — a
     * developer machine, or a deployment with no worker tier. Nothing is being
     * claimed, and it is not counted as a degradation. See worker-health.ts.
     */
    workers: {
      status: 'ok' | 'degraded' | 'unknown';
      expected: number;
      up: number;
      /** Queue names, which are static strings in this repository, not data. */
      down: string[];
      error: string | null;
    };
  };
  /** Counts only. See the header. */
  errors: {
    windowMinutes: number;
    last15Minutes: Record<string, number>;
    total: number;
    observedSince: string;
  };
}

const ERROR_WINDOW_MINUTES = 15;

export async function GET(): Promise<NextResponse<HealthStatus>> {
  let dbStatus: HealthStatus['checks']['database'] = { status: 'ok' };

  // Check database connectivity
  if (process.env.DATABASE_URL) {
    try {
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = {
        status: 'ok',
        latencyMs: Date.now() - dbStart,
      };
    } catch (error) {
      // Not reported by hand here: `$queryRaw` runs through the observability
      // extension on the client, so this failure is already counted as
      // `prisma:queryRaw`. Reporting it again would double every outage.
      dbStatus = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown database error',
      };
    }
  } else {
    dbStatus = {
      status: 'error',
      error: 'DATABASE_URL not configured',
    };
  }

  const workerHealth = await readWorkerHealth();

  const snapshot = recorder.snapshot();
  const overallStatus = dbStatus.status === 'ok' ? 'ok' : 'degraded';

  const health: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
    uptime: process.uptime(),
    checks: {
      database: dbStatus,
      workers: {
        status: workerHealth.status,
        expected: workerHealth.workers.length,
        up: workerHealth.workers.filter((w) => w.state === 'up').length,
        down: workerHealth.down,
        error: workerHealth.error,
      },
    },
    errors: {
      windowMinutes: ERROR_WINDOW_MINUTES,
      last15Minutes: snapshot.rates.last15Minutes,
      total: recorder.totalOver(ERROR_WINDOW_MINUTES),
      observedSince: snapshot.processStartedAt,
    },
  };

  return NextResponse.json(health, {
    status: overallStatus === 'ok' ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

// Disable static optimization for this route
export const dynamic = 'force-dynamic';
