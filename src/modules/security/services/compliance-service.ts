// ============================================================================
// Compliance Service — HIPAA, GDPR & CCPA Enforcement
// Worker 15: Security, Privacy & Compliance
// ============================================================================

import type { ComplianceFinding, ConsentRecord } from '@/modules/security/types';
import type { ComplianceProfile } from '@/shared/types';
import { prisma } from '@/lib/db';
import { redactionService } from './redaction-service';
import { consentService } from './consent-service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** PHI-related sensitive data categories used for HIPAA enforcement. */
const PHI_CATEGORIES: readonly string[] = [
  'MEDICAL_RECORD_NUMBER',
  'DIAGNOSIS',
  'MEDICATION',
  'HEALTH_CONDITION',
  'INSURANCE_ID',
] as const;

/** Maps action types to their corresponding GDPR consent type. */
const GDPR_CONSENT_MAP: Record<string, ConsentRecord['consentType']> = {
  DATA_PROCESSING: 'DATA_PROCESSING',
  STORE: 'DATA_PROCESSING',
  ANALYZE: 'DATA_PROCESSING',
  MARKETING: 'MARKETING',
  EMAIL_CAMPAIGN: 'MARKETING',
  SHARE: 'DATA_SHARING',
  EXPORT: 'DATA_SHARING',
  PROFILE: 'PROFILING',
  SCORE: 'PROFILING',
  AUTOMATE: 'AUTOMATED_DECISIONS',
  AI_DECISION: 'AUTOMATED_DECISIONS',
};

/** CCPA action types that require opt-out/disclosure notices. */
const CCPA_DATA_SALE_ACTIONS: ReadonlySet<string> = new Set([
  'SHARE',
  'SELL',
  'EXPORT',
  'DATA_SHARING',
]);

const CCPA_RIGHT_TO_KNOW_ACTIONS: ReadonlySet<string> = new Set([
  'COLLECT',
  'STORE',
  'DATA_PROCESSING',
  'ANALYZE',
  'PROFILE',
]);

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

interface HIPAAEnforcementResult {
  compliant: boolean;
  violations: string[];
  autoRedacted: string;
  recommendations: string[];
}

interface GDPREnforcementResult {
  compliant: boolean;
  violations: string[];
  requiredConsents: string[];
}

interface CCPAEnforcementResult {
  compliant: boolean;
  violations: string[];
  requiredNotices: string[];
}

interface ComplianceReportResult {
  profile: ComplianceProfile[];
  status: 'COMPLIANT' | 'AT_RISK' | 'NON_COMPLIANT';
  findings: ComplianceFinding[];
  score: number;
}

// ---------------------------------------------------------------------------
// ComplianceService
// ---------------------------------------------------------------------------

export class ComplianceService {
  // -------------------------------------------------------------------------
  // Profile look-ups
  // -------------------------------------------------------------------------

  /**
   * Retrieve the compliance profiles associated with an entity.
   */
  async getComplianceProfile(entityId: string): Promise<ComplianceProfile[]> {
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { complianceProfile: true },
    });

    if (!entity) {
      return [];
    }

    return entity.complianceProfile as ComplianceProfile[];
  }

  /**
   * Quick check: does the entity have HIPAA in its compliance profile?
   */
  async isHIPAAEntity(entityId: string): Promise<boolean> {
    const profiles = await this.getComplianceProfile(entityId);
    return profiles.includes('HIPAA');
  }

  // -------------------------------------------------------------------------
  // HIPAA enforcement
  // -------------------------------------------------------------------------

  /**
   * Check content for HIPAA compliance. If PHI is detected the content is
   * auto-redacted via the redaction service. Returns violations, the redacted
   * text, and recommendations.
   */
  async enforceHIPAA(
    content: string,
    entityId: string,
  ): Promise<HIPAAEnforcementResult> {
    const violations: string[] = [];
    const recommendations: string[] = [];
    let autoRedacted = content;

    // Verify entity is subject to HIPAA
    const isHIPAA = await this.isHIPAAEntity(entityId);
    if (!isHIPAA) {
      return { compliant: true, violations: [], autoRedacted: content, recommendations: [] };
    }

    // Detect sensitive data via the redaction service
    const sensitiveMatches = await redactionService.detectSensitiveData(content);

    // Filter matches to PHI-only categories
    const phiMatches = sensitiveMatches.filter((match) =>
      PHI_CATEGORIES.includes(match.type),
    );

    if (phiMatches.length > 0) {
      // Build human-readable violation descriptions per PHI type found
      const foundTypes = [...new Set(phiMatches.map((m) => m.type))];
      for (const phiType of foundTypes) {
        const label = phiType.toLowerCase().replace(/_/g, ' ');
        violations.push(`Unprotected PHI detected: ${label} found`);
      }

      // Auto-redact PHI from the content
      const redactionResult = await redactionService.redactContent(content, {
        categories: ['PHI'],
      });
      autoRedacted = redactionResult.redactedText;

      // Provide actionable recommendations
      recommendations.push(
        'Store PHI in encrypted vault',
        'Enable audit logging for PHI access',
        'Implement minimum-necessary access controls for PHI',
        'Ensure PHI transmission uses TLS 1.2+',
      );
    }

    return {
      compliant: violations.length === 0,
      violations,
      autoRedacted,
      recommendations,
    };
  }

  // -------------------------------------------------------------------------
  // GDPR enforcement
  // -------------------------------------------------------------------------

  /**
   * Check whether the required consent exists for a GDPR-regulated action.
   */
  async enforceGDPR(
    actionType: string,
    contactId: string,
    entityId: string,
  ): Promise<GDPREnforcementResult> {
    const violations: string[] = [];
    const requiredConsents: string[] = [];

    // Verify entity is subject to GDPR
    const profiles = await this.getComplianceProfile(entityId);
    if (!profiles.includes('GDPR')) {
      return { compliant: true, violations: [], requiredConsents: [] };
    }

    // Resolve the required consent type for the given action
    const consentType = GDPR_CONSENT_MAP[actionType];
    if (!consentType) {
      // Unknown action type — cannot verify consent; flag it
      violations.push(
        `Unknown action type "${actionType}" — unable to verify GDPR consent`,
      );
      return { compliant: false, violations, requiredConsents: [actionType] };
    }

    // Check consent via the consent service
    const hasConsent = await consentService.checkConsent(
      contactId,
      entityId,
      consentType,
    );

    if (!hasConsent) {
      requiredConsents.push(consentType);
      violations.push(
        `Missing required GDPR consent: "${consentType}" for action "${actionType}"`,
      );
    }

    return {
      compliant: violations.length === 0,
      violations,
      requiredConsents,
    };
  }

  // -------------------------------------------------------------------------
  // CCPA enforcement
  // -------------------------------------------------------------------------

  /**
   * CCPA compliance check — verifies opt-out notices and right-to-know
   * disclosures are satisfied for the requested action.
   */
  async enforceCCPA(
    actionType: string,
    contactId: string,
    entityId: string,
  ): Promise<CCPAEnforcementResult> {
    const violations: string[] = [];
    const requiredNotices: string[] = [];

    // Verify entity is subject to CCPA
    const profiles = await this.getComplianceProfile(entityId);
    if (!profiles.includes('CCPA')) {
      return { compliant: true, violations: [], requiredNotices: [] };
    }

    // Check data-sale / sharing opt-out notices
    if (CCPA_DATA_SALE_ACTIONS.has(actionType)) {
      const hasOptOut = await consentService.checkConsent(
        contactId,
        entityId,
        'DATA_SHARING',
      );

      if (!hasOptOut) {
        requiredNotices.push('OPT_OUT_NOTICE');
        violations.push(
          `CCPA requires a "Do Not Sell or Share My Personal Information" opt-out notice for action "${actionType}"`,
        );
      }
    }

    // Check right-to-know disclosures
    if (CCPA_RIGHT_TO_KNOW_ACTIONS.has(actionType)) {
      const hasDisclosure = await consentService.checkConsent(
        contactId,
        entityId,
        'DATA_PROCESSING',
      );

      if (!hasDisclosure) {
        requiredNotices.push('RIGHT_TO_KNOW_DISCLOSURE');
        violations.push(
          `CCPA requires a right-to-know disclosure before "${actionType}" action`,
        );
      }
    }

    return {
      compliant: violations.length === 0,
      violations,
      requiredNotices,
    };
  }

  // -------------------------------------------------------------------------
  // Compliance report
  // -------------------------------------------------------------------------

  /**
   * Generate an overall compliance health report for an entity.
   * Score: 100 = fully compliant, deductions per finding severity.
   * Status thresholds: >= 80 COMPLIANT, >= 50 AT_RISK, < 50 NON_COMPLIANT.
   */
  async getComplianceReport(entityId: string): Promise<ComplianceReportResult> {
    const profile = await this.getComplianceProfile(entityId);
    const findings: ComplianceFinding[] = [];
    let score = 100;

    // --- HIPAA checks ---
    if (profile.includes('HIPAA')) {
      const hipaaFindings = await this.auditHIPAA(entityId);
      findings.push(...hipaaFindings);
    }

    // --- GDPR checks ---
    if (profile.includes('GDPR')) {
      const gdprFindings = await this.auditGDPR(entityId);
      findings.push(...gdprFindings);
    }

    // --- CCPA checks ---
    if (profile.includes('CCPA')) {
      const ccpaFindings = await this.auditCCPA(entityId);
      findings.push(...ccpaFindings);
    }

    // Deduct points based on finding severity
    for (const finding of findings) {
      score -= this.severityDeduction(finding.severity);
    }

    // Clamp score to [0, 100]
    score = Math.max(0, Math.min(100, score));

    const status = this.scoreToStatus(score);

    return { profile, status, findings, score };
  }

  // -------------------------------------------------------------------------
  // Private audit helpers
  // -------------------------------------------------------------------------

  /**
   * Run HIPAA-specific audit checks and return findings.
   */
  private async auditHIPAA(entityId: string): Promise<ComplianceFinding[]> {
    const findings: ComplianceFinding[] = [];

    try {
      const entity = await prisma.entity.findUnique({
        where: { id: entityId },
      });

      if (!entity) {
        findings.push({
          regulation: 'HIPAA',
          severity: 'CRITICAL',
          description: 'Entity record not found — cannot verify HIPAA controls',
          recommendation: 'Ensure entity is properly registered in the system',
          affectedRecords: 0,
        });
        return findings;
      }
    } catch {
      findings.push({
        regulation: 'HIPAA',
        severity: 'MEDIUM',
        description: 'Unable to verify entity registration (database unavailable)',
        recommendation: 'Ensure database connectivity for compliance verification',
        affectedRecords: 0,
      });
    }

    // Check for messages that may contain unprotected PHI
    try {
      const messages = await prisma.message.findMany({
        where: { entityId },
        select: { id: true, body: true },
        take: 100,
      });

      let unprotectedPHI = 0;
      for (const msg of messages) {
        const matches = redactionService.detectSensitiveData(msg.body);
        const phiMatches = matches.filter((m) => PHI_CATEGORIES.includes(m.type));
        if (phiMatches.length > 0) {
          unprotectedPHI++;
        }
      }

      if (unprotectedPHI > 0) {
        findings.push({
          regulation: 'HIPAA',
          severity: 'HIGH',
          description: `${unprotectedPHI} message(s) contain unprotected PHI`,
          recommendation: 'Enable PHI auto-redaction and store sensitive data in encrypted vault',
          affectedRecords: unprotectedPHI,
        });
      }
    } catch {
      // DB unavailable
    }

    return findings;
  }

  /**
   * Run GDPR-specific audit checks and return findings.
   */
  private async auditGDPR(entityId: string): Promise<ComplianceFinding[]> {
    const findings: ComplianceFinding[] = [];

    // Check for contacts without consent records using in-memory store
    try {
      const contacts = await prisma.contact.findMany({
        where: { entityId },
        select: { id: true },
      });

      let contactsWithoutConsent = 0;
      for (const contact of contacts) {
        const consents = await consentService.getAllConsents(contact.id);
        if (consents.length === 0) {
          contactsWithoutConsent++;
        }
      }

      if (contactsWithoutConsent > 0) {
        findings.push({
          regulation: 'GDPR',
          severity: 'HIGH',
          description: `${contactsWithoutConsent} contact(s) have no consent records`,
          recommendation: 'Obtain explicit consent or establish alternative legal basis for all contacts',
          affectedRecords: contactsWithoutConsent,
        });
      }
    } catch {
      // DB unavailable
    }

    // Check for expired consents in the in-memory store
    const expiredConsents = await consentService.getExpiredConsents();
    if (expiredConsents.length > 0) {
      findings.push({
        regulation: 'GDPR',
        severity: 'MEDIUM',
        description: `${expiredConsents.length} consent record(s) have expired`,
        recommendation: 'Request consent renewal from affected contacts',
        affectedRecords: expiredConsents.length,
      });
    }

    return findings;
  }

  /**
   * Run CCPA-specific audit checks and return findings.
   */
  private async auditCCPA(entityId: string): Promise<ComplianceFinding[]> {
    const findings: ComplianceFinding[] = [];

    try {
      const totalContacts = await prisma.contact.count({
        where: { entityId },
      });

      if (totalContacts > 0) {
        // Check in-memory consent records for data sharing opt-outs
        const contacts = await prisma.contact.findMany({
          where: { entityId },
          select: { id: true },
        });

        let hasOptOut = false;
        for (const contact of contacts) {
          const consent = await consentService.checkConsent(
            contact.id,
            entityId,
            'DATA_SHARING',
          );
          if (consent) {
            hasOptOut = true;
            break;
          }
        }

        if (!hasOptOut) {
          findings.push({
            regulation: 'CCPA',
            severity: 'MEDIUM',
            description: 'No data-sharing opt-out records found for any contacts',
            recommendation: 'Provide "Do Not Sell or Share" notices and record opt-out preferences',
            affectedRecords: totalContacts,
          });
        }
      }
    } catch {
      // DB unavailable
    }

    return findings;
  }

  // -------------------------------------------------------------------------
  // Scoring helpers
  // -------------------------------------------------------------------------

  /**
   * Deduction points per finding severity level.
   */
  private severityDeduction(
    severity: ComplianceFinding['severity'],
  ): number {
    const deductions: Record<ComplianceFinding['severity'], number> = {
      LOW: 2,
      MEDIUM: 5,
      HIGH: 10,
      CRITICAL: 25,
    };
    return deductions[severity];
  }

  /**
   * Map a numeric compliance score to a status label.
   */
  private scoreToStatus(
    score: number,
  ): 'COMPLIANT' | 'AT_RISK' | 'NON_COMPLIANT' {
    if (score >= 80) return 'COMPLIANT';
    if (score >= 50) return 'AT_RISK';
    return 'NON_COMPLIANT';
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const complianceService = new ComplianceService();
