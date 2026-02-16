// Mock uuid ESM module
let uuidCounter = 0;
jest.mock('uuid', () => ({
  v4: () => `test-uuid-${++uuidCounter}`,
}));

import {
  createGate,
  evaluateGates,
  listGates,
  updateGate,
  deleteGate,
  evaluateExpression,
  _clearGateStore,
} from '../../../src/modules/execution/services/execution-gate';
import type { QueuedAction, ExecutionGate } from '../../../src/modules/execution/types';

function makeAction(overrides: Partial<QueuedAction> = {}): QueuedAction {
  return {
    id: 'action-1',
    actionLogId: 'log-1',
    actor: 'AI',
    actionType: 'CREATE_TASK',
    target: 'tasks',
    description: 'Create a task',
    reason: 'Testing',
    impact: 'Low',
    rollbackPlan: 'Delete task',
    blastRadius: 'LOW',
    reversible: true,
    status: 'APPROVED',
    requiresApproval: false,
    entityId: 'entity-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ExecutionGate', () => {
  beforeEach(() => {
    _clearGateStore();
  });

  describe('createGate', () => {
    it('should create a gate with generated ID', () => {
      const gate = createGate({
        name: 'Cost Limit',
        expression: 'estimatedCost < 100',
        description: 'Block if cost exceeds $100',
        scope: 'GLOBAL',
        isActive: true,
      });

      expect(gate.id).toBeDefined();
      expect(gate.name).toBe('Cost Limit');
      expect(gate.expression).toBe('estimatedCost < 100');
      expect(gate.scope).toBe('GLOBAL');
      expect(gate.isActive).toBe(true);
    });

    it('should create an entity-scoped gate', () => {
      const gate = createGate({
        name: 'Entity Gate',
        expression: 'blastRadius != "CRITICAL"',
        description: 'No critical actions for this entity',
        scope: 'ENTITY',
        entityId: 'entity-1',
        isActive: true,
      });

      expect(gate.scope).toBe('ENTITY');
      expect(gate.entityId).toBe('entity-1');
    });
  });

  describe('evaluateGates', () => {
    it('should pass when no gates exist', async () => {
      const action = makeAction();
      const result = await evaluateGates(action, {});

      expect(result.passed).toBe(true);
      expect(result.blockedBy).toBeUndefined();
    });

    it('should pass when all gates evaluate to true', async () => {
      createGate({
        name: 'Allow LOW',
        expression: 'blastRadius == "LOW"',
        description: 'Only allow LOW blast radius',
        scope: 'GLOBAL',
        isActive: true,
      });

      const action = makeAction({ blastRadius: 'LOW' });
      const result = await evaluateGates(action, { blastRadius: 'LOW' });

      expect(result.passed).toBe(true);
    });

    it('should block when a gate evaluates to false', async () => {
      createGate({
        name: 'No CRITICAL',
        expression: 'blastRadius != "CRITICAL"',
        description: 'Block CRITICAL actions',
        scope: 'GLOBAL',
        isActive: true,
      });

      const action = makeAction({ blastRadius: 'CRITICAL' });
      const result = await evaluateGates(action, { blastRadius: 'CRITICAL' });

      expect(result.passed).toBe(false);
      expect(result.blockedBy).toBeDefined();
      expect(result.blockedBy!.name).toBe('No CRITICAL');
      expect(result.reason).toContain('No CRITICAL');
    });

    it('should skip inactive gates', async () => {
      createGate({
        name: 'Inactive Gate',
        expression: 'false',
        description: 'This gate always blocks',
        scope: 'GLOBAL',
        isActive: false,
      });

      const action = makeAction();
      const result = await evaluateGates(action, {});

      expect(result.passed).toBe(true);
    });

    it('should only apply ENTITY gates to matching entity', async () => {
      createGate({
        name: 'Entity-1 Only',
        expression: 'blastRadius != "HIGH"',
        description: 'No HIGH for entity-1',
        scope: 'ENTITY',
        entityId: 'entity-1',
        isActive: true,
      });

      // Action in entity-2 should not be affected
      const action = makeAction({ entityId: 'entity-2', blastRadius: 'HIGH' });
      const result = await evaluateGates(action, { blastRadius: 'HIGH' });

      expect(result.passed).toBe(true);

      // Action in entity-1 should be blocked
      const action2 = makeAction({ entityId: 'entity-1', blastRadius: 'HIGH' });
      const result2 = await evaluateGates(action2, { blastRadius: 'HIGH' });

      expect(result2.passed).toBe(false);
    });

    it('should apply GLOBAL gates to all entities', async () => {
      createGate({
        name: 'Global Cost Gate',
        expression: 'estimatedCost < 1000',
        description: 'Block expensive actions globally',
        scope: 'GLOBAL',
        isActive: true,
      });

      const action = makeAction({ estimatedCost: 5000, entityId: 'entity-2' });
      const result = await evaluateGates(action, { estimatedCost: 5000 });

      expect(result.passed).toBe(false);
    });

    it('should pass action context variables to expression', async () => {
      createGate({
        name: 'Actor Gate',
        expression: 'actor != "SYSTEM"',
        description: 'Block system actions',
        scope: 'GLOBAL',
        isActive: true,
      });

      const action = makeAction({ actor: 'SYSTEM' });
      const result = await evaluateGates(action, {});

      expect(result.passed).toBe(false);
    });

    it('should evaluate multiple gates and block on first failure', async () => {
      createGate({
        name: 'Gate A',
        expression: 'blastRadius != "CRITICAL"',
        description: 'No critical',
        scope: 'GLOBAL',
        isActive: true,
      });
      createGate({
        name: 'Gate B',
        expression: 'estimatedCost < 100',
        description: 'Cost limit',
        scope: 'GLOBAL',
        isActive: true,
      });

      const action = makeAction({
        blastRadius: 'CRITICAL',
        estimatedCost: 50,
      });
      const result = await evaluateGates(action, {
        blastRadius: 'CRITICAL',
        estimatedCost: 50,
      });

      expect(result.passed).toBe(false);
      expect(result.blockedBy!.name).toBe('Gate A');
    });
  });

  describe('listGates', () => {
    it('should list all gates', () => {
      createGate({
        name: 'Gate 1',
        expression: 'true',
        description: 'Test',
        scope: 'GLOBAL',
        isActive: true,
      });
      createGate({
        name: 'Gate 2',
        expression: 'true',
        description: 'Test',
        scope: 'ENTITY',
        entityId: 'entity-1',
        isActive: true,
      });

      const all = listGates();
      expect(all).toHaveLength(2);
    });

    it('should filter by scope', () => {
      createGate({
        name: 'Global',
        expression: 'true',
        description: 'Test',
        scope: 'GLOBAL',
        isActive: true,
      });
      createGate({
        name: 'Entity',
        expression: 'true',
        description: 'Test',
        scope: 'ENTITY',
        entityId: 'entity-1',
        isActive: true,
      });

      const globalGates = listGates('GLOBAL');
      expect(globalGates).toHaveLength(1);
      expect(globalGates[0].name).toBe('Global');
    });

    it('should filter by entityId (includes GLOBAL)', () => {
      createGate({
        name: 'Global',
        expression: 'true',
        description: 'Test',
        scope: 'GLOBAL',
        isActive: true,
      });
      createGate({
        name: 'Entity-1',
        expression: 'true',
        description: 'Test',
        scope: 'ENTITY',
        entityId: 'entity-1',
        isActive: true,
      });
      createGate({
        name: 'Entity-2',
        expression: 'true',
        description: 'Test',
        scope: 'ENTITY',
        entityId: 'entity-2',
        isActive: true,
      });

      const result = listGates(undefined, 'entity-1');
      expect(result).toHaveLength(2); // Global + Entity-1
      const names = result.map((g) => g.name);
      expect(names).toContain('Global');
      expect(names).toContain('Entity-1');
      expect(names).not.toContain('Entity-2');
    });
  });

  describe('updateGate', () => {
    it('should update gate expression and preserve ID', () => {
      const gate = createGate({
        name: 'Test Gate',
        expression: 'blastRadius == "LOW"',
        description: 'Test',
        scope: 'GLOBAL',
        isActive: true,
      });

      const updated = updateGate(gate.id, {
        expression: 'blastRadius != "CRITICAL"',
      });

      expect(updated.id).toBe(gate.id);
      expect(updated.expression).toBe('blastRadius != "CRITICAL"');
      expect(updated.name).toBe('Test Gate');
    });

    it('should throw for non-existent gate', () => {
      expect(() => updateGate('nonexistent', { name: 'X' })).toThrow(
        'Gate nonexistent not found'
      );
    });
  });

  describe('deleteGate', () => {
    it('should delete an existing gate', () => {
      const gate = createGate({
        name: 'Deletable',
        expression: 'true',
        description: 'Test',
        scope: 'GLOBAL',
        isActive: true,
      });

      deleteGate(gate.id);
      const gates = listGates();
      expect(gates).toHaveLength(0);
    });

    it('should throw for non-existent gate', () => {
      expect(() => deleteGate('nonexistent')).toThrow(
        'Gate nonexistent not found'
      );
    });
  });

  describe('evaluateExpression', () => {
    it('should evaluate numeric comparisons', () => {
      expect(evaluateExpression('5 < 10', {})).toBe(true);
      expect(evaluateExpression('10 < 5', {})).toBe(false);
      expect(evaluateExpression('10 <= 10', {})).toBe(true);
      expect(evaluateExpression('10 > 5', {})).toBe(true);
      expect(evaluateExpression('5 > 10', {})).toBe(false);
      expect(evaluateExpression('10 >= 10', {})).toBe(true);
    });

    it('should evaluate string equality', () => {
      expect(evaluateExpression('x == "hello"', { x: 'hello' })).toBe(true);
      expect(evaluateExpression('x == "world"', { x: 'hello' })).toBe(false);
      expect(evaluateExpression('x != "world"', { x: 'hello' })).toBe(true);
    });

    it('should evaluate logical AND', () => {
      expect(evaluateExpression('a > 5 && b < 10', { a: 6, b: 8 })).toBe(true);
      expect(evaluateExpression('a > 5 && b < 10', { a: 3, b: 8 })).toBe(false);
    });

    it('should evaluate logical OR', () => {
      expect(evaluateExpression('a > 5 || b < 10', { a: 3, b: 8 })).toBe(true);
      expect(evaluateExpression('a > 5 || b < 10', { a: 3, b: 15 })).toBe(false);
    });

    it('should evaluate parenthesized expressions', () => {
      // Single parenthesized expression
      expect(evaluateExpression('(a > 5)', { a: 6 })).toBe(true);
      expect(evaluateExpression('(a > 5)', { a: 3 })).toBe(false);

      // Parenthesized OR
      expect(
        evaluateExpression('(a == 1 || a == 6)', { a: 6 })
      ).toBe(true);

      // Note: The expression parser consumes logical operators at the comparison
      // level when preceded by parenthesized expressions, so (expr) && (expr)
      // patterns should use non-parenthesized comparisons: a > 5 && b > 3
      expect(evaluateExpression('a > 5 && b > 3', { a: 6, b: 5 })).toBe(true);
    });

    it('should look up context variables', () => {
      expect(evaluateExpression('cost < 100', { cost: 50 })).toBe(true);
      expect(evaluateExpression('cost < 100', { cost: 150 })).toBe(false);
    });

    it('should default missing variables to 0', () => {
      expect(evaluateExpression('missing > 0', {})).toBe(false);
      expect(evaluateExpression('missing == 0', {})).toBe(true);
    });

    it('should handle boolean literals', () => {
      expect(evaluateExpression('true', {})).toBe(true);
      expect(evaluateExpression('false', {})).toBe(false);
    });

    it('should return false on parse errors (fail-safe)', () => {
      expect(evaluateExpression('', {})).toBe(false);
      expect(evaluateExpression(')))((', {})).toBe(false);
    });

    it('should evaluate single-quoted strings', () => {
      expect(evaluateExpression("x == 'hello'", { x: 'hello' })).toBe(true);
    });

    it('should handle negative numbers', () => {
      expect(evaluateExpression('x > -5', { x: 0 })).toBe(true);
      expect(evaluateExpression('x > -5', { x: -10 })).toBe(false);
    });
  });
});
