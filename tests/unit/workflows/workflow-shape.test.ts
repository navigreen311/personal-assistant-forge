// ============================================================================
// P-32 (T-039) — the workflow shape schemas
// ============================================================================
//
// Every case here is a value that STORED SUCCESSFULLY before this package, and
// the consequence of it having stored. The point of the file is not that zod
// works; it is that each of these shapes was reachable, was reached, and did
// something invisible.

import {
  parseWorkflowGraph,
  parseWorkflowTriggers,
  parseWorkflowStatus,
  readWorkflowGraph,
  workflowGraphSchema,
  workflowTriggerListSchema,
  WorkflowShapeError,
  WORKFLOW_STATUSES,
  TRIGGER_TYPES,
} from '@/modules/workflows/schemas/workflow-shape';
import { cronExpressionsOf } from '@/lib/queue/scheduler';
import { triggersMatchEvent } from '@/lib/queue/domain-events';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function actionNode(overrides: Record<string, unknown> = {}) {
  return {
    id: 'n-action',
    type: 'ACTION',
    label: 'Do the thing',
    config: {
      nodeType: 'ACTION',
      actionType: 'UPDATE_RECORD',
      parameters: { model: 'task', id: 't-1', data: { status: 'DONE' } },
    },
    position: { x: 0, y: 0 },
    inputs: [],
    outputs: [],
    ...overrides,
  };
}

function graphOf(...nodes: unknown[]) {
  return { nodes, edges: [] };
}

// ---------------------------------------------------------------------------
// The status set
// ---------------------------------------------------------------------------

describe('workflow status', () => {
  // The set was read off the code, not invented: `Workflow['status']` in
  // `src/shared/types`, `createWorkflow` writing DRAFT, `deleteWorkflow`
  // writing ARCHIVED, and the three ACTIVE-only gates in the scheduler, the
  // cron consumer and the domain-event worker.
  it('accepts exactly DRAFT, ACTIVE, PAUSED and ARCHIVED', () => {
    expect([...WORKFLOW_STATUSES].sort()).toEqual(
      ['ACTIVE', 'ARCHIVED', 'DRAFT', 'PAUSED'].sort()
    );
    for (const status of WORKFLOW_STATUSES) {
      expect(parseWorkflowStatus(status)).toBe(status);
    }
  });

  // THE TYPO. `status: z.string().optional()` accepted this, `updateWorkflow`
  // stored it, and the workflow was then invisible to `syncCronTriggers`,
  // `processCronTriggerJob` and `domain-event-worker` -- all three of which
  // compare against the literal 'ACTIVE'. It never ran again and nothing said
  // so.
  it('refuses ACTVIE', () => {
    expect(() => parseWorkflowStatus('ACTVIE')).toThrow(WorkflowShapeError);
  });

  it('refuses lowercase and unknown statuses', () => {
    expect(() => parseWorkflowStatus('active')).toThrow(WorkflowShapeError);
    expect(() => parseWorkflowStatus('ENABLED')).toThrow(WorkflowShapeError);
    expect(() => parseWorkflowStatus('')).toThrow(WorkflowShapeError);
  });
});

// ---------------------------------------------------------------------------
// The node union — discriminated on config.nodeType
// ---------------------------------------------------------------------------

describe('node config union', () => {
  it('accepts a well-formed node of every node type', () => {
    const configs: Record<string, unknown>[] = [
      { nodeType: 'TRIGGER', triggerType: 'MANUAL' },
      { nodeType: 'ACTION', actionType: 'CREATE_TASK', parameters: {} },
      { nodeType: 'CONDITION', expression: 'x > 1', trueOutputId: 'a', falseOutputId: 'b' },
      { nodeType: 'AI_DECISION', decisionType: 'CLASSIFY', prompt: 'p', outputMapping: {} },
      {
        nodeType: 'HUMAN_APPROVAL',
        approverIds: ['u1'],
        message: 'ok?',
        timeoutHours: 24,
        requiredApprovals: 1,
      },
      { nodeType: 'DELAY', delayType: 'FIXED', delayMs: 1000 },
      {
        nodeType: 'LOOP',
        collection: 'items',
        iteratorVariable: 'item',
        bodyNodeIds: [],
        maxIterations: 10,
      },
      { nodeType: 'ERROR_HANDLER', errorTypes: ['*'], notifyOnError: true },
      { nodeType: 'SUB_WORKFLOW', workflowId: 'w1', inputMapping: {}, outputMapping: {} },
    ];

    for (const config of configs) {
      const nodeType = config.nodeType as string;
      const graph = parseWorkflowGraph(
        graphOf(actionNode({ id: `n-${nodeType}`, type: nodeType, config }))
      );
      expect(graph.nodes[0].config.nodeType).toBe(nodeType);
    }
  });

  // `nodes: z.array(z.record(z.string(), z.unknown()))` accepted `[{}]`.
  // `executeNode` switches on `node.config.nodeType`, falls to `default:`,
  // marks the step SKIPPED with "Unknown node type: undefined" -- and the run
  // then reports COMPLETED having done nothing at all.
  it('refuses a node with no config', () => {
    expect(() => parseWorkflowGraph(graphOf({}))).toThrow(WorkflowShapeError);
    expect(() =>
      parseWorkflowGraph(graphOf({ id: 'n1', type: 'ACTION', config: {} }))
    ).toThrow(WorkflowShapeError);
  });

  it('refuses a nodeType the executor has no case for', () => {
    expect(() =>
      parseWorkflowGraph(
        graphOf(actionNode({ type: 'ACTION', config: { nodeType: 'SEND_EMAIL' } }))
      )
    ).toThrow(WorkflowShapeError);
  });

  // Each of these fields is read UNCONDITIONALLY by the handler the dispatch
  // sends the node to.
  it.each([
    ['ACTION without actionType', { nodeType: 'ACTION', parameters: {} }],
    ['ACTION without parameters', { nodeType: 'ACTION', actionType: 'CREATE_TASK' }],
    ['ACTION with an unknown actionType', { nodeType: 'ACTION', actionType: 'FLY', parameters: {} }],
    ['CONDITION without expression', { nodeType: 'CONDITION', trueOutputId: 'a', falseOutputId: 'b' }],
    ['DELAY without delayType', { nodeType: 'DELAY', delayMs: 5 }],
    ['LOOP without maxIterations', { nodeType: 'LOOP', collection: 'c', iteratorVariable: 'i', bodyNodeIds: [] }],
    ['SUB_WORKFLOW without workflowId', { nodeType: 'SUB_WORKFLOW', inputMapping: {}, outputMapping: {} }],
    ['HUMAN_APPROVAL without requiredApprovals', { nodeType: 'HUMAN_APPROVAL', approverIds: [], message: '', timeoutHours: 1 }],
    ['ERROR_HANDLER without notifyOnError', { nodeType: 'ERROR_HANDLER', errorTypes: [] }],
  ])('refuses %s', (_name, config) => {
    const nodeType = (config as { nodeType: string }).nodeType;
    expect(() =>
      parseWorkflowGraph(graphOf(actionNode({ type: nodeType, config })))
    ).toThrow(WorkflowShapeError);
  });

  // REQUIRED KEY, PERMISSIVE VALUE. The designer drops a CONDITION with three
  // empty strings and the author fills them in; refusing to SAVE that is a
  // designer nobody can use. The refusal above is for the key being ABSENT.
  it('accepts the empty-string defaults the designer produces', () => {
    expect(() =>
      parseWorkflowGraph(
        graphOf(
          actionNode({
            type: 'CONDITION',
            config: { nodeType: 'CONDITION', expression: '', trueOutputId: '', falseOutputId: '' },
          })
        )
      )
    ).not.toThrow();
  });

  // Stripping would make this schema quietly delete fields off a caller's
  // stored graph, which is a worse failure than the one being fixed.
  it('keeps unknown keys rather than stripping them', () => {
    const graph = parseWorkflowGraph(
      graphOf(actionNode({ config: { nodeType: 'TRIGGER', triggerType: 'EVENT', config: { taskId: 't-1' } }, type: 'TRIGGER' }))
    );
    expect((graph.nodes[0].config as unknown as Record<string, unknown>).config).toEqual({
      taskId: 't-1',
    });
  });
});

// ---------------------------------------------------------------------------
// THE DIVERGENCE: type vs config.nodeType
// ---------------------------------------------------------------------------

describe('node.type must agree with node.config.nodeType', () => {
  // P-31 established that `config.nodeType` is the authority: every dispatch in
  // `executeNode` reads it. `simulation-service` estimates from `node.type`.
  // Nothing compared them, so this graph previewed as a five-minute wait that
  // does nothing and then, on the real run, updated a record.
  it('refuses a node simulated as a DELAY and executed as an ACTION', () => {
    expect(() =>
      parseWorkflowGraph(
        graphOf(
          actionNode({
            type: 'DELAY',
            config: {
              nodeType: 'ACTION',
              actionType: 'UPDATE_RECORD',
              parameters: { model: 'task', id: 't-1', data: { status: 'DONE' } },
            },
          })
        )
      )
    ).toThrow(/declared type DELAY but its config\.nodeType is ACTION/);
  });

  it('refuses the disagreement in the other direction too', () => {
    expect(() =>
      parseWorkflowGraph(
        graphOf(
          actionNode({
            type: 'ACTION',
            config: { nodeType: 'DELAY', delayType: 'FIXED', delayMs: 1 },
          })
        )
      )
    ).toThrow(WorkflowShapeError);
  });

  // The read side is weaker than the write side everywhere EXCEPT here: a
  // disagreement is what makes the dispatch wrong, so a stored row carrying one
  // is refused at the moment it would have run, by name.
  it('is refused on the read side as well', () => {
    expect(() =>
      readWorkflowGraph(
        graphOf(
          actionNode({
            type: 'DELAY',
            config: { nodeType: 'ACTION', actionType: 'CREATE_TASK', parameters: {} },
          })
        ),
        'w-1'
      )
    ).toThrow(/simulated as one node type and executed as another/);
  });
});

// ---------------------------------------------------------------------------
// Graph-level structure
// ---------------------------------------------------------------------------

describe('graph structure', () => {
  // A blank workflow is a real thing: the designer creates one before anything
  // is dragged onto the canvas. The place that refuses to RUN an empty graph is
  // `readWorkflowGraph`, which is a different question.
  it('accepts an empty graph at write time and refuses to run it', () => {
    expect(parseWorkflowGraph({ nodes: [], edges: [] })).toEqual({ nodes: [], edges: [] });
    expect(() => readWorkflowGraph({ nodes: [], edges: [] }, 'w-1')).toThrow(
      'Workflow w-1 has no nodes'
    );
    // The Prisma column's own default value.
    expect(() => readWorkflowGraph([], 'w-1')).toThrow('Workflow w-1 has no nodes');
  });

  // `graph.nodes.find(n => n.id === ...)` is how `getNextNodes` and
  // `resumePointOf` resolve a node id. With a duplicate, which one runs is
  // decided by array order.
  it('refuses duplicate node ids', () => {
    expect(() =>
      parseWorkflowGraph(graphOf(actionNode({ id: 'dup' }), actionNode({ id: 'dup' })))
    ).toThrow(/duplicate node id "dup"/);
    expect(() =>
      readWorkflowGraph(graphOf(actionNode({ id: 'dup' }), actionNode({ id: 'dup' })), 'w-1')
    ).toThrow(/two nodes with id "dup"/);
  });

  // `getNextNodes` drops an edge whose target does not resolve, so the walk
  // stops -- and a run that stopped early is recorded COMPLETED.
  it('refuses an edge pointing at a node that is not in the graph', () => {
    expect(() =>
      parseWorkflowGraph({
        nodes: [actionNode({ id: 'a' })],
        edges: [{ id: 'e1', sourceNodeId: 'a', targetNodeId: 'ghost' }],
      })
    ).toThrow(/points at node "ghost"/);
  });

  // Canvas decoration. The executor reads none of these -- it walks
  // `graph.edges` and dispatches on `config.nodeType` -- so a graph is not
  // refused for want of an x coordinate.
  it('defaults label, position, inputs and outputs', () => {
    const graph = parseWorkflowGraph({
      nodes: [
        {
          id: 'n1',
          type: 'ACTION',
          config: { nodeType: 'ACTION', actionType: 'CREATE_TASK', parameters: {} },
        },
      ],
      edges: [],
    });
    expect(graph.nodes[0]).toMatchObject({
      label: '',
      position: { x: 0, y: 0 },
      inputs: [],
      outputs: [],
    });
  });

  it('refuses a node with no id', () => {
    expect(() =>
      parseWorkflowGraph(
        graphOf({ type: 'ACTION', config: { nodeType: 'ACTION', actionType: 'CREATE_TASK', parameters: {} } })
      )
    ).toThrow(WorkflowShapeError);
  });

  it('refuses a graph that is not a graph', () => {
    for (const bad of [null, 'graph', 42, [], { nodes: 'many' }]) {
      expect(workflowGraphSchema.safeParse(bad).success).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Workflow.triggers — the list that decides whether anything ever fires
// ---------------------------------------------------------------------------

describe('stored triggers', () => {
  it('accepts a bare TriggerNodeConfig', () => {
    expect(
      parseWorkflowTriggers([{ nodeType: 'TRIGGER', triggerType: 'EVENT', eventName: 'task.created' }])
    ).toEqual([{ nodeType: 'TRIGGER', triggerType: 'EVENT', eventName: 'task.created' }]);
  });

  // `nodeType` is a constant in this list, so it is defaulted rather than
  // demanded. This is the shape leg 4 of the end-to-end proof sends.
  it('defaults nodeType when it is omitted', () => {
    expect(parseWorkflowTriggers([{ triggerType: 'EVENT', eventName: 'task.created' }])).toEqual([
      { nodeType: 'TRIGGER', triggerType: 'EVENT', eventName: 'task.created' },
    ]);
  });

  it('refuses a nodeType that is present and wrong', () => {
    expect(() =>
      parseWorkflowTriggers([{ nodeType: 'ACTION', triggerType: 'MANUAL' }])
    ).toThrow(WorkflowShapeError);
  });

  // THE UI SHAPE. `InlineCreateWorkflowModal` posts `{ type, config }`, and so
  // does `handleDuplicate` with what it read back from `GET /api/workflows`.
  // `createWorkflow` reads `t.triggerType`, so before this the row stored
  // `{ type: null, config: { type: 'TIME', config: {} } }` and matched nothing.
  it('normalises the { type, config } wrapper the browser sends', () => {
    expect(
      parseWorkflowTriggers([
        { type: 'TIME', config: { cronExpression: '0 9 * * MON-FRI' } },
      ])
    ).toEqual([
      { nodeType: 'TRIGGER', triggerType: 'TIME', cronExpression: '0 9 * * MON-FRI' },
    ]);
  });

  // The read-then-write round trip `handleDuplicate` performs. `mapToWorkflow`
  // returns the wrapper with the full config inside; re-posting it used to
  // double-wrap and lose the trigger entirely.
  it('survives the duplicate round trip without double-wrapping', () => {
    const stored = [
      {
        type: 'EVENT',
        config: { nodeType: 'TRIGGER', triggerType: 'EVENT', eventName: 'contact.created' },
      },
    ];
    expect(parseWorkflowTriggers(stored)).toEqual([
      { nodeType: 'TRIGGER', triggerType: 'EVENT', eventName: 'contact.created' },
    ]);
  });

  // A MALFORMED TRIGGER IS REFUSED AT THE DOOR. Each of these stored fine
  // before, and each matched nothing forever, with nothing anywhere to say so.
  it.each([
    ['no triggerType at all', { nodeType: 'TRIGGER' }],
    ['a triggerType outside the union', { triggerType: 'ON_TUESDAY' }],
    ['TIME with no cronExpression', { triggerType: 'TIME' }],
    ['TIME with a blank cronExpression', { triggerType: 'TIME', cronExpression: '   ' }],
    ['EVENT with no eventName', { triggerType: 'EVENT' }],
    // The exact trigger leg 5 of P-20's end-to-end proof stored: an EVENT
    // trigger whose name is buried in an ad-hoc `config` key that no matcher
    // has ever read.
    ['EVENT with the name in an undeclared key', { triggerType: 'EVENT', config: { entity: 'task', event: 'created' } }],
    ['WEBHOOK with no webhookPath', { triggerType: 'WEBHOOK' }],
    ['CONDITION with no conditionExpression', { triggerType: 'CONDITION' }],
    ['the empty wrapper the create form used to send for TIME', { type: 'TIME', config: {} }],
    ['not an object', 'MANUAL'],
  ])('refuses a trigger with %s', (_name, trigger) => {
    expect(() => parseWorkflowTriggers([trigger])).toThrow(WorkflowShapeError);
  });

  it('accepts MANUAL and VOICE, which name no target', () => {
    expect(parseWorkflowTriggers([{ triggerType: 'MANUAL' }, { triggerType: 'VOICE' }])).toEqual([
      { nodeType: 'TRIGGER', triggerType: 'MANUAL' },
      { nodeType: 'TRIGGER', triggerType: 'VOICE' },
    ]);
  });

  it('declares exactly the six trigger types the type union declares', () => {
    expect([...TRIGGER_TYPES].sort()).toEqual(
      ['CONDITION', 'EVENT', 'MANUAL', 'TIME', 'VOICE', 'WEBHOOK'].sort()
    );
  });

  it('refuses a triggers value that is not an array', () => {
    expect(workflowTriggerListSchema.safeParse({ triggerType: 'MANUAL' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The point of all of it: what stores is what the matchers can match
// ---------------------------------------------------------------------------

describe('every trigger that stores is one a matcher can find', () => {
  // The schema is checked against the two SURVIVING matchers rather than
  // against the type declaration, because a schema that is stricter than the
  // matcher, or looser than it, is how a trigger ends up looking configured and
  // matching nothing. `workflow-crud` stores `{ type: t.triggerType, config: t }`,
  // so that is the shape handed to the matchers here.
  function asStored(triggers: unknown) {
    return parseWorkflowTriggers(triggers).map((t) => ({ type: t.triggerType, config: t }));
  }

  it('a TIME trigger that parses is a schedule the scheduler registers', () => {
    const stored = asStored([{ type: 'TIME', config: { cronExpression: '0 9 * * *' } }]);
    expect(cronExpressionsOf(stored)).toEqual(['0 9 * * *']);
  });

  it('an EVENT trigger that parses is one the domain-event worker matches', () => {
    const stored = asStored([{ triggerType: 'EVENT', eventName: 'task.created' }]);
    expect(triggersMatchEvent(stored, 'task.created')).toBe(true);
    expect(triggersMatchEvent(stored, 'task.updated')).toBe(false);
  });

  // The regression, stated as the thing it broke. This is what the browser's
  // "Scheduled (Time)" option produced, and the scheduler could not see it.
  it('the shape that used to store finds no schedule at all', () => {
    const asItUsedToStore = [{ type: undefined, config: { type: 'TIME', config: {} } }];
    expect(cronExpressionsOf(asItUsedToStore)).toEqual([]);
    expect(() => parseWorkflowTriggers([{ type: 'TIME', config: {} }])).toThrow(
      WorkflowShapeError
    );
  });
});
