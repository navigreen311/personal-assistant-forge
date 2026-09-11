// ============================================================================
// VoiceForge — Call Scripting Engine
// Script CRUD, execution, branch evaluation, and validation
// ============================================================================

import { prisma } from '@/lib/db';
import type {
  CallScript,
  ScriptNode,
  ScriptBranch,
  ScriptExecution,
} from '@/modules/voiceforge/types';
import { generateJSON } from '@/lib/ai';
import type { VerifiedEntityId } from '@/shared/middleware/auth';

const DOC_TYPE = 'CALL_SCRIPT';

/**
 * A script draft whose scope has already been proven. See section 2.
 *
 * P-42 — READ THIS BEFORE PASSING A DRAFT TO ANYTHING THAT WANTS AN ID.
 *
 * `id` is absent from this type on purpose: a draft has not been persisted, so
 * it does not have one. `tests/e2e/voice-system.test.ts` used to start a call
 * execution from `(script as any).id` off one of these, which was `undefined`
 * at runtime and always had been — the cast was the only thing between that and
 * a compile error. `createScript` is what turns a draft into a `CallScript`
 * with a real id, and only a `CallScript` can be executed.
 */
export type ScriptDraft = Omit<
  CallScript,
  'id' | 'entityId' | 'version' | 'createdAt' | 'updatedAt'
> & { entityId: VerifiedEntityId };

function deserializeScript(doc: { id: string; entityId: string; version: number; content: string | null; status: string; createdAt: Date; updatedAt: Date }): CallScript {
  const data = JSON.parse(doc.content ?? '{}');
  return {
    id: doc.id,
    entityId: doc.entityId,
    name: data.name ?? '',
    description: data.description ?? '',
    nodes: data.nodes ?? [],
    startNodeId: data.startNodeId ?? '',
    version: doc.version,
    status: (data.status ?? doc.status) as CallScript['status'],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function serializeScript(data: Omit<CallScript, 'id' | 'version' | 'createdAt' | 'updatedAt'>): string {
  return JSON.stringify({
    name: data.name,
    description: data.description,
    nodes: data.nodes,
    startNodeId: data.startNodeId,
    status: data.status,
  });
}

export async function createScript(data: ScriptDraft): Promise<CallScript> {
  const doc = await prisma.document.create({
    data: {
      title: data.name,
      entityId: data.entityId,
      type: DOC_TYPE,
      content: serializeScript(data),
      status: data.status,
    },
  });
  return deserializeScript(doc);
}

export async function getScript(
  id: string,
  entityId: VerifiedEntityId
): Promise<CallScript | null> {
  const doc = await prisma.document.findFirst({
    where: { id, type: DOC_TYPE, entityId },
  });
  if (!doc) return null;
  return deserializeScript(doc);
}

export async function listScripts(entityId: VerifiedEntityId): Promise<CallScript[]> {
  const docs = await prisma.document.findMany({
    where: { entityId, type: DOC_TYPE },
    orderBy: { createdAt: 'desc' },
  });
  return docs.map(deserializeScript);
}

export async function updateScript(
  id: string,
  entityId: VerifiedEntityId,
  data: Partial<CallScript>
): Promise<CallScript> {
  const existing = await getScript(id, entityId);
  if (!existing) throw new Error(`Script ${id} not found`);

  const merged = { ...existing, ...data, entityId: existing.entityId };
  const res = await prisma.document.updateMany({
    where: { id, type: DOC_TYPE, entityId },
    data: {
      title: merged.name,
      content: serializeScript(merged),
      status: merged.status,
    },
  });
  if (res.count === 0) throw new Error(`Script ${id} not found`);

  const updated = await getScript(id, entityId);
  if (!updated) throw new Error(`Script ${id} not found`);
  return updated;
}

export function startExecution(
  scriptId: string,
  callId: string,
  startNodeId: string
): ScriptExecution {
  return {
    scriptId,
    callId,
    currentNodeId: startNodeId,
    visitedNodes: [startNodeId],
    collectedData: {},
    startedAt: new Date(),
  };
}

export function advanceNode(
  execution: ScriptExecution,
  input: string,
  nodes: ScriptNode[]
): ScriptExecution {
  const currentNode = nodes.find((n) => n.id === execution.currentNodeId);
  if (!currentNode) return execution;

  // If COLLECT_INFO, store collected data
  if (currentNode.type === 'COLLECT_INFO' && currentNode.collectField) {
    execution.collectedData[currentNode.collectField] = input;
  }

  // Evaluate branches first
  for (const branch of currentNode.branches) {
    if (evaluateBranch(branch, input, execution.collectedData)) {
      return {
        ...execution,
        currentNodeId: branch.targetNodeId,
        visitedNodes: [...execution.visitedNodes, branch.targetNodeId],
      };
    }
  }

  // Fall through to default next node
  if (currentNode.nextNodeId) {
    return {
      ...execution,
      currentNodeId: currentNode.nextNodeId,
      visitedNodes: [...execution.visitedNodes, currentNode.nextNodeId],
    };
  }

  return execution;
}

export function evaluateBranch(
  branch: ScriptBranch,
  input: string,
  context: Record<string, string>
): boolean {
  const condition = branch.condition.toLowerCase();
  const inputLower = input.toLowerCase();

  // keyword=<word> -> check if input contains the keyword
  if (condition.startsWith('keyword=')) {
    const keyword = condition.split('=')[1];
    return inputLower.includes(keyword);
  }

  // intent=<intent> -> check if input contains the intent keyword
  if (condition.startsWith('intent=')) {
    const intent = condition.split('=')[1];
    return inputLower.includes(intent);
  }

  // sentiment<N or sentiment>N -> placeholder based on positive/negative words
  if (condition.startsWith('sentiment')) {
    const positiveWords = ['great', 'good', 'yes', 'love', 'excellent', 'happy', 'sure', 'absolutely'];
    const negativeWords = ['bad', 'no', 'hate', 'terrible', 'awful', 'never', 'cancel', 'angry'];
    const posCount = positiveWords.filter((w) => inputLower.includes(w)).length;
    const negCount = negativeWords.filter((w) => inputLower.includes(w)).length;
    const sentiment = (posCount - negCount) / Math.max(posCount + negCount, 1);

    const op = condition.includes('<') ? '<' : '>';
    const threshold = parseFloat(condition.split(op)[1]);
    return op === '<' ? sentiment < threshold : sentiment > threshold;
  }

  // <field>=<value> -> check context
  if (condition.includes('=')) {
    const [field, value] = condition.split('=');
    if (context[field] !== undefined) {
      return context[field].toLowerCase() === value;
    }
  }

  // Fallback: check if input contains the condition as keyword
  return inputLower.includes(condition);
}

export function validateScript(
  script: CallScript
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const nodeIds = new Set(script.nodes.map((n) => n.id));

  // Check startNodeId exists
  if (!script.startNodeId) {
    errors.push('Missing startNodeId');
  } else if (!nodeIds.has(script.startNodeId)) {
    errors.push(`Start node "${script.startNodeId}" not found in nodes`);
  }

  // Check for empty nodes
  if (script.nodes.length === 0) {
    errors.push('Script has no nodes');
  }

  // Check branch targets exist
  for (const node of script.nodes) {
    for (const branch of node.branches) {
      if (!nodeIds.has(branch.targetNodeId)) {
        errors.push(
          `Node "${node.id}" branch targets non-existent node "${branch.targetNodeId}"`
        );
      }
    }
    if (node.nextNodeId && !nodeIds.has(node.nextNodeId)) {
      errors.push(
        `Node "${node.id}" default next targets non-existent node "${node.nextNodeId}"`
      );
    }
  }

  // Check for unreachable nodes (BFS from startNodeId)
  if (script.startNodeId && nodeIds.has(script.startNodeId)) {
    const reachable = new Set<string>();
    const queue = [script.startNodeId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (reachable.has(current)) continue;
      reachable.add(current);

      const node = script.nodes.find((n) => n.id === current);
      if (!node) continue;

      for (const branch of node.branches) {
        if (!reachable.has(branch.targetNodeId)) {
          queue.push(branch.targetNodeId);
        }
      }
      if (node.nextNodeId && !reachable.has(node.nextNodeId)) {
        queue.push(node.nextNodeId);
      }
    }

    for (const nodeId of nodeIds) {
      if (!reachable.has(nodeId)) {
        errors.push(`Node "${nodeId}" is unreachable from start node`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// P-42 — the generated draft could not be saved, and a cast hid it
// ---------------------------------------------------------------------------
//
// `generateScriptWithAI` asked the model for node types
//
//   GREETING, QUESTION, STATEMENT, BRANCH, OBJECTION_HANDLER, CLOSING
//
// and then wrote `n.type as ScriptNode['type']`. `ScriptNode['type']` is
// `SPEAK | LISTEN | BRANCH | TRANSFER | END | COLLECT_INFO`, so five of those
// six names are not node types at all. The cast made it compile; nothing made
// it work. `POST /api/voice/scripts` validates `nodes[].type` against a zod
// enum of the REAL six, so every AI-generated draft was rejected 400 by the
// only route that can persist one — and `validateScript` would happily call the
// same draft valid, because it checks graph reachability and never looks at a
// type. The prompt and the schema described different systems and the cast kept
// them from meeting.
//
// The prompt below now names the six types that exist. This map is kept for the
// old vocabulary because a model reading a paraphrase of the old prompt will
// still answer in it, and because it is what the existing tests send.
const NODE_TYPE_ALIASES: Record<string, ScriptNode['type']> = {
  SPEAK: 'SPEAK',
  LISTEN: 'LISTEN',
  BRANCH: 'BRANCH',
  TRANSFER: 'TRANSFER',
  END: 'END',
  COLLECT_INFO: 'COLLECT_INFO',
  // The old prompt's vocabulary, mapped to what the engine can execute.
  GREETING: 'SPEAK',
  STATEMENT: 'SPEAK',
  OBJECTION_HANDLER: 'SPEAK',
  QUESTION: 'LISTEN',
  CLOSING: 'END',
};

/**
 * Resolve a generated node type, or refuse the draft.
 *
 * It THROWS on an unrecognised type rather than defaulting to `SPEAK`. A
 * default would be this codebase's own failure mode one layer down: a script
 * that looks generated, saves cleanly, and runs a node the author never wrote.
 */
function resolveNodeType(nodeId: string, type: string): ScriptNode['type'] {
  const resolved = NODE_TYPE_ALIASES[type?.toUpperCase?.() ?? ''];
  if (!resolved) {
    throw new Error(
      `Generated script node "${nodeId}" has unsupported type "${type}". ` +
        `Supported types: SPEAK, LISTEN, BRANCH, TRANSFER, END, COLLECT_INFO.`
    );
  }
  return resolved;
}

export async function generateScriptWithAI(
  entityId: VerifiedEntityId,
  params: {
    purpose: string;
    targetAudience: string;
    tone: string;
    maxDuration: number;
    keyPoints: string[];
    complianceRequirements?: string[];
  }
): Promise<ScriptDraft> {
  const result = await generateJSON<{
    name: string;
    description: string;
    nodes: Array<{
      id: string;
      type: string;
      content: string;
      branches: Array<{ condition: string; targetNodeId: string }>;
    }>;
    startNodeId: string;
  }>(`Generate a call script for the following scenario:

Purpose: ${params.purpose}
Target audience: ${params.targetAudience}
Tone: ${params.tone}
Max duration: ${params.maxDuration} minutes
Key points to cover: ${params.keyPoints.join(', ')}
Compliance requirements: ${params.complianceRequirements?.join(', ') ?? 'None specified'}

Generate a branching call script with:
- A greeting node
- Key discussion point nodes
- Decision branch nodes (e.g., "interested" vs "not interested")
- Objection handling nodes
- Closing/wrap-up node
- Each node has: id (unique string), type, content (what to say), branches (array of {condition, targetNodeId})
- type MUST be one of exactly these six values: SPEAK (say the content), LISTEN (ask and wait for a reply), BRANCH (route on the reply), TRANSFER (hand to a human), END (close the call), COLLECT_INFO (capture one field)
- Use SPEAK for the greeting, key points and objection handling; LISTEN for questions; END for the closing node`, {
    maxTokens: 2048,
    temperature: 0.6,
    system: 'You are a professional call script writer. Create natural, conversational scripts that achieve their purpose while maintaining compliance.',
  });

  return {
    entityId,
    name: result.name,
    description: result.description,
    nodes: result.nodes.map((n) => ({
      id: n.id,
      type: resolveNodeType(n.id, n.type),
      content: n.content,
      branches: n.branches.map((b) => ({
        condition: b.condition,
        targetNodeId: b.targetNodeId,
        label: b.condition,
      })),
    })),
    startNodeId: result.startNodeId,
    status: 'DRAFT',
  };
}

export async function optimizeScript(
  scriptId: string,
  entityId: VerifiedEntityId,
  performanceData: {
    completionRate: number;
    avgDuration: number;
    conversionRate: number;
    commonDropoffPoints: string[];
  }
): Promise<string[]> {
  const script = await getScript(scriptId, entityId);
  if (!script) throw new Error(`Script ${scriptId} not found`);

  try {
    const result = await generateJSON<{ suggestions: string[] }>(`Analyze this call script's performance and suggest optimizations.

Script name: ${script.name}
Nodes: ${JSON.stringify(script.nodes.map((n) => ({ id: n.id, type: n.type, content: n.content.substring(0, 100) })))}

Performance data:
- Completion rate: ${(performanceData.completionRate * 100).toFixed(1)}%
- Average duration: ${performanceData.avgDuration} seconds
- Conversion rate: ${(performanceData.conversionRate * 100).toFixed(1)}%
- Common drop-off points: ${performanceData.commonDropoffPoints.join(', ')}

Suggest specific improvements to:
- Reduce drop-off at identified problem points
- Improve conversion rate
- Optimize call duration
- Enhance objection handling

Return JSON with suggestions array of specific, actionable improvement strings.`, {
      maxTokens: 512,
      temperature: 0.5,
      system: 'You are a call script optimization expert. Provide specific, actionable suggestions based on performance data.',
    });

    return result.suggestions;
  } catch {
    return ['Unable to generate AI optimization suggestions. Review drop-off points manually.'];
  }
}
