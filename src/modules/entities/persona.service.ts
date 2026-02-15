import { prisma } from '@/lib/db';
import type { BrandKit, ComplianceProfile } from '@/shared/types';
import type { PersonaContext } from './entity.types';

interface EntityRow {
  id: string;
  name: string;
  type: string;
  complianceProfile: string[];
  brandKit: Record<string, unknown> | null;
  voicePersonaId: string | null;
}

export class PersonaService {
  async getPersonaContext(entityId: string): Promise<PersonaContext> {
    const entity = await prisma.entity.findUniqueOrThrow({
      where: { id: entityId },
    }) as EntityRow;
    return this.buildPersonaContext(entity);
  }

  async listPersonas(userId: string): Promise<PersonaContext[]> {
    const entities = await prisma.entity.findMany({ where: { userId } }) as EntityRow[];
    return entities.map((e: EntityRow) => this.buildPersonaContext(e));
  }

  async validateMessageForPersona(
    entityId: string,
    message: string,
  ): Promise<{
    valid: boolean;
    suggestions: string[];
    complianceIssues: string[];
  }> {
    const entity = await prisma.entity.findUniqueOrThrow({
      where: { id: entityId },
    }) as EntityRow;
    const profiles = entity.complianceProfile as ComplianceProfile[];
    const brandKit = entity.brandKit as BrandKit | null;

    const suggestions: string[] = [];
    const complianceIssues: string[] = [];

    // Check for PHI-like patterns in non-HIPAA entities
    if (!profiles.includes('HIPAA')) {
      const phiPatterns = [
        /\b(SSN|social security)\b/i,
        /\b\d{3}-\d{2}-\d{4}\b/,
        /\b(diagnosis|medication|patient|medical record)\b/i,
        /\b(health insurance|medicare|medicaid)\b/i,
      ];
      for (const pattern of phiPatterns) {
        if (pattern.test(message)) {
          complianceIssues.push(
            'Message may contain PHI (Protected Health Information) but entity does not have HIPAA compliance profile',
          );
          break;
        }
      }
    }

    // HIPAA entities: check for unencrypted PHI references
    if (profiles.includes('HIPAA')) {
      if (/\b\d{3}-\d{2}-\d{4}\b/.test(message)) {
        complianceIssues.push(
          'HIPAA: SSN detected in message — ensure this communication channel is encrypted',
        );
      }
    }

    // GDPR: check for personal data without consent language
    if (profiles.includes('GDPR')) {
      const hasPersonalData = /\b(address|date of birth|DOB|national ID)\b/i.test(message);
      if (hasPersonalData) {
        complianceIssues.push(
          'GDPR: Personal data detected — ensure data subject has given consent for this communication',
        );
      }
    }

    // Tone suggestions based on brand kit
    if (brandKit?.toneGuide) {
      const tone = brandKit.toneGuide.toLowerCase();
      if (tone.includes('formal') && /\b(hey|yo|sup|gonna|wanna)\b/i.test(message)) {
        suggestions.push(
          `Brand tone is "${brandKit.toneGuide}" — consider using more formal language`,
        );
      }
      if (tone.includes('warm') && /\b(pursuant|hereby|notwithstanding)\b/i.test(message)) {
        suggestions.push(
          `Brand tone is "${brandKit.toneGuide}" — consider using warmer, more approachable language`,
        );
      }
    }

    return {
      valid: complianceIssues.length === 0,
      suggestions,
      complianceIssues,
    };
  }

  getComplianceDisclaimers(profiles: ComplianceProfile[]): string[] {
    const disclaimers: string[] = [];

    if (profiles.includes('HIPAA')) {
      disclaimers.push(
        'This communication may contain Protected Health Information (PHI). ' +
          'It is intended only for the individual(s) named above. ' +
          'If you are not the intended recipient, please delete this message and notify the sender.',
      );
    }

    if (profiles.includes('GDPR')) {
      disclaimers.push(
        'This message is sent in accordance with GDPR regulations. ' +
          'You have the right to access, rectify, or request deletion of your personal data. ' +
          'Contact us for data subject requests.',
      );
    }

    if (profiles.includes('CCPA')) {
      disclaimers.push(
        'Under the California Consumer Privacy Act (CCPA), ' +
          'you have the right to know what personal information is collected, ' +
          'to request deletion, and to opt-out of the sale of your personal information.',
      );
    }

    if (profiles.includes('SOX')) {
      disclaimers.push(
        'This communication may contain financial information subject to Sarbanes-Oxley compliance. ' +
          'All financial records are maintained in accordance with SOX requirements.',
      );
    }

    if (profiles.includes('SEC')) {
      disclaimers.push(
        'This communication may contain information subject to SEC regulations. ' +
          'Do not forward without proper authorization.',
      );
    }

    if (profiles.includes('REAL_ESTATE')) {
      disclaimers.push(
        'This communication is related to real estate transactions. ' +
          'All required disclosures are available upon request.',
      );
    }

    return disclaimers;
  }

  // ─── Private ──────────────────────────────────────────

  private buildPersonaContext(entity: EntityRow): PersonaContext {
    const brandKit = entity.brandKit as BrandKit | null;
    const profiles = (entity.complianceProfile ?? []) as ComplianceProfile[];
    const disclaimers = this.getComplianceDisclaimers(profiles);

    return {
      entityId: entity.id,
      entityName: entity.name,
      entityType: entity.type,
      voicePersonaId: entity.voicePersonaId ?? undefined,
      brandKit: brandKit ?? undefined,
      complianceProfile: profiles,
      responsePrefix: `Responding as ${entity.name}`,
      toneGuidance: brandKit?.toneGuide ?? 'Professional and clear',
      disclaimers,
    };
  }
}
