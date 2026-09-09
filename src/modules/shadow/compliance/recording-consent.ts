// ============================================================================
// Shadow Voice Agent — Recording Consent Service
// Manages recording consent requirements based on jurisdiction (one-party vs
// two-party consent states/countries). Stores consent receipts for audit trails.
// ============================================================================

import { prisma } from '@/lib/db';
import { consentReceiptService } from '@/modules/shadow/safety/consent-receipt';

// --- Types ---

/**
 * `actionType` written to `ShadowConsentReceipt` for a recording-consent
 * decision. The granted/denied outcome is carried by the action type itself —
 * `ShadowConsentReceipt` has no boolean consent column.
 */
const RECORDING_CONSENT_GRANTED = 'recording_consent_granted';
const RECORDING_CONSENT_DENIED = 'recording_consent_denied';

/** `triggerReferenceType` used to point a receipt at a Contact. */
const CONTACT_REFERENCE_TYPE = 'contact';

/**
 * `VoiceforgeConsentConfig.consentType` is stored snake_case (`two_party`),
 * while this module's API speaks hyphenated (`two-party`). Normalise on read.
 */
function normalizeConsentType(raw: string): 'one-party' | 'two-party' | 'all-party' {
  switch (raw.toLowerCase().replace(/_/g, '-')) {
    case 'all-party':
      return 'all-party';
    case 'two-party':
      return 'two-party';
    default:
      return 'one-party';
  }
}

/**
 * `VoiceforgeConsentConfig` has no `requiresExplicitConsent` column — the
 * requirement is a function of the consent type, which is how the
 * jurisdiction fallback below already derives it.
 */
function requiresExplicitConsent(consentType: 'one-party' | 'two-party' | 'all-party'): boolean {
  return consentType !== 'one-party';
}

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
          actionType: RECORDING_CONSENT_GRANTED,
          triggerReferenceType: CONTACT_REFERENCE_TYPE,
          triggerReferenceId: contactId,
        },
        orderBy: { executedAt: 'desc' },
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
    const entityConfig = await prisma.voiceforgeConsentConfig.findFirst({
      where: { entityId, jurisdiction: jurisdiction ?? 'DEFAULT' },
    });

    if (entityConfig) {
      const consentType = normalizeConsentType(entityConfig.consentType);
      const explicit = requiresExplicitConsent(consentType);
      return {
        allowed: !explicit,
        consentType,
        consentScript: entityConfig.consentScript ?? CONSENT_SCRIPTS[consentType],
        requiresExplicitConsent: explicit,
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

    await consentReceiptService.createReceipt({
      entityId,
      sessionId: callId,
      actionType: consentGiven ? RECORDING_CONSENT_GRANTED : RECORDING_CONSENT_DENIED,
      actionDescription: consentGiven
        ? 'Contact consented to this call being recorded'
        : 'Contact declined to have this call recorded',
      triggerSource: 'recording_consent_check',
      triggerReferenceType: CONTACT_REFERENCE_TYPE,
      triggerReferenceId: contactId,
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

    const configs = await prisma.voiceforgeConsentConfig.findMany({ where });

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

    return configs.map((c) => {
      const consentType = normalizeConsentType(c.consentType);
      return {
        jurisdiction: c.jurisdiction,
        consentType,
        consentScript: c.consentScript ?? CONSENT_SCRIPTS[consentType],
        requiresExplicitConsent: requiresExplicitConsent(consentType),
      };
    });
  }
}

// Singleton export
export const recordingConsentService = new RecordingConsentService();
