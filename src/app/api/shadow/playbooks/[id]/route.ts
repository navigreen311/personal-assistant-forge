import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import type { UserRole } from '@/lib/auth/types';

import { callPlaybookService } from '@/modules/shadow/compliance/call-playbook';

// P-34. `withEntityScope` performs the authentication `withRole` used to, so
// the role gate is kept explicitly inside the handler and still runs before any
// playbook is read.
const WRITE_ROLES: UserRole[] = ['owner', 'admin', 'member'];
const DELETE_ROLES: UserRole[] = ['owner', 'admin'];

// ============================================================================
// P-16 -- THE REQUEST SCHEMA DESCRIBED A TABLE THAT DOES NOT EXIST
// ============================================================================
//
// `CreatePlaybookSchema` and `UpdatePlaybookSchema` declared `description`,
// `type`, `steps`, `isActive` and `tags`. `VoiceforgeCallPlaybook` has none of
// those columns, and `CallPlaybookService` -- which P-34 rewrote against the
// real table, saying so in its header -- reads `scenario`, `openingScript`,
// `dataAllowed`, `neverDisclose`, `escalationTriggers`, `escalationAction`,
// `maxDuration` and `outcomeFields`.
//
// Zod strips unknown keys. So every compliance field a caller sent was
// DISCARDED BY THE VALIDATOR before the service saw it, and the service, given
// an object with none of its fields present, wrote column defaults and returned
// 200. `PUT` was the worse half: sending a corrected `neverDisclose` -- the list
// of things Shadow must never say out loud on a call -- changed nothing and
// reported success. That is the codebase's third failure mode exactly: code
// that runs and reports success for work it did not do.
//
// `POST` was usually not even that lucky. `scenario` was not in the schema, so
// it was stripped; the service falls back to `description`, which defaulted to
// `''`; `if (!scenario) throw` then made every request with no `description` a
// 500. The route could not create a usable playbook at all.
//
// The schema below is the table. `description` survives as an accepted alias
// for `scenario` because the old shape is what any existing caller sends.

const UpdatePlaybookSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  scenario: z.string().min(1).max(100).optional(),
  /** Legacy alias for `scenario`. */
  description: z.string().min(1).optional(),
  openingScript: z.string().optional(),
  dataAllowed: z.array(z.string()).optional(),
  neverDisclose: z.array(z.string()).optional(),
  escalationTriggers: z.array(z.string()).optional(),
  escalationAction: z
    .enum(['transfer_to_human', 'end_call_politely', 'schedule_callback'])
    .optional(),
  maxDuration: z.number().int().min(30).max(3600).optional(),
  outcomeFields: z.array(z.string()).optional(),
});

/**
 * GET /api/shadow/playbooks/[id]
 * Read one playbook.
 *
 * P-16. `getPlaybook` existed on the service, entity-scoped by P-34, and no
 * route exported GET for it -- so the only way to read a single playbook was to
 * list them all and filter client-side, and there was no way to confirm that a
 * PUT had actually changed anything. Which is part of how the PUT above went
 * unnoticed.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withEntityScope(request, async (_req, _session, entityId) => {
    try {
      const { id } = await params;
      const playbook = await callPlaybookService.getPlaybook(id, entityId);
      return success(playbook);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read playbook';
      if (message.includes('not found')) {
        return error('NOT_FOUND', message, 404);
      }
      return error('PLAYBOOK_READ_FAILED', message, 500);
    }
  });
}

/**
 * PUT /api/shadow/playbooks/[id]
 * Update a playbook.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // P-34. `updatePlaybook(id, data)` was unscoped: one of the five route/method
  // pairs P-20's fuzz recorded as reaching another tenant's rows, and a WRITE.
  // A playbook's `neverDisclose` list is what Shadow may not say out loud on a
  // call, so editing another tenant's is editing their disclosure policy.
  return withEntityScope(request, async (req, session, entityId) => {
    if (!WRITE_ROLES.includes(session.role)) {
      return error('FORBIDDEN', 'Insufficient permissions', 403);
    }

    try {
      const { id } = await params;
      const body = await req.json();
      const parsed = UpdatePlaybookSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const playbook = await callPlaybookService.updatePlaybook(id, parsed.data, entityId);
      return success(playbook);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update playbook';
      if (message.includes('not found')) {
        return error('NOT_FOUND', message, 404);
      }
      return error('PLAYBOOK_UPDATE_FAILED', message, 500);
    }
  });
}

/**
 * DELETE /api/shadow/playbooks/[id]
 * Delete a playbook.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withEntityScope(request, async (_req, session, entityId) => {
    if (!DELETE_ROLES.includes(session.role)) {
      return error('FORBIDDEN', 'Insufficient permissions', 403);
    }

    try {
      const { id } = await params;
      await callPlaybookService.deletePlaybook(id, entityId);
      return success({ deleted: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete playbook';
      if (message.includes('not found')) {
        return error('NOT_FOUND', message, 404);
      }
      return error('PLAYBOOK_DELETE_FAILED', message, 500);
    }
  });
}
