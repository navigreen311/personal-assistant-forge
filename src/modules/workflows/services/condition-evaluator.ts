// ============================================================================
// Condition & Expression Evaluator
// Safe expression parser — does NOT use eval()
// Supports: comparisons, logical operators, nested property access, strings,
//           structured condition groups, regex matching, type coercion,
//           short-circuit evaluation, and comprehensive error handling.
// ============================================================================

// --- Token Types ---
type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'BOOLEAN'
  | 'IDENTIFIER'
  | 'OPERATOR'
  | 'LOGICAL'
  | 'NOT'
  | 'LPAREN'
  | 'RPAREN'
  | 'DOT'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string;
}

// --- Structured Condition Types ---

export type LogicalOperator = 'AND' | 'OR' | 'NOT';

export type ComparisonOperator =
  | 'equals'
  | 'notEquals'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterThanOrEquals'
  | 'lessThanOrEquals'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'matches';

export interface Condition {
  field: string;
  operator: ComparisonOperator;
  value: unknown;
}

export interface ConditionGroup {
  operator: LogicalOperator;
  conditions: Array<Condition | ConditionGroup>;
}

// --- Tokenizer ---

const OPERATORS = ['>=', '<=', '!=', '==', '>', '<'] as const;
const LOGICAL_OPS = ['&&', '||'] as const;
const KEYWORDS: Record<string, TokenType> = {
  true: 'BOOLEAN',
  false: 'BOOLEAN',
  includes: 'IDENTIFIER',
  startsWith: 'IDENTIFIER',
};

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expression.length) {
    const ch = expression[i];

    // Skip whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Parentheses
    if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: '(' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ')' });
      i++;
      continue;
    }

    // Dot
    if (ch === '.') {
      // Check if this is a method call dot or property access
      tokens.push({ type: 'DOT', value: '.' });
      i++;
      continue;
    }

    // NOT operator
    if (ch === '!' && expression[i + 1] !== '=') {
      tokens.push({ type: 'NOT', value: '!' });
      i++;
      continue;
    }

    // Two-char operators (>=, <=, !=, ==, &&, ||)
    if (i + 1 < expression.length) {
      const twoChar = expression.slice(i, i + 2);

      const foundLogical = (LOGICAL_OPS as readonly string[]).find((op) => op === twoChar);
      if (foundLogical) {
        tokens.push({ type: 'LOGICAL', value: twoChar });
        i += 2;
        continue;
      }

      const foundOp = (OPERATORS as readonly string[]).find((op) => op === twoChar);
      if (foundOp) {
        tokens.push({ type: 'OPERATOR', value: twoChar });
        i += 2;
        continue;
      }
    }

    // Single-char operators (>, <)
    if (ch === '>' || ch === '<') {
      tokens.push({ type: 'OPERATOR', value: ch });
      i++;
      continue;
    }

    // Number
    if (/\d/.test(ch) || (ch === '-' && i + 1 < expression.length && /\d/.test(expression[i + 1]))) {
      let num = '';
      if (ch === '-') {
        num += '-';
        i++;
      }
      while (i < expression.length && (/\d/.test(expression[i]) || expression[i] === '.')) {
        num += expression[i];
        i++;
      }
      tokens.push({ type: 'NUMBER', value: num });
      continue;
    }

    // String literals (single or double quoted)
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let str = '';
      while (i < expression.length && expression[i] !== quote) {
        str += expression[i];
        i++;
      }
      i++; // skip closing quote
      tokens.push({ type: 'STRING', value: str });
      continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_$]/.test(ch)) {
      let ident = '';
      while (i < expression.length && /[a-zA-Z0-9_$]/.test(expression[i])) {
        ident += expression[i];
        i++;
      }
      const keyType = KEYWORDS[ident];
      if (keyType) {
        tokens.push({ type: keyType, value: ident });
      } else {
        tokens.push({ type: 'IDENTIFIER', value: ident });
      }
      continue;
    }

    // Unknown character — skip
    i++;
  }

  tokens.push({ type: 'EOF', value: '' });
  return tokens;
}

// --- Data Accessor: Dot-Notation Path Resolution ---

/**
 * Resolves a dot-notation path (e.g., "task.priority", "contact.address.city")
 * against a context object. Returns undefined if any segment is missing.
 */
export function getValueByPath(context: Record<string, unknown>, path: string): unknown {
  const segments = path.split('.');
  let current: unknown = context;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

// --- Type Coercion Utilities ---

/**
 * Attempts to coerce two values to compatible types for comparison.
 * Priority: Date > Number > String. Booleans are handled specially.
 */
function coerceForComparison(left: unknown, right: unknown): { l: unknown; r: unknown } {
  // If both are the same type, no coercion needed
  if (typeof left === typeof right) {
    return { l: left, r: right };
  }

  // Handle null/undefined — treat them as comparable to each other
  if (left === null || left === undefined) {
    if (right === null || right === undefined) {
      return { l: null, r: null };
    }
    return { l: left, r: right };
  }
  if (right === null || right === undefined) {
    return { l: left, r: right };
  }

  // Date coercion: if either side looks like a date string or is a Date
  const leftDate = tryParseDate(left);
  const rightDate = tryParseDate(right);
  if (leftDate !== null && rightDate !== null) {
    return { l: leftDate.getTime(), r: rightDate.getTime() };
  }

  // Boolean coercion
  if (typeof left === 'boolean' || typeof right === 'boolean') {
    return { l: toBoolean(left), r: toBoolean(right) };
  }

  // Number coercion: if either is a number or both can be parsed as numbers
  const leftNum = tryParseNumber(left);
  const rightNum = tryParseNumber(right);
  if (leftNum !== null && rightNum !== null) {
    return { l: leftNum, r: rightNum };
  }

  // Fall back to string comparison
  return { l: String(left), r: String(right) };
}

function tryParseDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string') {
    // Only parse strings that look like dates (ISO 8601, common date formats)
    if (/^\d{4}-\d{2}-\d{2}/.test(value) || /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(value)) {
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
  }
  if (typeof value === 'number') {
    // Could be a timestamp
    const asDate = new Date(value);
    // Only treat as date if it looks like a reasonable timestamp (after year 2000)
    if (!isNaN(asDate.getTime()) && value > 946684800000) {
      return asDate;
    }
  }
  return null;
}

function tryParseNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return isNaN(value) ? null : value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const num = Number(value);
    return isNaN(num) ? null : num;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  return null;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no' || lower === '') return false;
  }
  if (typeof value === 'number') return value !== 0;
  return Boolean(value);
}

// --- Parser (Recursive Descent) ---

class ExpressionParser {
  private tokens: Token[];
  private pos = 0;
  private context: Record<string, unknown>;

  constructor(tokens: Token[], context: Record<string, unknown>) {
    this.tokens = tokens;
    this.context = context;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private consume(expectedType?: TokenType): Token {
    const token = this.tokens[this.pos];
    if (expectedType && token.type !== expectedType) {
      throw new Error(`Expected ${expectedType} but got ${token.type} (${token.value})`);
    }
    this.pos++;
    return token;
  }

  parse(): boolean {
    const result = this.parseOr();
    return Boolean(result);
  }

  // Short-circuit: OR stops on first true
  private parseOr(): unknown {
    let left = this.parseAnd();
    while (this.peek().type === 'LOGICAL' && this.peek().value === '||') {
      this.consume();
      // Short-circuit: if left is already true, skip evaluating right
      // but we still need to parse (consume tokens) for the right side
      if (Boolean(left)) {
        // Parse but discard the right side to advance token position
        this.parseAnd();
        // left stays true — no need to update
      } else {
        const right = this.parseAnd();
        left = Boolean(left) || Boolean(right);
      }
    }
    return left;
  }

  // Short-circuit: AND stops on first false
  private parseAnd(): unknown {
    let left = this.parseNot();
    while (this.peek().type === 'LOGICAL' && this.peek().value === '&&') {
      this.consume();
      // Short-circuit: if left is already false, skip evaluating right
      // but we still need to parse (consume tokens) for the right side
      if (!Boolean(left)) {
        // Parse but discard the right side to advance token position
        this.parseNot();
        // left stays false — no need to update
      } else {
        const right = this.parseNot();
        left = Boolean(left) && Boolean(right);
      }
    }
    return left;
  }

  private parseNot(): unknown {
    if (this.peek().type === 'NOT') {
      this.consume();
      const value = this.parseNot();
      return !value;
    }
    return this.parseComparison();
  }

  private parseComparison(): unknown {
    const left = this.parsePrimary();

    if (this.peek().type === 'OPERATOR') {
      const op = this.consume().value;
      const right = this.parsePrimary();
      return this.compare(left, op, right);
    }

    return left;
  }

  private compare(left: unknown, op: string, right: unknown): boolean {
    // Use type coercion to get comparable values
    const { l, r } = coerceForComparison(left, right);

    switch (op) {
      case '>': return (l as number) > (r as number);
      case '<': return (l as number) < (r as number);
      case '>=': return (l as number) >= (r as number);
      case '<=': return (l as number) <= (r as number);
      case '==': return l === r || String(l) === String(r);
      case '!=': return l !== r && String(l) !== String(r);
      default: return false;
    }
  }

  private parsePrimary(): unknown {
    const token = this.peek();

    // Parenthesized expression
    if (token.type === 'LPAREN') {
      this.consume();
      const value = this.parseOr();
      this.consume('RPAREN');
      return value;
    }

    // Number
    if (token.type === 'NUMBER') {
      this.consume();
      return Number(token.value);
    }

    // String literal
    if (token.type === 'STRING') {
      this.consume();
      return token.value;
    }

    // Boolean
    if (token.type === 'BOOLEAN') {
      this.consume();
      return token.value === 'true';
    }

    // Identifier (variable lookup, possibly with dot notation and method calls)
    if (token.type === 'IDENTIFIER') {
      return this.parseIdentifier();
    }

    throw new Error(`Unexpected token: ${token.type} (${token.value})`);
  }

  private parseIdentifier(): unknown {
    let value: unknown = this.resolveIdentifier(this.consume('IDENTIFIER').value);

    // Handle dot notation: a.b.c or a.method(args)
    while (this.peek().type === 'DOT') {
      this.consume(); // consume dot
      const propToken = this.consume('IDENTIFIER');

      // Check for method call
      if (this.peek().type === 'LPAREN') {
        this.consume(); // consume (
        // Handle no-arg method calls (e.g., .toLowerCase())
        let arg: unknown = undefined;
        if (this.peek().type !== 'RPAREN') {
          arg = this.parsePrimary();
        }
        this.consume('RPAREN');
        value = this.callMethod(value, propToken.value, arg);
      } else {
        // Property access
        if (value !== null && value !== undefined && typeof value === 'object') {
          value = (value as Record<string, unknown>)[propToken.value];
        } else {
          value = undefined;
        }
      }
    }

    return value;
  }

  private resolveIdentifier(name: string): unknown {
    if (name in this.context) {
      return this.context[name];
    }
    // Could be part of a nested path resolved through the context
    return undefined;
  }

  private callMethod(obj: unknown, method: string, arg: unknown): unknown {
    const str = String(obj ?? '');
    switch (method) {
      case 'includes':
        return str.includes(String(arg));
      case 'startsWith':
        return str.startsWith(String(arg));
      case 'endsWith':
        return str.endsWith(String(arg));
      case 'matches': {
        try {
          const regex = new RegExp(String(arg));
          return regex.test(str);
        } catch {
          console.warn(`[ConditionEvaluator] Invalid regex pattern: ${String(arg)}`);
          return false;
        }
      }
      case 'toLowerCase':
        return str.toLowerCase();
      case 'toUpperCase':
        return str.toUpperCase();
      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  }
}

// --- Structured Condition Evaluator ---

/**
 * Type guard: checks if the given object is a ConditionGroup (has operator + conditions array).
 */
function isConditionGroup(obj: Condition | ConditionGroup): obj is ConditionGroup {
  return 'operator' in obj && 'conditions' in obj && Array.isArray((obj as ConditionGroup).conditions);
}

/**
 * Evaluates a single atomic Condition against a context object.
 * Uses dot-notation data accessors and type-coerced comparisons.
 */
function evaluateSingleCondition(
  condition: Condition,
  context: Record<string, unknown>
): boolean {
  try {
    const fieldValue = getValueByPath(context, condition.field);
    const targetValue = condition.value;

    switch (condition.operator) {
      case 'equals': {
        const { l, r } = coerceForComparison(fieldValue, targetValue);
        return l === r || String(l) === String(r);
      }
      case 'notEquals': {
        const { l, r } = coerceForComparison(fieldValue, targetValue);
        return l !== r && String(l) !== String(r);
      }
      case 'greaterThan': {
        const { l, r } = coerceForComparison(fieldValue, targetValue);
        return (l as number) > (r as number);
      }
      case 'lessThan': {
        const { l, r } = coerceForComparison(fieldValue, targetValue);
        return (l as number) < (r as number);
      }
      case 'greaterThanOrEquals': {
        const { l, r } = coerceForComparison(fieldValue, targetValue);
        return (l as number) >= (r as number);
      }
      case 'lessThanOrEquals': {
        const { l, r } = coerceForComparison(fieldValue, targetValue);
        return (l as number) <= (r as number);
      }
      case 'contains': {
        return String(fieldValue ?? '').includes(String(targetValue));
      }
      case 'startsWith': {
        return String(fieldValue ?? '').startsWith(String(targetValue));
      }
      case 'endsWith': {
        return String(fieldValue ?? '').endsWith(String(targetValue));
      }
      case 'matches': {
        try {
          const regex = new RegExp(String(targetValue));
          return regex.test(String(fieldValue ?? ''));
        } catch {
          console.warn(`[ConditionEvaluator] Invalid regex in matches operator: ${String(targetValue)}`);
          return false;
        }
      }
      default: {
        console.warn(`[ConditionEvaluator] Unknown comparison operator: ${String(condition.operator)}`);
        return false;
      }
    }
  } catch (err) {
    console.warn(
      `[ConditionEvaluator] Error evaluating condition on field "${condition.field}": ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return false;
  }
}

/**
 * Evaluates a ConditionGroup (AND, OR, NOT) with nested conditions and groups.
 * Supports short-circuit evaluation:
 *   - AND stops on first false
 *   - OR stops on first true
 * NOT applies to the first condition in the group.
 * Invalid conditions return false with a logged warning.
 */
export function evaluateConditionGroup(
  group: ConditionGroup,
  context: Record<string, unknown>
): boolean {
  try {
    if (!group || !group.conditions || !Array.isArray(group.conditions)) {
      console.warn('[ConditionEvaluator] Invalid condition group: missing conditions array');
      return false;
    }

    if (group.conditions.length === 0) {
      console.warn('[ConditionEvaluator] Empty condition group');
      return false;
    }

    switch (group.operator) {
      case 'AND': {
        // Short-circuit: stop on first false
        for (const condition of group.conditions) {
          const result = isConditionGroup(condition)
            ? evaluateConditionGroup(condition, context)
            : evaluateSingleCondition(condition, context);
          if (!result) {
            return false;
          }
        }
        return true;
      }

      case 'OR': {
        // Short-circuit: stop on first true
        for (const condition of group.conditions) {
          const result = isConditionGroup(condition)
            ? evaluateConditionGroup(condition, context)
            : evaluateSingleCondition(condition, context);
          if (result) {
            return true;
          }
        }
        return false;
      }

      case 'NOT': {
        // NOT negates the evaluation of the first condition/group
        const firstCondition = group.conditions[0];
        if (!firstCondition) {
          console.warn('[ConditionEvaluator] NOT group has no conditions to negate');
          return false;
        }
        const result = isConditionGroup(firstCondition)
          ? evaluateConditionGroup(firstCondition, context)
          : evaluateSingleCondition(firstCondition, context);
        return !result;
      }

      default: {
        console.warn(`[ConditionEvaluator] Unknown logical operator: ${String(group.operator)}`);
        return false;
      }
    }
  } catch (err) {
    console.warn(
      `[ConditionEvaluator] Error evaluating condition group: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return false;
  }
}

// --- Public API ---

export function evaluateExpression(
  expression: string,
  context: Record<string, unknown>
): boolean {
  try {
    const tokens = tokenize(expression);
    const parser = new ExpressionParser(tokens, context);
    return parser.parse();
  } catch (err) {
    console.warn(
      `[ConditionEvaluator] Expression evaluation failed for "${expression}": ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return false;
  }
}

export function validateExpression(expression: string): { valid: boolean; error?: string } {
  // Reject dangerous patterns
  const dangerous = [
    /\beval\b/,
    /\bFunction\b/,
    /\bnew\b/,
    /\bimport\b/,
    /\brequire\b/,
    /\bdelete\b/,
    /\btypeof\b/,
    /\bvoid\b/,
    /\bthrow\b/,
    /\bawait\b/,
    /\basync\b/,
    /\byield\b/,
    /[;{}[\]]/,  // block/array syntax
    /(?<!=)=(?!=)/,    // assignment (but not == or !=)
  ];

  for (const pattern of dangerous) {
    if (pattern.test(expression)) {
      return {
        valid: false,
        error: `Expression contains disallowed pattern: ${pattern.source}`,
      };
    }
  }

  try {
    const tokens = tokenize(expression);
    // Ensure we got at least one meaningful token
    if (tokens.length <= 1) {
      return { valid: false, error: 'Expression is empty' };
    }
    // Try parsing with empty context to check syntax
    new ExpressionParser(tokens, {}).parse();
    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Invalid expression',
    };
  }
}

/**
 * Validates a structured ConditionGroup for correctness.
 * Returns { valid: true } if the structure is well-formed,
 * or { valid: false, error: string } describing the issue.
 */
export function validateConditionGroup(
  group: ConditionGroup
): { valid: boolean; error?: string } {
  if (!group || typeof group !== 'object') {
    return { valid: false, error: 'Condition group must be an object' };
  }

  if (!['AND', 'OR', 'NOT'].includes(group.operator)) {
    return { valid: false, error: `Invalid logical operator: ${String(group.operator)}` };
  }

  if (!Array.isArray(group.conditions)) {
    return { valid: false, error: 'Conditions must be an array' };
  }

  if (group.conditions.length === 0) {
    return { valid: false, error: 'Condition group must have at least one condition' };
  }

  if (group.operator === 'NOT' && group.conditions.length > 1) {
    return { valid: false, error: 'NOT operator should have exactly one condition' };
  }

  const validOperators: ComparisonOperator[] = [
    'equals', 'notEquals', 'greaterThan', 'lessThan',
    'greaterThanOrEquals', 'lessThanOrEquals',
    'contains', 'startsWith', 'endsWith', 'matches',
  ];

  for (const condition of group.conditions) {
    if (isConditionGroup(condition)) {
      const nested = validateConditionGroup(condition);
      if (!nested.valid) {
        return nested;
      }
    } else {
      const cond = condition as Condition;
      if (!cond.field || typeof cond.field !== 'string') {
        return { valid: false, error: 'Each condition must have a string "field" property' };
      }
      if (!validOperators.includes(cond.operator)) {
        return { valid: false, error: `Invalid comparison operator: ${String(cond.operator)}` };
      }
    }
  }

  return { valid: true };
}
