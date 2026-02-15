// ============================================================================
// PII/PHI/PCI Auto-Redaction Service
// Detects and redacts sensitive data (SSN, credit cards, medical records, etc.)
// from arbitrary text content using pattern-based scanning.
// ============================================================================

import type {
  SensitiveDataMatch,
  SensitiveDataType,
  RedactionResult,
} from '@/modules/security/types';

// ---------------------------------------------------------------------------
// Category mappings
// ---------------------------------------------------------------------------

type SensitiveCategory = 'PII' | 'PHI' | 'PCI' | 'FINANCIAL';

const CATEGORY_MAP: Record<SensitiveDataType, SensitiveCategory> = {
  SSN: 'PII',
  DRIVERS_LICENSE: 'PII',
  PASSPORT: 'PII',
  DOB: 'PII',
  PHONE: 'PII',
  EMAIL: 'PII',
  ADDRESS: 'PII',
  IP_ADDRESS: 'PII',
  TAX_ID: 'PII',
  MEDICAL_RECORD_NUMBER: 'PHI',
  DIAGNOSIS: 'PHI',
  MEDICATION: 'PHI',
  HEALTH_CONDITION: 'PHI',
  INSURANCE_ID: 'PHI',
  BIOMETRIC: 'PHI',
  GENETIC: 'PHI',
  CREDIT_CARD: 'PCI',
  BANK_ACCOUNT: 'FINANCIAL',
};

// ---------------------------------------------------------------------------
// Pattern registry entry
// ---------------------------------------------------------------------------

interface PatternEntry {
  type: SensitiveDataType;
  category: SensitiveCategory;
  regex: RegExp;
  redactor: (match: string) => string;
  confidence: number;
  contextRequired?: {
    keywords: string[];
    windowChars: number;
  };
}

// ---------------------------------------------------------------------------
// Keyword lists for medical detection
// ---------------------------------------------------------------------------

const DIAGNOSIS_KEYWORDS: string[] = [
  'diabetes',
  'hypertension',
  'cancer',
  'HIV',
  'AIDS',
  'asthma',
  'COPD',
  'depression',
  'anxiety',
  'bipolar',
  'schizophrenia',
  'epilepsy',
  'alzheimer',
  'parkinson',
  'arthritis',
  'hepatitis',
  'tuberculosis',
  'pneumonia',
  'leukemia',
  'lymphoma',
  'melanoma',
  'fibromyalgia',
  'lupus',
  'cirrhosis',
  'anemia',
  'dementia',
  'autism',
  'PTSD',
  'OCD',
  'ADHD',
];

const MEDICATION_KEYWORDS: string[] = [
  'metformin',
  'lisinopril',
  'atorvastatin',
  'amlodipine',
  'metoprolol',
  'omeprazole',
  'losartan',
  'gabapentin',
  'hydrochlorothiazide',
  'sertraline',
  'fluoxetine',
  'alprazolam',
  'amoxicillin',
  'azithromycin',
  'ciprofloxacin',
  'prednisone',
  'ibuprofen',
  'acetaminophen',
  'warfarin',
  'insulin',
  'levothyroxine',
  'simvastatin',
  'pantoprazole',
  'escitalopram',
  'citalopram',
  'duloxetine',
  'venlafaxine',
  'tramadol',
  'oxycodone',
  'morphine',
];

// ---------------------------------------------------------------------------
// Redaction helpers
// ---------------------------------------------------------------------------

function redactSSN(): string {
  return '***-**-****';
}

function redactCreditCard(match: string): string {
  const digitsOnly = match.replace(/[\s-]/g, '');
  const lastFour = digitsOnly.slice(-4);
  return `****-****-****-${lastFour}`;
}

function redactBankAccount(): string {
  return '********';
}

function redactPhone(match: string): string {
  const digitsOnly = match.replace(/[^\d]/g, '');
  const lastFour = digitsOnly.slice(-4);
  return `(***) ***-${lastFour}`;
}

function redactEmail(match: string): string {
  const atIndex = match.indexOf('@');
  if (atIndex <= 0) return '***@***.***';
  const firstChar = match[0];
  const domain = match.slice(atIndex + 1);
  return `${firstChar}***@${domain}`;
}

function redactDOB(): string {
  return '**/**/****';
}

function redactMRN(): string {
  return 'MRN:******';
}

function redactMedical(): string {
  return '[REDACTED_MEDICAL]';
}

function redactIPAddress(): string {
  return '***.***.***.***';
}

function redactDriversLicense(): string {
  return 'DL:********';
}

function redactAddress(): string {
  return '[REDACTED_ADDRESS]';
}

// ---------------------------------------------------------------------------
// Pattern registry
// ---------------------------------------------------------------------------

const PATTERN_REGISTRY: PatternEntry[] = [
  // SSN
  {
    type: 'SSN',
    category: 'PII',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    redactor: redactSSN,
    confidence: 0.95,
  },

  // Credit Card
  {
    type: 'CREDIT_CARD',
    category: 'PCI',
    regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    redactor: redactCreditCard,
    confidence: 0.9,
  },

  // Bank Account (context-dependent: near "account" or "routing")
  {
    type: 'BANK_ACCOUNT',
    category: 'FINANCIAL',
    regex: /\b\d{8,17}\b/g,
    redactor: redactBankAccount,
    confidence: 0.75,
    contextRequired: {
      keywords: ['account', 'routing'],
      windowChars: 50,
    },
  },

  // Phone
  {
    type: 'PHONE',
    category: 'PII',
    regex: /\b(\+1)?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
    redactor: redactPhone,
    confidence: 0.85,
  },

  // Email
  {
    type: 'EMAIL',
    category: 'PII',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    redactor: redactEmail,
    confidence: 0.95,
  },

  // DOB (context-dependent: near "born", "birthday", "DOB", "date of birth")
  {
    type: 'DOB',
    category: 'PII',
    regex: /\b(?:\d{1,2}[/\-.]?\d{1,2}[/\-.]?\d{2,4}|\d{4}[/\-.]\d{1,2}[/\-.]\d{1,2})\b/g,
    redactor: redactDOB,
    confidence: 0.8,
    contextRequired: {
      keywords: ['born', 'birthday', 'dob', 'date of birth'],
      windowChars: 50,
    },
  },

  // Medical Record Number
  {
    type: 'MEDICAL_RECORD_NUMBER',
    category: 'PHI',
    regex: /\bMRN[\s:#]?\d{6,10}\b/gi,
    redactor: redactMRN,
    confidence: 0.95,
  },

  // Diagnosis keywords
  {
    type: 'DIAGNOSIS',
    category: 'PHI',
    regex: new RegExp(`\\b(?:${DIAGNOSIS_KEYWORDS.join('|')})\\b`, 'gi'),
    redactor: redactMedical,
    confidence: 0.85,
  },

  // Medication keywords
  {
    type: 'MEDICATION',
    category: 'PHI',
    regex: new RegExp(`\\b(?:${MEDICATION_KEYWORDS.join('|')})\\b`, 'gi'),
    redactor: redactMedical,
    confidence: 0.85,
  },

  // IP Address
  {
    type: 'IP_ADDRESS',
    category: 'PII',
    regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    redactor: redactIPAddress,
    confidence: 0.8,
  },

  // Driver's License (common US state patterns)
  {
    type: 'DRIVERS_LICENSE',
    category: 'PII',
    regex:
      /\b(?:DL|D\.L\.|driver'?s?\s*license|license\s*#?)\s*:?\s*#?\s*[A-Z]?\d{4,12}\b/gi,
    redactor: redactDriversLicense,
    confidence: 0.7,
  },

  // Address (number + street + city/state/zip)
  {
    type: 'ADDRESS',
    category: 'PII',
    regex:
      /\b\d+\s+[\w\s]+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Road|Rd|Lane|Ln|Court|Ct|Way|Place|Pl)[\s,]+[\w\s]+,?\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/gi,
    redactor: redactAddress,
    confidence: 0.8,
  },
];

// ---------------------------------------------------------------------------
// Redaction options
// ---------------------------------------------------------------------------

interface RedactionOptions {
  preserveFormat?: boolean;
  redactionChar?: string;
  categories?: SensitiveCategory[];
}

// ---------------------------------------------------------------------------
// Redaction statistics
// ---------------------------------------------------------------------------

interface RedactionStats {
  totalRedacted: number;
  byCategory: Record<string, number>;
  byType: Record<string, number>;
}

// ---------------------------------------------------------------------------
// RedactionService
// ---------------------------------------------------------------------------

export class RedactionService {
  private stats: RedactionStats = {
    totalRedacted: 0,
    byCategory: {},
    byType: {},
  };

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Scan content for sensitive data and return the redacted text along with
   * details about every match found.
   */
  redactContent(content: string, options?: RedactionOptions): RedactionResult {
    const matches = this.collectMatches(content, options?.categories);

    // Sort matches by startIndex descending so we can replace from end to
    // start without invalidating earlier indices.
    const sorted = [...matches].sort((a, b) => b.startIndex - a.startIndex);

    let redacted = content;

    for (const match of sorted) {
      const replacement =
        options?.preserveFormat && options?.redactionChar
          ? options.redactionChar.repeat(match.value.length)
          : match.redactedValue;

      redacted =
        redacted.slice(0, match.startIndex) +
        replacement +
        redacted.slice(match.endIndex);
    }

    // Update cumulative stats
    this.updateStats(matches);

    // Derive unique categories
    const categories = [...new Set(matches.map((m) => m.category))];

    return {
      originalLength: content.length,
      redactedText: redacted,
      matches,
      matchCount: matches.length,
      categories,
    };
  }

  /**
   * Aggressive redaction intended for content that will be indexed or stored
   * in search systems. All PII/PHI/PCI/FINANCIAL data is removed.
   */
  redactForIndexing(content: string): string {
    const { redactedText } = this.redactContent(content);
    return redactedText;
  }

  /**
   * Detect sensitive data without performing any redaction. Useful for
   * classification and risk-scoring workflows.
   */
  detectSensitiveData(content: string): SensitiveDataMatch[] {
    return this.collectMatches(content);
  }

  /**
   * Return cumulative redaction statistics gathered over the lifetime of
   * this service instance.
   */
  getRedactionStats(): {
    totalRedacted: number;
    byCategory: Record<string, number>;
    byType: Record<string, number>;
  } {
    return {
      totalRedacted: this.stats.totalRedacted,
      byCategory: { ...this.stats.byCategory },
      byType: { ...this.stats.byType },
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Run every pattern in the registry against `content` and return all
   * non-overlapping matches. When `categories` is provided only patterns
   * belonging to one of the listed categories are evaluated.
   */
  private collectMatches(
    content: string,
    categories?: SensitiveCategory[]
  ): SensitiveDataMatch[] {
    const matches: SensitiveDataMatch[] = [];
    const coveredRanges: Array<{ start: number; end: number }> = [];

    for (const pattern of PATTERN_REGISTRY) {
      // Skip patterns not in the requested categories
      if (categories && categories.length > 0) {
        if (!categories.includes(pattern.category)) continue;
      }

      // Reset regex lastIndex (global flag)
      pattern.regex.lastIndex = 0;

      let regexMatch: RegExpExecArray | null;

      while ((regexMatch = pattern.regex.exec(content)) !== null) {
        const matchedText = regexMatch[0];
        const startIndex = regexMatch.index;
        const endIndex = startIndex + matchedText.length;

        // Context check: some patterns only apply near specific keywords
        if (pattern.contextRequired) {
          if (
            !this.hasContext(
              content,
              startIndex,
              endIndex,
              pattern.contextRequired.keywords,
              pattern.contextRequired.windowChars
            )
          ) {
            continue;
          }
        }

        // Skip overlapping matches
        if (this.overlaps(coveredRanges, startIndex, endIndex)) {
          continue;
        }

        coveredRanges.push({ start: startIndex, end: endIndex });

        matches.push({
          type: pattern.type,
          category: CATEGORY_MAP[pattern.type],
          value: matchedText,
          redactedValue: pattern.redactor(matchedText),
          startIndex,
          endIndex,
          confidence: pattern.confidence,
        });
      }
    }

    // Return matches sorted by startIndex ascending (natural reading order)
    return matches.sort((a, b) => a.startIndex - b.startIndex);
  }

  /**
   * Check whether any of the given keywords appear within `windowChars`
   * characters of the matched region `[start, end)`.
   */
  private hasContext(
    content: string,
    start: number,
    end: number,
    keywords: string[],
    windowChars: number
  ): boolean {
    const windowStart = Math.max(0, start - windowChars);
    const windowEnd = Math.min(content.length, end + windowChars);
    const surrounding = content.slice(windowStart, windowEnd).toLowerCase();

    return keywords.some((kw) => surrounding.includes(kw.toLowerCase()));
  }

  /**
   * Return `true` if the range `[start, end)` overlaps with any already
   * covered range.
   */
  private overlaps(
    ranges: Array<{ start: number; end: number }>,
    start: number,
    end: number
  ): boolean {
    return ranges.some(
      (r) => start < r.end && end > r.start
    );
  }

  /**
   * Accumulate match counts into the internal stats object.
   */
  private updateStats(matches: SensitiveDataMatch[]): void {
    for (const m of matches) {
      this.stats.totalRedacted += 1;
      this.stats.byCategory[m.category] =
        (this.stats.byCategory[m.category] ?? 0) + 1;
      this.stats.byType[m.type] =
        (this.stats.byType[m.type] ?? 0) + 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const redactionService = new RedactionService();
