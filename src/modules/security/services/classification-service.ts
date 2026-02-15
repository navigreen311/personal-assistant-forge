// ============================================================================
// Data Classification Service
// Automatic content classification based on patterns, entity compliance
// profiles, and custom rules. Supports HIPAA, GDPR, CCPA, SOX, SEC, PCI.
// ============================================================================

import type {
  DataClassification,
  ClassificationResult,
  ComplianceFlag,
  ClassificationRule,
  ClassificationPattern,
} from '@/modules/security/types';
import prisma from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Pattern constants
// ---------------------------------------------------------------------------

const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/;
const CREDIT_CARD_PATTERN = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/;
const BANK_ACCOUNT_PATTERN = /\b(?:account|routing)\b[^.]{0,30}\b\d{8,17}\b/i;
const MEDICAL_RECORD_PATTERN = /\bMRN[\s:#]?\d{6,10}\b/;
const PASSWORD_PATTERN = /password[\s:=]+\S+/i;
const FINANCIAL_AMOUNT_PATTERN = /\$[\d,]+(?:\.\d{2})?/g;

const HEALTH_TERMS = [
  'diagnosis',
  'medication',
  'prescription',
  'treatment',
  'patient',
  'medical',
  'hospital',
  'physician',
  'surgery',
  'therapy',
  'clinical',
  'symptom',
  'condition',
  'prognosis',
  'immunization',
  'vaccine',
  'allergy',
  'chronic',
  'oncology',
  'radiology',
  'lab result',
  'blood pressure',
  'heart rate',
  'cholesterol',
  'insulin',
  'hemoglobin',
];

const LEGAL_TERMS = [
  'contract',
  'agreement',
  'settlement',
  'litigation',
  'attorney',
  'counsel',
  'deposition',
  'subpoena',
  'arbitration',
  'indemnification',
  'liability',
  'non-disclosure',
  'confidentiality agreement',
];

const BUSINESS_TERMS = [
  'meeting',
  'project',
  'deadline',
  'task',
  'agenda',
  'standup',
  'retrospective',
  'sprint',
  'milestone',
  'deliverable',
  'stakeholder',
];

const MARKETING_TERMS = [
  'campaign',
  'promotion',
  'newsletter',
  'advertisement',
  'public release',
  'press release',
  'marketing',
  'brochure',
  'landing page',
  'social media post',
  'blog post',
  'announcement',
];

const PII_FIELD_NAMES = [
  'ssn',
  'social_security',
  'socialSecurity',
  'date_of_birth',
  'dateOfBirth',
  'dob',
  'drivers_license',
  'driversLicense',
  'passport',
  'tax_id',
  'taxId',
  'national_id',
  'nationalId',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function containsTerms(content: string, terms: string[]): string[] {
  const lower = content.toLowerCase();
  return terms.filter((term) => lower.includes(term.toLowerCase()));
}

function findFinancialAmountsAboveThreshold(
  content: string,
  threshold: number,
): number[] {
  const matches = content.match(FINANCIAL_AMOUNT_PATTERN);
  if (!matches) return [];
  return matches
    .map((m) => parseFloat(m.replace(/[$,]/g, '')))
    .filter((amount) => !isNaN(amount) && amount > threshold);
}

function buildRegexPattern(pattern: ClassificationPattern): RegExp | null {
  if (pattern.type === 'REGEX') {
    try {
      return new RegExp(pattern.value, 'i');
    } catch {
      return null;
    }
  }
  return null;
}

function matchesPattern(
  content: string,
  context: { entityId?: string; dataType?: string; fieldName?: string },
  pattern: ClassificationPattern,
  entityCompliance: string[],
): boolean {
  switch (pattern.type) {
    case 'KEYWORD': {
      return content.toLowerCase().includes(pattern.value.toLowerCase());
    }
    case 'REGEX': {
      const regex = buildRegexPattern(pattern);
      return regex ? regex.test(content) : false;
    }
    case 'FIELD_NAME': {
      return context.fieldName
        ? context.fieldName.toLowerCase() === pattern.value.toLowerCase()
        : false;
    }
    case 'CONTENT_TYPE': {
      return context.dataType
        ? context.dataType.toLowerCase() === pattern.value.toLowerCase()
        : false;
    }
    case 'ENTITY_COMPLIANCE': {
      return entityCompliance.some(
        (c) => c.toLowerCase() === pattern.value.toLowerCase(),
      );
    }
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// ClassificationService
// ---------------------------------------------------------------------------

export class ClassificationService {
  private rules: ClassificationRule[] = [];
  private entityComplianceCache: Map<string, string[]> = new Map();

  constructor() {
    this.initBuiltInRules();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Classify content based on patterns, entity compliance profile, and rules.
   * Performs an async entity lookup (cached) when entityId is provided.
   */
  async classifyContent(
    content: string,
    context: {
      entityId?: string;
      dataType?: string;
      fieldName?: string;
    } = {},
  ): Promise<ClassificationResult> {
    const entityCompliance = context.entityId
      ? await this.getEntityCompliance(context.entityId)
      : [];

    const reasons: string[] = [];
    const regulatoryFlags: ComplianceFlag[] = [];
    let highestClassification: DataClassification = 'PUBLIC';
    let highestPriority = 0;
    let confidence = 0;

    // Evaluate every active rule in priority order (highest first)
    const activeRules = this.rules
      .filter((r) => r.isActive)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of activeRules) {
      const matched = rule.patterns.some((p) =>
        matchesPattern(content, context, p, entityCompliance),
      );

      if (matched && rule.priority > highestPriority) {
        highestClassification = rule.resultClassification;
        highestPriority = rule.priority;
        reasons.push(`Matched rule: ${rule.name}`);
        regulatoryFlags.push(...rule.regulatoryFlags);
      }
    }

    // --- Pattern-based detection (supplements rule evaluation) ---

    // SSN detection
    if (SSN_PATTERN.test(content)) {
      this.elevate('RESTRICTED', 80, highestClassification, highestPriority, {
        classification: (c) => { highestClassification = c; },
        priority: (p) => { highestPriority = p; },
      });
      reasons.push('Contains Social Security Number pattern');
      regulatoryFlags.push({
        regulation: 'CCPA',
        category: 'PII',
        description: 'Social Security Number detected',
        requiredActions: ['encrypt', 'restrict_access', 'audit_log'],
      });
      confidence = Math.max(confidence, 0.95);
    }

    // Credit card detection
    if (CREDIT_CARD_PATTERN.test(content)) {
      this.elevate('RESTRICTED', 80, highestClassification, highestPriority, {
        classification: (c) => { highestClassification = c; },
        priority: (p) => { highestPriority = p; },
      });
      reasons.push('Contains credit card number pattern');
      regulatoryFlags.push({
        regulation: 'PCI',
        category: 'PCI',
        description: 'Credit card number detected',
        requiredActions: ['encrypt', 'mask', 'pci_compliance'],
      });
      confidence = Math.max(confidence, 0.9);
    }

    // Bank account detection
    if (BANK_ACCOUNT_PATTERN.test(content)) {
      this.elevate('RESTRICTED', 80, highestClassification, highestPriority, {
        classification: (c) => { highestClassification = c; },
        priority: (p) => { highestPriority = p; },
      });
      reasons.push('Contains bank account/routing number pattern');
      regulatoryFlags.push({
        regulation: 'SOX',
        category: 'Financial',
        description: 'Bank account or routing number detected',
        requiredActions: ['encrypt', 'restrict_access'],
      });
      confidence = Math.max(confidence, 0.85);
    }

    // Medical record number
    if (MEDICAL_RECORD_PATTERN.test(content)) {
      this.elevate('RESTRICTED', 80, highestClassification, highestPriority, {
        classification: (c) => { highestClassification = c; },
        priority: (p) => { highestPriority = p; },
      });
      reasons.push('Contains medical record number (MRN) pattern');
      regulatoryFlags.push({
        regulation: 'HIPAA',
        category: 'PHI',
        description: 'Medical Record Number detected',
        requiredActions: ['encrypt', 'hipaa_audit', 'restrict_access'],
      });
      confidence = Math.max(confidence, 0.9);
    }

    // Password detection
    if (PASSWORD_PATTERN.test(content)) {
      this.elevate('RESTRICTED', 80, highestClassification, highestPriority, {
        classification: (c) => { highestClassification = c; },
        priority: (p) => { highestPriority = p; },
      });
      reasons.push('Contains password or credential data');
      confidence = Math.max(confidence, 0.85);
    }

    // PII field name detection
    if (
      context.fieldName &&
      PII_FIELD_NAMES.some(
        (f) => f.toLowerCase() === context.fieldName!.toLowerCase(),
      )
    ) {
      this.elevate('RESTRICTED', 80, highestClassification, highestPriority, {
        classification: (c) => { highestClassification = c; },
        priority: (p) => { highestPriority = p; },
      });
      reasons.push(`Field name "${context.fieldName}" indicates PII data`);
      confidence = Math.max(confidence, 0.8);
    }

    // Financial amounts > $1,000
    const largeAmounts = findFinancialAmountsAboveThreshold(content, 1000);
    if (largeAmounts.length > 0) {
      this.elevate('CONFIDENTIAL', 60, highestClassification, highestPriority, {
        classification: (c) => { highestClassification = c; },
        priority: (p) => { highestPriority = p; },
      });
      reasons.push(
        `Contains financial amounts exceeding $1,000: ${largeAmounts
          .map((a) => `$${a.toLocaleString()}`)
          .join(', ')}`,
      );
      regulatoryFlags.push({
        regulation: 'SOX',
        category: 'Financial',
        description: 'Large financial amounts detected',
        requiredActions: ['audit_log', 'restrict_access'],
      });
      confidence = Math.max(confidence, 0.75);
    }

    // Legal terms
    const matchedLegal = containsTerms(content, LEGAL_TERMS);
    if (matchedLegal.length > 0) {
      this.elevate('CONFIDENTIAL', 60, highestClassification, highestPriority, {
        classification: (c) => { highestClassification = c; },
        priority: (p) => { highestPriority = p; },
      });
      reasons.push(
        `Contains legal terminology: ${matchedLegal.join(', ')}`,
      );
      confidence = Math.max(confidence, 0.7);
    }

    // Health terms
    const matchedHealth = containsTerms(content, HEALTH_TERMS);
    if (matchedHealth.length > 0) {
      this.elevate('CONFIDENTIAL', 60, highestClassification, highestPriority, {
        classification: (c) => { highestClassification = c; },
        priority: (p) => { highestPriority = p; },
      });
      reasons.push(
        `Contains health/medical terminology: ${matchedHealth.join(', ')}`,
      );
      confidence = Math.max(confidence, 0.7);

      // HIPAA entity elevation
      if (entityCompliance.includes('HIPAA')) {
        this.elevate('REGULATED', 100, highestClassification, highestPriority, {
          classification: (c) => { highestClassification = c; },
          priority: (p) => { highestPriority = p; },
        });
        reasons.push(
          'Entity has HIPAA compliance profile — health content auto-elevated to REGULATED',
        );
        regulatoryFlags.push({
          regulation: 'HIPAA',
          category: 'PHI',
          description:
            'Content contains health-related terms under HIPAA-regulated entity',
          requiredActions: [
            'encrypt',
            'hipaa_audit',
            'minimum_necessary',
            'access_control',
          ],
        });
        confidence = Math.max(confidence, 0.95);
      }
    }

    // GDPR PII flagging
    if (entityCompliance.includes('GDPR')) {
      const hasPII =
        SSN_PATTERN.test(content) ||
        CREDIT_CARD_PATTERN.test(content) ||
        BANK_ACCOUNT_PATTERN.test(content) ||
        PASSWORD_PATTERN.test(content) ||
        (context.fieldName &&
          PII_FIELD_NAMES.some(
            (f) => f.toLowerCase() === context.fieldName!.toLowerCase(),
          ));

      if (hasPII) {
        this.elevate('REGULATED', 100, highestClassification, highestPriority, {
          classification: (c) => { highestClassification = c; },
          priority: (p) => { highestPriority = p; },
        });
        reasons.push(
          'Entity has GDPR compliance profile — PII content auto-elevated to REGULATED',
        );
        regulatoryFlags.push({
          regulation: 'GDPR',
          category: 'PII',
          description:
            'Personal data detected under GDPR-regulated entity',
          requiredActions: [
            'encrypt',
            'consent_required',
            'right_to_erasure',
            'data_portability',
            'dpo_notification',
          ],
        });
        confidence = Math.max(confidence, 0.95);
      }
    }

    // Business terms (INTERNAL)
    const matchedBusiness = containsTerms(content, BUSINESS_TERMS);
    if (matchedBusiness.length > 0 && highestPriority < 40) {
      highestClassification = 'INTERNAL';
      highestPriority = 40;
      reasons.push(
        `Contains business terminology: ${matchedBusiness.join(', ')}`,
      );
      confidence = Math.max(confidence, 0.6);
    }

    // Marketing terms (PUBLIC)
    const matchedMarketing = containsTerms(content, MARKETING_TERMS);
    if (matchedMarketing.length > 0 && highestPriority < 20) {
      highestClassification = 'PUBLIC';
      highestPriority = 20;
      reasons.push(
        `Contains marketing/public terminology: ${matchedMarketing.join(', ')}`,
      );
      confidence = Math.max(confidence, 0.5);
    }

    // Default when nothing matched
    if (reasons.length === 0) {
      reasons.push('No sensitive patterns detected — defaulting to INTERNAL');
      highestClassification = 'INTERNAL';
      confidence = 0.4;
    }

    // Deduplicate regulatory flags
    const uniqueFlags = this.deduplicateFlags(regulatoryFlags);

    return {
      classification: highestClassification,
      confidence: Math.min(confidence, 1),
      reasons,
      regulatoryFlags: uniqueFlags,
      autoApplied: true,
    };
  }

  /**
   * Classify an existing database record by looking up its content from the
   * appropriate Prisma model.
   */
  async classifyRecord(
    model: string,
    recordId: string,
  ): Promise<ClassificationResult> {
    const record = await this.fetchRecord(model, recordId);

    if (!record) {
      return {
        classification: 'INTERNAL',
        confidence: 0,
        reasons: [`Record not found: ${model}/${recordId}`],
        regulatoryFlags: [],
        autoApplied: false,
      };
    }

    const content = this.extractContent(record);
    const entityId = (record as Record<string, unknown>).entityId as
      | string
      | undefined;

    return this.classifyContent(content, {
      entityId,
      dataType: model,
    });
  }

  /**
   * Add a custom classification rule at runtime.
   */
  addClassificationRule(
    rule: Omit<ClassificationRule, 'id'>,
  ): ClassificationRule {
    const newRule: ClassificationRule = {
      ...rule,
      id: uuidv4(),
    };
    this.rules.push(newRule);
    // Re-sort after insertion so priority ordering is maintained
    this.rules.sort((a, b) => b.priority - a.priority);
    return newRule;
  }

  /**
   * Return all classification rules (built-in + custom).
   */
  getClassificationRules(): ClassificationRule[] {
    return [...this.rules];
  }

  /**
   * Re-classify every record tied to an entity and report changes.
   */
  async reclassifyEntity(
    entityId: string,
  ): Promise<{
    reclassified: number;
    changes: Array<{
      recordId: string;
      oldClassification: string;
      newClassification: string;
    }>;
  }> {
    // Invalidate cache so we get fresh compliance data
    this.entityComplianceCache.delete(entityId);

    const changes: Array<{
      recordId: string;
      oldClassification: string;
      newClassification: string;
    }> = [];
    let reclassified = 0;

    // Gather records from models that hold classifiable content
    const [messages, documents, knowledgeEntries, calls] = await Promise.all([
      prisma.message.findMany({
        where: { entityId },
        select: { id: true, body: true, sensitivity: true },
      }),
      prisma.document.findMany({
        where: { entityId },
        select: { id: true, content: true, title: true, type: true },
      }),
      prisma.knowledgeEntry.findMany({
        where: { entityId },
        select: { id: true, content: true },
      }),
      prisma.call.findMany({
        where: { entityId },
        select: { id: true, transcript: true },
      }),
    ]);

    // Messages
    for (const msg of messages) {
      const result = await this.classifyContent(msg.body, {
        entityId,
        dataType: 'Message',
      });
      reclassified++;
      if (msg.sensitivity !== result.classification) {
        changes.push({
          recordId: msg.id,
          oldClassification: msg.sensitivity,
          newClassification: result.classification,
        });
      }
    }

    // Documents
    for (const doc of documents) {
      const content = doc.content ?? doc.title;
      const result = await this.classifyContent(content, {
        entityId,
        dataType: 'Document',
      });
      reclassified++;
      // Documents don't have a sensitivity field by default; track title-based ID
      const oldClassification = 'INTERNAL'; // default assumption
      if (oldClassification !== result.classification) {
        changes.push({
          recordId: doc.id,
          oldClassification,
          newClassification: result.classification,
        });
      }
    }

    // Knowledge entries
    for (const entry of knowledgeEntries) {
      const result = await this.classifyContent(entry.content, {
        entityId,
        dataType: 'KnowledgeEntry',
      });
      reclassified++;
      const oldClassification = 'INTERNAL';
      if (oldClassification !== result.classification) {
        changes.push({
          recordId: entry.id,
          oldClassification,
          newClassification: result.classification,
        });
      }
    }

    // Calls (transcript)
    for (const call of calls) {
      if (!call.transcript) continue;
      const result = await this.classifyContent(call.transcript, {
        entityId,
        dataType: 'Call',
      });
      reclassified++;
      const oldClassification = 'INTERNAL';
      if (oldClassification !== result.classification) {
        changes.push({
          recordId: call.id,
          oldClassification,
          newClassification: result.classification,
        });
      }
    }

    return { reclassified, changes };
  }

  /**
   * Clear the entity compliance cache (useful after entity updates).
   */
  clearComplianceCache(entityId?: string): void {
    if (entityId) {
      this.entityComplianceCache.delete(entityId);
    } else {
      this.entityComplianceCache.clear();
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Initialize all built-in classification rules ordered by priority.
   */
  private initBuiltInRules(): void {
    // REGULATED (priority 100) — PHI/PII under compliance regimes
    this.rules.push({
      id: uuidv4(),
      name: 'HIPAA Regulated Content',
      patterns: [
        { type: 'ENTITY_COMPLIANCE', value: 'HIPAA' },
      ],
      resultClassification: 'REGULATED',
      regulatoryFlags: [
        {
          regulation: 'HIPAA',
          category: 'PHI',
          description: 'Content under HIPAA-regulated entity',
          requiredActions: ['encrypt', 'hipaa_audit', 'access_control'],
        },
      ],
      priority: 100,
      isActive: true,
    });

    this.rules.push({
      id: uuidv4(),
      name: 'GDPR Regulated Content',
      patterns: [
        { type: 'ENTITY_COMPLIANCE', value: 'GDPR' },
      ],
      resultClassification: 'REGULATED',
      regulatoryFlags: [
        {
          regulation: 'GDPR',
          category: 'PII',
          description: 'Content under GDPR-regulated entity',
          requiredActions: [
            'encrypt',
            'consent_required',
            'right_to_erasure',
            'data_portability',
          ],
        },
      ],
      priority: 100,
      isActive: true,
    });

    // RESTRICTED (priority 80) — SSN, credit cards, bank accounts, MRN, passwords
    this.rules.push({
      id: uuidv4(),
      name: 'Social Security Number',
      patterns: [{ type: 'REGEX', value: '\\b\\d{3}-\\d{2}-\\d{4}\\b' }],
      resultClassification: 'RESTRICTED',
      regulatoryFlags: [
        {
          regulation: 'CCPA',
          category: 'PII',
          description: 'SSN pattern detected',
          requiredActions: ['encrypt', 'restrict_access', 'audit_log'],
        },
      ],
      priority: 80,
      isActive: true,
    });

    this.rules.push({
      id: uuidv4(),
      name: 'Credit Card Number',
      patterns: [
        {
          type: 'REGEX',
          value: '\\b\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}\\b',
        },
      ],
      resultClassification: 'RESTRICTED',
      regulatoryFlags: [
        {
          regulation: 'PCI',
          category: 'PCI',
          description: 'Credit card number detected',
          requiredActions: ['encrypt', 'mask', 'pci_compliance'],
        },
      ],
      priority: 80,
      isActive: true,
    });

    this.rules.push({
      id: uuidv4(),
      name: 'Bank Account / Routing Number',
      patterns: [
        {
          type: 'REGEX',
          value: '\\b(?:account|routing)\\b[^.]{0,30}\\b\\d{8,17}\\b',
        },
      ],
      resultClassification: 'RESTRICTED',
      regulatoryFlags: [
        {
          regulation: 'SOX',
          category: 'Financial',
          description: 'Bank account or routing number detected',
          requiredActions: ['encrypt', 'restrict_access'],
        },
      ],
      priority: 80,
      isActive: true,
    });

    this.rules.push({
      id: uuidv4(),
      name: 'Medical Record Number',
      patterns: [{ type: 'REGEX', value: '\\bMRN[\\s:#]?\\d{6,10}\\b' }],
      resultClassification: 'RESTRICTED',
      regulatoryFlags: [
        {
          regulation: 'HIPAA',
          category: 'PHI',
          description: 'Medical Record Number detected',
          requiredActions: ['encrypt', 'hipaa_audit', 'restrict_access'],
        },
      ],
      priority: 80,
      isActive: true,
    });

    this.rules.push({
      id: uuidv4(),
      name: 'Password / Credential',
      patterns: [{ type: 'REGEX', value: 'password[\\s:=]+\\S+' }],
      resultClassification: 'RESTRICTED',
      regulatoryFlags: [],
      priority: 80,
      isActive: true,
    });

    // CONFIDENTIAL (priority 60) — financial data, legal, personnel
    this.rules.push({
      id: uuidv4(),
      name: 'Financial Data (Large Amounts)',
      patterns: [{ type: 'REGEX', value: '\\$[\\d,]+(?:\\.\\d{2})?' }],
      resultClassification: 'CONFIDENTIAL',
      regulatoryFlags: [
        {
          regulation: 'SOX',
          category: 'Financial',
          description: 'Financial amounts detected',
          requiredActions: ['audit_log', 'restrict_access'],
        },
      ],
      priority: 60,
      isActive: true,
    });

    this.rules.push({
      id: uuidv4(),
      name: 'Legal Documents',
      patterns: LEGAL_TERMS.map((term) => ({
        type: 'KEYWORD' as const,
        value: term,
      })),
      resultClassification: 'CONFIDENTIAL',
      regulatoryFlags: [],
      priority: 60,
      isActive: true,
    });

    this.rules.push({
      id: uuidv4(),
      name: 'Personnel / HR Data',
      patterns: [
        { type: 'KEYWORD', value: 'salary' },
        { type: 'KEYWORD', value: 'compensation' },
        { type: 'KEYWORD', value: 'performance review' },
        { type: 'KEYWORD', value: 'termination' },
        { type: 'KEYWORD', value: 'disciplinary' },
        { type: 'KEYWORD', value: 'employee record' },
      ],
      resultClassification: 'CONFIDENTIAL',
      regulatoryFlags: [],
      priority: 60,
      isActive: true,
    });

    // INTERNAL (priority 40) — business communications, project data
    this.rules.push({
      id: uuidv4(),
      name: 'Business Communications',
      patterns: BUSINESS_TERMS.map((term) => ({
        type: 'KEYWORD' as const,
        value: term,
      })),
      resultClassification: 'INTERNAL',
      regulatoryFlags: [],
      priority: 40,
      isActive: true,
    });

    // PUBLIC (priority 20) — marketing, published content
    this.rules.push({
      id: uuidv4(),
      name: 'Marketing / Public Content',
      patterns: MARKETING_TERMS.map((term) => ({
        type: 'KEYWORD' as const,
        value: term,
      })),
      resultClassification: 'PUBLIC',
      regulatoryFlags: [],
      priority: 20,
      isActive: true,
    });
  }

  /**
   * Fetch and cache the compliance profile for an entity.
   */
  private async getEntityCompliance(entityId: string): Promise<string[]> {
    const cached = this.entityComplianceCache.get(entityId);
    if (cached) return cached;

    try {
      const entity = await prisma.entity.findUnique({
        where: { id: entityId },
        select: { complianceProfile: true },
      });

      const profile = entity?.complianceProfile ?? [];
      this.entityComplianceCache.set(entityId, profile);
      return profile;
    } catch {
      return [];
    }
  }

  /**
   * Conditionally elevate the classification and priority when the candidate
   * level outranks the current one.
   */
  private elevate(
    candidateClassification: DataClassification,
    candidatePriority: number,
    currentClassification: DataClassification,
    currentPriority: number,
    setters: {
      classification: (c: DataClassification) => void;
      priority: (p: number) => void;
    },
  ): void {
    if (candidatePriority > currentPriority) {
      setters.classification(candidateClassification);
      setters.priority(candidatePriority);
    }
  }

  /**
   * Fetch a record from the database using the model name as a discriminator.
   */
  private async fetchRecord(
    model: string,
    recordId: string,
  ): Promise<Record<string, unknown> | null> {
    const normalizedModel = model.toLowerCase();

    switch (normalizedModel) {
      case 'message':
        return prisma.message.findUnique({ where: { id: recordId } }) as Promise<Record<string, unknown> | null>;
      case 'document':
        return prisma.document.findUnique({ where: { id: recordId } }) as Promise<Record<string, unknown> | null>;
      case 'knowledgeentry':
        return prisma.knowledgeEntry.findUnique({ where: { id: recordId } }) as Promise<Record<string, unknown> | null>;
      case 'call':
        return prisma.call.findUnique({ where: { id: recordId } }) as Promise<Record<string, unknown> | null>;
      case 'contact':
        return prisma.contact.findUnique({ where: { id: recordId } }) as Promise<Record<string, unknown> | null>;
      case 'task':
        return prisma.task.findUnique({ where: { id: recordId } }) as Promise<Record<string, unknown> | null>;
      case 'financialrecord':
        return prisma.financialRecord.findUnique({ where: { id: recordId } }) as Promise<Record<string, unknown> | null>;
      default:
        return null;
    }
  }

  /**
   * Extract classifiable text content from a generic database record.
   */
  private extractContent(record: Record<string, unknown>): string {
    const parts: string[] = [];

    // Collect all string fields that are likely to hold content
    const contentFields = [
      'body',
      'content',
      'transcript',
      'description',
      'title',
      'subject',
      'name',
    ];

    for (const field of contentFields) {
      const value = record[field];
      if (typeof value === 'string' && value.length > 0) {
        parts.push(value);
      }
    }

    return parts.join(' ');
  }

  /**
   * Deduplicate compliance flags by regulation + category.
   */
  private deduplicateFlags(flags: ComplianceFlag[]): ComplianceFlag[] {
    const seen = new Set<string>();
    const unique: ComplianceFlag[] = [];

    for (const flag of flags) {
      const key = `${flag.regulation}:${flag.category}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(flag);
      }
    }

    return unique;
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const classificationService = new ClassificationService();
