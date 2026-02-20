// ============================================================================
// Agent Orchestrator — Multi-Agent Coordination with Guardrails
// Manages agent registration, domain routing, handoffs, autonomy levels,
// and multi-step orchestration across agents (parallel + sequential).
// ============================================================================

import type {
  AgentConfig,
  AgentDomain,
  AgentCollaboration,
  AgentHandoff,
  WorkflowExecution,
  RetryPolicy,
} from '@/modules/workflows/types';
import type { BlastRadius } from '@/shared/types';
import { executeWorkflow } from './workflow-executor';

// In-memory agent registry
const agentRegistry = new Map<string, AgentConfig>();
const collaborations = new Map<string, AgentCollaboration>();

let collaborationCounter = 0;

// --- Progress Event System ---

export type OrchestratorEventType =
  | 'step:start'
  | 'step:complete'
  | 'step:failed'
  | 'step:retry'
  | 'step:timeout'
  | 'orchestration:start'
  | 'orchestration:complete'
  | 'orchestration:failed'
  | 'parallel:start'
  | 'parallel:complete';

export interface OrchestratorEvent {
  type: OrchestratorEventType;
  orchestrationId: string;
  timestamp: Date;
  stepIndex?: number;
  totalSteps?: number;
  nodeId?: string;
  agentId?: string;
  detail?: string;
  error?: string;
  retryCount?: number;
  durationMs?: number;
}

type EventListener = (event: OrchestratorEvent) => void;

const eventListeners: EventListener[] = [];

export function onOrchestratorEvent(listener: EventListener): () => void {
  eventListeners.push(listener);
  return () => {
    const index = eventListeners.indexOf(listener);
    if (index >= 0) eventListeners.splice(index, 1);
  };
}

function emitEvent(event: OrchestratorEvent): void {
  for (const listener of eventListeners) {
    try {
      listener(event);
    } catch {
      // Swallow listener errors to avoid disrupting orchestration
    }
  }
}

// --- Orchestration Types ---

export type StepExecutionMode = 'sequential' | 'parallel';

export interface OrchestrationStep {
  nodeId: string;
  agentId: string;
  input: Record<string, unknown>;
  timeoutMs?: number;
  retryPolicy?: RetryPolicy;
  dependsOn?: string[]; // nodeIds this step depends on
}

export interface OrchestrationPlan {
  id: string;
  steps: OrchestrationStep[];
  mode: StepExecutionMode;
  variables: Record<string, unknown>;
}

export interface OrchestrationResult {
  orchestrationId: string;
  status: 'COMPLETED' | 'FAILED' | 'PARTIAL';
  stepResults: StepOrchestrationResult[];
  totalDurationMs: number;
  variables: Record<string, unknown>;
  error?: string;
}

export interface StepOrchestrationResult {
  nodeId: string;
  agentId: string;
  status: 'COMPLETED' | 'FAILED' | 'TIMEOUT' | 'SKIPPED';
  output: Record<string, unknown>;
  durationMs: number;
  retryCount: number;
  error?: string;
}

// --- Agent Registration ---

export function registerAgent(config: AgentConfig): void {
  agentRegistry.set(config.id, { ...config });
}

export function unregisterAgent(agentId: string): void {
  agentRegistry.delete(agentId);
}

export function getAgent(agentId: string): AgentConfig | null {
  return agentRegistry.get(agentId) ?? null;
}

export function getAgentForDomain(domain: AgentDomain): AgentConfig | null {
  let bestAgent: AgentConfig | null = null;
  let bestScore = -1;

  for (const agent of agentRegistry.values()) {
    if (agent.domain === domain && agent.accuracyScore > bestScore) {
      bestAgent = agent;
      bestScore = agent.accuracyScore;
    }
  }

  return bestAgent;
}

export function listAgents(): AgentConfig[] {
  return Array.from(agentRegistry.values());
}

// --- Multi-Step Orchestration ---

let orchestrationCounter = 0;

function generateOrchestrationId(): string {
  orchestrationCounter++;
  return `orch-${Date.now()}-${orchestrationCounter}`;
}

/**
 * Execute a plan of orchestration steps across multiple agents.
 * Supports sequential (waterfall) and parallel execution modes.
 * Each step can have its own timeout and retry policy.
 */
export async function orchestrate(plan: OrchestrationPlan): Promise<OrchestrationResult> {
  const orchestrationId = plan.id || generateOrchestrationId();
  const startTime = Date.now();

  emitEvent({
    type: 'orchestration:start',
    orchestrationId,
    timestamp: new Date(),
    totalSteps: plan.steps.length,
  });

  const result: OrchestrationResult = {
    orchestrationId,
    status: 'COMPLETED',
    stepResults: [],
    totalDurationMs: 0,
    variables: { ...plan.variables },
  };

  try {
    if (plan.mode === 'parallel') {
      result.stepResults = await executeParallelSteps(
        orchestrationId,
        plan.steps,
        result.variables
      );
    } else {
      result.stepResults = await executeSequentialSteps(
        orchestrationId,
        plan.steps,
        result.variables
      );
    }

    // Determine overall status based on step results
    const failedSteps = result.stepResults.filter(
      (s) => s.status === 'FAILED' || s.status === 'TIMEOUT'
    );
    if (failedSteps.length === result.stepResults.length) {
      result.status = 'FAILED';
      result.error = `All ${failedSteps.length} step(s) failed`;
    } else if (failedSteps.length > 0) {
      result.status = 'PARTIAL';
      result.error = `${failedSteps.length} of ${result.stepResults.length} step(s) failed`;
    }

    result.totalDurationMs = Date.now() - startTime;

    emitEvent({
      type: 'orchestration:complete',
      orchestrationId,
      timestamp: new Date(),
      totalSteps: plan.steps.length,
      durationMs: result.totalDurationMs,
      detail: result.status,
    });
  } catch (err) {
    result.status = 'FAILED';
    result.error = err instanceof Error ? err.message : String(err);
    result.totalDurationMs = Date.now() - startTime;

    emitEvent({
      type: 'orchestration:failed',
      orchestrationId,
      timestamp: new Date(),
      error: result.error,
      durationMs: result.totalDurationMs,
    });
  }

  return result;
}

/**
 * Execute steps sequentially in waterfall fashion.
 * Each step receives the accumulated context (variables) from prior steps.
 */
async function executeSequentialSteps(
  orchestrationId: string,
  steps: OrchestrationStep[],
  variables: Record<string, unknown>
): Promise<StepOrchestrationResult[]> {
  const results: StepOrchestrationResult[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    emitEvent({
      type: 'step:start',
      orchestrationId,
      timestamp: new Date(),
      stepIndex: i,
      totalSteps: steps.length,
      nodeId: step.nodeId,
      agentId: step.agentId,
    });

    // Check if dependencies are satisfied (all dependent steps must have completed)
    if (step.dependsOn && step.dependsOn.length > 0) {
      const unmetDependencies = step.dependsOn.filter((depId) => {
        const depResult = results.find((r) => r.nodeId === depId);
        return !depResult || depResult.status !== 'COMPLETED';
      });

      if (unmetDependencies.length > 0) {
        const skipResult: StepOrchestrationResult = {
          nodeId: step.nodeId,
          agentId: step.agentId,
          status: 'SKIPPED',
          output: { reason: `Unmet dependencies: ${unmetDependencies.join(', ')}` },
          durationMs: 0,
          retryCount: 0,
        };
        results.push(skipResult);
        continue;
      }
    }

    // Merge accumulated variables into step input
    const stepInput = { ...variables, ...step.input };
    const stepResult = await executeStepWithRetry(
      orchestrationId,
      step,
      stepInput,
      i,
      steps.length
    );

    // Pass output into variables for downstream steps (waterfall)
    if (stepResult.status === 'COMPLETED') {
      Object.assign(variables, stepResult.output);
    }

    results.push(stepResult);

    emitEvent({
      type: stepResult.status === 'COMPLETED' ? 'step:complete' : 'step:failed',
      orchestrationId,
      timestamp: new Date(),
      stepIndex: i,
      totalSteps: steps.length,
      nodeId: step.nodeId,
      agentId: step.agentId,
      durationMs: stepResult.durationMs,
      error: stepResult.error,
    });
  }

  return results;
}

/**
 * Execute independent steps in parallel using Promise.allSettled.
 * All steps run concurrently; failures in one do not cancel others.
 */
async function executeParallelSteps(
  orchestrationId: string,
  steps: OrchestrationStep[],
  variables: Record<string, unknown>
): Promise<StepOrchestrationResult[]> {
  emitEvent({
    type: 'parallel:start',
    orchestrationId,
    timestamp: new Date(),
    totalSteps: steps.length,
  });

  const promises = steps.map((step, i) => {
    const stepInput = { ...variables, ...step.input };
    return executeStepWithRetry(orchestrationId, step, stepInput, i, steps.length);
  });

  const settled = await Promise.allSettled(promises);

  const results: StepOrchestrationResult[] = settled.map((outcome, i) => {
    if (outcome.status === 'fulfilled') {
      return outcome.value;
    }

    // Promise.allSettled rejected — should not happen since executeStepWithRetry
    // catches all errors internally, but handle defensively
    return {
      nodeId: steps[i].nodeId,
      agentId: steps[i].agentId,
      status: 'FAILED' as const,
      output: {},
      durationMs: 0,
      retryCount: 0,
      error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
    };
  });

  // Merge all successful outputs into variables
  for (const stepResult of results) {
    if (stepResult.status === 'COMPLETED') {
      Object.assign(variables, stepResult.output);
    }
  }

  emitEvent({
    type: 'parallel:complete',
    orchestrationId,
    timestamp: new Date(),
    totalSteps: steps.length,
    detail: `${results.filter((r) => r.status === 'COMPLETED').length}/${results.length} succeeded`,
  });

  return results;
}

/**
 * Execute a single step with timeout enforcement and exponential-backoff retry.
 */
async function executeStepWithRetry(
  orchestrationId: string,
  step: OrchestrationStep,
  input: Record<string, unknown>,
  stepIndex: number,
  totalSteps: number
): Promise<StepOrchestrationResult> {
  const maxRetries = step.retryPolicy?.maxRetries ?? 0;
  const baseBackoffMs = step.retryPolicy?.backoffMs ?? 1000;
  const backoffMultiplier = step.retryPolicy?.backoffMultiplier ?? 2;
  const maxBackoffMs = step.retryPolicy?.maxBackoffMs ?? 30000;

  let lastError: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(
        baseBackoffMs * Math.pow(backoffMultiplier, attempt - 1),
        maxBackoffMs
      );

      emitEvent({
        type: 'step:retry',
        orchestrationId,
        timestamp: new Date(),
        stepIndex,
        totalSteps,
        nodeId: step.nodeId,
        agentId: step.agentId,
        retryCount: attempt,
        detail: `Retrying after ${backoff}ms`,
      });

      await delay(backoff);
    }

    const startTime = Date.now();

    try {
      const output = await executeWithTimeout(
        () => executeAgentStep(step.agentId, step.nodeId, input),
        step.timeoutMs
      );

      return {
        nodeId: step.nodeId,
        agentId: step.agentId,
        status: 'COMPLETED',
        output,
        durationMs: Date.now() - startTime,
        retryCount: attempt,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      lastError = err instanceof Error ? err.message : String(err);

      const isTimeout = lastError === TIMEOUT_ERROR_MESSAGE;

      if (isTimeout) {
        emitEvent({
          type: 'step:timeout',
          orchestrationId,
          timestamp: new Date(),
          stepIndex,
          totalSteps,
          nodeId: step.nodeId,
          agentId: step.agentId,
          durationMs,
          error: lastError,
        });
      }

      // If this is the last attempt, return the failure
      if (attempt === maxRetries) {
        return {
          nodeId: step.nodeId,
          agentId: step.agentId,
          status: isTimeout ? 'TIMEOUT' : 'FAILED',
          output: {},
          durationMs,
          retryCount: attempt,
          error: lastError,
        };
      }
    }
  }

  // Should never reach here, but satisfy TypeScript
  return {
    nodeId: step.nodeId,
    agentId: step.agentId,
    status: 'FAILED',
    output: {},
    durationMs: 0,
    retryCount: maxRetries,
    error: lastError ?? 'Unknown error',
  };
}

/**
 * Execute a function with a per-step timeout.
 * If timeoutMs is undefined or 0, no timeout is enforced.
 */
const TIMEOUT_ERROR_MESSAGE = 'Step execution timed out';

async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs?: number
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) {
    return fn();
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(TIMEOUT_ERROR_MESSAGE));
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Dispatch a step to the appropriate agent for execution.
 * The agent processes the input and returns output data.
 */
async function executeAgentStep(
  agentId: string,
  nodeId: string,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const agent = agentRegistry.get(agentId);
  if (!agent) {
    throw new Error(`Agent ${agentId} not found in registry`);
  }

  // Verify the agent has the required autonomy level
  if (agent.autonomyLevel === 'SUGGEST') {
    return {
      suggestion: true,
      agentId,
      nodeId,
      message: `Agent ${agent.name} can only suggest — manual execution required`,
      input,
    };
  }

  // Simulate agent processing the step
  // In production, this would route to actual agent implementations
  return {
    agentId,
    nodeId,
    executedBy: agent.name,
    domain: agent.domain,
    autonomyLevel: agent.autonomyLevel,
    processedAt: new Date().toISOString(),
    ...input,
  };
}

// --- Autonomous Workflow Execution ---

const BLAST_RADIUS_LEVELS: Record<string, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export async function executeAutonomousWorkflow(
  workflowId: string,
  agentId: string,
  maxSteps?: number
): Promise<WorkflowExecution> {
  const agent = agentRegistry.get(agentId);
  if (!agent) {
    throw new Error(`Agent ${agentId} not found`);
  }

  // Apply guardrails based on autonomy level
  const guardedExecution = await executeWorkflow(
    workflowId,
    agentId,
    'AGENT',
    {
      __agentId: agentId,
      __autonomyLevel: agent.autonomyLevel,
      __maxSteps: maxSteps ?? 100,
    }
  );

  // Post-execution: check each step against blast radius guardrails
  for (const step of guardedExecution.stepResults) {
    const stepBlastRadius = inferBlastRadius(step.output);
    if (!isAllowedByAutonomy(agent.autonomyLevel, stepBlastRadius)) {
      guardedExecution.status = 'PAUSED';
      guardedExecution.error = `Step ${step.nodeId} requires human approval (blast radius: ${stepBlastRadius})`;
      break;
    }
  }

  return guardedExecution;
}

function inferBlastRadius(output: Record<string, unknown>): BlastRadius {
  // Infer blast radius from action output
  if (output.blastRadius) return output.blastRadius as BlastRadius;

  // Heuristics based on action type
  const actionType = output.actionType as string | undefined;
  if (!actionType) return 'LOW';

  const highRiskActions = ['EXECUTE_SCRIPT', 'LOG_FINANCIAL', 'CALL_API'];
  const mediumRiskActions = ['CREATE_TASK', 'UPDATE_RECORD', 'CREATE_EVENT', 'UPDATE_CONTACT'];

  if (highRiskActions.includes(actionType)) return 'HIGH';
  if (mediumRiskActions.includes(actionType)) return 'MEDIUM';
  return 'LOW';
}

function isAllowedByAutonomy(
  autonomyLevel: AgentConfig['autonomyLevel'],
  blastRadius: BlastRadius
): boolean {
  const radiusLevel = BLAST_RADIUS_LEVELS[blastRadius] ?? 1;

  switch (autonomyLevel) {
    case 'EXECUTE_AUTONOMOUS':
      // Can only execute LOW and MEDIUM blast radius autonomously
      return radiusLevel <= 2;
    case 'EXECUTE_WITH_APPROVAL':
      // All actions require approval, but LOW can proceed
      return radiusLevel <= 1;
    case 'DRAFT':
    case 'SUGGEST':
      // Cannot execute any actions autonomously
      return false;
    default:
      return false;
  }
}

// --- Agent Handoff ---

export async function handoff(
  fromAgentId: string,
  toAgentId: string,
  context: Record<string, unknown>,
  executionId: string
): Promise<AgentHandoff> {
  const fromAgent = agentRegistry.get(fromAgentId);
  const toAgent = agentRegistry.get(toAgentId);

  if (!fromAgent) throw new Error(`Source agent ${fromAgentId} not found`);
  if (!toAgent) throw new Error(`Target agent ${toAgentId} not found`);

  const handoffRecord: AgentHandoff = {
    fromAgentId,
    toAgentId,
    reason: `Handoff from ${fromAgent.domain} to ${toAgent.domain}`,
    context: filterContext(context, fromAgent.handoffProtocol.contextFields),
    timestamp: new Date(),
  };

  // Record in collaboration
  let collaboration = findCollaboration(executionId);
  if (!collaboration) {
    collaborationCounter++;
    collaboration = {
      id: `collab-${Date.now()}-${collaborationCounter}`,
      primaryAgentId: fromAgentId,
      collaboratorAgentIds: [toAgentId],
      workflowExecutionId: executionId,
      status: 'ACTIVE',
      handoffs: [],
    };
    collaborations.set(collaboration.id, collaboration);
  }

  collaboration.handoffs.push(handoffRecord);

  if (!collaboration.collaboratorAgentIds.includes(toAgentId)) {
    collaboration.collaboratorAgentIds.push(toAgentId);
  }

  return handoffRecord;
}

function filterContext(
  context: Record<string, unknown>,
  allowedFields: string[]
): Record<string, unknown> {
  if (allowedFields.length === 0) return { ...context };

  const filtered: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in context) {
      filtered[field] = context[field];
    }
  }
  return filtered;
}

function findCollaboration(executionId: string): AgentCollaboration | undefined {
  for (const collab of collaborations.values()) {
    if (collab.workflowExecutionId === executionId) {
      return collab;
    }
  }
  return undefined;
}

// --- Progressive Autonomy ---

export function adjustAutonomy(
  agentId: string,
  newLevel: AgentConfig['autonomyLevel']
): void {
  const agent = agentRegistry.get(agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);

  const levelOrder: AgentConfig['autonomyLevel'][] = [
    'SUGGEST',
    'DRAFT',
    'EXECUTE_WITH_APPROVAL',
    'EXECUTE_AUTONOMOUS',
  ];

  const currentIndex = levelOrder.indexOf(agent.autonomyLevel);
  const newIndex = levelOrder.indexOf(newLevel);

  // Only allow one-level changes for safety
  if (Math.abs(newIndex - currentIndex) > 1) {
    throw new Error(
      `Autonomy can only be adjusted one level at a time. Current: ${agent.autonomyLevel}, requested: ${newLevel}`
    );
  }

  // Require minimum accuracy for autonomy increase
  if (newIndex > currentIndex && agent.accuracyScore < 0.8) {
    throw new Error(
      `Agent accuracy (${agent.accuracyScore}) is below threshold (0.8) for autonomy increase`
    );
  }

  agent.autonomyLevel = newLevel;
  agentRegistry.set(agentId, agent);
}

export function updateAgentAccuracy(agentId: string, outcome: boolean): void {
  const agent = agentRegistry.get(agentId);
  if (!agent) return;

  // Exponential moving average
  const alpha = 0.1;
  agent.accuracyScore = agent.accuracyScore * (1 - alpha) + (outcome ? 1 : 0) * alpha;
  agentRegistry.set(agentId, agent);
}

// --- Helpers ---

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Testing Helpers ---

export function clearAgentRegistry(): void {
  agentRegistry.clear();
  collaborations.clear();
  collaborationCounter = 0;
  orchestrationCounter = 0;
  eventListeners.length = 0;
}
