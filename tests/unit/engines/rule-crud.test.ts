import {
  createRule,
  updateRule,
  deleteRule,
  listRules,
  getRuleById,
  duplicateRule,
} from '@/engines/policy/rule-crud';

jest.mock('@/lib/db', () => ({
  prisma: {
    rule: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const NOW = new Date('2025-06-01T00:00:00Z');

function makeRuleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule-1',
    name: 'Test Rule',
    scope: 'GLOBAL',
    entityId: null,
    condition: { field: 'status', operator: 'eq', value: 'open' },
    action: { type: 'NOTIFY', config: {} },
    precedence: 50,
    createdBy: 'HUMAN',
    version: 1,
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('createRule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a rule with version 1 and return mapped result', async () => {
    const row = makeRuleRow();
    (mockPrisma.rule.create as jest.Mock).mockResolvedValue(row);

    const result = await createRule({
      name: 'Test Rule',
      scope: 'GLOBAL',
      condition: { field: 'status', operator: 'eq', value: 'open' },
      action: { type: 'NOTIFY', config: {} },
      precedence: 50,
      createdBy: 'HUMAN',
      isActive: true,
    });

    expect(mockPrisma.rule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Test Rule',
        scope: 'GLOBAL',
        version: 1,
        isActive: true,
      }),
    });
    expect(result.id).toBe('rule-1');
    expect(result.version).toBe(1);
    expect(result.name).toBe('Test Rule');
  });

  it('should pass condition and action as JSON values', async () => {
    const condition = { field: 'priority', operator: 'gte', value: 8 };
    const action = { type: 'ESCALATE', config: { team: 'ops' } };
    const row = makeRuleRow({ condition, action });
    (mockPrisma.rule.create as jest.Mock).mockResolvedValue(row);

    const result = await createRule({
      name: 'Escalation Rule',
      scope: 'ENTITY',
      entityId: 'ent-1',
      condition,
      action,
      precedence: 100,
      createdBy: 'AI',
      isActive: true,
    });

    expect(result.condition).toEqual(condition);
    expect(result.action).toEqual(action);
  });
});

describe('updateRule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should increment version on update', async () => {
    const existing = makeRuleRow({ version: 3 });
    (mockPrisma.rule.findUnique as jest.Mock).mockResolvedValue(existing);
    (mockPrisma.rule.update as jest.Mock).mockResolvedValue({
      ...existing,
      name: 'Updated Rule',
      version: 4,
      updatedAt: new Date(),
    });

    const result = await updateRule('rule-1', { name: 'Updated Rule' });

    const updateCall = (mockPrisma.rule.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.version).toBe(4);
    expect(result.name).toBe('Updated Rule');
    expect(result.version).toBe(4);
  });

  it('should throw an error when rule does not exist', async () => {
    (mockPrisma.rule.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(updateRule('nonexistent', { name: 'X' }))
      .rejects
      .toThrow('Rule not found: nonexistent');
  });

  it('should only update provided fields', async () => {
    const existing = makeRuleRow();
    (mockPrisma.rule.findUnique as jest.Mock).mockResolvedValue(existing);
    (mockPrisma.rule.update as jest.Mock).mockResolvedValue({
      ...existing,
      precedence: 200,
      version: 2,
    });

    await updateRule('rule-1', { precedence: 200 });

    const updateCall = (mockPrisma.rule.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.precedence).toBe(200);
    // Name should NOT be in the update data since it was not provided
    expect(updateCall.data.name).toBeUndefined();
  });
});

describe('deleteRule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should soft-delete by setting isActive to false', async () => {
    (mockPrisma.rule.update as jest.Mock).mockResolvedValue(
      makeRuleRow({ isActive: false })
    );

    await deleteRule('rule-1');

    expect(mockPrisma.rule.update).toHaveBeenCalledWith({
      where: { id: 'rule-1' },
      data: { isActive: false },
    });
  });
});

describe('listRules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return paginated rules with total count', async () => {
    const rules = [
      makeRuleRow({ id: 'r1', precedence: 100 }),
      makeRuleRow({ id: 'r2', precedence: 50 }),
    ];
    (mockPrisma.rule.findMany as jest.Mock).mockResolvedValue(rules);
    (mockPrisma.rule.count as jest.Mock).mockResolvedValue(5);

    const result = await listRules({ scope: 'GLOBAL' }, 1, 2);

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(5);
    expect(mockPrisma.rule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 2,
        orderBy: { precedence: 'desc' },
      })
    );
  });

  it('should apply scope and isActive filters', async () => {
    (mockPrisma.rule.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.rule.count as jest.Mock).mockResolvedValue(0);

    await listRules({ scope: 'ENTITY', isActive: true });

    const findCall = (mockPrisma.rule.findMany as jest.Mock).mock.calls[0][0];
    expect(findCall.where.scope).toBe('ENTITY');
    expect(findCall.where.isActive).toBe(true);
  });

  it('should calculate correct skip for page 2', async () => {
    (mockPrisma.rule.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.rule.count as jest.Mock).mockResolvedValue(0);

    await listRules({}, 2, 10);

    const findCall = (mockPrisma.rule.findMany as jest.Mock).mock.calls[0][0];
    expect(findCall.skip).toBe(10); // (2-1) * 10
    expect(findCall.take).toBe(10);
  });
});

describe('getRuleById', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return mapped rule when found', async () => {
    const row = makeRuleRow();
    (mockPrisma.rule.findUnique as jest.Mock).mockResolvedValue(row);

    const result = await getRuleById('rule-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('rule-1');
    expect(result!.name).toBe('Test Rule');
    expect(result!.scope).toBe('GLOBAL');
  });

  it('should return null when rule does not exist', async () => {
    (mockPrisma.rule.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await getRuleById('nonexistent');

    expect(result).toBeNull();
  });
});

describe('duplicateRule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a copy with "(copy)" suffix and version 1', async () => {
    const existing = makeRuleRow({ name: 'Original Rule', version: 5 });
    (mockPrisma.rule.findUnique as jest.Mock).mockResolvedValue(existing);
    (mockPrisma.rule.create as jest.Mock).mockResolvedValue(
      makeRuleRow({ id: 'rule-2', name: 'Original Rule (copy)', version: 1 })
    );

    const result = await duplicateRule('rule-1');

    const createCall = (mockPrisma.rule.create as jest.Mock).mock.calls[0][0];
    expect(createCall.data.name).toBe('Original Rule (copy)');
    expect(createCall.data.version).toBe(1);
    expect(createCall.data.isActive).toBe(true);
    expect(result.id).toBe('rule-2');
    expect(result.name).toBe('Original Rule (copy)');
  });

  it('should apply overrides when duplicating', async () => {
    const existing = makeRuleRow({ name: 'Original', precedence: 50 });
    (mockPrisma.rule.findUnique as jest.Mock).mockResolvedValue(existing);
    (mockPrisma.rule.create as jest.Mock).mockResolvedValue(
      makeRuleRow({ id: 'rule-3', name: 'Custom Name', precedence: 200, version: 1 })
    );

    const result = await duplicateRule('rule-1', {
      name: 'Custom Name',
      precedence: 200,
    });

    const createCall = (mockPrisma.rule.create as jest.Mock).mock.calls[0][0];
    expect(createCall.data.name).toBe('Custom Name');
    expect(createCall.data.precedence).toBe(200);
    expect(result.name).toBe('Custom Name');
  });

  it('should throw an error when source rule does not exist', async () => {
    (mockPrisma.rule.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(duplicateRule('nonexistent'))
      .rejects
      .toThrow('Rule not found: nonexistent');
  });
});
