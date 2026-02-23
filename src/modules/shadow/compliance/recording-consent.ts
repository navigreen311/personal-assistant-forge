// ============================================================================
// Shadow Voice Agent — Recording Consent Service
// Manages recording consent requirements based on jurisdiction (one-party vs
// two-party consent states/countries). Stores consent receipts for audit trails.
// ============================================================================

import { prisma } from '@/lib/db';

// --- Types ---

export interface ConsentCheckParams {
  entityId: string;
  contactId?: string;
  jurisdiction?: string;
}

export interface ConsentCheckResult {
  allowed: boolean;
  consentType: string;
  consentScript?: string;
  requiresExplicitConsent: boolean;
}

export interface RecordConsentParams {
  entityId: string;
  contactId: string;
  consentGiven: boolean;
  callId: string;
}

export interface ConsentConfig {
  jurisdiction: string;
  consentType: 'one-party' | 'two-party' | 'all-party';
  consentScript: string;
  requiresExplicitConsent: boolean;
}

// --- Jurisdiction Consent Rules ---

/**
 * Two-party (all-party) consent states in the US.
 * These require explicit consent from all parties before recording.
 */
const TWO_PARTY_CONSENT_STATES = new Set([
  'CA', 'CT', 'DE', 'FL', 'IL', 'MD', 'MA', 'MI', 'MT',
  'NH', 'NV', 'PA', 'WA',
]);

/**
 * Countries/regions requiring explicit consent under GDPR or similar.
 */
const EXPLICIT_CONSENT_REGIONS = new Set([
  'EU', 'UK', 'EEA', 'GDPR',
]);

/**
 * Default consent scripts by type.
 */
const CONSENT_SCRIPTS: Record<string, string> = {
  'one-party':
    'This call may be recorded for quality assurance and training purposes.',
  'two-party':
    'This call will be recorded. By continuing this conversation, you consent to being recorded. If you do not wish to be recorded, please let me know now.',
  'all-party':
    'This call will be recorded. I need your explicit verbal consent before we proceed. Do you consent to this call being recorded?',
  'gdpr':
    'Under GDPR regulations, this call will be recorded and processed. Your data will be handled in accordance with our privacy policy. Do you explicitly consent to this recording?',
};

// --- Recording Consent Service ---

export class RecordingConsentService {
  /**
   * Check whether recording is allowed for a given entity/contact/jurisdiction.
   * Returns the consent type, required script, and whether explicit consent is needed.
   */
  async checkConsent(params: ConsentCheckParams): Promise<ConsentCheckResult> {
    const { entityId, contactId, jurisdiction } = params;

    // Check if we already have consent on file for this contact
    if (contactId) {
      const existingConsent = await prisma.shadowConsentReceipt.findFirst({
        where: {
          entityId,
          contactId,
          consentGiven: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existingConsent) {
        return {
          allowed: true,
          consentType: 'pre-authorized',
          requiresExplicitConsent: false,
        };
      }
    }

    // Check entity-level consent configuration
    const entityConfig = await prisma.shadowConsentConfig.findFirst({
      where: { entityId, jurisdiction: jurisdiction ?? 'DEFAULT' },
    });

    if (entityConfig) {
      return {
        allowed: !entityConfig.requiresExplicitConsent,
        consentType: entityConfig.consentType as string,
        consentScript: entityConfig.consentScript as string | undefined,
        requiresExplicitConsent: entityConfig.requiresExplicitConsent as boolean,
      };
    }

    // Fall back to jurisdiction-based rules
    const normalizedJurisdiction = (jurisdiction ?? '').toUpperCase().trim();

    // Check GDPR regions
    if (EXPLICIT_CONSENT_REGIONS.has(normalizedJurisdiction)) {
      return {
        allowed: false,
        consentType: 'all-party',
        consentScript: CONSENT_SCRIPTS['gdpr'],
        requiresExplicitConsent: true,
      };
    }

    // Check US two-party consent states
    if (TWO_PARTY_CONSENT_STATES.has(normalizedJurisdiction)) {
      return {
        allowed: false,
        consentType: 'two-party',
        consentScript: CONSENT_SCRIPTS['two-party'],
        requiresExplicitConsent: true,
      };
    }

    // Default: one-party consent (most US states, etc.)
    return {
      allowed: true,
      consentType: 'one-party',
      consentScript: CONSENT_SCRIPTS['one-party'],
      requiresExplicitConsent: false,
    };
  }

  /**
   * Record a consent decision for audit trail purposes.
   * Stores a consent receipt with timestamp, entity, contact, and call reference.
   */
  async recordConsent(params: RecordConsentParams): Promise<void> {
    const { entityId, contactId, consentGiven, callId } = params;

    await prisma.shadowConsentReceipt.create({
      data: {
        entityId,
        contactId,
        consentGiven,
        sessionId: callId,
        consentType: 'recording',
        recordedAt: new Date(),
      },
    });
  }

  /**
   * Get the consent configurations for an entity, optionally filtered by jurisdiction.
   * Returns all consent configs if no jurisdiction is specified.
   */
  async getConsentConfig(
    entityId: string,
    jurisdiction?: string,
  ): Promise<ConsentConfig[]> {
    const where: Record<string, unknown> = { entityId };
    if (jurisdiction) {
      where.jurisdiction = jurisdiction;
    }

    const configs = await prisma.shadowConsentConfig.findMany({ where });

    if (configs.length === 0 && jurisdiction) {
      // Return the default config for the jurisdiction
      const normalizedJurisdiction = jurisdiction.toUpperCase().trim();

      if (EXPLICIT_CONSENT_REGIONS.has(normalizedJurisdiction)) {
        return [
          {
            jurisdiction: normalizedJurisdiction,
            consentType: 'all-party',
            consentScript: CONSENT_SCRIPTS['gdpr'],
            requiresExplicitConsent: true,
          },
        ];
      }

      if (TWO_PARTY_CONSENT_STATES.has(normalizedJurisdiction)) {
        return [
          {
            jurisdiction: normalizedJurisdiction,
            consentType: 'two-party',
            consentScript: CONSENT_SCRIPTS['two-party'],
            requiresExplicitConsent: true,
          },
        ];
      }

      return [
        {
          jurisdiction: normalizedJurisdiction,
          consentType: 'one-party',
          consentScript: CONSENT_SCRIPTS['one-party'],
          requiresExplicitConsent: false,
        },
      ];
    }

    return configs.map((c) => ({
      jurisdiction: c.jurisdiction as string,
      consentType: (c.consentType as string) as 'one-party' | 'two-party' | 'all-party',
      consentScript: c.consentScript as string,
      requiresExplicitConsent: c.requiresExplicitConsent as boolean,
    }));
  }
}

// Singleton export
export const recordingConsentService = new RecordingConsentService();
