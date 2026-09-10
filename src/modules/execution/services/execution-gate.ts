// ============================================================================
// Conditional Execution Gates
// Evaluates conditions before allowing action execution
// Uses safe expression parsing (no eval)
// ============================================================================
//
// P-09 (T-007 / T-034): the gate rules used to live in a module-level Map.
// A gate is the mechanism that STOPS an action, so a gate that disappears on
// `restart: unless-stopped` is worse than no gate at all -- the console still
// reports the action as protected. Rules now live in `ExecutionGateRule` and
// every read goes to Postgres, so a restart, a second process, or a direct
// service call all see the same rules.
//
// P-09 (T-001): gates are tenant-scoped in the WHERE clause. A rule may only
// be edited or removed by the entity that owns it, and a rule only ever
// applies to actions of the entity that owns it. A gate belonging to nobody
// (`entityId = null`, seeded by the platform, not reachable from this API)
// is the only truly global one, and nothing here can delete it.

import { prisma } from '@/lib/db';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { ExecutionGate, QueuedAction } from '../types';

// --- Row <-> interface reconciliation ---

interface GateRow {
  id: string;
  name: string;
  expression: string;
  description: string;
  scope: string;
  entityId: string | null;
  isActive: boolean;
}

function toExecutionGate(row: GateRow): ExecutionGate {
  return {
    id: row.id,
    name: row.name,
    expression: row.expression,
    description: row.description,
    scope: row.scope as ExecutionGate['scope'],
    entityId: row.entityId ?? undefined,
    isActive: row.isActive,
  };
}

// --- Public API ---

/**
 * Create a gate owned by `entityId`.
 *
 * The scope is recorded as asked for, but the owner is always the verified
 * caller: `getApplicableGates` only ever matches a gate against actions of the
 * entity that owns it, so a tenant cannot install a rule into another tenant's
 * execution path (a gate you can inject is a denial of service, the mirror of
 * a gate you can bypass).
 */
export async function createGate(
  params: Omit<ExecutionGate, 'id' | 'entityId'>,
  entityId: VerifiedEntityId
): Promise<ExecutionGate> {
  const row = await prisma.executionGateRule.create({
    data: {
      name: params.name,
      expression: params.expression,
      description: params.description,
      scope: params.scope,
      isActive: params.isActive,
      // LAST and unconditional: the caller does not name its own tenant.
      entityId,
    },
  });
  return toExecutionGate(row);
}

export async function evaluateGates(
  action: QueuedAction,
  context: Record<string, unknown>
): Promise<{ passed: boolean; blockedBy?: ExecutionGate; reason?: string }> {
  const applicableGates = await getApplicableGates(action);

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

export async function listGates(
  entityId: VerifiedEntityId,
  scope?: string
): Promise<ExecutionGate[]> {
  const rows = await prisma.executionGateRule.findMany({
    where: {
      ...(scope ? { scope } : {}),
      // Applied last and unconditionally, so no filter combination widens it.
      OR: [{ entityId }, { entityId: null, scope: 'GLOBAL' }],
    },
    orderBy: { createdAt: 'asc' },
  });

  return rows.map(toExecutionGate);
}

export async function updateGate(
  gateId: string,
  updates: Partial<Omit<ExecutionGate, 'id' | 'entityId'>>,
  entityId: VerifiedEntityId
): Promise<ExecutionGate> {
  const data: Record<string, unknown> = {};
  if (updates.name !== undefined) data.name = updates.name;
  if (updates.expression !== undefined) data.expression = updates.expression;
  if (updates.description !== undefined) data.description = updates.description;
  if (updates.scope !== undefined) data.scope = updates.scope;
  if (updates.isActive !== undefined) data.isActive = updates.isActive;

  // updateMany, not update: a unique WHERE cannot carry the entity, so a
  // foreign gate would be editable by anyone who knew its id.
  const { count } = await prisma.executionGateRule.updateMany({
    where: { id: gateId, entityId },
    data,
  });

  if (count === 0) {
    throw new Error(`Gate ${gateId} not found`);
  }

  const row = await prisma.executionGateRule.findFirst({
    where: { id: gateId, entityId },
  });
  if (!row) {
    throw new Error(`Gate ${gateId} not found`);
  }
  return toExecutionGate(row);
}

export async function deleteGate(
  gateId: string,
  entityId: VerifiedEntityId
): Promise<void> {
  const { count } = await prisma.executionGateRule.deleteMany({
    where: { id: gateId, entityId },
  });
  if (count === 0) {
    throw new Error(`Gate ${gateId} not found`);
  }
}

// ---------------------------------------------------------------------------
// P-27 (T-038) — THE HALT. "...and the agent stops."
// ---------------------------------------------------------------------------
//
// `fireDeadManSwitch` used to execute a protocol by writing one audit row
// naming it. After it fired, measurably: every worker kept consuming, and a
// workflow triggered a second later ran to completion. The switch was a record
// that something had happened, attached to nothing that made it happen.
//
// WHAT "STOPS" MEANS HERE, AND WHAT IT DOES NOT
//
// REJECTED — pausing the BullMQ queues. `queue.pause()` is durable (the flag
// lives in Redis) and it is trivially observable, but the queues are shared by
// every tenant on the platform. One user's contingency plan would be everyone
// else's outage. A kill switch that cannot be scoped to its owner is not a
// safety feature, it is a denial of service anybody can trip.
//
// REJECTED — shutting the workers down. Same blast radius, plus it does not
// survive the restart it would immediately provoke: `restart: unless-stopped`
// brings the container straight back with the halt forgotten. The stop has to
// outlive the process, so it has to be a row.
//
// CHOSEN — a row in `ExecutionGateRule`, the platform's one real halt
// primitive, which P-09 already made durable and tenant-scoped for exactly this
// class of problem. The row is an ordinary gate with the expression `false`, so
// it is not a second mechanism bolted alongside the first: `evaluateGates`
// above already refuses every action of an entity that owns one, with no change
// to that function at all. What P-27 adds is the workflow engine consulting the
// same table before it starts a run and at every node boundary.
//
// GUARANTEES IT GIVES:
//   * it survives a process restart, a deploy, and a second process — it is in
//     Postgres, and every check is a read of Postgres;
//   * it is scoped to the entities of the user who tripped it, so no other
//     tenant is affected;
//   * it is reversible by the product's own path — `checkIn()` releases it —
//     rather than by a DBA;
//   * it blocks the queued-action path for free, because `evaluateGates` was
//     already the gatekeeper there.
//
// GUARANTEES IT DOES NOT GIVE:
//   * a run already inside a node when the switch fires finishes that node. The
//     check is at the node boundary, not inside `executeAction`; a handler that
//     has already sent an email cannot be un-sent by a row appearing;
//   * it does not stop the non-workflow workers (email, sms, capture). Those
//     consume jobs enqueued before the halt and have no entity gate of their
//     own. Named in the PR body; not silently implied by the word "stops".

/** The `name` every halt row carries. The handle for finding and lifting one. */
export const HALT_GATE_NAME = 'PLATFORM_HALT';

/**
 * The expression that makes a gate a halt.
 *
 * `evaluateExpression('false', ...)` is a boolean literal, evaluates to false,
 * and `evaluateGates` reports `passed: false` — so a halt row is understood by
 * the gate evaluator that already exists rather than by a special case.
 */
const HALT_EXPRESSION = 'false';

/**
 * Raised when something tries to start work for a halted entity.
 *
 * Carries the entity so a route can say which tenant is stopped without
 * re-deriving it, and so the message never has to be parsed.
 */
export class ExecutionHaltedError extends Error {
  readonly entityId: string;

  constructor(entityId: string) {
    super(`Execution is halted for entity ${entityId}`);
    this.name = 'ExecutionHaltedError';
    this.entityId = entityId;
  }
}

/**
 * Stop all execution for these entities. Returns how many rows were written.
 *
 * `entityIds` are plain strings, and the rule that makes that safe is the same
 * one `createTaskForEntityOwner` runs on: they must have been read off a
 * database column — `Entity.userId` for the user whose switch fired — never off
 * a request. There is no caller to authorise here; the dead man switch is
 * user-scoped and the user is, by definition, unreachable.
 *
 * Idempotent: an entity already halted is re-halted with the current reason
 * rather than accumulating rows, so a scheduler calling this on every tick does
 * not fill the table.
 */
export async function haltEntities(
  entityIds: string[],
  reason: string
): Promise<number> {
  if (entityIds.length === 0) return 0;

  await prisma.executionGateRule.deleteMany({
    where: { name: HALT_GATE_NAME, entityId: { in: entityIds } },
  });

  const { count } = await prisma.executionGateRule.createMany({
    data: entityIds.map((entityId) => ({
      name: HALT_GATE_NAME,
      expression: HALT_EXPRESSION,
      description: reason,
      scope: 'ENTITY',
      entityId,
      isActive: true,
    })),
  });

  return count;
}

/** Lift the halt on these entities. Returns how many rows were removed. */
export async function releaseEntities(entityIds: string[]): Promise<number> {
  if (entityIds.length === 0) return 0;

  const { count } = await prisma.executionGateRule.deleteMany({
    where: { name: HALT_GATE_NAME, entityId: { in: entityIds } },
  });

  return count;
}

/**
 * Is execution stopped for this entity?
 *
 * A plain string is accepted deliberately. This is a read whose only possible
 * effect is to REFUSE work, so the worst a forged id can do is halt nothing;
 * requiring a `VerifiedEntityId` would instead make the check unreachable from
 * the worker process, which has no request and is precisely where it is needed.
 */
export async function isEntityHalted(entityId: string): Promise<boolean> {
  const halt = await prisma.executionGateRule.findFirst({
    where: { name: HALT_GATE_NAME, entityId, isActive: true },
    select: { id: true },
  });
  return halt !== null;
}

/** `isEntityHalted`, as a guard. Throws `ExecutionHaltedError` when stopped. */
export async function assertNotHalted(entityId: string): Promise<void> {
  if (await isEntityHalted(entityId)) {
    throw new ExecutionHaltedError(entityId);
  }
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

/**
 * The gates that apply to one action.
 *
 * The scope is in the WHERE clause, so a gate belonging to another tenant is
 * simply not returned -- there is no post-filter to forget. A platform gate
 * (`entityId = null`, `scope = 'GLOBAL'`) applies to everyone; a tenant's own
 * gate applies only to that tenant's actions, whatever scope it declares.
 */
async function getApplicableGates(action: QueuedAction): Promise<ExecutionGate[]> {
  const rows = await prisma.executionGateRule.findMany({
    where: {
      OR: [
        { entityId: null, scope: 'GLOBAL' },
        { entityId: action.entityId },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(toExecutionGate);
}

// --- Testing Helpers ---

/** Remove every gate rule. Real deletes now -- there is no Map to clear. */
export async function _clearGateStore(): Promise<void> {
  await prisma.executionGateRule.deleteMany({});
}
