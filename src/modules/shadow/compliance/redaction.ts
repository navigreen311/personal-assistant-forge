// ============================================================================
// Shadow Voice Agent — PII/PHI/PCI Redaction Pipeline
// Every transcript passes through this BEFORE storage. Supports configurable
// entity compliance profiles (HIPAA, PCI-DSS, GDPR, etc.).
// ============================================================================

export interface RedactionEntry {
  type: string;
  original: string;
  replacement: string;
  position: [number, number];
}

export interface RedactionResult {
  redactedText: string;
  redactions: RedactionEntry[];
}

interface RedactionPattern {
  name: string;
  regex: RegExp;
  replacement: string;
  /** If set, only applies when the entity has one of these compliance profiles */
  requiredProfiles?: string[];
  /** If true, pattern needs special context-aware matching */
  contextual?: boolean;
}

// --- Pattern Definitions ---

const SSN_PATTERN: RedactionPattern = {
  name: 'SSN',
  regex: /\b\d{3}-\d{2}-\d{4}\b/g,
  replacement: '[SSN-REDACTED]',
};

const CREDIT_CARD_PATTERN: RedactionPattern = {
  name: 'CREDIT_CARD',
  regex: /\b(?:\d[ -]*?){13,19}\b/g,
  replacement: '[CC-REDACTED]',
};

const CREDENTIAL_PATTERN: RedactionPattern = {
  name: 'CREDENTIAL',
  regex: /(?:api[_-]?key|password|secret|token)\s*[:=]\s*\S+/gi,
  replacement: '[CREDENTIAL-REDACTED]',
};

const EMAIL_PATTERN: RedactionPattern = {
  name: 'EMAIL',
  regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/gi,
  replacement: '[PII-REDACTED]',
  requiredProfiles: ['GDPR'],
};

const PHONE_PATTERN: RedactionPattern = {
  name: 'PHONE',
  regex: /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
  replacement: '[PII-REDACTED]',
  requiredProfiles: ['GDPR'],
};

const MEDICAL_PATTERN: RedactionPattern = {
  name: 'MEDICAL',
  regex:
    /\b(?:diagnosis|diagnosed|prescription|Rx|medication|blood\s*type|patient\s*id|medical\s*record|MRN|insurance\s*id|ICD-?\d{1,2}|CPT\s*\d+|blood\s*pressure|heart\s*rate|hemoglobin|cholesterol|diabetes|hypertension|HIV|cancer|tumor|surgery|surgical|biopsy|radiology|MRI|CT\s*scan|X-ray)\b[:\s]*\S*/gi,
  replacement: '[PHI-REDACTED]',
  requiredProfiles: ['HIPAA'],
};

/**
 * CVV detection: 3-4 digit numbers that appear near credit card context.
 * We look for patterns like "cvv 123", "cvc: 4567", "security code 123".
 */
const CVV_PATTERN: RedactionPattern = {
  name: 'CVV',
  regex: /(?:cvv|cvc|cv2|security\s*code)\s*[:=]?\s*\b\d{3,4}\b/gi,
  replacement: '[PCI-REDACTED]',
};

// --- All patterns in priority order (most specific first) ---

const ALL_PATTERNS: RedactionPattern[] = [
  CVV_PATTERN,
  SSN_PATTERN,
  CREDENTIAL_PATTERN,
  CREDIT_CARD_PATTERN,
  MEDICAL_PATTERN,
  EMAIL_PATTERN,
  PHONE_PATTERN,
];

// --- Redaction Pipeline ---

export class RedactionPipeline {
  /**
   * Redact PII/PHI/PCI data from text based on the entity's compliance profile.
   *
   * @param text - The raw text (transcript, message, etc.)
   * @param entityCompliance - Array of compliance profiles for the entity
   *   (e.g., ['HIPAA', 'PCI-DSS', 'GDPR']). If omitted, only universal
   *   patterns (SSN, CC, credentials) are applied.
   * @returns The redacted text and a list of all redactions made.
   */
  redact(text: string, entityCompliance?: string[]): RedactionResult {
    const profiles = new Set(
      (entityCompliance ?? []).map((p) => p.toUpperCase()),
    );
    const redactions: RedactionEntry[] = [];

    // Track which character ranges have already been redacted to avoid overlaps
    const redactedRanges: Array<[number, number]> = [];

    let workingText = text;

    for (const pattern of ALL_PATTERNS) {
      // Skip patterns that require a specific compliance profile the entity doesn't have
      if (
        pattern.requiredProfiles &&
        !pattern.requiredProfiles.some((rp) => profiles.has(rp))
      ) {
        continue;
      }

      // Reset regex lastIndex for global patterns
      pattern.regex.lastIndex = 0;

      // Collect all matches first, then replace (to avoid index shifting issues)
      const matches: Array<{
        match: string;
        index: number;
      }> = [];

      let regexMatch: RegExpExecArray | null;
      while ((regexMatch = pattern.regex.exec(workingText)) !== null) {
        const matchStart = regexMatch.index;
        const matchEnd = matchStart + regexMatch[0].length;

        // Skip if this range overlaps with an already-redacted range
        const overlaps = redactedRanges.some(
          ([rStart, rEnd]) => matchStart < rEnd && matchEnd > rStart,
        );

        if (!overlaps) {
          matches.push({
            match: regexMatch[0],
            index: matchStart,
          });
        }
      }

      // Apply replacements in reverse order to preserve indices
      for (let i = matches.length - 1; i >= 0; i--) {
        const m = matches[i];
        const originalPosition: [number, number] = [
          m.index,
          m.index + m.match.length,
        ];

        redactions.push({
          type: pattern.name,
          original: m.match,
          replacement: pattern.replacement,
          position: originalPosition,
        });

        redactedRanges.push(originalPosition);

        // Replace in working text
        workingText =
          workingText.substring(0, m.index) +
          pattern.replacement +
          workingText.substring(m.index + m.match.length);
      }
    }

    // Sort redactions by position for consistent output
    redactions.sort((a, b) => a.position[0] - b.position[0]);

    return {
      redactedText: workingText,
      redactions,
    };
  }
}

// Singleton export
export const redactionPipeline = new RedactionPipeline();
