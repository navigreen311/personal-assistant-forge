import { v4 as uuidv4 } from 'uuid';
import type { MockedDelegates } from '../../support/prisma-mock';

/** The columns the DLP service supplies when it writes a Rule row. */
type RuleInput = {
  name?: string;
  scope?: string;
  entityId?: string;
  condition?: unknown;
  action?: unknown;
  isActive?: boolean;
};

/** The Rule row this fake hands back. */
interface RuleRow {
  id: string;
  name: string;
  scope: string;
  entityId: string;
  condition: unknown;
  action: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Mock prisma before importing the service
/**
 * P-35: the delegate/method names in the literal below were unconstrained, and
 * the `mockImplementation` args were `any`. `MockedDelegates` binds the names
 * to the real client (see tests/support/prisma-mock.ts) and the arg types name
 * the fields this fake actually reads, so the mock states an interface instead
 * of asserting nothing.
 */
const mockPrisma: MockedDelegates<'rule' | 'actionLog'> = {
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
import { verifiedEntityIdForTest } from '../../helpers/factories';

beforeEach(() => {
  dlpStore.clear();
  jest.clearAllMocks();

  // Make prisma.rule.create return a proper rule object
  mockPrisma.rule.create!.mockImplementation(async ({ data }: { data: RuleInput }) => {
    const id = uuidv4();
    const row: RuleRow = {
      id,
      name: data.name ?? '',
      scope: data.scope ?? '',
      entityId: data.entityId ?? '',
      condition: data.condition,
      action: data.action,
      isActive: data.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return row;
  });

  // Make prisma.rule.findMany return rules from the dlpStore
  mockPrisma.rule.findMany!.mockImplementation(async ({ where }: { where?: { entityId?: string } }) => {
    const rules: RuleRow[] = [];
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
      entityId: verifiedEntityIdForTest('entity-1'),
      name: 'SSN Detector',
      pattern: '\\d{3}-\\d{2}-\\d{4}',
      action: 'BLOCK',
      scope: 'ALL',
      isActive: true,
    });

    const result = await checkContent(verifiedEntityIdForTest('entity-1'), 'My SSN is 123-45-6789', 'ALL');
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBe(1);
    expect(result.violations[0].matchedText).toBe('123-45-6789');
  });

  it('should detect keyword matches', async () => {
    await createDLPRule({
      entityId: verifiedEntityIdForTest('entity-1'),
      name: 'Confidential Detector',
      pattern: 'CONFIDENTIAL',
      action: 'WARN',
      scope: 'ALL',
      isActive: true,
    });

    const result = await checkContent(verifiedEntityIdForTest('entity-1'), 'This document is CONFIDENTIAL', 'ALL');
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBe(1);
  });

  it('should return all violated rules', async () => {
    await createDLPRule({
      entityId: verifiedEntityIdForTest('entity-1'),
      name: 'Rule 1',
      pattern: 'secret',
      action: 'BLOCK',
      scope: 'ALL',
      isActive: true,
    });
    await createDLPRule({
      entityId: verifiedEntityIdForTest('entity-1'),
      name: 'Rule 2',
      pattern: 'password',
      action: 'WARN',
      scope: 'ALL',
      isActive: true,
    });

    const result = await checkContent(verifiedEntityIdForTest('entity-1'), 'The secret password is here', 'ALL');
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBe(2);
  });

  it('should pass clean content', async () => {
    await createDLPRule({
      entityId: verifiedEntityIdForTest('entity-1'),
      name: 'SSN Rule',
      pattern: '\\d{3}-\\d{2}-\\d{4}',
      action: 'BLOCK',
      scope: 'ALL',
      isActive: true,
    });

    const result = await checkContent(verifiedEntityIdForTest('entity-1'), 'This is a normal document with no sensitive data', 'ALL');
    expect(result.passed).toBe(true);
    expect(result.violations.length).toBe(0);
  });

  it('should respect scope filtering', async () => {
    await createDLPRule({
      entityId: verifiedEntityIdForTest('entity-1'),
      name: 'Documents Only',
      pattern: 'restricted',
      action: 'BLOCK',
      scope: 'DOCUMENTS',
      isActive: true,
    });

    const resultDocs = await checkContent(verifiedEntityIdForTest('entity-1'), 'This is restricted', 'DOCUMENTS');
    expect(resultDocs.passed).toBe(false);

    const resultMessages = await checkContent(verifiedEntityIdForTest('entity-1'), 'This is restricted', 'OUTBOUND_MESSAGES');
    expect(resultMessages.passed).toBe(true);
  });

  it('should only check active rules', async () => {
    await createDLPRule({
      entityId: verifiedEntityIdForTest('entity-1'),
      name: 'Inactive Rule',
      pattern: 'blocked',
      action: 'BLOCK',
      scope: 'ALL',
      isActive: false,
    });

    const result = await checkContent(verifiedEntityIdForTest('entity-1'), 'This is blocked content', 'ALL');
    expect(result.passed).toBe(true);
  });
});
