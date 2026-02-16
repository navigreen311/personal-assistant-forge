import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

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
  };
}

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

  const overallStatus = dbStatus.status === 'ok' ? 'ok' : 'degraded';

  const health: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
    uptime: process.uptime(),
    checks: {
      database: dbStatus,
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
