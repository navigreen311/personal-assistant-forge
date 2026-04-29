/**
 * /api/shadow/compliance/status — read-only compliance status for the
 * active entity. Used by AdvancedVoiceSettings to render a "HIPAA mode
 * active" badge without exposing entity internals.
 *
 * GET → { entityId, complianceModes: ['HIPAA' | 'PCI' | 'GDPR'] }
 *
 * Always 200 even when no entity is active — empty list = "no special
 * compliance flagged". The endpoint never reveals data beyond the
 * derived mode list.
 */

import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { deriveEntityCompliance } from '@/lib/shadow/compliance/entity-compliance';
import type { AuthSession } from '@/lib/auth/types';

async function handleGet(_req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const entityId = session.activeEntityId ?? null;
    const complianceModes = entityId ? await deriveEntityCompliance(entityId) : [];
    return success({ entityId, complianceModes });
  } catch (err) {
    console.error('[shadow/compliance/status] GET error:', err);
    return error('INTERNAL_ERROR', 'Failed to load compliance status', 500);
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  return withAuth(req, handleGet);
}
