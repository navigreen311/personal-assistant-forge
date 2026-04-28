/**
 * /api/shadow/vaf-config — VAF integration config endpoint.
 *
 * GET   → returns the current user's VAF config (or defaults if none yet).
 * PATCH → updates a subset of fields. Unknown / wrong-typed fields are
 *         silently dropped by the helper layer.
 *
 * Service-status (health) information is NOT served from this endpoint;
 * it lives at /api/shadow/health-style or is fetched directly by the
 * Advanced Voice Settings client component, since it concerns the VAF
 * service rather than the user's config.
 */

import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { getVafConfig, updateVafConfig } from '@/lib/shadow/vaf-config';
import type { AuthSession } from '@/lib/auth/types';

async function handleGet(_req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const config = await getVafConfig(session.userId);
    return success(config);
  } catch (err) {
    console.error('[shadow/vaf-config] GET error:', err);
    return error('INTERNAL_ERROR', 'Failed to load VAF config', 500);
  }
}

async function handlePatch(req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return error('BAD_REQUEST', 'Invalid JSON body', 400);
    }

    const config = await updateVafConfig(session.userId, body);
    return success(config);
  } catch (err) {
    console.error('[shadow/vaf-config] PATCH error:', err);
    return error('INTERNAL_ERROR', 'Failed to update VAF config', 500);
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  return withAuth(req, handleGet);
}

export async function PATCH(req: NextRequest): Promise<Response> {
  return withAuth(req, handlePatch);
}
