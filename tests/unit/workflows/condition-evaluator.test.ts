// ============================================================================
// Condition Evaluator — Unit Tests
// ============================================================================

import {
  evaluateExpression,
  validateExpression,
  evaluateConditionGroup,
  validateConditionGroup,
  getValueByPath,
} from '@/modules/workflows/services/condition-evaluator';
import type {
  ConditionGroup,
  Condition,
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

    // --- New tests: regex matches ---

    it('should evaluate regex matches via .matches() method', () => {
      expect(evaluateExpression('email.matches("^[a-z]+@example\\.com$")', {
        email: 'alice@example.com',
      })).toBe(true);

      expect(evaluateExpression('email.matches("^[a-z]+@example\\.com$")', {
        email: 'ALICE@example.com',
      })).toBe(false);

      expect(evaluateExpression('code.matches("^[A-Z]{3}-\\d{4}$")', {
        code: 'ABC-1234',
      })).toBe(true);

      expect(evaluateExpression('code.matches("^[A-Z]{3}-\\d{4}$")', {
        code: 'AB-123',
      })).toBe(false);
    });

    it('should return false for invalid regex in matches without throwing', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const result = evaluateExpression('name.matches("[")', { name: 'test' });
      expect(result).toBe(false);
      warnSpy.mockRestore();
    });

    // --- New tests: short-circuit evaluation ---

    it('should short-circuit AND on first false', () => {
      // The second operand references an undefined property which would be falsy,
      // but AND should stop after first false without issue
      const result = evaluateExpression('x > 100 && y.z.w > 5', { x: 1 });
      expect(result).toBe(false);
    });

    it('should short-circuit OR on first true', () => {
      // The second operand references a missing path, but OR should return true
      // after the first true condition
      const result = evaluateExpression('x > 0 || y.z.w > 5', { x: 10 });
      expect(result).toBe(true);
    });

    // --- New tests: type coercion ---

    it('should coerce string numbers for comparison', () => {
      expect(evaluateExpression('amount > 100', { amount: '200' })).toBe(true);
      expect(evaluateExpression('amount > 100', { amount: '50' })).toBe(false);
    });

    // --- New tests: deeply nested dot-notation ---

    it('should evaluate deeply nested dot-notation paths', () => {
      const ctx = {
        order: {
          customer: {
            address: {
              city: 'New York',
            },
          },
        },
      };
      expect(evaluateExpression('order.customer.address.city == "New York"', ctx)).toBe(true);
      expect(evaluateExpression('order.customer.address.city == "Boston"', ctx)).toBe(false);
    });

    // --- New tests: complex chained conditions ---

    it('should evaluate complex chained AND/OR/NOT with parentheses', () => {
      const ctx = { a: 10, b: 20, c: 30 };
      // (a > 5 && b < 25) || c == 100 => (true && true) || false => true
      expect(evaluateExpression('(a > 5 && b < 25) || c == 100', ctx)).toBe(true);
      // !(a > 100) => !false => true
      expect(evaluateExpression('!(a > 100)', ctx)).toBe(true);
      // (a > 100 || b > 100) && c == 30 => false && true => false
      expect(evaluateExpression('(a > 100 || b > 100) && c == 30', ctx)).toBe(false);
    });

    // --- New tests: endsWith method ---

    it('should evaluate .endsWith() method calls', () => {
      expect(evaluateExpression('filename.endsWith(".pdf")', { filename: 'report.pdf' })).toBe(true);
      expect(evaluateExpression('filename.endsWith(".pdf")', { filename: 'report.doc' })).toBe(false);
    });

    // --- New tests: startsWith method ---

    it('should evaluate .startsWith() method calls', () => {
      expect(evaluateExpression('url.startsWith("https")', { url: 'https://example.com' })).toBe(true);
      expect(evaluateExpression('url.startsWith("https")', { url: 'http://example.com' })).toBe(false);
    });

    // --- New tests: error handling with warning logging ---

    it('should log warnings for failed expression evaluations', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      // Use an expression that causes a parse error (unmatched paren)
      evaluateExpression('(x > 5', { x: 10 });
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
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

  // =========================================================================
  // Structured Condition Group Evaluation
  // =========================================================================

  describe('evaluateConditionGroup', () => {
    describe('AND operator', () => {
      it('should return true when all conditions are true', () => {
        const group: ConditionGroup = {
          operator: 'AND',
          conditions: [
            { field: 'amount', operator: 'greaterThan', value: 100 },
            { field: 'status', operator: 'equals', value: 'ACTIVE' },
          ],
        };
        expect(evaluateConditionGroup(group, { amount: 200, status: 'ACTIVE' })).toBe(true);
      });

      it('should return false when any condition is false', () => {
        const group: ConditionGroup = {
          operator: 'AND',
          conditions: [
            { field: 'amount', operator: 'greaterThan', value: 100 },
            { field: 'status', operator: 'equals', value: 'ACTIVE' },
          ],
        };
        expect(evaluateConditionGroup(group, { amount: 50, status: 'ACTIVE' })).toBe(false);
      });

      it('should short-circuit on first false (AND)', () => {
        // The second condition would fail with a deep path, but AND should stop early
        const group: ConditionGroup = {
          operator: 'AND',
          conditions: [
            { field: 'x', operator: 'greaterThan', value: 1000 },
            { field: 'deep.nested.value', operator: 'equals', value: 'test' },
          ],
        };
        expect(evaluateConditionGroup(group, { x: 5 })).toBe(false);
      });
    });

    describe('OR operator', () => {
      it('should return true when at least one condition is true', () => {
        const group: ConditionGroup = {
          operator: 'OR',
          conditions: [
            { field: 'priority', operator: 'equals', value: 'P0' },
            { field: 'priority', operator: 'equals', value: 'P1' },
          ],
        };
        expect(evaluateConditionGroup(group, { priority: 'P1' })).toBe(true);
      });

      it('should return false when all conditions are false', () => {
        const group: ConditionGroup = {
          operator: 'OR',
          conditions: [
            { field: 'priority', operator: 'equals', value: 'P0' },
            { field: 'priority', operator: 'equals', value: 'P1' },
          ],
        };
        expect(evaluateConditionGroup(group, { priority: 'P3' })).toBe(false);
      });

      it('should short-circuit on first true (OR)', () => {
        const group: ConditionGroup = {
          operator: 'OR',
          conditions: [
            { field: 'isAdmin', operator: 'equals', value: true },
            { field: 'deep.nonexistent.path', operator: 'equals', value: 'whatever' },
          ],
        };
        expect(evaluateConditionGroup(group, { isAdmin: true })).toBe(true);
      });
    });

    describe('NOT operator', () => {
      it('should negate a true condition to false', () => {
        const group: ConditionGroup = {
          operator: 'NOT',
          conditions: [
            { field: 'isArchived', operator: 'equals', value: true },
          ],
        };
        expect(evaluateConditionGroup(group, { isArchived: true })).toBe(false);
      });

      it('should negate a false condition to true', () => {
        const group: ConditionGroup = {
          operator: 'NOT',
          conditions: [
            { field: 'isArchived', operator: 'equals', value: true },
          ],
        };
        expect(evaluateConditionGroup(group, { isArchived: false })).toBe(true);
      });

      it('should negate a nested condition group', () => {
        const group: ConditionGroup = {
          operator: 'NOT',
          conditions: [
            {
              operator: 'AND',
              conditions: [
                { field: 'x', operator: 'greaterThan', value: 10 },
                { field: 'y', operator: 'lessThan', value: 5 },
              ],
            },
          ],
        };
        // x > 10 && y < 5 => true && true => true, negated => false
        expect(evaluateConditionGroup(group, { x: 20, y: 2 })).toBe(false);
        // x > 10 && y < 5 => true && false => false, negated => true
        expect(evaluateConditionGroup(group, { x: 20, y: 10 })).toBe(true);
      });
    });

    describe('nested condition groups', () => {
      it('should evaluate deeply nested AND/OR groups', () => {
        // (amount > 100 AND status == "ACTIVE") OR (priority == "P0")
        const group: ConditionGroup = {
          operator: 'OR',
          conditions: [
            {
              operator: 'AND',
              conditions: [
                { field: 'amount', operator: 'greaterThan', value: 100 },
                { field: 'status', operator: 'equals', value: 'ACTIVE' },
              ],
            },
            { field: 'priority', operator: 'equals', value: 'P0' },
          ],
        };

        // AND group: true && true => true, OR => true
        expect(evaluateConditionGroup(group, { amount: 200, status: 'ACTIVE', priority: 'P3' })).toBe(true);
        // AND group: false && true => false, OR: priority == P0 => true
        expect(evaluateConditionGroup(group, { amount: 50, status: 'ACTIVE', priority: 'P0' })).toBe(true);
        // AND group: false && true => false, OR: priority == P3 => false
        expect(evaluateConditionGroup(group, { amount: 50, status: 'ACTIVE', priority: 'P3' })).toBe(false);
      });

      it('should evaluate triple-nested condition groups', () => {
        // NOT (OR (x > 100, AND (y == "test", z < 5)))
        const group: ConditionGroup = {
          operator: 'NOT',
          conditions: [
            {
              operator: 'OR',
              conditions: [
                { field: 'x', operator: 'greaterThan', value: 100 },
                {
                  operator: 'AND',
                  conditions: [
                    { field: 'y', operator: 'equals', value: 'test' },
                    { field: 'z', operator: 'lessThan', value: 5 },
                  ],
                },
              ],
            },
          ],
        };

        // OR(false, AND(true, true)) => OR(false, true) => true, NOT => false
        expect(evaluateConditionGroup(group, { x: 50, y: 'test', z: 3 })).toBe(false);
        // OR(false, AND(true, false)) => OR(false, false) => false, NOT => true
        expect(evaluateConditionGroup(group, { x: 50, y: 'test', z: 10 })).toBe(true);
      });
    });

    describe('comparison operators', () => {
      it('should evaluate equals operator', () => {
        const group: ConditionGroup = {
          operator: 'AND',
          conditions: [{ field: 'name', operator: 'equals', value: 'Alice' }],
        };
        expect(evaluateConditionGroup(group, { name: 'Alice' })).toBe(true);
        expect(evaluateConditionGroup(group, { name: 'Bob' })).toBe(false);
      });

      it('should evaluate notEquals operator', () => {
        const group: ConditionGroup = {
          operator: 'AND',
          conditions: [{ field: 'status', operator: 'notEquals', value: 'DELETED' }],
        };
        expect(evaluateConditionGroup(group, { status: 'ACTIVE' })).toBe(true);
        expect(evaluateConditionGroup(group, { status: 'DELETED' })).toBe(false);
      });

      it('should evaluate greaterThan and lessThan operators', () => {
        const group: ConditionGroup = {
          operator: 'AND',
          conditions: [
            { field: 'score', operator: 'greaterThan', value: 50 },
            { field: 'score', operator: 'lessThan', value: 100 },
          ],
        };
        expect(evaluateConditionGroup(group, { score: 75 })).toBe(true);
        expect(evaluateConditionGroup(group, { score: 30 })).toBe(false);
        expect(evaluateConditionGroup(group, { score: 150 })).toBe(false);
      });

      it('should evaluate greaterThanOrEquals and lessThanOrEquals operators', () => {
        const group: ConditionGroup = {
          operator: 'AND',
          conditions: [
            { field: 'count', operator: 'greaterThanOrEquals', value: 10 },
            { field: 'count', operator: 'lessThanOrEquals', value: 20 },
          ],
        };
        expect(evaluateConditionGroup(group, { count: 10 })).toBe(true);
        expect(evaluateConditionGroup(group, { count: 20 })).toBe(true);
        expect(evaluateConditionGroup(group, { count: 15 })).toBe(true);
        expect(evaluateConditionGroup(group, { count: 9 })).toBe(false);
        expect(evaluateConditionGroup(group, { count: 21 })).toBe(false);
      });

      it('should evaluate contains operator', () => {
        const group: ConditionGroup = {
          operator: 'AND',
          conditions: [{ field: 'description', operator: 'contains', value: 'urgent' }],
        };
        expect(evaluateConditionGroup(group, { description: 'This is urgent!' })).toBe(true);
        expect(evaluateConditionGroup(group, { description: 'Not important' })).toBe(false);
      });

      it('should evaluate startsWith operator', () => {
        const group: ConditionGroup = {
          operator: 'AND',
          conditions: [{ field: 'email', operator: 'startsWith', value: 'admin' }],
        };
        expect(evaluateConditionGroup(group, { email: 'admin@example.com' })).toBe(true);
        expect(evaluateConditionGroup(group, { email: 'user@example.com' })).toBe(false);
      });

      it('should evaluate endsWith operator', () => {
        const group: ConditionGroup = {
          operator: 'AND',
          conditions: [{ field: 'filename', operator: 'endsWith', value: '.pdf' }],
        };
        expect(evaluateConditionGroup(group, { filename: 'report.pdf' })).toBe(true);
        expect(evaluateConditionGroup(group, { filename: 'report.doc' })).toBe(false);
      });

      it('should evaluate matches (regex) operator', () => {
        const group: ConditionGroup = {
          operator: 'AND',
          conditions: [{ field: 'phone', operator: 'matches', value: '^\\d{3}-\\d{3}-\\d{4}$' }],
        };
        expect(evaluateConditionGroup(group, { phone: '555-123-4567' })).toBe(true);
        expect(evaluateConditionGroup(group, { phone: '5551234567' })).toBe(false);
        expect(evaluateConditionGroup(group, { phone: 'not-a-phone' })).toBe(false);
      });

      it('should return false for invalid regex in matches operator', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const group: ConditionGroup = {
          operator: 'AND',
          conditions: [{ field: 'text', operator: 'matches', value: '[invalid' }],
        };
        expect(evaluateConditionGroup(group, { text: 'anything' })).toBe(false);
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
      });
    });

    describe('dot-notation data accessors', () => {
      it('should resolve simple dot-notation paths', () => {
        const group: ConditionGroup = {
          operator: 'AND',
          conditions: [{ field: 'task.priority', operator: 'equals', value: 'HIGH' }],
        };
        expect(evaluateConditionGroup(group, { task: { priority: 'HIGH' } })).toBe(true);
        expect(evaluateConditionGroup(group, { task: { priority: 'LOW' } })).toBe(false);
      });

      it('should resolve deeply nested dot-notation paths', () => {
        const group: ConditionGroup = {
          operator: 'AND',
          conditions: [{ field: 'contact.address.country', operator: 'equals', value: 'US' }],
        };
        const ctx = { contact: { address: { country: 'US' } } };
        expect(evaluateConditionGroup(group, ctx)).toBe(true);
      });

      it('should return false for undefined paths without throwing', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const group: ConditionGroup = {
          operator: 'AND',
          conditions: [{ field: 'nonexistent.deep.path', operator: 'equals', value: 'test' }],
        };
        // undefined != 'test' so equals should return false
        expect(evaluateConditionGroup(group, {})).toBe(false);
        warnSpy.mockRestore();
      });
    });

    describe('type coercion', () => {
      it('should coerce string numbers for numeric comparisons', () => {
        const group: ConditionGroup = {
          operator: 'AND',
          conditions: [{ field: 'amount', operator: 'greaterThan', value: 100 }],
        };
        expect(evaluateConditionGroup(group, { amount: '200' })).toBe(true);
        expect(evaluateConditionGroup(group, { amount: '50' })).toBe(false);
      });

      it('should coerce number to string for equals comparison', () => {
        const group: ConditionGroup = {
          operator: 'AND',
          conditions: [{ field: 'code', operator: 'equals', value: '42' }],
        };
        expect(evaluateConditionGroup(group, { code: 42 })).toBe(true);
      });

      it('should handle boolean coercion', () => {
        const group: ConditionGroup = {
          operator: 'AND',
          conditions: [{ field: 'active', operator: 'equals', value: true }],
        };
        expect(evaluateConditionGroup(group, { active: true })).toBe(true);
        expect(evaluateConditionGroup(group, { active: false })).toBe(false);
      });

      it('should handle date string comparisons', () => {
        const group: ConditionGroup = {
          operator: 'AND',
          conditions: [{ field: 'dueDate', operator: 'greaterThan', value: '2024-01-01' }],
        };
        expect(evaluateConditionGroup(group, { dueDate: '2024-06-15' })).toBe(true);
        expect(evaluateConditionGroup(group, { dueDate: '2023-06-15' })).toBe(false);
      });

      it('should handle null and undefined values gracefully', () => {
        const group: ConditionGroup = {
          operator: 'AND',
          conditions: [{ field: 'value', operator: 'equals', value: null }],
        };
        expect(evaluateConditionGroup(group, { value: null })).toBe(true);
        // undefined field compared to null
        expect(evaluateConditionGroup(group, {})).toBe(true);
      });
    });

    describe('error handling', () => {
      it('should return false for null condition group with warning', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        expect(evaluateConditionGroup(null as unknown as ConditionGroup, {})).toBe(false);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Invalid condition group')
        );
        warnSpy.mockRestore();
      });

      it('should return false for empty conditions array with warning', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const group: ConditionGroup = { operator: 'AND', conditions: [] };
        expect(evaluateConditionGroup(group, {})).toBe(false);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Empty condition group')
        );
        warnSpy.mockRestore();
      });

      it('should return false for unknown logical operator with warning', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const group = { operator: 'XOR' as 'AND', conditions: [{ field: 'x', operator: 'equals' as const, value: 1 }] };
        expect(evaluateConditionGroup(group, { x: 1 })).toBe(false);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Unknown logical operator')
        );
        warnSpy.mockRestore();
      });

      it('should return false for unknown comparison operator with warning', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const group: ConditionGroup = {
          operator: 'AND',
          conditions: [{ field: 'x', operator: 'foobar' as 'equals', value: 1 }],
        };
        expect(evaluateConditionGroup(group, { x: 1 })).toBe(false);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Unknown comparison operator')
        );
        warnSpy.mockRestore();
      });
    });
  });

  // =========================================================================
  // Data Accessor: getValueByPath
  // =========================================================================

  describe('getValueByPath', () => {
    it('should resolve top-level properties', () => {
      expect(getValueByPath({ name: 'Alice' }, 'name')).toBe('Alice');
    });

    it('should resolve nested properties', () => {
      expect(getValueByPath({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42);
    });

    it('should return undefined for missing paths', () => {
      expect(getValueByPath({}, 'a.b.c')).toBeUndefined();
    });

    it('should return undefined when intermediate is null', () => {
      expect(getValueByPath({ a: null }, 'a.b')).toBeUndefined();
    });

    it('should return undefined when intermediate is a primitive', () => {
      expect(getValueByPath({ a: 42 }, 'a.b')).toBeUndefined();
    });

    it('should handle arrays in the path', () => {
      const ctx = { items: [{ name: 'first' }, { name: 'second' }] };
      expect(getValueByPath(ctx, 'items.0.name')).toBe('first');
      expect(getValueByPath(ctx, 'items.1.name')).toBe('second');
    });
  });

  // =========================================================================
  // validateConditionGroup
  // =========================================================================

  describe('validateConditionGroup', () => {
    it('should validate a correct AND group', () => {
      const group: ConditionGroup = {
        operator: 'AND',
        conditions: [
          { field: 'x', operator: 'greaterThan', value: 10 },
          { field: 'y', operator: 'equals', value: 'test' },
        ],
      };
      expect(validateConditionGroup(group)).toEqual({ valid: true });
    });

    it('should validate a correct OR group', () => {
      const group: ConditionGroup = {
        operator: 'OR',
        conditions: [
          { field: 'status', operator: 'equals', value: 'ACTIVE' },
        ],
      };
      expect(validateConditionGroup(group)).toEqual({ valid: true });
    });

    it('should validate a correct NOT group', () => {
      const group: ConditionGroup = {
        operator: 'NOT',
        conditions: [
          { field: 'archived', operator: 'equals', value: true },
        ],
      };
      expect(validateConditionGroup(group)).toEqual({ valid: true });
    });

    it('should validate nested groups', () => {
      const group: ConditionGroup = {
        operator: 'OR',
        conditions: [
          {
            operator: 'AND',
            conditions: [
              { field: 'a', operator: 'greaterThan', value: 1 },
              { field: 'b', operator: 'lessThan', value: 10 },
            ],
          },
          { field: 'c', operator: 'equals', value: 'test' },
        ],
      };
      expect(validateConditionGroup(group)).toEqual({ valid: true });
    });

    it('should reject null input', () => {
      const result = validateConditionGroup(null as unknown as ConditionGroup);
      expect(result.valid).toBe(false);
    });

    it('should reject invalid logical operator', () => {
      const group = { operator: 'NAND', conditions: [{ field: 'x', operator: 'equals', value: 1 }] };
      const result = validateConditionGroup(group as unknown as ConditionGroup);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid logical operator');
    });

    it('should reject empty conditions array', () => {
      const group: ConditionGroup = { operator: 'AND', conditions: [] };
      const result = validateConditionGroup(group);
      expect(result.valid).toBe(false);
    });

    it('should reject NOT with multiple conditions', () => {
      const group: ConditionGroup = {
        operator: 'NOT',
        conditions: [
          { field: 'a', operator: 'equals', value: 1 },
          { field: 'b', operator: 'equals', value: 2 },
        ],
      };
      const result = validateConditionGroup(group);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('NOT operator should have exactly one condition');
    });

    it('should reject invalid comparison operators', () => {
      const group: ConditionGroup = {
        operator: 'AND',
        conditions: [{ field: 'x', operator: 'banana' as 'equals', value: 1 }],
      };
      const result = validateConditionGroup(group);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid comparison operator');
    });

    it('should reject conditions without a field', () => {
      const group: ConditionGroup = {
        operator: 'AND',
        conditions: [{ field: '', operator: 'equals', value: 1 }],
      };
      const result = validateConditionGroup(group);
      expect(result.valid).toBe(false);
    });

    it('should validate all comparison operator types', () => {
      const operators = [
        'equals', 'notEquals', 'greaterThan', 'lessThan',
        'greaterThanOrEquals', 'lessThanOrEquals',
        'contains', 'startsWith', 'endsWith', 'matches',
      ] as const;

      for (const op of operators) {
        const group: ConditionGroup = {
          operator: 'AND',
          conditions: [{ field: 'x', operator: op, value: 'test' }],
        };
        expect(validateConditionGroup(group)).toEqual({ valid: true });
      }
    });
  });
});
