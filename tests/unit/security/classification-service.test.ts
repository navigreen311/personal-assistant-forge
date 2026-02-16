// ============================================================================
// ClassificationService — Unit Tests
// ============================================================================

import { ClassificationService } from '@/modules/security/services/classification-service';

// Mock prisma — the classification service imports `prisma` as the default
// export from `@/lib/db`.
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    entity: { findUnique: jest.fn() },
    message: { findMany: jest.fn() },
    document: { findMany: jest.fn() },
    knowledgeEntry: { findMany: jest.fn() },
    call: { findMany: jest.fn() },
  },
  prisma: {
    entity: { findUnique: jest.fn() },
    message: { findMany: jest.fn() },
    document: { findMany: jest.fn() },
    knowledgeEntry: { findMany: jest.fn() },
    call: { findMany: jest.fn() },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const prisma = require('@/lib/db').default;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freshService(): ClassificationService {
  return new ClassificationService();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClassificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // SSN detection
  // -----------------------------------------------------------------------
  describe('classifyContent — SSN detection', () => {
    it('should classify content with SSN as RESTRICTED', async () => {
      const svc = freshService();
      const result = await svc.classifyContent('My SSN is 123-45-6789');

      expect(result.classification).toBe('RESTRICTED');
      expect(result.reasons.join(' ')).toMatch(/Social Security Number/i);
      expect(
        result.regulatoryFlags.some((f) => f.regulation === 'CCPA'),
      ).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Credit card detection
  // -----------------------------------------------------------------------
  describe('classifyContent — Credit card detection', () => {
    it('should classify content with a credit card number as RESTRICTED', async () => {
      const svc = freshService();
      const result = await svc.classifyContent(
        'card: 4111-1111-1111-1234',
      );

      expect(result.classification).toBe('RESTRICTED');
      expect(result.reasons.join(' ')).toMatch(/credit card/i);
      expect(
        result.regulatoryFlags.some((f) => f.regulation === 'PCI'),
      ).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Medical Record Number detection
  // -----------------------------------------------------------------------
  describe('classifyContent — MRN detection', () => {
    it('should classify content with a medical record number as RESTRICTED', async () => {
      const svc = freshService();
      const result = await svc.classifyContent('MRN#1234567');

      expect(result.classification).toBe('RESTRICTED');
      expect(result.reasons.join(' ')).toMatch(/medical record/i);
      expect(
        result.regulatoryFlags.some((f) => f.regulation === 'HIPAA'),
      ).toBe(true);
    });

    it('should elevate MRN content to REGULATED for HIPAA entities', async () => {
      // Mock entity lookup to return HIPAA compliance profile
      prisma.entity.findUnique.mockResolvedValue({
        complianceProfile: ['HIPAA'],
      });

      const svc = freshService();
      // MRN#1234567 triggers both the MRN pattern AND the HIPAA entity rule
      // but MRN itself is not a health term — we need health terms for HIPAA
      // elevation. Let's include a health term alongside MRN.
      const result = await svc.classifyContent(
        'Patient MRN#1234567 with diagnosis pending',
        { entityId: 'entity-hipaa-1' },
      );

      expect(result.classification).toBe('REGULATED');
      expect(result.reasons.join(' ')).toMatch(/HIPAA/i);
    });
  });

  // -----------------------------------------------------------------------
  // Financial data (over $1,000)
  // -----------------------------------------------------------------------
  describe('classifyContent — Financial data above threshold', () => {
    it('should classify content with amounts >$1,000 as CONFIDENTIAL', async () => {
      const svc = freshService();
      const result = await svc.classifyContent('Invoice for $5,000.00');

      expect(result.classification).toBe('CONFIDENTIAL');
      expect(result.reasons.join(' ')).toMatch(/financial amount/i);
      expect(
        result.regulatoryFlags.some((f) => f.regulation === 'SOX'),
      ).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Business / INTERNAL classification
  // -----------------------------------------------------------------------
  describe('classifyContent — Business email content', () => {
    it('should classify typical business content as INTERNAL', async () => {
      const svc = freshService();
      const result = await svc.classifyContent(
        "Let's discuss the project deadline in our meeting",
      );

      expect(result.classification).toBe('INTERNAL');
      expect(result.reasons.join(' ')).toMatch(/business/i);
    });
  });

  // -----------------------------------------------------------------------
  // Marketing / PUBLIC classification
  // -----------------------------------------------------------------------
  describe('classifyContent — Marketing content', () => {
    it('should classify marketing content as PUBLIC', async () => {
      const svc = freshService();
      const result = await svc.classifyContent(
        'Check out our new campaign and newsletter',
      );

      expect(result.classification).toBe('PUBLIC');
      expect(result.reasons.join(' ')).toMatch(/marketing|public/i);
    });
  });

  // -----------------------------------------------------------------------
  // HIPAA entity elevation for health terms
  // -----------------------------------------------------------------------
  describe('classifyContent — HIPAA entity with health terms', () => {
    it('should elevate health-related content to REGULATED for HIPAA entity', async () => {
      prisma.entity.findUnique.mockResolvedValue({
        complianceProfile: ['HIPAA'],
      });

      const svc = freshService();
      const result = await svc.classifyContent(
        'Patient diagnosis shows treatment for chronic condition',
        { entityId: 'entity-hipaa-2' },
      );

      expect(result.classification).toBe('REGULATED');
      expect(result.reasons.join(' ')).toMatch(/HIPAA/);
      expect(result.reasons.join(' ')).toMatch(/health/i);
      expect(
        result.regulatoryFlags.some(
          (f) => f.regulation === 'HIPAA' && f.category === 'PHI',
        ),
      ).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.95);
    });
  });

  // -----------------------------------------------------------------------
  // Confidence and reasons are present
  // -----------------------------------------------------------------------
  describe('classifyContent — result structure', () => {
    it('should return confidence and reasons in every result', async () => {
      const svc = freshService();

      // Restricted content
      const restricted = await svc.classifyContent(
        'My SSN is 123-45-6789',
      );
      expect(typeof restricted.confidence).toBe('number');
      expect(restricted.confidence).toBeGreaterThan(0);
      expect(restricted.confidence).toBeLessThanOrEqual(1);
      expect(restricted.reasons.length).toBeGreaterThan(0);
      expect(restricted.autoApplied).toBe(true);

      // Default (no patterns)
      const svc2 = freshService();
      const defaultResult = await svc2.classifyContent('hello world');
      expect(typeof defaultResult.confidence).toBe('number');
      expect(defaultResult.reasons.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Multiple regulatory flags
  // -----------------------------------------------------------------------
  describe('classifyContent — multiple regulatory flags', () => {
    it('should detect multiple regulatory flags for content with SSN and credit card', async () => {
      const svc = freshService();
      const result = await svc.classifyContent(
        'SSN: 123-45-6789, Card: 4111-1111-1111-1234',
      );

      expect(result.classification).toBe('RESTRICTED');

      const regulations = result.regulatoryFlags.map((f) => f.regulation);
      expect(regulations).toContain('CCPA');
      expect(regulations).toContain('PCI');
    });

    it('should detect HIPAA and GDPR flags when both compliance profiles apply', async () => {
      prisma.entity.findUnique.mockResolvedValue({
        complianceProfile: ['HIPAA', 'GDPR'],
      });

      const svc = freshService();
      const result = await svc.classifyContent(
        'Patient SSN 123-45-6789 with diagnosis pending',
        { entityId: 'entity-multi-compliance' },
      );

      expect(result.classification).toBe('REGULATED');

      const regulations = result.regulatoryFlags.map((f) => f.regulation);
      expect(regulations).toContain('HIPAA');
      expect(regulations).toContain('GDPR');
    });
  });

  // -----------------------------------------------------------------------
  // addClassificationRule — custom rule
  // -----------------------------------------------------------------------
  describe('addClassificationRule', () => {
    it('should add a custom rule that takes effect on classification', async () => {
      const svc = freshService();

      svc.addClassificationRule({
        name: 'Custom Secret Word',
        patterns: [{ type: 'KEYWORD', value: 'ultrasecret' }],
        resultClassification: 'RESTRICTED',
        regulatoryFlags: [],
        priority: 90,
        isActive: true,
      });

      const result = await svc.classifyContent(
        'This message is ultrasecret and must not leak',
      );

      expect(result.classification).toBe('RESTRICTED');
      expect(result.reasons.join(' ')).toMatch(/Custom Secret Word/);
    });

    it('should respect priority ordering when adding custom rules', async () => {
      const svc = freshService();

      // Add a low-priority custom rule
      svc.addClassificationRule({
        name: 'Low Priority Flag',
        patterns: [{ type: 'KEYWORD', value: 'flagword' }],
        resultClassification: 'CONFIDENTIAL',
        regulatoryFlags: [],
        priority: 50,
        isActive: true,
      });

      // Add a high-priority custom rule
      svc.addClassificationRule({
        name: 'High Priority Flag',
        patterns: [{ type: 'KEYWORD', value: 'flagword' }],
        resultClassification: 'RESTRICTED',
        regulatoryFlags: [],
        priority: 95,
        isActive: true,
      });

      const result = await svc.classifyContent(
        'This content has the flagword in it',
      );

      // The higher-priority rule should win
      expect(result.classification).toBe('RESTRICTED');
      expect(result.reasons.join(' ')).toMatch(/High Priority Flag/);

      // Verify rules are stored in priority order
      const rules = svc.getClassificationRules();
      for (let i = 1; i < rules.length; i++) {
        expect(rules[i - 1].priority).toBeGreaterThanOrEqual(rules[i].priority);
      }
    });

    it('should return the created rule with an assigned id', () => {
      const svc = freshService();

      const created = svc.addClassificationRule({
        name: 'Test Rule',
        patterns: [{ type: 'KEYWORD', value: 'testrule' }],
        resultClassification: 'INTERNAL',
        regulatoryFlags: [],
        priority: 30,
        isActive: true,
      });

      expect(created.id).toBeDefined();
      expect(typeof created.id).toBe('string');
      expect(created.id.length).toBeGreaterThan(0);
      expect(created.name).toBe('Test Rule');
    });
  });

  // -----------------------------------------------------------------------
  // Default classification (no patterns matched)
  // -----------------------------------------------------------------------
  describe('classifyContent — default classification', () => {
    it('should default to INTERNAL when no patterns match', async () => {
      const svc = freshService();
      const result = await svc.classifyContent(
        'absolutely nothing sensitive here just random words',
      );

      expect(result.classification).toBe('INTERNAL');
      expect(result.reasons.join(' ')).toMatch(/no sensitive patterns/i);
      expect(result.confidence).toBe(0.4);
    });
  });
});
