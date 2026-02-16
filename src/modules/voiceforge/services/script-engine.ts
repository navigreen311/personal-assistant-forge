// ============================================================================
// VoiceForge — Call Scripting Engine
// Script CRUD, execution, branch evaluation, and validation
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db';
import type {
  CallScript,
  ScriptNode,
  ScriptBranch,
  ScriptExecution,
} from '@/modules/voiceforge/types';
import { generateJSON, generateText } from '@/lib/ai';

const DOC_TYPE = 'CALL_SCRIPT';

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

export async function createScript(
  data: Omit<CallScript, 'id' | 'version' | 'createdAt' | 'updatedAt'>
): Promise<CallScript> {
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

export async function getScript(id: string): Promise<CallScript | null> {
  const doc = await prisma.document.findFirst({
    where: { id, type: DOC_TYPE },
  });
  if (!doc) return null;
  return deserializeScript(doc);
}

export async function listScripts(entityId: string): Promise<CallScript[]> {
  const docs = await prisma.document.findMany({
    where: { entityId, type: DOC_TYPE },
    orderBy: { createdAt: 'desc' },
  });
  return docs.map(deserializeScript);
}

export async function updateScript(
  id: string,
  data: Partial<CallScript>
): Promise<CallScript> {
  const existing = await getScript(id);
  if (!existing) throw new Error(`Script ${id} not found`);

  const merged = { ...existing, ...data };
  const doc = await prisma.document.update({
    where: { id },
    data: {
      title: merged.name,
      content: serializeScript(merged),
      status: merged.status,
    },
  });
  return deserializeScript(doc);
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

export async function generateScriptWithAI(
  entityId: string,
  params: {
    purpose: string;
    targetAudience: string;
    tone: string;
    maxDuration: number;
    keyPoints: string[];
    complianceRequirements?: string[];
  }
): Promise<Omit<CallScript, 'id' | 'version' | 'createdAt' | 'updatedAt'>> {
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
- Each node has: id (unique string), type (GREETING, QUESTION, STATEMENT, BRANCH, OBJECTION_HANDLER, CLOSING), content (what to say), branches (array of {condition, targetNodeId})`, {
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
      type: n.type as ScriptNode['type'],
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
  performanceData: {
    completionRate: number;
    avgDuration: number;
    conversionRate: number;
    commonDropoffPoints: string[];
  }
): Promise<string[]> {
  const script = await getScript(scriptId);
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
