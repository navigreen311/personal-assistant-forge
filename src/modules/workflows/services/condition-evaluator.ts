// ============================================================================
// Condition & Expression Evaluator
// Safe expression parser — does NOT use eval()
// Supports: comparisons, logical operators, nested property access, strings
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

  private parseOr(): unknown {
    let left = this.parseAnd();
    while (this.peek().type === 'LOGICAL' && this.peek().value === '||') {
      this.consume();
      const right = this.parseAnd();
      left = Boolean(left) || Boolean(right);
    }
    return left;
  }

  private parseAnd(): unknown {
    let left = this.parseNot();
    while (this.peek().type === 'LOGICAL' && this.peek().value === '&&') {
      this.consume();
      const right = this.parseNot();
      left = Boolean(left) && Boolean(right);
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
    const l = typeof left === 'string' && !isNaN(Number(left)) ? Number(left) : left;
    const r = typeof right === 'string' && !isNaN(Number(right)) ? Number(right) : right;

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
        const arg = this.parsePrimary();
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
      case 'toLowerCase':
        return str.toLowerCase();
      case 'toUpperCase':
        return str.toUpperCase();
      default:
        throw new Error(`Unsupported method: ${method}`);
    }
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
  } catch {
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
