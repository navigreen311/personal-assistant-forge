import { NextRequest } from 'next/server';
import { withRole } from '@/shared/middleware/auth';

import { success, error } from '@/shared/utils/api-response';
import type { AuthSession } from '@/lib/auth/types';
import { withRateLimit } from '@/shared/middleware/rate-limit';

// --- Types ---

interface ExportResponse {
  exportId: string;
  format: 'json' | 'csv';
  status: 'queued';
  message: string;
  estimatedCompletionMinutes: number;
}

// --- Handlers ---

async function handlePost(req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const body = await req.json();
    const format = body.format === 'csv' ? 'csv' : 'json';

    // Generate a mock export ID
    const exportId = `exp_${Date.now()}_${session.userId.slice(0, 8)}`;

    const data: ExportResponse = {
      exportId,
      format,
      status: 'queued',
      message: `Data export (${format.toUpperCase()}) has been queued. You will receive a download link via email at ${session.email}.`,
      estimatedCompletionMinutes: 5,
    };

    return success(data, 202);
  } catch (err) {
    console.error('[settings/export] POST error:', err);
    return error('INTERNAL_ERROR', 'Failed to initiate data export', 500);
  }
}

// --- Route Exports ---

async function handlePOST(req: NextRequest): Promise<Response> {
  return withRole(req, ['owner', 'admin'], handlePost);
}

// ---------------------------------------------------------------------------
// P-18 / T-012 — rate limit: tier "bulk".
//
// The limiter sits OUTSIDE the auth wrappers, so a refused request never reaches
// the handler, the entity-ownership query, or the work itself. (On a user-keyed
// tier the limiter does decrypt the session token -- that is what makes the
// bucket unspoofable -- but nothing beyond that runs.) The tier, its budget and
// the reason for that budget live in RATE_LIMIT_POLICY in
// src/shared/middleware/rate-limit.ts; nothing about the limit is decided here,
// so no route can quietly hold a different number from the published table.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  return withRateLimit(request, 'bulk', handlePOST);
}
