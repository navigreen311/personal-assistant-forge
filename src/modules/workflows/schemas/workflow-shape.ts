// ============================================================================
// Workflow shape schemas — the one place a stored workflow's shape is checked
// ============================================================================
//
// P-32 (T-039). `POST /api/workflows` validated the graph as
//
//     graph: z.object({
//       nodes: z.array(z.record(z.string(), z.unknown())),
//       edges: z.array(z.record(z.string(), z.unknown())),
//     })
//
// -- "an array of objects with string keys", which every JSON object satisfies
// -- and then asserted the shape it had just declined to check:
//
//     graph: parsed.data.graph as unknown as WorkflowGraph
//
// `as unknown as` over an unvalidated input is `as any` wearing a hat. P-19
// removed 173 `as any` from this repository and found ten bugs behind them;
// these four casts were the same escape hatch spelled differently, and two
// bugs were behind them:
//
//   1. A trigger that is not a `TriggerNodeConfig` stored fine. `createWorkflow`
//      writes `{ type: t.triggerType, config: t }`, so a trigger with no
//      `triggerType` was stored with `type: null` and matched NOTHING, forever,
//      with no error anywhere. Both live browser create paths produced exactly
//      that (see `normalizeStoredTrigger` below), and so did leg 5 of P-20's
//      own end-to-end proof.
//
//   2. A node could be SIMULATED as one node type and EXECUTED as another.
//      `simulation-service` estimates from `node.type`; `executeNode` dispatches
//      on `node.config.nodeType`. Nothing ever compared them, so a node with
//      `type: 'DELAY'` and `config.nodeType: 'ACTION'` previewed as a harmless
//      wait and then sent the message.
//
// ============================================================================
// P-31 ESTABLISHED THE AUTHORITY, AND THIS FILE USES IT
// ============================================================================
//
// `config.nodeType` is the real node shape: every dispatch in `executeNode`
// reads it, and it is the union tag that decides which other fields a node
// needs. `node.type` is presentation and estimation only. So the union is
// discriminated on `config.nodeType`, and a node whose `type` disagrees with it
// is refused -- because that divergence is invisible until it runs.
//
// ============================================================================
// WHY THERE ARE TWO STRICTNESSES, AND WHERE THE LINE IS
// ============================================================================
//
// WRITE (`parseWorkflowGraph`, `parseWorkflowTriggers`) is a contract with a
// caller who is holding the request and can fix it. It is the full
// discriminated union: every field the node's own handler will reach for has to
// be there.
//
// READ (`readWorkflowGraph`, used by `graphOf` in the executor) is a row that
// already exists. The Prisma schema is FROZEN and there is no migration, so a
// read-side schema that refuses a stored row turns a silent bug into an outage
// -- and it refuses it at the moment somebody's automation was supposed to run.
// So the read side checks only what makes a dispatch WRONG rather than
// incomplete: the node has an id, its `config.nodeType` is a node type this
// executor knows, and its `type` does not contradict it. A field a handler
// needs and does not find still fails -- as one FAILED step with an error on
// the record, which is the executor's existing, per-node, recoverable failure
// mode -- instead of killing the whole run before it starts.
//
// MEASURED, not assumed. Across every PAF database on this machine there are
// three stored `Workflow` rows; all three are well-formed and pass both
// strictnesses. The rows that would fail are `prisma/seed.ts`'s six, whose
// `steps` is a legacy FLAT ARRAY with no `nodes` key at all -- and `graphOf`
// has refused those since P-31 ("has no nodes"), so they are already unrunnable
// and this change costs them nothing.
//
// ============================================================================
// REQUIRED KEY, PERMISSIVE VALUE
// ============================================================================
//
// `expression: z.string()` and not `z.string().min(1)`. The designer drops a
// CONDITION node with `expression: ''` and the user fills it in afterwards; a
// schema that refuses to SAVE a half-built graph is a designer that cannot be
// used. What is refused is the field being ABSENT, because absent is the state
// nothing downstream can distinguish from "the author meant nothing here".
// The enums are the exception -- `actionType`, `decisionType`, `delayType`,
// `triggerType` each select a code path, and a value outside the union selects
// none.
//
// Unknown keys are KEPT, not stripped (`z.looseObject`). Stripping would make
// this schema quietly delete fields off a caller's stored graph, which is a
// worse failure than the one being fixed.

import { z } from 'zod';
import type {
  WorkflowGraph,
  WorkflowNode,
  WorkflowEdge,
  TriggerNodeConfig,
} from '@/modules/workflows/types';

// ---------------------------------------------------------------------------
// The vocabularies, taken from the code rather than invented
// ---------------------------------------------------------------------------

/**
 * The statuses a workflow may hold.
 *
 * Determined from three places that had to agree, and do:
 *   - `Workflow['status']` in `src/shared/types` is the declared union.
 *   - `workflow-crud` writes `'DRAFT'` on create and `'ARCHIVED'` on delete.
 *   - `syncCronTriggers` registers a schedule only when `status === 'ACTIVE'`,
 *     `processCronTriggerJob` refuses to run a workflow that is not ACTIVE, and
 *     `domain-event-worker` queries `{ status: 'ACTIVE' }`.
 *
 * `PUT /api/workflows/:id` took `z.string()`, so `'ACTVIE'` stored fine and the
 * workflow was then invisible to all three of those and never ran again, with
 * no error and nothing in the UI to explain it. That is the whole reason this
 * enum exists.
 */
export const WORKFLOW_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'] as const;

export const workflowStatusSchema = z.enum(WORKFLOW_STATUSES);

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

/** Every `nodeType` `executeNode` has a case for. Mirrors `WorkflowNodeType`. */
export const WORKFLOW_NODE_TYPES = [
  'TRIGGER',
  'ACTION',
  'CONDITION',
  'AI_DECISION',
  'HUMAN_APPROVAL',
  'DELAY',
  'LOOP',
  'ERROR_HANDLER',
  'SUB_WORKFLOW',
] as const;

/**
 * The declared trigger types.
 *
 * WHAT CAN ACTUALLY FIRE, as of this package -- because a schema that accepts a
 * trigger nothing can match is the bug being fixed, not the fix:
 *   - TIME    -> `cronExpressionsOf` + `syncCronTriggers` (scheduler.ts)
 *   - EVENT   -> `eventNamesOf` + `triggersMatchEvent` (domain-events.ts, P-27)
 *   - MANUAL  -> a person calling `POST /api/workflows/:id/trigger`
 *   - CONDITION, VOICE, WEBHOOK -> NOTHING. `conditionExpression` appears in
 *     this repository exactly once, in the type declaration. `webhookPath`
 *     appears in the type and in one text input in `NodeConfigPanel`; there is
 *     no route that reads it. No producer anywhere reads a VOICE trigger.
 *
 * They are still accepted, because the frozen `TriggerNodeConfig` union
 * declares them and narrowing a public contract is not this package's call --
 * but they are required to be COMPLETE (below), so that when a producer is
 * built the stored rows are already usable, and the gap is recorded here
 * instead of being rediscovered as "my webhook trigger does nothing".
 */
export const TRIGGER_TYPES = [
  'TIME',
  'EVENT',
  'CONDITION',
  'MANUAL',
  'VOICE',
  'WEBHOOK',
] as const;

/** The trigger types no producer in this repository can currently fire. */
export const UNWIRED_TRIGGER_TYPES = ['CONDITION', 'VOICE', 'WEBHOOK'] as const;

const actionTypeSchema = z.enum([
  'SEND_MESSAGE',
  'CREATE_TASK',
  'UPDATE_RECORD',
  'GENERATE_DOCUMENT',
  'CALL_API',
  'TRIGGER_AI_ANALYSIS',
  'SEND_NOTIFICATION',
  'CREATE_EVENT',
  'UPDATE_CONTACT',
  'LOG_FINANCIAL',
  'EXECUTE_SCRIPT',
]);

const retryPolicySchema = z.looseObject({
  maxRetries: z.number(),
  backoffMs: z.number(),
  backoffMultiplier: z.number(),
  maxBackoffMs: z.number(),
});

// ---------------------------------------------------------------------------
// Node configs -- a discriminated union on `config.nodeType`
// ---------------------------------------------------------------------------

/**
 * A TRIGGER node's config, as it appears INSIDE the graph.
 *
 * Structural only: `nodeType` and `triggerType`, and nothing about whether the
 * trigger is complete. A TRIGGER node in the graph is documentation -- no
 * matcher reads it, `executeNode`'s TRIGGER case returns `{ triggered: true }`
 * and dispatches nothing. The list that decides whether anything ever fires is
 * `Workflow.triggers`, and THAT is where completeness is enforced
 * (`storedTriggerSchema`). Requiring a cron expression on a canvas node the
 * scheduler never reads would block saving a half-drawn graph for no gain.
 */
const triggerNodeConfigSchema = z.looseObject({
  nodeType: z.literal('TRIGGER'),
  triggerType: z.enum(TRIGGER_TYPES),
  cronExpression: z.string().optional(),
  eventName: z.string().optional(),
  webhookPath: z.string().optional(),
  conditionExpression: z.string().optional(),
});

const actionNodeConfigSchema = z.looseObject({
  nodeType: z.literal('ACTION'),
  actionType: actionTypeSchema,
  parameters: z.record(z.string(), z.unknown()),
  retryPolicy: retryPolicySchema.optional(),
  timeout: z.number().optional(),
});

const conditionNodeConfigSchema = z.looseObject({
  nodeType: z.literal('CONDITION'),
  expression: z.string(),
  trueOutputId: z.string(),
  falseOutputId: z.string(),
});

const aiDecisionNodeConfigSchema = z.looseObject({
  nodeType: z.literal('AI_DECISION'),
  decisionType: z.enum(['CLASSIFY', 'SCORE', 'DRAFT', 'SUMMARIZE', 'RECOMMEND', 'EXTRACT']),
  prompt: z.string(),
  model: z.string().optional(),
  outputMapping: z.record(z.string(), z.string()),
  confidenceThreshold: z.number().optional(),
});

const humanApprovalNodeConfigSchema = z.looseObject({
  nodeType: z.literal('HUMAN_APPROVAL'),
  approverIds: z.array(z.string()),
  message: z.string(),
  timeoutHours: z.number(),
  escalateAfter: z.number().optional(),
  escalateTo: z.array(z.string()).optional(),
  requiredApprovals: z.number(),
});

const delayNodeConfigSchema = z.looseObject({
  nodeType: z.literal('DELAY'),
  delayMs: z.number().optional(),
  delayUntil: z.string().optional(),
  delayType: z.enum(['FIXED', 'UNTIL', 'BUSINESS_HOURS']),
});

const loopNodeConfigSchema = z.looseObject({
  nodeType: z.literal('LOOP'),
  collection: z.string(),
  iteratorVariable: z.string(),
  bodyNodeIds: z.array(z.string()),
  maxIterations: z.number(),
});

const errorHandlerNodeConfigSchema = z.looseObject({
  nodeType: z.literal('ERROR_HANDLER'),
  errorTypes: z.array(z.string()),
  retryPolicy: retryPolicySchema.optional(),
  fallbackNodeId: z.string().optional(),
  notifyOnError: z.boolean(),
});

const subWorkflowNodeConfigSchema = z.looseObject({
  nodeType: z.literal('SUB_WORKFLOW'),
  workflowId: z.string(),
  inputMapping: z.record(z.string(), z.string()),
  outputMapping: z.record(z.string(), z.string()),
});

export const workflowNodeConfigSchema = z.discriminatedUnion('nodeType', [
  triggerNodeConfigSchema,
  actionNodeConfigSchema,
  conditionNodeConfigSchema,
  aiDecisionNodeConfigSchema,
  humanApprovalNodeConfigSchema,
  delayNodeConfigSchema,
  loopNodeConfigSchema,
  errorHandlerNodeConfigSchema,
  subWorkflowNodeConfigSchema,
]);

// ---------------------------------------------------------------------------
// Nodes, edges, graph
// ---------------------------------------------------------------------------

/**
 * THE CHECK NOTHING PERFORMED.
 *
 * `simulation-service` reads `node.type` to say what a node WOULD do and what
 * it would cost; `executeNode` reads `node.config.nodeType` to decide what it
 * DOES. Nothing compared them, so a graph could preview as one workflow and run
 * as a different one, and no test, log line or screen could tell.
 */
function refuseTypeDisagreement(
  node: { id: string; type: string; config: { nodeType: string } },
  ctx: z.RefinementCtx
): void {
  if (node.type !== node.config.nodeType) {
    ctx.addIssue({
      code: 'custom',
      path: ['config', 'nodeType'],
      message:
        `node "${node.id}" is declared type ${node.type} but its config.nodeType is ` +
        `${node.config.nodeType}. The simulator estimates from type and the executor ` +
        `dispatches on config.nodeType, so this node would be previewed as one kind of ` +
        `node and run as another. They must be the same value.`,
    });
  }
}

/**
 * `label`, `position`, `inputs` and `outputs` are DEFAULTED, not required.
 *
 * The executor reads none of them -- it walks `graph.edges` and dispatches on
 * `config.nodeType`. They are canvas decoration, and refusing a graph for want
 * of an `x` coordinate would be refusing to run an automation over a drawing
 * detail. `id` and `config` are required, because both are load-bearing.
 */
const workflowNodeSchema = z
  .looseObject({
    id: z.string().min(1),
    type: z.enum(WORKFLOW_NODE_TYPES),
    label: z.string().default(''),
    config: workflowNodeConfigSchema,
    position: z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
    inputs: z.array(z.string()).default([]),
    outputs: z.array(z.string()).default([]),
  })
  .superRefine(refuseTypeDisagreement);

const workflowEdgeSchema = z.looseObject({
  id: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  condition: z.string().optional(),
  label: z.string().optional(),
});

/**
 * A whole graph.
 *
 * `nodes: []` is ALLOWED. A blank workflow is a real thing -- the designer
 * creates one before anything is dragged onto the canvas -- and the place that
 * refuses to RUN an empty graph is `graphOf`, which has done so since P-31.
 * Write-time and run-time are different questions and this is the one the
 * caller can still answer.
 */
export const workflowGraphSchema = z
  .looseObject({
    nodes: z.array(workflowNodeSchema).default([]),
    edges: z.array(workflowEdgeSchema).default([]),
  })
  .superRefine((graph, ctx) => {
    const seen = new Set<string>();
    for (const node of graph.nodes) {
      if (seen.has(node.id)) {
        // `graph.nodes.find(n => n.id === ...)` is how the executor resolves a
        // node id -- in `getNextNodes`, and in `resumePointOf` when a parked run
        // wakes up. With a duplicate id it silently picks the first, so which of
        // the two nodes runs is decided by array order.
        ctx.addIssue({
          code: 'custom',
          path: ['nodes'],
          message: `duplicate node id "${node.id}": node ids must be unique within a graph`,
        });
      }
      seen.add(node.id);
    }

    for (const [index, edge] of graph.edges.entries()) {
      for (const end of ['sourceNodeId', 'targetNodeId'] as const) {
        if (!seen.has(edge[end])) {
          // `getNextNodes` drops an edge whose target does not resolve, so the
          // walk just stops -- and a run that stopped early is recorded
          // COMPLETED. A dangling edge is a truncated workflow that reports
          // success.
          ctx.addIssue({
            code: 'custom',
            path: ['edges', index, end],
            message: `edge "${edge.id}" points at node "${edge[end]}", which is not in this graph`,
          });
        }
      }
    }
  });

// ---------------------------------------------------------------------------
// `Workflow.triggers` -- the list that decides whether anything ever fires
// ---------------------------------------------------------------------------

/**
 * Fold the shapes that reach this list into one `TriggerNodeConfig`.
 *
 * THREE shapes arrive here, and only one of them is what `createWorkflow`
 * expects. That mismatch is a live bug on both browser create paths:
 *
 *   a. `{ nodeType, triggerType, ... }` -- the bare `TriggerNodeConfig` the
 *      service's `triggers.map(t => ({ type: t.triggerType, config: t }))`
 *      assumes it is given. Only the proof file ever sent it.
 *
 *   b. `{ type, config }` -- the WRAPPER shape. `InlineCreateWorkflowModal`
 *      posts `[{ type: 'TIME', config: {} }]`, so `t.triggerType` was undefined
 *      and the row stored `{ type: null, config: { type: 'TIME', config: {} } }`
 *      -- and `cronExpressionsOf` finds no `triggerType` and no `type` inside
 *      that, so choosing "Scheduled (Time)" in the UI produced a workflow that
 *      could never fire. `handleDuplicate` is worse: it re-posts the wrappers
 *      it read back from `GET /api/workflows`, so every duplicate double-wraps
 *      and loses its trigger.
 *
 *   c. the wrapper with a well-formed config inside -- what `mapToWorkflow`
 *      returns for a correctly stored row, which is what makes (b)'s
 *      read-then-write round trip so easy to write by accident.
 *
 * All three are normalised to (a) rather than rejected, because the wrapper is
 * ALREADY the shape both surviving matchers read (`cronExpressionsOf` and
 * `eventNamesOf` both do `config.triggerType ?? record.type`) -- so rejecting it
 * would be making the schema stricter than the matcher, which is how you ship a
 * schema that accepts only triggers nothing can match. Normalising instead
 * repairs the two live UI paths at the same time.
 *
 * The inner config wins over the wrapper's `type` when both are present: it is
 * the one carrying the rest of the trigger.
 */
function normalizeStoredTrigger(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  const record = value as Record<string, unknown>;

  // (a) already a TriggerNodeConfig.
  if ('triggerType' in record) return record;

  // (b)/(c) the `{ type, config }` wrapper.
  if (typeof record.type === 'string') {
    const inner =
      record.config !== null &&
      typeof record.config === 'object' &&
      !Array.isArray(record.config)
        ? (record.config as Record<string, unknown>)
        : {};
    return {
      ...inner,
      nodeType: 'TRIGGER',
      triggerType: inner.triggerType ?? record.type,
    };
  }

  return record;
}

/**
 * The field a trigger of this type needs before it can match anything.
 *
 * A TIME trigger with no `cronExpression` is not "a schedule with a default" --
 * `cronExpressionsOf` returns nothing for it and no repeatable job is ever
 * registered. An EVENT trigger with no `eventName` is not matched by
 * `triggersMatchEvent` against any event that will ever be published. Both
 * store perfectly today and are indistinguishable, from every screen and every
 * log, from a trigger that is simply waiting.
 */
const REQUIRED_TRIGGER_FIELD: Partial<
  Record<(typeof TRIGGER_TYPES)[number], 'cronExpression' | 'eventName' | 'webhookPath' | 'conditionExpression'>
> = {
  TIME: 'cronExpression',
  EVENT: 'eventName',
  WEBHOOK: 'webhookPath',
  CONDITION: 'conditionExpression',
};

/**
 * One entry of `Workflow.triggers`.
 *
 * `nodeType` is DEFAULTED here and required in the graph. In the graph it is
 * the discriminator of a nine-way union and has real work to do; in this list
 * every entry is a trigger by construction, so demanding the caller repeat the
 * constant would reject the proof file's honest `{ triggerType: 'EVENT',
 * eventName: 'task.created' }` for saying nothing wrong. A `nodeType` that is
 * PRESENT and not `'TRIGGER'` is still refused.
 */
const storedTriggerSchema = z.preprocess(
  normalizeStoredTrigger,
  z
    .looseObject({
      nodeType: z.literal('TRIGGER').default('TRIGGER'),
      triggerType: z.enum(TRIGGER_TYPES),
      cronExpression: z.string().optional(),
      eventName: z.string().optional(),
      webhookPath: z.string().optional(),
      conditionExpression: z.string().optional(),
    })
    .superRefine((trigger, ctx) => {
      const field = REQUIRED_TRIGGER_FIELD[trigger.triggerType];
      if (!field) return;
      const value = trigger[field];
      if (typeof value !== 'string' || value.trim().length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message:
            `a ${trigger.triggerType} trigger needs a non-empty ${field}. Without it the ` +
            `trigger stores successfully and matches nothing, forever, with no error.`,
        });
      }
    })
);

export const workflowTriggerListSchema = z.array(storedTriggerSchema);

// ---------------------------------------------------------------------------
// Write-side entry points
// ---------------------------------------------------------------------------

/** A shape a caller sent that a workflow cannot be built from. */
export class WorkflowShapeError extends Error {
  readonly issues: z.core.$ZodIssue[];

  constructor(message: string, issues: z.core.$ZodIssue[]) {
    super(message);
    this.name = 'WorkflowShapeError';
    this.issues = issues;
  }
}

function orThrow<T>(result: z.ZodSafeParseResult<T>, what: string): T {
  if (!result.success) {
    throw new WorkflowShapeError(
      `Invalid workflow ${what}: ${z.prettifyError(result.error)}`,
      result.error.issues
    );
  }
  return result.data;
}

/**
 * Parse a graph off a request body, or throw `WorkflowShapeError`.
 *
 * WHERE THIS RUNS, AND WHAT IT DOES NOT COVER. It runs in the SERVICE
 * (`createWorkflow` / `updateWorkflow`) as well as in the two routes' zod
 * schemas. The routes alone would not be enough: a route-level schema misses
 * every server-side caller, and this run has already found one bug of exactly
 * that shape -- `handleCreateTask` was a third write path that skipped a check
 * two other paths performed. Putting it in the service means the check cannot
 * be skipped by adding a caller; keeping it in the routes means a bad request
 * still gets a 400 with field paths instead of a 500.
 *
 * WHAT IT STILL DOES NOT COVER: `prisma.workflow.create` called directly. The
 * seed script and four db-test fixtures do that, and no TypeScript service
 * boundary can stop them -- only a database constraint could, and the schema is
 * frozen. `readWorkflowGraph` is the backstop for anything that got in that way.
 */
export function parseWorkflowGraph(value: unknown): WorkflowGraph {
  const graph: WorkflowGraph = orThrow(workflowGraphSchema.safeParse(value), 'graph');
  return graph;
}

/** Parse and normalise a trigger list, or throw `WorkflowShapeError`. */
export function parseWorkflowTriggers(value: unknown): TriggerNodeConfig[] {
  const triggers: TriggerNodeConfig[] = orThrow(
    workflowTriggerListSchema.safeParse(value),
    'triggers'
  );
  return triggers;
}

/** Parse a status, or throw `WorkflowShapeError`. */
export function parseWorkflowStatus(value: unknown): WorkflowStatus {
  return orThrow(workflowStatusSchema.safeParse(value), 'status');
}

// ---------------------------------------------------------------------------
// Read-side entry point -- the single place a STORED graph is checked
// ---------------------------------------------------------------------------

const KNOWN_NODE_TYPES: ReadonlySet<string> = new Set(WORKFLOW_NODE_TYPES);

/**
 * Read a stored graph off a `Workflow.steps` column.
 *
 * This is the body of `graphOf`, which P-31 collapsed the repository's two
 * `steps as unknown as WorkflowGraph` casts into. It is deliberately weaker
 * than `parseWorkflowGraph` -- see the file header for why -- and checks the
 * three things that make a DISPATCH wrong rather than incomplete:
 *
 *   1. the node has an id, because the id is how a parked run finds its way
 *      back into the graph;
 *   2. `config.nodeType` is a node type `executeNode` has a case for, because
 *      the `default:` branch marks the step SKIPPED with "Unknown node type"
 *      and lets the run report COMPLETED having done nothing;
 *   3. `type` does not contradict `config.nodeType`, because that is a node
 *      simulated as one thing and executed as another.
 *
 * Everything else is left to the handlers, which already fail one step at a
 * time onto the execution record.
 *
 * The two "no nodes" messages are P-31's, unchanged: an empty or non-object
 * `steps` (the column's own Prisma default is `[]`) is not a graph.
 */
export function readWorkflowGraph(steps: unknown, workflowId: string): WorkflowGraph {
  if (typeof steps !== 'object' || steps === null || Array.isArray(steps)) {
    throw new Error(`Workflow ${workflowId} has no nodes`);
  }
  const record: Record<string, unknown> = { ...steps };
  const rawNodes = record.nodes;
  const rawEdges = record.edges;
  if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
    throw new Error(`Workflow ${workflowId} has no nodes`);
  }

  const nodes: WorkflowNode[] = rawNodes.map((raw, index) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`Workflow ${workflowId} node at index ${index} is not an object`);
    }
    const node = raw as Record<string, unknown>;
    const id = typeof node.id === 'string' && node.id.length > 0 ? node.id : null;
    if (id === null) {
      throw new Error(`Workflow ${workflowId} node at index ${index} has no id`);
    }

    const config = node.config;
    if (config === null || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error(`Workflow ${workflowId} node "${id}" has no config`);
    }
    const nodeType = (config as Record<string, unknown>).nodeType;
    if (typeof nodeType !== 'string' || !KNOWN_NODE_TYPES.has(nodeType)) {
      throw new Error(
        `Workflow ${workflowId} node "${id}" has config.nodeType ${JSON.stringify(nodeType)}, ` +
          `which is not a node type this executor can run`
      );
    }
    if (typeof node.type === 'string' && node.type !== nodeType) {
      throw new Error(
        `Workflow ${workflowId} node "${id}" is declared type ${node.type} but its ` +
          `config.nodeType is ${nodeType}; it would be simulated as one node type and ` +
          `executed as another`
      );
    }

    const position = node.position;
    return {
      ...node,
      id,
      type: nodeType,
      label: typeof node.label === 'string' ? node.label : '',
      position:
        position !== null && typeof position === 'object' && !Array.isArray(position)
          ? (position as { x: number; y: number })
          : { x: 0, y: 0 },
      inputs: Array.isArray(node.inputs) ? (node.inputs as string[]) : [],
      outputs: Array.isArray(node.outputs) ? (node.outputs as string[]) : [],
    } as WorkflowNode;
  });

  const seen = new Set<string>();
  for (const node of nodes) {
    if (seen.has(node.id)) {
      throw new Error(
        `Workflow ${workflowId} has two nodes with id "${node.id}"; which one runs would ` +
          `depend on array order`
      );
    }
    seen.add(node.id);
  }

  // An edge that is not an edge is DROPPED rather than fatal, which is what
  // `getNextNodes` already did with one (`graph.nodes.find(...)` returning
  // undefined). The write side now refuses to store one, so this only ever sees
  // a row from before this package.
  const edges: WorkflowEdge[] = [];
  for (const raw of Array.isArray(rawEdges) ? rawEdges : []) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const edge = raw as Record<string, unknown>;
    if (typeof edge.sourceNodeId !== 'string' || typeof edge.targetNodeId !== 'string') {
      continue;
    }
    edges.push({
      id: typeof edge.id === 'string' ? edge.id : `${edge.sourceNodeId}->${edge.targetNodeId}`,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      ...(typeof edge.condition === 'string' ? { condition: edge.condition } : {}),
      ...(typeof edge.label === 'string' ? { label: edge.label } : {}),
    });
  }

  return { nodes, edges };
}
