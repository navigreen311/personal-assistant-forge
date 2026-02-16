import { v4 as uuidv4 } from 'uuid';

// Mock prisma before importing the service
const mockPrisma = {
  rule: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  actionLog: {
    create: jest.fn().mockResolvedValue({}),
  },
};

jest.mock('@/lib/db', () => ({ prisma: mockPrisma }));

import { createDLPRule, getDLPRules, checkContent, deleteDLPRule, dlpStore } from '@/modules/admin/services/dlp-service';

beforeEach(() => {
  dlpStore.clear();
  jest.clearAllMocks();

  // Make prisma.rule.create return a proper rule object
  mockPrisma.rule.create.mockImplementation(async ({ data }: any) => {
    const id = uuidv4();
    return {
      id,
      name: data.name,
      scope: data.scope,
      entityId: data.entityId,
      condition: data.condition,
      action: data.action,
      isActive: data.isActive,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  // Make prisma.rule.findMany return rules from the dlpStore
  mockPrisma.rule.findMany.mockImplementation(async ({ where }: any) => {
    const rules: any[] = [];
    for (const [, rule] of dlpStore) {
      if (where?.entityId && rule.entityId !== where.entityId) continue;
      rules.push({
        id: rule.id,
        name: rule.name,
        scope: 'DLP',
        entityId: rule.entityId,
        condition: { type: 'regex', pattern: rule.pattern, dataType: 'CUSTOM', scope: rule.scope },
        action: { action: rule.action, notify: [] },
        isActive: rule.isActive,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    return rules;
  });
});

describe('checkContent', () => {
  it('should detect regex pattern matches', async () => {
    await createDLPRule({
      entityId: 'entity-1',
      name: 'SSN Detector',
      pattern: '\\d{3}-\\d{2}-\\d{4}',
      action: 'BLOCK',
      scope: 'ALL',
      isActive: true,
    });

    const result = await checkContent('entity-1', 'My SSN is 123-45-6789', 'ALL');
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBe(1);
    expect(result.violations[0].matchedText).toBe('123-45-6789');
  });

  it('should detect keyword matches', async () => {
    await createDLPRule({
      entityId: 'entity-1',
      name: 'Confidential Detector',
      pattern: 'CONFIDENTIAL',
      action: 'WARN',
      scope: 'ALL',
      isActive: true,
    });

    const result = await checkContent('entity-1', 'This document is CONFIDENTIAL', 'ALL');
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBe(1);
  });

  it('should return all violated rules', async () => {
    await createDLPRule({
      entityId: 'entity-1',
      name: 'Rule 1',
      pattern: 'secret',
      action: 'BLOCK',
      scope: 'ALL',
      isActive: true,
    });
    await createDLPRule({
      entityId: 'entity-1',
      name: 'Rule 2',
      pattern: 'password',
      action: 'WARN',
      scope: 'ALL',
      isActive: true,
    });

    const result = await checkContent('entity-1', 'The secret password is here', 'ALL');
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBe(2);
  });

  it('should pass clean content', async () => {
    await createDLPRule({
      entityId: 'entity-1',
      name: 'SSN Rule',
      pattern: '\\d{3}-\\d{2}-\\d{4}',
      action: 'BLOCK',
      scope: 'ALL',
      isActive: true,
    });

    const result = await checkContent('entity-1', 'This is a normal document with no sensitive data', 'ALL');
    expect(result.passed).toBe(true);
    expect(result.violations.length).toBe(0);
  });

  it('should respect scope filtering', async () => {
    await createDLPRule({
      entityId: 'entity-1',
      name: 'Documents Only',
      pattern: 'restricted',
      action: 'BLOCK',
      scope: 'DOCUMENTS',
      isActive: true,
    });

    const resultDocs = await checkContent('entity-1', 'This is restricted', 'DOCUMENTS');
    expect(resultDocs.passed).toBe(false);

    const resultMessages = await checkContent('entity-1', 'This is restricted', 'OUTBOUND_MESSAGES');
    expect(resultMessages.passed).toBe(true);
  });

  it('should only check active rules', async () => {
    await createDLPRule({
      entityId: 'entity-1',
      name: 'Inactive Rule',
      pattern: 'blocked',
      action: 'BLOCK',
      scope: 'ALL',
      isActive: false,
    });

    const result = await checkContent('entity-1', 'This is blocked content', 'ALL');
    expect(result.passed).toBe(true);
  });
});
