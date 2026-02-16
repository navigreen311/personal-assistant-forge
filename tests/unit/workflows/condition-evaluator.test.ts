// ============================================================================
// Condition Evaluator — Unit Tests
// ============================================================================

import {
  evaluateExpression,
  validateExpression,
} from '@/modules/workflows/services/condition-evaluator';

describe('ConditionEvaluator', () => {
  describe('evaluateExpression', () => {
    it('should evaluate "amount > 1000" with context { amount: 1500 } as true', () => {
      const result = evaluateExpression('amount > 1000', { amount: 1500 });
      expect(result).toBe(true);
    });

    it('should evaluate "amount > 1000" with context { amount: 500 } as false', () => {
      const result = evaluateExpression('amount > 1000', { amount: 500 });
      expect(result).toBe(false);
    });

    it('should evaluate "status == ACTIVE" correctly', () => {
      const result = evaluateExpression('status == "ACTIVE"', { status: 'ACTIVE' });
      expect(result).toBe(true);

      const resultFalse = evaluateExpression('status == "ACTIVE"', {
        status: 'INACTIVE',
      });
      expect(resultFalse).toBe(false);
    });

    it('should evaluate nested properties "contact.score > 80"', () => {
      const result = evaluateExpression('contact.score > 80', {
        contact: { score: 95 },
      });
      expect(result).toBe(true);

      const resultFalse = evaluateExpression('contact.score > 80', {
        contact: { score: 50 },
      });
      expect(resultFalse).toBe(false);
    });

    it('should evaluate AND expressions "amount > 100 && status == PENDING"', () => {
      const resultTrue = evaluateExpression(
        'amount > 100 && status == "PENDING"',
        { amount: 200, status: 'PENDING' }
      );
      expect(resultTrue).toBe(true);

      const resultFalse = evaluateExpression(
        'amount > 100 && status == "PENDING"',
        { amount: 50, status: 'PENDING' }
      );
      expect(resultFalse).toBe(false);
    });

    it('should evaluate OR expressions "priority == P0 || priority == P1"', () => {
      const resultP0 = evaluateExpression(
        'priority == "P0" || priority == "P1"',
        { priority: 'P0' }
      );
      expect(resultP0).toBe(true);

      const resultP1 = evaluateExpression(
        'priority == "P0" || priority == "P1"',
        { priority: 'P1' }
      );
      expect(resultP1).toBe(true);

      const resultP2 = evaluateExpression(
        'priority == "P0" || priority == "P1"',
        { priority: 'P2' }
      );
      expect(resultP2).toBe(false);
    });

    it('should evaluate NOT expressions "!isArchived"', () => {
      const resultTrue = evaluateExpression('!isArchived', { isArchived: false });
      expect(resultTrue).toBe(true);

      const resultFalse = evaluateExpression('!isArchived', { isArchived: true });
      expect(resultFalse).toBe(false);
    });

    it('should evaluate string contains "name.includes(Dr)"', () => {
      const result = evaluateExpression('name.includes("Dr")', {
        name: 'Dr. Smith',
      });
      expect(result).toBe(true);

      const resultFalse = evaluateExpression('name.includes("Dr")', {
        name: 'John Smith',
      });
      expect(resultFalse).toBe(false);
    });

    it('should return false for invalid expressions without throwing', () => {
      const result = evaluateExpression('invalid @@@ expression', {});
      expect(result).toBe(false);
    });

    it('should NOT use eval() internally', () => {
      // Verify that eval-like patterns don't execute
      const result = evaluateExpression('constructor.constructor("return 1+1")()', {});
      expect(result).toBe(false);
    });

    it('should handle comparison operators correctly', () => {
      expect(evaluateExpression('x >= 10', { x: 10 })).toBe(true);
      expect(evaluateExpression('x >= 10', { x: 9 })).toBe(false);
      expect(evaluateExpression('x <= 10', { x: 10 })).toBe(true);
      expect(evaluateExpression('x != 5', { x: 3 })).toBe(true);
      expect(evaluateExpression('x != 5', { x: 5 })).toBe(false);
    });

    it('should handle parenthesized expressions', () => {
      const result = evaluateExpression('(x > 5) && (y < 10)', { x: 8, y: 3 });
      expect(result).toBe(true);
    });
  });

  describe('validateExpression', () => {
    it('should validate correct expressions', () => {
      expect(validateExpression('amount > 100').valid).toBe(true);
      expect(validateExpression('status == "ACTIVE"').valid).toBe(true);
      expect(validateExpression('x > 5 && y < 10').valid).toBe(true);
    });

    it('should reject expressions with function calls', () => {
      const result = validateExpression('eval("malicious code")');
      expect(result.valid).toBe(false);
    });

    it('should reject expressions with assignment operators', () => {
      const result = validateExpression('x = 5');
      expect(result.valid).toBe(false);
    });

    it('should reject expressions with dangerous keywords', () => {
      expect(validateExpression('import("fs")').valid).toBe(false);
      expect(validateExpression('require("fs")').valid).toBe(false);
      expect(validateExpression('delete x').valid).toBe(false);
    });

    it('should reject empty expressions', () => {
      const result = validateExpression('');
      expect(result.valid).toBe(false);
    });
  });
});
