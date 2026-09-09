import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuditedAuth } from '@/modules/security/audit-wiring';
import { getCrisisForUser, updateCrisis } from '@/modules/crisis/services/detection-service';

// P-10/T-001. All three handlers called `getCrisisById(id)` and acted on
// whatever came back, with the session discarded as `_session`. Any
// authenticated caller who knew an id could read, edit or archive any user's
// crisis. `getCrisisForUser` returns undefined for a crisis that is not the
// caller's, so a foreign record is a 404 and there is no check to forget.
//
// The scope is the OWNING USER, not an entity: `withEntityScope` resolves from
// query/body/session, none of which describe "the entity this crisis belongs
// to", and falling through to the session's active entity would answer about a
// record the caller never asked for. See tenancy-pattern.md §4.

const updateCrisisSchema = z.object({
  status: z.enum(['DETECTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'MITIGATED', 'RESOLVED', 'POST_MORTEM']).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});

const AUDIT = { resource: 'crisis', sensitivityLevel: 'CONFIDENTIAL' as const };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuditedAuth(request, AUDIT, async (_req, session) => {
    try {
      const { id } = await params;
      const crisis = getCrisisForUser(id, session.userId);
      if (!crisis) return error('NOT_FOUND', 'Crisis not found', 404);
      return success(crisis);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuditedAuth(request, AUDIT, async (req, session) => {
    try {
      const { id } = await params;
      const crisis = getCrisisForUser(id, session.userId);
      if (!crisis) return error('NOT_FOUND', 'Crisis not found', 404);

      const body = await req.json();
      const parsed = updateCrisisSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      const updates = parsed.data;
      if (updates.status !== undefined) crisis.status = updates.status;
      if (updates.severity !== undefined) crisis.severity = updates.severity;
      if (updates.title !== undefined) crisis.title = updates.title;
      if (updates.description !== undefined) crisis.description = updates.description;

      if (updates.status === 'ACKNOWLEDGED' && !crisis.acknowledgedAt) {
        crisis.acknowledgedAt = new Date();
      }
      if (updates.status === 'RESOLVED' && !crisis.resolvedAt) {
        crisis.resolvedAt = new Date();
      }

      updateCrisis(crisis);
      return success(crisis);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuditedAuth(request, AUDIT, async (_req, session) => {
    try {
      const { id } = await params;
      const crisis = getCrisisForUser(id, session.userId);
      if (!crisis) return error('NOT_FOUND', 'Crisis not found', 404);

      crisis.status = 'RESOLVED';
      crisis.resolvedAt = crisis.resolvedAt ?? new Date();
      updateCrisis(crisis);

      return success({ id, archived: true });
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
