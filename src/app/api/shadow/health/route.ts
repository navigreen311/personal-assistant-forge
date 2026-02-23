import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Track process start for uptime
const processStartTime = Date.now();

interface ServiceHealth {
  status: 'ok' | 'degraded' | 'down';
  latencyMs?: number;
  error?: string;
}

/**
 * GET /api/shadow/health
 * Public health check endpoint (no auth required).
 * Returns status of all dependent services.
 */
export async function GET(_request: NextRequest) {
  const services: Record<string, ServiceHealth> = {};
  let overallStatus: 'ok' | 'degraded' | 'down' = 'ok';

  // --- Database check ---
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1 as health`;
    services.db = { status: 'ok', latencyMs: Date.now() - dbStart };
  } catch (err) {
    services.db = {
      status: 'down',
      error: err instanceof Error ? err.message : 'Database unreachable',
    };
    overallStatus = 'down';
  }

  // --- Redis check (best-effort) ---
  try {
    const redisStart = Date.now();
    // Attempt a lightweight Redis ping via dynamic import
    const { default: Redis } = await import('ioredis');
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      const redis = new Redis(redisUrl, { lazyConnect: true, connectTimeout: 3000 });
      await redis.ping();
      await redis.quit();
      services.redis = { status: 'ok', latencyMs: Date.now() - redisStart };
    } else {
      services.redis = { status: 'degraded', error: 'REDIS_URL not configured' };
      if (overallStatus === 'ok') overallStatus = 'degraded';
    }
  } catch (err) {
    services.redis = {
      status: 'degraded',
      error: err instanceof Error ? err.message : 'Redis unreachable',
    };
    if (overallStatus === 'ok') overallStatus = 'degraded';
  }

  // --- STT service check (config-based) ---
  if (process.env.DEEPGRAM_API_KEY || process.env.STT_API_KEY) {
    services.stt = { status: 'ok' };
  } else {
    services.stt = { status: 'degraded', error: 'STT API key not configured' };
    if (overallStatus === 'ok') overallStatus = 'degraded';
  }

  // --- TTS service check (config-based) ---
  if (process.env.ELEVENLABS_API_KEY || process.env.TTS_API_KEY) {
    services.tts = { status: 'ok' };
  } else {
    services.tts = { status: 'degraded', error: 'TTS API key not configured' };
    if (overallStatus === 'ok') overallStatus = 'degraded';
  }

  // --- LLM service check (config-based) ---
  if (process.env.ANTHROPIC_API_KEY) {
    services.llm = { status: 'ok' };
  } else {
    services.llm = { status: 'degraded', error: 'ANTHROPIC_API_KEY not configured' };
    if (overallStatus === 'ok') overallStatus = 'degraded';
  }

  const uptimeSeconds = Math.round((Date.now() - processStartTime) / 1000);

  return NextResponse.json({
    status: overallStatus,
    services,
    uptime: uptimeSeconds,
    version: process.env.APP_VERSION ?? '0.1.0',
    timestamp: new Date().toISOString(),
  });
}
