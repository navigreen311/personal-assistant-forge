// ============================================================================
// Conditional Execution Gates
// Evaluates conditions before allowing action execution
// Uses safe expression parsing (no eval)
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import type { ExecutionGate, QueuedAction } from '../types';

// --- In-Memory Gate Store ---

const gateStore = new Map<string, ExecutionGate>();

// --- Public API ---

export function createGate(
  params: Omit<ExecutionGate, 'id'>
): ExecutionGate {
  const gate: ExecutionGate = {
    id: uuidv4(),
    ...params,
  };
  gateStore.set(gate.id, gate);
  return gate;
}

export async function evaluateGates(
  action: QueuedAction,
  context: Record<string, unknown>
): Promise<{ passed: boolean; blockedBy?: ExecutionGate; reason?: string }> {
  const applicableGates = getApplicableGates(action);

  for (const gate of applicableGates) {
    if (!gate.isActive) continue;

    const result = evaluateExpression(gate.expression, {
      ...context,
      actionType: action.actionType,
      blastRadius: action.blastRadius,
      actor: action.actor,
      entityId: action.entityId,
      target: action.target,
      estimatedCost: action.estimatedCost ?? 0,
    });

    if (!result) {
      return {
        passed: false,
        blockedBy: gate,
        reason: `Gate "${gate.name}" blocked execution: condition "${gate.expression}" evaluated to false`,
      };
    }
  }

  return { passed: true };
}

export function listGates(
  scope?: string,
  entityId?: string
): ExecutionGate[] {
  let gates = Array.from(gateStore.values());

  if (scope) {
    gates = gates.filter((g) => g.scope === scope);
  }
  if (entityId) {
    gates = gates.filter(
      (g) => g.entityId === entityId || g.scope === 'GLOBAL'
    );
  }

  return gates;
}

export function updateGate(
  gateId: string,
  updates: Partial<ExecutionGate>
): ExecutionGate {
  const gate = gateStore.get(gateId);
  if (!gate) {
    throw new Error(`Gate ${gateId} not found`);
  }

  const updated: ExecutionGate = { ...gate, ...updates, id: gate.id };
  gateStore.set(gateId, updated);
  return updated;
}

export function deleteGate(gateId: string): void {
  if (!gateStore.has(gateId)) {
    throw new Error(`Gate ${gateId} not found`);
  }
  gateStore.delete(gateId);
}

// --- Safe Expression Evaluator ---
// Recursive descent parser supporting:
//   - Comparisons: <, <=, >, >=, ==, !=
//   - String equality: ==, !=
//   - Logical: &&, ||
//   - Parentheses: (expr)
//   - Variables from context
//   - String literals: 'value' or "value"
//   - Number literals

interface Token {
  type: 'NUMBER' | 'STRING' | 'IDENTIFIER' | 'OPERATOR' | 'PAREN' | 'EOF';
  value: string;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    // Skip whitespace
    if (/\s/.test(expr[i])) {
      i++;
      continue;
    }

    // String literals
    if (expr[i] === "'" || expr[i] === '"') {
      const quote = expr[i];
      i++;
      let str = '';
      while (i < expr.length && expr[i] !== quote) {
        str += expr[i];
        i++;
      }
      i++; // skip closing quote
      tokens.push({ type: 'STRING', value: str });
      continue;
    }

    // Numbers
    if (/\d/.test(expr[i]) || (expr[i] === '-' && i + 1 < expr.length && /\d/.test(expr[i + 1]))) {
      let num = '';
      if (expr[i] === '-') {
        num += '-';
        i++;
      }
      while (i < expr.length && /[\d.]/.test(expr[i])) {
        num += expr[i];
        i++;
      }
      tokens.push({ type: 'NUMBER', value: num });
      continue;
    }

    // Multi-char operators
    if (i + 1 < expr.length) {
      const twoChar = expr[i] + expr[i + 1];
      if (['<=', '>=', '==', '!=', '&&', '||'].includes(twoChar)) {
        tokens.push({ type: 'OPERATOR', value: twoChar });
        i += 2;
        continue;
      }
    }

    // Single-char operators
    if (['<', '>'].includes(expr[i])) {
      tokens.push({ type: 'OPERATOR', value: expr[i] });
      i++;
      continue;
    }

    // Parentheses
    if (expr[i] === '(' || expr[i] === ')') {
      tokens.push({ type: 'PAREN', value: expr[i] });
      i++;
      continue;
    }

    // Identifiers
    if (/[a-zA-Z_]/.test(expr[i])) {
      let ident = '';
      while (i < expr.length && /[a-zA-Z_\d]/.test(expr[i])) {
        ident += expr[i];
        i++;
      }
      tokens.push({ type: 'IDENTIFIER', value: ident });
      continue;
    }

    // Skip unknown characters
    i++;
  }

  tokens.push({ type: 'EOF', value: '' });
  return tokens;
}

class Parser {
  private tokens: Token[];
  private pos: number;
  private context: Record<string, unknown>;

  constructor(tokens: Token[], context: Record<string, unknown>) {
    this.tokens = tokens;
    this.pos = 0;
    this.context = context;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    const token = this.tokens[this.pos];
    this.pos++;
    return token;
  }

  parse(): boolean {
    const result = this.parseOr();
    return Boolean(result);
  }

  private parseOr(): unknown {
    let left = this.parseAnd();
    while (this.peek().type === 'OPERATOR' && this.peek().value === '||') {
      this.advance();
      const right = this.parseAnd();
      left = Boolean(left) || Boolean(right);
    }
    return left;
  }

  private parseAnd(): unknown {
    let left = this.parseComparison();
    while (this.peek().type === 'OPERATOR' && this.peek().value === '&&') {
      this.advance();
      const right = this.parseComparison();
      left = Boolean(left) && Boolean(right);
    }
    return left;
  }

  private parseComparison(): unknown {
    const left = this.parsePrimary();
    const token = this.peek();

    if (token.type === 'OPERATOR') {
      const op = this.advance().value;
      const right = this.parsePrimary();

      switch (op) {
        case '<':
          return Number(left) < Number(right);
        case '<=':
          return Number(left) <= Number(right);
        case '>':
          return Number(left) > Number(right);
        case '>=':
          return Number(left) >= Number(right);
        case '==':
          return String(left) === String(right);
        case '!=':
          return String(left) !== String(right);
        default:
          return false;
      }
    }

    return left;
  }

  private parsePrimary(): unknown {
    const token = this.peek();

    if (token.type === 'PAREN' && token.value === '(') {
      this.advance();
      const result = this.parseOr();
      if (this.peek().type === 'PAREN' && this.peek().value === ')') {
        this.advance();
      }
      return result;
    }

    if (token.type === 'NUMBER') {
      this.advance();
      return parseFloat(token.value);
    }

    if (token.type === 'STRING') {
      this.advance();
      return token.value;
    }

    if (token.type === 'IDENTIFIER') {
      this.advance();
      // Boolean literals
      if (token.value === 'true') return true;
      if (token.value === 'false') return false;
      // Look up in context
      return this.context[token.value] ?? 0;
    }

    // Fallback
    this.advance();
    return 0;
  }
}

export function evaluateExpression(
  expression: string,
  context: Record<string, unknown>
): boolean {
  try {
    const tokens = tokenize(expression);
    const parser = new Parser(tokens, context);
    return parser.parse();
  } catch {
    // If expression parsing fails, default to blocking (fail-safe)
    return false;
  }
}

// --- Helpers ---

function getApplicableGates(action: QueuedAction): ExecutionGate[] {
  return Array.from(gateStore.values()).filter((gate) => {
    if (gate.scope === 'GLOBAL') return true;
    if (gate.scope === 'ENTITY' && gate.entityId === action.entityId) return true;
    return false;
  });
}

// --- Testing Helpers ---

export function _clearGateStore(): void {
  gateStore.clear();
}
