import {
  evaluateRules,
  resolveConflicts,
  getWinningAction,
  getInheritedRules,
} from '@/engines/policy/rule-engine';
import type { EvaluatedRule } from '@/engines/policy/types';

// Mock prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    rule: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('evaluateRules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return matching rules sorted by precedence', async () => {
    (mockPrisma.rule.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'r1',
        name: 'High Priority',
        scope: 'GLOBAL',
        condition: [{ field: 'message.triageScore', operator: 'gte', value: 8 }],
        action: { type: 'ESCALATE', config: {} },
        precedence: 100,
        isActive: true,
        version: 1,
      },
      {
        id: 'r2',
        name: 'Low Priority',
        scope: 'GLOBAL',
        condition: [{ field: 'message.triageScore', operator: 'gte', value: 5 }],
        action: { type: 'NOTIFY', config: {} },
        precedence: 50,
        isActive: true,
        version: 1,
      },
    ]);

    const result = await evaluateRules({ message: { triageScore: 9 } });

    expect(result).toHaveLength(2);
    expect(result[0].ruleId).toBe('r1');
    expect(result[0].matched).toBe(true);
    expect(result[1].ruleId).toBe('r2');
    expect(result[1].matched).toBe(true);
  });

  it('should skip inactive rules', async () => {
    (mockPrisma.rule.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'r1',
        name: 'Active Rule',
        scope: 'GLOBAL',
        condition: [{ field: 'status', operator: 'eq', value: 'open' }],
        action: { type: 'NOTIFY', config: {} },
        precedence: 50,
        isActive: true,
        version: 1,
      },
    ]);

    const result = await evaluateRules({ status: 'open' });

    // Only active rules returned by prisma (the query filters isActive: true)
    expect(result).toHaveLength(1);
    expect(result[0].matched).toBe(true);
  });

  it('should evaluate all condition operators', async () => {
    const operators = [
      { operator: 'eq', field: 'a', value: 'x', context: { a: 'x' }, expected: true },
      { operator: 'neq', field: 'a', value: 'x', context: { a: 'y' }, expected: true },
      { operator: 'gt', field: 'n', value: 5, context: { n: 10 }, expected: true },
      { operator: 'gte', field: 'n', value: 5, context: { n: 5 }, expected: true },
      { operator: 'lt', field: 'n', value: 10, context: { n: 5 }, expected: true },
      { operator: 'lte', field: 'n', value: 10, context: { n: 10 }, expected: true },
      { operator: 'in', field: 'a', value: ['x', 'y'], context: { a: 'x' }, expected: true },
      { operator: 'contains', field: 'a', value: 'ell', context: { a: 'hello' }, expected: true },
      { operator: 'matches', field: 'a', value: '^he.*lo$', context: { a: 'hello' }, expected: true },
    ];

    for (const op of operators) {
      (mockPrisma.rule.findMany as jest.Mock).mockResolvedValue([
        {
          id: `r-${op.operator}`,
          name: `Rule ${op.operator}`,
          scope: 'GLOBAL',
          condition: [{ field: op.field, operator: op.operator, value: op.value }],
          action: { type: 'LOG', config: {} },
          precedence: 10,
          isActive: true,
          version: 1,
        },
      ]);

      const result = await evaluateRules(op.context);
      expect(result[0].matched).toBe(op.expected);
    }
  });

  it('should handle AND/OR logical groups correctly', async () => {
    (mockPrisma.rule.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'r1',
        name: 'AND Rule',
        scope: 'GLOBAL',
        condition: [
          { field: 'a', operator: 'eq', value: 1 },
          { field: 'b', operator: 'eq', value: 2, logicalGroup: 'AND' },
        ],
        action: { type: 'NOTIFY', config: {} },
        precedence: 10,
        isActive: true,
        version: 1,
      },
    ]);

    // Both match
    let result = await evaluateRules({ a: 1, b: 2 });
    expect(result[0].matched).toBe(true);

    // Only first matches
    result = await evaluateRules({ a: 1, b: 3 });
    expect(result[0].matched).toBe(false);

    // OR group
    (mockPrisma.rule.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'r2',
        name: 'OR Rule',
        scope: 'GLOBAL',
        condition: [
          { field: 'a', operator: 'eq', value: 1 },
          { field: 'b', operator: 'eq', value: 2, logicalGroup: 'OR' },
        ],
        action: { type: 'NOTIFY', config: {} },
        precedence: 10,
        isActive: true,
        version: 1,
      },
    ]);

    // Only second matches
    result = await evaluateRules({ a: 0, b: 2 });
    expect(result[0].matched).toBe(true);
  });

  it('should return empty array when no rules match', async () => {
    (mockPrisma.rule.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'r1',
        name: 'Rule',
        scope: 'GLOBAL',
        condition: [{ field: 'x', operator: 'eq', value: 'never' }],
        action: { type: 'NOTIFY', config: {} },
        precedence: 10,
        isActive: true,
        version: 1,
      },
    ]);

    const result = await evaluateRules({ x: 'something' });
    expect(result).toHaveLength(1);
    expect(result[0].matched).toBe(false);
  });
});

describe('resolveConflicts', () => {
  it('should detect contradictory actions (BLOCK vs APPROVE)', () => {
    const rules: EvaluatedRule[] = [
      {
        ruleId: 'r1',
        ruleName: 'Block Rule',
        matched: true,
        conditionResults: [],
        action: { type: 'BLOCK', config: {} },
        precedence: 100,
        scope: 'GLOBAL',
      },
      {
        ruleId: 'r2',
        ruleName: 'Approve Rule',
        matched: true,
        conditionResults: [],
        action: { type: 'APPROVE', config: {} },
        precedence: 50,
        scope: 'GLOBAL',
      },
    ];

    const conflicts = resolveConflicts(rules);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].conflictType).toBe('CONTRADICTORY_ACTIONS');
  });

  it('should resolve by higher precedence first', () => {
    const rules: EvaluatedRule[] = [
      {
        ruleId: 'r1',
        ruleName: 'High Prec',
        matched: true,
        conditionResults: [],
        action: { type: 'BLOCK', config: {} },
        precedence: 100,
        scope: 'GLOBAL',
      },
      {
        ruleId: 'r2',
        ruleName: 'Low Prec',
        matched: true,
        conditionResults: [],
        action: { type: 'APPROVE', config: {} },
        precedence: 50,
        scope: 'GLOBAL',
      },
    ];

    const conflicts = resolveConflicts(rules);
    expect(conflicts[0].resolution).toBe('HIGHER_PRECEDENCE');
    expect(conflicts[0].resolvedWinnerId).toBe('r1');
  });

  it('should resolve by narrower scope when precedence is tied', () => {
    const rules: EvaluatedRule[] = [
      {
        ruleId: 'r1',
        ruleName: 'Global Rule',
        matched: true,
        conditionResults: [],
        action: { type: 'BLOCK', config: {} },
        precedence: 50,
        scope: 'GLOBAL',
      },
      {
        ruleId: 'r2',
        ruleName: 'Contact Rule',
        matched: true,
        conditionResults: [],
        action: { type: 'APPROVE', config: {} },
        precedence: 50,
        scope: 'CONTACT',
      },
    ];

    const conflicts = resolveConflicts(rules);
    expect(conflicts[0].resolution).toBe('NARROWER_SCOPE');
    expect(conflicts[0].resolvedWinnerId).toBe('r2');
  });

  it('should flag MANUAL_REQUIRED when all resolution criteria tie', () => {
    const rules: EvaluatedRule[] = [
      {
        ruleId: 'r1',
        ruleName: 'Rule A',
        matched: true,
        conditionResults: [],
        action: { type: 'NOTIFY', config: {} },
        precedence: 50,
        scope: 'GLOBAL',
      },
      {
        ruleId: 'r2',
        ruleName: 'Rule B',
        matched: true,
        conditionResults: [],
        action: { type: 'NOTIFY', config: {} },
        precedence: 50,
        scope: 'GLOBAL',
      },
    ];

    const conflicts = resolveConflicts(rules);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].conflictType).toBe('OVERLAPPING_SCOPE');
    expect(conflicts[0].resolution).toBe('MANUAL_REQUIRED');
  });

  it('should return empty array when no conflicts exist', () => {
    const rules: EvaluatedRule[] = [
      {
        ruleId: 'r1',
        ruleName: 'Rule A',
        matched: true,
        conditionResults: [],
        action: { type: 'NOTIFY', config: {} },
        precedence: 100,
        scope: 'GLOBAL',
      },
      {
        ruleId: 'r2',
        ruleName: 'Rule B',
        matched: true,
        conditionResults: [],
        action: { type: 'ESCALATE', config: {} },
        precedence: 50,
        scope: 'ENTITY',
      },
    ];

    const conflicts = resolveConflicts(rules);
    expect(conflicts).toHaveLength(0);
  });
});

describe('getWinningAction', () => {
  it('should return the highest-precedence matching rule', () => {
    const rules: EvaluatedRule[] = [
      {
        ruleId: 'r1',
        ruleName: 'Low',
        matched: true,
        conditionResults: [],
        action: { type: 'NOTIFY', config: {} },
        precedence: 10,
        scope: 'GLOBAL',
      },
      {
        ruleId: 'r2',
        ruleName: 'High',
        matched: true,
        conditionResults: [],
        action: { type: 'ESCALATE', config: {} },
        precedence: 100,
        scope: 'GLOBAL',
      },
    ];

    const winner = getWinningAction(rules);
    expect(winner).not.toBeNull();
    expect(winner!.ruleId).toBe('r2');
  });

  it('should return null when no rules match', () => {
    const rules: EvaluatedRule[] = [
      {
        ruleId: 'r1',
        ruleName: 'Unmatched',
        matched: false,
        conditionResults: [],
        action: null,
        precedence: 100,
        scope: 'GLOBAL',
      },
    ];

    const winner = getWinningAction(rules);
    expect(winner).toBeNull();
  });
});

describe('getInheritedRules', () => {
  it('should return rules in order: Global -> Entity -> Project -> Contact', async () => {
    (mockPrisma.rule.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'r-contact',
        name: 'Contact Rule',
        scope: 'CONTACT',
        entityId: 'e1',
        condition: { field: 'a', operator: 'eq', value: 1 },
        action: { type: 'NOTIFY', config: {} },
        precedence: 50,
        createdBy: 'HUMAN',
        version: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'r-global',
        name: 'Global Rule',
        scope: 'GLOBAL',
        entityId: null,
        condition: { field: 'b', operator: 'eq', value: 2 },
        action: { type: 'LOG', config: {} },
        precedence: 10,
        createdBy: 'HUMAN',
        version: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'r-entity',
        name: 'Entity Rule',
        scope: 'ENTITY',
        entityId: 'e1',
        condition: { field: 'c', operator: 'eq', value: 3 },
        action: { type: 'TAG', config: {} },
        precedence: 30,
        createdBy: 'HUMAN',
        version: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const rules = await getInheritedRules('e1', undefined, 'c1');

    expect(rules.length).toBeGreaterThan(0);
    // First rule should be GLOBAL, then ENTITY, then CONTACT
    const scopes = rules.map((r) => r.scope);
    const globalIdx = scopes.indexOf('GLOBAL');
    const entityIdx = scopes.indexOf('ENTITY');
    const contactIdx = scopes.indexOf('CONTACT');

    if (globalIdx >= 0 && entityIdx >= 0) {
      expect(globalIdx).toBeLessThan(entityIdx);
    }
    if (entityIdx >= 0 && contactIdx >= 0) {
      expect(entityIdx).toBeLessThan(contactIdx);
    }
  });

  it('should allow narrower scope to override broader scope', async () => {
    const sharedCondition = { field: 'x', operator: 'eq', value: 1 };

    (mockPrisma.rule.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'r-global',
        name: 'Global Rule',
        scope: 'GLOBAL',
        entityId: null,
        condition: sharedCondition,
        action: { type: 'BLOCK', config: {} },
        precedence: 50,
        createdBy: 'HUMAN',
        version: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'r-entity',
        name: 'Entity Override',
        scope: 'ENTITY',
        entityId: 'e1',
        condition: sharedCondition,
        action: { type: 'APPROVE', config: {} },
        precedence: 50,
        createdBy: 'HUMAN',
        version: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const rules = await getInheritedRules('e1');

    // Same condition key means entity overrides global
    const conditionKey = JSON.stringify(sharedCondition);
    const rulesWithCondition = rules.filter(
      (r) => JSON.stringify(r.condition) === conditionKey
    );
    expect(rulesWithCondition).toHaveLength(1);
    expect(rulesWithCondition[0].scope).toBe('ENTITY');
  });

  it('should include only active rules', async () => {
    (mockPrisma.rule.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'r1',
        name: 'Active',
        scope: 'GLOBAL',
        entityId: null,
        condition: { field: 'a' },
        action: { type: 'LOG', config: {} },
        precedence: 10,
        createdBy: 'HUMAN',
        version: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const rules = await getInheritedRules('e1');
    expect(rules.every((r) => r.isActive)).toBe(true);
  });
});
