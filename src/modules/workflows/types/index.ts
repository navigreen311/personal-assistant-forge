// ============================================================================
// Workflow Module — Type Definitions
// Visual designer nodes, execution engine, agent orchestration, integrations
// ============================================================================

// --- Node Types for Visual Designer ---

export type WorkflowNodeType =
  | 'TRIGGER'
  | 'ACTION'
  | 'CONDITION'
  | 'AI_DECISION'
  | 'HUMAN_APPROVAL'
  | 'DELAY'
  | 'LOOP'
  | 'ERROR_HANDLER'
  | 'SUB_WORKFLOW';

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  label: string;
  config: WorkflowNodeConfig;
  position: { x: number; y: number };
  inputs: string[];
  outputs: string[];
}

export interface WorkflowEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  condition?: string;
  label?: string;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// --- Node Configuration Types ---

export type WorkflowNodeConfig =
  | TriggerNodeConfig
  | ActionNodeConfig
  | ConditionNodeConfig
  | AIDecisionNodeConfig
  | HumanApprovalNodeConfig
  | DelayNodeConfig
  | LoopNodeConfig
  | ErrorHandlerNodeConfig
  | SubWorkflowNodeConfig;

export interface TriggerNodeConfig {
  nodeType: 'TRIGGER';
  triggerType: 'TIME' | 'EVENT' | 'CONDITION' | 'MANUAL' | 'VOICE' | 'WEBHOOK';
  cronExpression?: string;
  eventName?: string;
  webhookPath?: string;
  conditionExpression?: string;
}

export interface ActionNodeConfig {
  nodeType: 'ACTION';
  actionType: ActionType;
  parameters: Record<string, unknown>;
  retryPolicy?: RetryPolicy;
  timeout?: number;
}

export type ActionType =
  | 'SEND_MESSAGE'
  | 'CREATE_TASK'
  | 'UPDATE_RECORD'
  | 'GENERATE_DOCUMENT'
  | 'CALL_API'
  | 'TRIGGER_AI_ANALYSIS'
  | 'SEND_NOTIFICATION'
  | 'CREATE_EVENT'
  | 'UPDATE_CONTACT'
  | 'LOG_FINANCIAL'
  | 'EXECUTE_SCRIPT';

export interface ConditionNodeConfig {
  nodeType: 'CONDITION';
  expression: string;
  trueOutputId: string;
  falseOutputId: string;
}

export interface AIDecisionNodeConfig {
  nodeType: 'AI_DECISION';
  decisionType: 'CLASSIFY' | 'SCORE' | 'DRAFT' | 'SUMMARIZE' | 'RECOMMEND' | 'EXTRACT';
  prompt: string;
  model?: string;
  outputMapping: Record<string, string>;
  confidenceThreshold?: number;
}

export interface HumanApprovalNodeConfig {
  nodeType: 'HUMAN_APPROVAL';
  approverIds: string[];
  message: string;
  timeoutHours: number;
  escalateAfter?: number;
  escalateTo?: string[];
  requiredApprovals: number;
}

export interface DelayNodeConfig {
  nodeType: 'DELAY';
  delayMs?: number;
  delayUntil?: string;
  delayType: 'FIXED' | 'UNTIL' | 'BUSINESS_HOURS';
}

export interface LoopNodeConfig {
  nodeType: 'LOOP';
  collection: string;
  iteratorVariable: string;
  bodyNodeIds: string[];
  maxIterations: number;
}

export interface ErrorHandlerNodeConfig {
  nodeType: 'ERROR_HANDLER';
  errorTypes: string[];
  retryPolicy?: RetryPolicy;
  fallbackNodeId?: string;
  notifyOnError: boolean;
}

export interface SubWorkflowNodeConfig {
  nodeType: 'SUB_WORKFLOW';
  workflowId: string;
  inputMapping: Record<string, string>;
  outputMapping: Record<string, string>;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
  backoffMultiplier: number;
  maxBackoffMs: number;
}

// --- Execution Types ---

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'PENDING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'ROLLED_BACK';
  triggeredBy: string;
  triggerType: string;
  startedAt: Date;
  completedAt?: Date;
  currentNodeId?: string;
  variables: Record<string, unknown>;
  stepResults: StepExecutionResult[];
  error?: string;
}

export interface StepExecutionResult {
  nodeId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  startedAt: Date;
  completedAt?: Date;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error?: string;
  retryCount: number;
}

export interface WorkflowSimulationResult {
  workflowId: string;
  steps: SimulatedStep[];
  estimatedDuration: number;
  estimatedCost: number;
  warnings: string[];
  wouldExecute: boolean;
}

export interface SimulatedStep {
  nodeId: string;
  nodeLabel: string;
  wouldDo: string;
  impact: string;
  reversible: boolean;
  estimatedDuration: number;
}

// --- Agent Orchestration Types ---

export type AgentDomain = 'COMMUNICATION' | 'SCHEDULING' | 'RESEARCH' | 'FINANCE' | 'LEGAL' | 'GENERAL';

export interface AgentConfig {
  id: string;
  name: string;
  domain: AgentDomain;
  capabilities: string[];
  autonomyLevel: 'SUGGEST' | 'DRAFT' | 'EXECUTE_WITH_APPROVAL' | 'EXECUTE_AUTONOMOUS';
  accuracyScore: number;
  handoffProtocol: HandoffProtocol;
}

export interface HandoffProtocol {
  triggerConditions: string[];
  targetAgentDomain: AgentDomain;
  contextFields: string[];
  requiresHumanApproval: boolean;
}

export interface AgentCollaboration {
  id: string;
  primaryAgentId: string;
  collaboratorAgentIds: string[];
  workflowExecutionId: string;
  status: 'ACTIVE' | 'COMPLETED' | 'FAILED';
  handoffs: AgentHandoff[];
}

export interface AgentHandoff {
  fromAgentId: string;
  toAgentId: string;
  reason: string;
  context: Record<string, unknown>;
  timestamp: Date;
}

// --- Integration Hub Types ---

export type IntegrationType = 'GOOGLE_WORKSPACE' | 'SLACK' | 'NOTION' | 'QUICKBOOKS' | 'CUSTOM_REST' | 'CUSTOM_WEBHOOK';

export interface IntegrationConfig {
  id: string;
  type: IntegrationType;
  name: string;
  credentials: Record<string, string>;
  baseUrl?: string;
  headers?: Record<string, string>;
  isActive: boolean;
  lastSyncAt?: Date;
}

// --- Approval Types ---

export interface ApprovalRequest {
  id: string;
  executionId: string;
  workflowName: string;
  stepLabel: string;
  message: string;
  requiredApprovals: number;
  currentApprovals: number;
  createdAt: Date;
  expiresAt: Date;
}

export interface ApprovalResponse {
  approverId: string;
  approved: boolean;
  comment?: string;
  respondedAt: Date;
}
