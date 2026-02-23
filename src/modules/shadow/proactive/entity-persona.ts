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
      throw new Error('Could not resolve target entity. Provide an entity ID or keyword.');
    }

    // Verify ownership
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
    });

    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    if (entity.userId !== userId) {
      throw new Error('Access denied: entity does not belong to this user');
    }

    // Load current session to check if entity is actually changing
    let personaChanged = false;
    try {
      const session = await prisma.shadowVoiceSession.findUnique({
        where: { id: sessionId },
      });

      if (session) {
        personaChanged = session.activeEntityId !== entityId;

        // Update the session's active entity
        await prisma.shadowVoiceSession.update({
          where: { id: sessionId },
          data: { activeEntityId: entityId },
        });
      } else {
        personaChanged = true;
      }
    } catch {
      personaChanged = true;
    }

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
