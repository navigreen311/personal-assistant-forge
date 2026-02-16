jest.mock('@/lib/db', () => ({
  prisma: {
    rule: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    actionLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import {
  createDLPRule,
  getDLPRules,
  scanContent,
  deleteDLPRule,
  getViolationReport,
} from '@/modules/admin/services/dlp-service';

const mockRule = prisma.rule as jest.Mocked<typeof prisma.rule>;
const mockActionLog = prisma.actionLog as jest.Mocked<typeof prisma.actionLog>;

describe('DLP Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockActionLog.create as jest.Mock).mockResolvedValue({});
  });

  describe('createRule', () => {
    it('should create a rule with condition and action', async () => {
      const mockCreated = {
        id: 'rule-1',
        name: 'SSN Detector',
        scope: 'DLP',
        entityId: 'entity-1',
        condition: { type: 'regex', pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b', dataType: 'CUSTOM', scope: 'ALL' },
        action: { action: 'BLOCK', notify: [] },
        precedence: 0,
        createdBy: 'HUMAN',
        version: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (mockRule.create as jest.Mock).mockResolvedValue(mockCreated);

      const result = await createDLPRule({
        entityId: 'entity-1',
        name: 'SSN Detector',
        pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
        action: 'BLOCK',
        scope: 'ALL',
        isActive: true,
      });

      expect(mockRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            scope: 'DLP',
            name: 'SSN Detector',
          }),
        })
      );
      expect(result.id).toBe('rule-1');
      expect(result.action).toBe('BLOCK');
    });
  });

  describe('scanContent', () => {
    const ssnRule = {
      id: 'rule-ssn',
      name: 'SSN Detector',
      scope: 'DLP',
      entityId: 'entity-1',
      condition: { type: 'regex', pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b', scope: 'ALL' },
      action: { action: 'BLOCK' },
      precedence: 0,
      createdBy: 'HUMAN',
      version: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const ccRule = {
      id: 'rule-cc',
      name: 'CC Detector',
      scope: 'DLP',
      entityId: 'entity-1',
      condition: { type: 'regex', pattern: '\\b\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}\\b', scope: 'ALL' },
      action: { action: 'REDACT' },
      precedence: 0,
      createdBy: 'HUMAN',
      version: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should detect SSN patterns', async () => {
      (mockRule.findMany as jest.Mock).mockResolvedValue([ssnRule]);

      const result = await scanContent('entity-1', 'My SSN is 123-45-6789.');
      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].matchedText).toBe('123-45-6789');
    });

    it('should detect credit card patterns', async () => {
      (mockRule.findMany as jest.Mock).mockResolvedValue([ccRule]);

      const result = await scanContent('entity-1', 'Card: 4111-1111-1111-1111');
      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('should return clean when no violations', async () => {
      (mockRule.findMany as jest.Mock).mockResolvedValue([ssnRule, ccRule]);

      const result = await scanContent('entity-1', 'This is a perfectly clean message.');
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should return all matching violations', async () => {
      (mockRule.findMany as jest.Mock).mockResolvedValue([ssnRule, ccRule]);

      const result = await scanContent(
        'entity-1',
        'SSN: 123-45-6789, Card: 4111-1111-1111-1111'
      );
      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getViolationReport', () => {
    it('should aggregate violations by rule and data type', async () => {
      (mockActionLog.findMany as jest.Mock).mockResolvedValue([
        { id: 'log-1', timestamp: new Date(), reason: 'Found 2 DLP violation(s)' },
        { id: 'log-2', timestamp: new Date(), reason: 'Found 1 DLP violation(s)' },
      ]);

      const result = await getViolationReport('entity-1', {
        start: new Date('2024-01-01'),
        end: new Date('2024-12-31'),
      });

      expect(result.totalViolations).toBe(2);
      expect(Object.keys(result.byRule).length).toBeGreaterThan(0);
    });
  });

  describe('deleteDLPRule', () => {
    it('should soft delete a DLP rule', async () => {
      (mockRule.findUnique as jest.Mock).mockResolvedValue({ id: 'rule-1' });
      (mockRule.update as jest.Mock).mockResolvedValue({ id: 'rule-1', isActive: false });

      await deleteDLPRule('rule-1');
      expect(mockRule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isActive: false },
        })
      );
    });

    it('should throw if rule not found', async () => {
      (mockRule.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(deleteDLPRule('nonexistent')).rejects.toThrow('not found');
    });
  });
});
