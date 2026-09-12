// ============================================================================
// Shadow Voice Agent — entity voice profiles and persona switching
// v3 spec, Addition 5.1 (entity voice profiles) + 5.2 (persona switching).
// ============================================================================
//
// P-16, deliverables 6 and 7.
//
// `getEntityProfile` was reachable (`GET /api/shadow/config/entity/[id]`).
// `switchEntity` and `detectEntity` were not called by anything, and
// `switchEntity` had a defect that would have made wiring it worse than not:
//
//     try {
//       const session = await prisma.shadowVoiceSession.findUnique(...)
//       if (session) { ...update... } else { personaChanged = true; }
//     } catch { personaChanged = true; }
//
// A session id that does not exist, and a database error while updating one
// that does, both produced `personaChanged: true` and the announcement
// "Context switched to X. All subsequent actions will be in the X context."
// Nothing had switched. That is the codebase's third failure mode -- reporting
// success for work not done -- in the one place where the work being reported
// is a compliance boundary: MedLink carries a HIPAA profile and CRE Forge does
// not, and Addition 5.2's cross-entity safeguard is the reason `entity-scope.ts`
// exists.
//
// It also did not check that the session belonged to the user. It verified the
// ENTITY's owner and then wrote `activeEntityId` into whatever session id it was
// handed, so one user could move another user's live voice session onto their
// own entity.
//
// Both are fixed below, and the failure is now a thrown error with a specific
// message rather than a cheerful announcement.

import { prisma } from '@/lib/db';

// ---- Types ----

export interface EntityProfile {
  entityId: string;
  entityName: string;
  entityType: string;
  voicePersona: string;
  tone: string;
  signature: string | null;
  greeting: string | null;
  disclaimers: string[];
  allowedDisclosures: string[];
  neverDisclose: string[];
  complianceProfiles: string[];
  vipContacts: string[];
  proactiveEnabled: boolean;
  financialPinThreshold: number;
  blastRadiusPinThreshold: string;
}

export interface SwitchParams {
  sessionId: string;
  userId: string;
  targetEntityId?: string;
  contactKeyword?: string;
}

export class EntitySwitchError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'TARGET_UNRESOLVED'
      | 'ENTITY_NOT_FOUND'
      | 'ENTITY_FORBIDDEN'
      // P-44 removed 'SESSION_FORBIDDEN'. It is not unused -- it is
      // unrepresentable: `switchEntity` resolves the session with the owner in
      // the filter, so there is no state in which a session exists, belongs to
      // someone else, and is reported as anything but absent. Leaving the member
      // in the union would leave a 403 arm in the route for a future edit to
      // reintroduce the oracle through.
      | 'SESSION_NOT_FOUND',
  ) {
    super(message);
    this.name = 'EntitySwitchError';
  }
}

export interface SwitchResult {
  entityId: string;
  entityName: string;
  personaChanged: boolean;
  announcement: string;
}

// ---- Service ----

export class EntityPersonaService {
  /**
   * Retrieve the full profile for an entity, including voice persona and compliance settings.
   */
  async getEntityProfile(entityId: string): Promise<EntityProfile | null> {
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
    });

    if (!entity) return null;

    // Load the shadow entity profile (persona/compliance config)
    const profile = await prisma.shadowEntityProfile.findUnique({
      where: { entityId },
    });

    return {
      entityId: entity.id,
      entityName: entity.name,
      entityType: entity.type,
      voicePersona: profile?.voicePersona ?? 'default',
      tone: profile?.tone ?? 'professional-friendly',
      signature: profile?.signature ?? null,
      greeting: profile?.greeting ?? null,
      disclaimers: (profile?.disclaimers ?? []) as string[],
      allowedDisclosures: (profile?.allowedDisclosures ?? []) as string[],
      neverDisclose: (profile?.neverDisclose ?? []) as string[],
      complianceProfiles: (profile?.complianceProfiles ?? []) as string[],
      vipContacts: (profile?.vipContacts ?? []) as string[],
      proactiveEnabled: profile?.proactiveEnabled ?? true,
      financialPinThreshold: profile?.financialPinThreshold ?? 500,
      blastRadiusPinThreshold: profile?.blastRadiusPinThreshold ?? 'external',
    };
  }

  /**
   * Switch the active entity in a session.
   * Supports two methods:
   * 1) Direct entity ID switch
   * 2) Contact keyword match (e.g., "Switch to MedLink" finds entity named MedLink)
   *
   * CRITICAL: Never leak data between entities. The switch fully replaces the active context.
   */
  async switchEntity(params: SwitchParams): Promise<SwitchResult> {
    const { sessionId, userId, targetEntityId, contactKeyword } = params;

    // Resolve target entity
    let entityId: string | null = targetEntityId ?? null;

    if (!entityId && contactKeyword) {
      entityId = await this.resolveEntityByKeyword(userId, contactKeyword);
    }

    if (!entityId) {
      throw new EntitySwitchError(
        'Could not resolve target entity. Provide an entity ID or keyword.',
        'TARGET_UNRESOLVED',
      );
    }

    // Verify ownership
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
    });

    if (!entity) {
      throw new EntitySwitchError(`Entity not found: ${entityId}`, 'ENTITY_NOT_FOUND');
    }

    if (entity.userId !== userId) {
      throw new EntitySwitchError(
        'Access denied: entity does not belong to this user',
        'ENTITY_FORBIDDEN',
      );
    }

    // The session must exist AND belong to this user, and P-44 made that one
    // query instead of two checks.
    //
    // P-16 added both checks and was right to; what it left was a distinction.
    // `findUnique({ id })` followed by `if (session.userId !== userId) throw
    // SESSION_FORBIDDEN` made the route a cuid existence oracle: the caller
    // learned, from a 403 rather than a 404, that somebody else's session id is
    // real. P-41 found two of these and closed the third; this is the second of
    // the two it left, and Ivan's ruling on the deletion paths — *"404 on all
    // three paths"* — is the same instruction.
    //
    // The fix is not to relabel the second branch. There is no second branch:
    // the owner is IN the filter, so "not yours" and "not there" are one query
    // returning null and a later edit cannot make them diverge. P-34's rule —
    // the scoping and the refusal are the same act — and the reason this is a
    // `findFirst`: `userId` is not part of any unique constraint on
    // `ShadowVoiceSession`.
    //
    // The failure is still not swallowed. A switch that did not happen must not
    // be announced as one; it is just no longer announced with a status code
    // that says whose.
    const session = await prisma.shadowVoiceSession.findFirst({
      where: { id: sessionId, userId },
      select: { id: true, activeEntityId: true },
    });

    if (!session) {
      throw new EntitySwitchError(`Voice session not found: ${sessionId}`, 'SESSION_NOT_FOUND');
    }

    const personaChanged = session.activeEntityId !== entityId;

    // Written unconditionally even when the entity is unchanged: `updatedAt`
    // semantics aside, an idempotent write is cheaper to reason about than a
    // branch whose "nothing to do" arm is the one no test covers.
    // The owner is in this `where` as well, not only in the `findFirst` above.
    // The read and the write are separate statements against a live database and
    // "resolve an id, then trust it" is the shape P-41 spent a package removing;
    // `userId` is legal in `ShadowVoiceSessionWhereUniqueInput`, so a filter that
    // misses raises P2025 rather than writing the row.
    await prisma.shadowVoiceSession.update({
      where: { id: sessionId, userId },
      data: { activeEntityId: entityId },
    });

    // Load the new entity's profile for the announcement
    const profile = await this.getEntityProfile(entityId);
    const greeting = profile?.greeting ?? `Switched to ${entity.name}.`;

    const announcement = personaChanged
      ? `Context switched to ${entity.name}. ${greeting} All subsequent actions will be in the ${entity.name} context.`
      : `Already in the ${entity.name} context. No changes made.`;

    return {
      entityId,
      entityName: entity.name,
      personaChanged,
      announcement,
    };
  }

  /**
   * Detect which entity a user's message might be referring to.
   * Uses keyword matching against entity names, contact names, and project names.
   * Returns the entity ID if a match is found, null otherwise.
   */
  async detectEntity(userId: string, message: string): Promise<string | null> {
    if (!message || message.trim().length === 0) return null;

    const lowerMessage = message.toLowerCase();

    // Load all user entities
    const entities = await prisma.entity.findMany({
      where: { userId },
      select: { id: true, name: true, type: true },
    });

    // Direct entity name match (highest priority)
    for (const entity of entities) {
      if (lowerMessage.includes(entity.name.toLowerCase())) {
        return entity.id;
      }
    }

    // Match by keywords from entity profile VIP contacts
    for (const entity of entities) {
      const profile = await prisma.shadowEntityProfile.findUnique({
        where: { entityId: entity.id },
      });

      if (profile) {
        // Check VIP contacts
        const vipContacts = (profile.vipContacts ?? []) as string[];
        for (const vip of vipContacts) {
          if (typeof vip === 'string' && lowerMessage.includes(vip.toLowerCase())) {
            return entity.id;
          }
        }
      }
    }

    // Match by contact names within entities
    for (const entity of entities) {
      const contacts = await prisma.contact.findMany({
        where: {
          entityId: entity.id,
          deletedAt: null,
        },
        select: { name: true },
      });

      for (const contact of contacts) {
        if (lowerMessage.includes(contact.name.toLowerCase())) {
          return entity.id;
        }
      }
    }

    // Check "switch to" pattern
    const switchPattern = /switch\s+to\s+["']?([^"']+?)["']?\s*$/i;
    const switchMatch = message.match(switchPattern);
    if (switchMatch) {
      const targetName = switchMatch[1].trim().toLowerCase();
      for (const entity of entities) {
        if (entity.name.toLowerCase() === targetName) {
          return entity.id;
        }
      }
    }

    return null;
  }

  /**
   * Resolve an entity ID by keyword search against the user's entities.
   */
  private async resolveEntityByKeyword(
    userId: string,
    keyword: string
  ): Promise<string | null> {
    const lowerKeyword = keyword.toLowerCase();

    // Exact name match first
    const entities = await prisma.entity.findMany({
      where: { userId },
      select: { id: true, name: true },
    });

    // Exact match
    const exact = entities.find(
      (e) => e.name.toLowerCase() === lowerKeyword
    );
    if (exact) return exact.id;

    // Partial match
    const partial = entities.find(
      (e) => e.name.toLowerCase().includes(lowerKeyword) || lowerKeyword.includes(e.name.toLowerCase())
    );
    if (partial) return partial.id;

    return null;
  }
}

export const entityPersonaService = new EntityPersonaService();
