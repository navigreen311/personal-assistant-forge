// ============================================================================
// Execution Layer Types
// Action Queue, Simulation, Blast Radius, Rollback, Runbooks, Gates, Costs
// ============================================================================

import type { ActionActor, BlastRadius } from '@/shared/types';

// --- Action Queue Types ---

export interface QueuedAction {
  id: string;
  actionLogId: string;
  actor: ActionActor;
  actorId?: string;
  actionType: string;
  target: string;
  description: string;
  reason: string;
  impact: string;
  rollbackPlan: string;
  blastRadius: BlastRadius;
  reversible: boolean;
  estimatedCost?: number;
  status:
    | 'QUEUED'
    | 'APPROVED'
    | 'EXECUTING'
    | 'EXECUTED'
    | 'REJECTED'
    | 'ROLLED_BACK'
    | 'FAILED';
  requiresApproval: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  executedAt?: Date;
  scheduledFor?: Date;
  entityId: string;
  projectId?: string;
  workflowExecutionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActionQueueFilters {
  status?: QueuedAction['status'];
  actor?: ActionActor;
  blastRadius?: BlastRadius;
  entityId?: string;
  projectId?: string;
  dateRange?: { from: Date; to: Date };
}

// --- Simulation Types ---

export interface SimulationRequest {
  actionType: string;
  target: string;
  parameters: Record<string, unknown>;
  entityId: string;
}

export interface SimulationResult {
  id: string;
  request: SimulationRequest;
  wouldDo: SimulatedEffect[];
  sideEffects: SimulatedEffect[];
  blastRadius: BlastRadius;
  reversible: boolean;
  estimatedCost: number;
  warnings: string[];
  recommendation:
    | 'SAFE_TO_EXECUTE'
    | 'REVIEW_RECOMMENDED'
    | 'HIGH_RISK'
    | 'BLOCKED';
  simulatedAt: Date;
}

export interface SimulatedEffect {
  type: 'CREATE' | 'UPDATE' | 'DELETE' | 'SEND' | 'NOTIFY';
  model: string;
  description: string;
  affectedRecordIds?: string[];
  reversible: boolean;
}

// --- Blast Radius Types ---

export interface BlastRadiusScore {
  overall: BlastRadius;
  factors: BlastRadiusFactor[];
  totalScore: number;
  reversibilityScore: number;
  affectedEntitiesCount: number;
  affectedContactsCount: number;
  financialImpact: number;
  recommendation: string;
}

export interface BlastRadiusFactor {
  name: string;
  weight: number;
  score: number;
  reason: string;
}

// --- Rollback Types ---

export interface RollbackPlan {
  actionId: string;
  steps: RollbackStep[];
  estimatedDuration: number;
  canAutoRollback: boolean;
  requiresManualSteps: boolean;
  manualInstructions?: string;
}

export interface RollbackStep {
  order: number;
  description: string;
  type: 'RESTORE' | 'DELETE' | 'UPDATE' | 'UNDO_SEND' | 'MANUAL';
  model?: string;
  recordId?: string;
  previousState?: Record<string, unknown>;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
}

export interface RollbackResult {
  actionId: string;
  status: 'COMPLETE' | 'PARTIAL' | 'FAILED';
  stepsCompleted: number;
  stepsFailed: number;
  stepsSkipped: number;
  details: RollbackStep[];
}

// --- Operator Console Types ---

export interface OperatorTimelineEntry {
  id: string;
  timestamp: Date;
  actor: ActionActor;
  actorName: string;
  actionType: string;
  target: string;
  description: string;
  blastRadius: BlastRadius;
  status: string;
  entityId: string;
  entityName?: string;
  projectId?: string;
  projectName?: string;
  relatedActions: string[];
}

export interface OperatorConsoleFilters {
  actor?: ActionActor;
  entityId?: string;
  projectId?: string;
  contactId?: string;
  dateRange?: { from: Date; to: Date };
  blastRadius?: BlastRadius;
  search?: string;
}

// --- Autopilot Runbook Types ---

export interface Runbook {
  id: string;
  name: string;
  description: string;
  entityId: string;
  schedule?: string;
  steps: RunbookStep[];
  tags: string[];
  lastRunAt?: Date;
  lastRunStatus?: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RunbookStep {
  order: number;
  name: string;
  description: string;
  actionType: string;
  parameters: Record<string, unknown>;
  requiresApproval: boolean;
  maxBlastRadius: BlastRadius;
  continueOnFailure: boolean;
  timeout?: number;
}

export interface RunbookExecution {
  id: string;
  runbookId: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PAUSED';
  startedAt: Date;
  completedAt?: Date;
  stepResults: RunbookStepResult[];
  triggeredBy: string;
}

export interface RunbookStepResult {
  stepOrder: number;
  stepName: string;
  status:
    | 'PENDING'
    | 'RUNNING'
    | 'COMPLETED'
    | 'FAILED'
    | 'SKIPPED'
    | 'AWAITING_APPROVAL';
  actionId?: string;
  startedAt?: Date;
  completedAt?: Date;
  output?: Record<string, unknown>;
  error?: string;
}

// --- Conditional Execution Gate Types ---

export interface ExecutionGate {
  id: string;
  name: string;
  expression: string;
  description: string;
  scope: 'GLOBAL' | 'ENTITY' | 'RUNBOOK';
  entityId?: string;
  isActive: boolean;
}

// --- Cost Estimation Types ---

export interface CostEstimate {
  actionType: string;
  estimatedCost: number;
  currency: string;
  breakdown: CostBreakdownItem[];
  confidence: number;
}

export interface CostBreakdownItem {
  item: string;
  cost: number;
  unit: string;
}
