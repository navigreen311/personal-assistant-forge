import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import type { UserRole } from '@/lib/auth/types';
import { callPlaybookService } from '@/modules/shadow/compliance/call-playbook';

const CREATE_ROLES: UserRole[] = ['owner', 'admin', 'member'];

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

const CreatePlaybookSchema = z
  .object({
    // Still accepted, still validated, and no longer load-bearing: P-34 takes
    // the entity from `withEntityScope`, which has proved it against the
    // session.
    entityId: z.string().min(1).optional(),
    name: z.string().min(1).max(255),
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
  })
  .refine((data) => Boolean(data.scenario ?? data.description), {
    message: 'scenario is required',
    path: ['scenario'],
  });

/**
 * GET /api/shadow/playbooks?entityId=xxx
 * List all playbooks for an entity.
 */
export async function GET(request: NextRequest) {
  // P-34. Was `withAuth` + `?entityId=` -> `listPlaybooks(entityId)`: one of the
  // five route/method pairs P-20's fuzz recorded as answering tenant A with
  // tenant B's rows. `withEntityScope` resolves the same candidate in the same
  // order and then applies Decision 1 to it.
  return withEntityScope(request, async (_req, _session, entityId) => {
    try {
      const playbooks = await callPlaybookService.listPlaybooks(entityId);
      return success(playbooks);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list playbooks';
      return error('PLAYBOOK_LIST_FAILED', message, 500);
    }
  });
}

/**
 * POST /api/shadow/playbooks
 * Create a new playbook.
 */
export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, session, entityId) => {
    if (!CREATE_ROLES.includes(session.role)) {
      return error('FORBIDDEN', 'Insufficient permissions', 403);
    }

    try {
      const body = await req.json();
      const parsed = CreatePlaybookSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const playbook = await callPlaybookService.createPlaybook(parsed.data, entityId);
      return success(playbook, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create playbook';
      return error('PLAYBOOK_CREATE_FAILED', message, 500);
    }
  });
}
