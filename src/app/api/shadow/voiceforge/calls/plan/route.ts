// ============================================================================
// POST /api/shadow/voiceforge/calls/plan
// ============================================================================
//
// P-16, deliverables 8 and 9. The entry point for the call playbook engine:
// given a contact and a scenario, either the plan Shadow will follow on the
// call -- opening script, what it may disclose, what it must never disclose,
// when to hand off to a human, the consent script for the jurisdiction -- or
// the reason the call must not be placed.
//
// `withEntityScope` rather than `withAuth`: the whole of what this returns is
// entity-owned (a playbook belongs to an entity, a contact belongs to an
// entity, disclosure policy is per entity), and `CallPlannerService` takes the
// branded `VerifiedEntityId` so it cannot be called from a route that has not
// proved ownership.
//
// `record: true` spends one unit of the contact's weekly calling budget. It is
// a separate flag, not implied by a successful plan, because previewing a
// script must not use up the budget -- and because only the code that actually
// dials knows that a call happened. See call-planner.ts.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import type { UserRole } from '@/lib/auth/types';
import { callPlannerService } from '@/modules/shadow/compliance/call-planner';

const PLAN_ROLES: UserRole[] = ['owner', 'admin', 'member'];

const PlanCallSchema = z.object({
  contactId: z.string().min(1),
  scenario: z.string().min(1).max(100).optional(),
  playbookId: z.string().min(1).optional(),
  jurisdiction: z.string().min(1).max(50).optional(),
  timezone: z.string().min(1).max(64).optional(),
  /** Spend one unit of this contact's weekly call budget. */
  record: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, session, entityId) => {
    if (!PLAN_ROLES.includes(session.role)) {
      return error('FORBIDDEN', 'Insufficient permissions', 403);
    }

    try {
      const body = await req.json();
      const parsed = PlanCallSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const plan = await callPlannerService.planCall({
        entityId,
        contactId: parsed.data.contactId,
        scenario: parsed.data.scenario,
        playbookId: parsed.data.playbookId,
        jurisdiction: parsed.data.jurisdiction,
        timezone: parsed.data.timezone,
      });

      // Only an allowed plan spends budget. A refused call that still counted
      // against the weekly limit would make a contact on DNC unreachable
      // forever by the same mechanism that is meant to protect them.
      let recorded = false;
      if (plan.allowed && parsed.data.record) {
        recorded = await callPlannerService.recordAttempt(parsed.data.contactId, entityId);
      }

      return success({ ...plan, recorded });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to plan call';
      return error('CALL_PLAN_FAILED', message, 500);
    }
  });
}
