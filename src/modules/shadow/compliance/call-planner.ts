// ============================================================================
// Shadow Voice Agent — the call playbook engine
// v3 spec, Addition 3.1 (playbooks) + 3.2 (consent) + 3.3 (DNC/quiet hours).
// ============================================================================
//
// P-16, deliverable 8, and the thing that makes deliverable 9 reachable.
//
// `call-playbook.ts` is CRUD: it stores what Shadow may say on a call and what
// it must never say. Nothing turned a stored playbook into a plan for one
// specific call to one specific contact, so `neverDisclose` was a list nobody
// consulted, `dncChecker` had no caller, and `recordingConsentService` had no
// caller either. The spec's call flow --
//
//   1. initiate  2. check jurisdiction  3. get consent  4. follow the playbook
//   5. extract outcomes  6. transcript  7. redact
//
// -- had steps 2, 3 and 4 implemented in three files and joined by none.
//
// This module is steps 2-4, and the order matters: DNC and quiet hours are
// checked BEFORE the playbook is even selected, because a call that must not be
// placed should not produce a script, and a caller holding a script is one
// refactor away from dialling it.
//
// ----------------------------------------------------------------------------
// WHAT IS DELIBERATELY NOT HERE
// ----------------------------------------------------------------------------
//
// Dialling. `PhoneOutboundHandler.callUser` posts to Twilio's REST API and
// needs a live account; it is one of the four `[E]` items this package was
// scoped to leave wired but unverified. `planCall` produces everything that
// call needs and stops. `recordAttempt` is separate for the same reason: the
// weekly budget should be spent when a call is actually placed, and only the
// code that places it knows that it was.

import { prisma } from '@/lib/db';
import type { VerifiedEntityId } from '@/shared/middleware/auth';

import { callPlaybookService, type Playbook } from './call-playbook';
import { dncChecker, type DNCCheckResult } from './dnc-checker';
import { recordingConsentService } from './recording-consent';

// --- Types ---

export interface PlanCallParams {
  entityId: VerifiedEntityId;
  contactId: string;
  /** `ap_collections`, `credential_chase`, `scheduling`, … */
  scenario?: string;
  /** Pin a specific playbook instead of resolving one from `scenario`. */
  playbookId?: string;
  /** Jurisdiction for the recording-consent rules, e.g. `NV`, `CA`, `GDPR`. */
  jurisdiction?: string;
  /** Timezone the contact's quiet hours are evaluated in. See dnc-checker. */
  timezone?: string;
  now?: Date;
}

export interface CallPlan {
  allowed: boolean;
  /** Present when `allowed` is false. */
  blockedReason?: string;
  /** What to do instead of calling, when the call is refused. */
  alternateChannel?: string;
  /** When the contact may be called again, when a limit or quiet hours applies. */
  nextAvailable?: string;
  contactId: string;
  contactName?: string;
  playbook?: {
    id: string;
    name: string;
    scenario: string;
    openingScript: string | null;
    dataAllowed: string[];
    neverDisclose: string[];
    escalationTriggers: string[];
    escalationAction: string | null;
    maxDuration: number;
    outcomeFields: string[];
  };
  consent?: {
    recordingAllowed: boolean;
    consentType: string;
    consentScript?: string;
    requiresExplicitConsent: boolean;
  };
  frequency: {
    callsThisWeek: number;
    maxCallsPerWeek: number;
  };
}

// --- Service ---

export class CallPlannerService {
  /**
   * Build the plan for one outbound call, or refuse it.
   *
   * Every branch returns a `CallPlan` rather than throwing: "you may not call
   * this contact for the next nine hours" is an answer, not an error, and a
   * caller that has to distinguish refusals by parsing an exception message is
   * a caller that will eventually stop distinguishing them.
   */
  async planCall(params: PlanCallParams): Promise<CallPlan> {
    const { entityId, contactId, jurisdiction, timezone } = params;
    const now = params.now ?? new Date();

    // --- Addition 3.3, first, because a refused call needs no script --------
    const dnc: DNCCheckResult = await dncChecker.canCall(contactId, entityId, {
      now,
      timezone,
    });

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, entityId, deletedAt: null },
      select: { id: true, name: true },
    });

    const frequency = {
      callsThisWeek: dnc.callsThisWeek,
      maxCallsPerWeek: dnc.maxCallsPerWeek,
    };

    if (!dnc.allowed) {
      return {
        allowed: false,
        blockedReason: dnc.reason,
        alternateChannel: dnc.preferredChannel,
        nextAvailable: dnc.nextAvailable?.toISOString(),
        contactId,
        contactName: contact?.name,
        frequency,
      };
    }

    // --- Addition 3.1: which playbook governs this call ---------------------
    const playbook = await this.resolvePlaybook(entityId, params.playbookId, params.scenario);

    if (!playbook) {
      // A call with no playbook is a freeform call, which Addition 3.1 exists
      // to forbid: "it follows a structured playbook -- not freeform
      // conversation". Refusing is the whole point of the rule.
      return {
        allowed: false,
        blockedReason: params.scenario
          ? `No playbook configured for scenario "${params.scenario}"`
          : 'No playbook selected, and third-party calls may not be freeform',
        alternateChannel: dnc.preferredChannel,
        contactId,
        contactName: contact?.name,
        frequency,
      };
    }

    // --- Addition 3.2: recording consent for this jurisdiction --------------
    const consent = await recordingConsentService.checkConsent({
      entityId,
      contactId,
      jurisdiction,
    });

    return {
      allowed: true,
      contactId,
      contactName: contact?.name,
      playbook: {
        id: playbook.id,
        name: playbook.name,
        scenario: playbook.scenario,
        openingScript: playbook.openingScript,
        dataAllowed: playbook.dataAllowed,
        neverDisclose: playbook.neverDisclose,
        escalationTriggers: playbook.escalationTriggers,
        escalationAction: playbook.escalationAction,
        maxDuration: playbook.maxDuration,
        outcomeFields: playbook.outcomeFields,
      },
      consent: {
        recordingAllowed: consent.allowed,
        consentType: consent.consentType,
        consentScript: consent.consentScript,
        requiresExplicitConsent: consent.requiresExplicitConsent,
      },
      frequency,
    };
  }

  /**
   * Spend one unit of the contact's weekly budget.
   *
   * Called when a call is actually placed. Scoped, because a caller that could
   * record an attempt against an out-of-scope contact could exhaust another
   * tenant's calling budget for them.
   */
  async recordAttempt(
    contactId: string,
    entityId: VerifiedEntityId,
    now: Date = new Date()
  ): Promise<boolean> {
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, entityId, deletedAt: null },
      select: { id: true },
    });
    if (!contact) return false;

    await dncChecker.recordCallAttempt(contactId, now);
    await prisma.contactCallPreference.updateMany({
      where: { contactId },
      data: { lastCalledAt: now },
    });
    return true;
  }

  /**
   * The playbook that governs this call.
   *
   * An explicit id wins. Otherwise the entity's playbook for the scenario, and
   * `listPlaybooks` already orders by name, so "the first one" is stable rather
   * than whatever Postgres returned this time.
   */
  private async resolvePlaybook(
    entityId: VerifiedEntityId,
    playbookId: string | undefined,
    scenario: string | undefined
  ): Promise<Playbook | null> {
    if (playbookId) {
      try {
        return await callPlaybookService.getPlaybook(playbookId, entityId);
      } catch {
        return null;
      }
    }

    if (!scenario) return null;

    const playbooks = await callPlaybookService.listPlaybooks(entityId);
    return playbooks.find((p) => p.scenario === scenario) ?? null;
  }
}

export const callPlannerService = new CallPlannerService();
