// ============================================================================
// Dry-Run Simulation Engine
// Simulates actions without executing them to preview effects and risks
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import type { BlastRadius } from '@/shared/types';
import type {
  SimulationRequest,
  SimulationResult,
  SimulatedEffect,
} from '../types';
import { scoreAction } from './blast-radius-scorer';
import { estimateActionCost } from './cost-estimator';
import { generateJSON } from '@/lib/ai';

// --- Action Simulators ---

type ActionSimulator = (
  request: SimulationRequest
) => { effects: SimulatedEffect[]; sideEffects: SimulatedEffect[]; warnings: string[] };

const simulators: Record<string, ActionSimulator> = {
  CREATE_TASK: simulateCreateTask,
  SEND_MESSAGE: simulateSendMessage,
  UPDATE_RECORD: simulateUpdateRecord,
  DELETE_RECORD: simulateDeleteRecord,
  DELETE_CONTACT: simulateDeleteContact,
  DELETE_PROJECT: simulateDeleteProject,
  TRIGGER_WORKFLOW: simulateTriggerWorkflow,
  FINANCIAL_ACTION: simulateFinancialAction,
  CREATE_CONTACT: simulateCreateContact,
  CREATE_PROJECT: simulateCreateProject,
  GENERATE_DOCUMENT: simulateGenerateDocument,
  CALL_API: simulateCallApi,
  BULK_SEND: simulateBulkSend,
};

function simulateCreateTask(request: SimulationRequest) {
  const effects: SimulatedEffect[] = [
    {
      type: 'CREATE',
      model: 'Task',
      description: `Create task "${request.parameters.title ?? 'Untitled'}" in entity ${request.entityId}`,
      reversible: true,
    },
  ];
  const sideEffects: SimulatedEffect[] = [];
  const warnings: string[] = [];

  if (request.parameters.projectId) {
    sideEffects.push({
      type: 'UPDATE',
      model: 'Project',
      description: `Project task count will increase`,
      affectedRecordIds: [request.parameters.projectId as string],
      reversible: true,
    });
  }

  if (request.parameters.assigneeId) {
    sideEffects.push({
      type: 'NOTIFY',
      model: 'User',
      description: `Assignee will be notified of new task`,
      affectedRecordIds: [request.parameters.assigneeId as string],
      reversible: false,
    });
  }

  if (request.parameters.checkDuplicates !== false) {
    warnings.push('Check for duplicate tasks with similar titles before creating.');
  }

  return { effects, sideEffects, warnings };
}

function simulateSendMessage(request: SimulationRequest) {
  const recipientId = request.parameters.recipientId as string | undefined;
  const channel = (request.parameters.channel as string) ?? 'EMAIL';

  const effects: SimulatedEffect[] = [
    {
      type: 'SEND',
      model: 'Message',
      description: `Send ${channel} message to recipient ${recipientId ?? 'unknown'}`,
      affectedRecordIds: recipientId ? [recipientId] : [],
      reversible: false,
    },
  ];
  const sideEffects: SimulatedEffect[] = [
    {
      type: 'CREATE',
      model: 'Message',
      description: 'Message record will be created in the system',
      reversible: true,
    },
  ];
  const warnings: string[] = [];

  if (request.parameters.doNotContact === true) {
    warnings.push('WARNING: Recipient has do-not-contact preference set.');
  }
  if (request.parameters.sensitivity === 'CONFIDENTIAL' || request.parameters.sensitivity === 'RESTRICTED') {
    warnings.push('Message contains sensitive content. Verify recipient authorization.');
  }
  if (channel === 'SMS') {
    warnings.push('SMS messages incur per-message cost.');
  }

  return { effects, sideEffects, warnings };
}

function simulateUpdateRecord(request: SimulationRequest) {
  const model = (request.parameters.model as string) ?? 'Record';
  const recordId = request.parameters.recordId as string | undefined;
  const changes = request.parameters.changes as Record<string, unknown> | undefined;

  const effects: SimulatedEffect[] = [
    {
      type: 'UPDATE',
      model,
      description: `Update ${model} ${recordId ?? 'unknown'}: ${changes ? Object.keys(changes).join(', ') : 'fields'}`,
      affectedRecordIds: recordId ? [recordId] : [],
      reversible: true,
    },
  ];
  const sideEffects: SimulatedEffect[] = [];
  const warnings: string[] = [];

  if (changes && Object.keys(changes).length > 5) {
    warnings.push('Large number of field changes. Review all modifications carefully.');
  }

  return { effects, sideEffects, warnings };
}

function simulateDeleteRecord(request: SimulationRequest) {
  const model = (request.parameters.model as string) ?? 'Record';
  const recordId = request.parameters.recordId as string | undefined;

  const effects: SimulatedEffect[] = [
    {
      type: 'DELETE',
      model,
      description: `Delete ${model} ${recordId ?? 'unknown'}`,
      affectedRecordIds: recordId ? [recordId] : [],
      reversible: false,
    },
  ];
  const sideEffects: SimulatedEffect[] = [];
  const warnings: string[] = [
    `Deleting a ${model} is irreversible. Dependent records may be orphaned.`,
  ];

  if (request.parameters.hasDependencies === true) {
    warnings.push(`This ${model} has dependent records that may be affected.`);
    sideEffects.push({
      type: 'UPDATE',
      model: 'DependentRecords',
      description: `Dependent records will lose their reference to this ${model}`,
      reversible: false,
    });
  }

  return { effects, sideEffects, warnings };
}

function simulateDeleteContact(request: SimulationRequest) {
  const contactId = request.parameters.contactId as string | undefined;

  const effects: SimulatedEffect[] = [
    {
      type: 'DELETE',
      model: 'Contact',
      description: `Delete contact ${contactId ?? request.target}`,
      affectedRecordIds: contactId ? [contactId] : [],
      reversible: false,
    },
  ];
  const sideEffects: SimulatedEffect[] = [
    {
      type: 'UPDATE',
      model: 'Message',
      description: 'Associated messages will lose contact reference',
      reversible: false,
    },
    {
      type: 'UPDATE',
      model: 'Call',
      description: 'Associated calls will lose contact reference',
      reversible: false,
    },
  ];
  const warnings = [
    'Deleting a contact is irreversible and affects all related messages, calls, and commitments.',
    'Consider archiving instead of deleting.',
  ];

  return { effects, sideEffects, warnings };
}

function simulateDeleteProject(request: SimulationRequest) {
  const projectId = request.parameters.projectId as string | undefined;

  const effects: SimulatedEffect[] = [
    {
      type: 'DELETE',
      model: 'Project',
      description: `Delete project ${projectId ?? request.target}`,
      affectedRecordIds: projectId ? [projectId] : [],
      reversible: false,
    },
  ];
  const sideEffects: SimulatedEffect[] = [
    {
      type: 'UPDATE',
      model: 'Task',
      description: 'Tasks linked to this project will be unlinked',
      reversible: true,
    },
  ];
  const warnings = [
    'Deleting a project affects all associated tasks and milestones.',
  ];

  return { effects, sideEffects, warnings };
}

function simulateTriggerWorkflow(request: SimulationRequest) {
  const workflowId = request.parameters.workflowId as string | undefined;
  const stepCount =
    typeof request.parameters.stepCount === 'number'
      ? request.parameters.stepCount
      : 3;

  const effects: SimulatedEffect[] = [
    {
      type: 'UPDATE',
      model: 'Workflow',
      description: `Trigger workflow ${workflowId ?? request.target} with ${stepCount} steps`,
      affectedRecordIds: workflowId ? [workflowId] : [],
      reversible: false,
    },
  ];
  const sideEffects: SimulatedEffect[] = [];
  const warnings: string[] = [];

  if (stepCount > 5) {
    warnings.push(`Workflow has ${stepCount} steps. Estimated total duration may be significant.`);
  }

  for (let i = 0; i < Math.min(stepCount, 5); i++) {
    sideEffects.push({
      type: 'CREATE',
      model: 'ActionLog',
      description: `Workflow step ${i + 1} will create an action log entry`,
      reversible: true,
    });
  }

  return { effects, sideEffects, warnings };
}

function simulateFinancialAction(request: SimulationRequest) {
  const amount =
    typeof request.parameters.amount === 'number'
      ? request.parameters.amount
      : 0;

  const effects: SimulatedEffect[] = [
    {
      type: 'CREATE',
      model: 'FinancialRecord',
      description: `Financial action: $${amount} ${request.parameters.type ?? 'transaction'}`,
      reversible: true,
    },
  ];
  const sideEffects: SimulatedEffect[] = [];
  const warnings: string[] = [];

  if (amount > 10000) {
    warnings.push(`High-value transaction: $${amount}. Requires additional approval.`);
  }
  if (amount > 100000) {
    warnings.push('CRITICAL: Transaction exceeds $100K threshold. Senior approval mandatory.');
  }

  return { effects, sideEffects, warnings };
}

function simulateCreateContact(request: SimulationRequest) {
  const effects: SimulatedEffect[] = [
    {
      type: 'CREATE',
      model: 'Contact',
      description: `Create contact "${request.parameters.name ?? 'Unknown'}" in entity ${request.entityId}`,
      reversible: true,
    },
  ];
  return { effects, sideEffects: [], warnings: [] };
}

function simulateCreateProject(request: SimulationRequest) {
  const effects: SimulatedEffect[] = [
    {
      type: 'CREATE',
      model: 'Project',
      description: `Create project "${request.parameters.name ?? 'Untitled'}" in entity ${request.entityId}`,
      reversible: true,
    },
  ];
  return { effects, sideEffects: [], warnings: [] };
}

function simulateGenerateDocument(request: SimulationRequest) {
  const effects: SimulatedEffect[] = [
    {
      type: 'CREATE',
      model: 'Document',
      description: `Generate document "${request.parameters.title ?? 'Untitled'}" of type ${request.parameters.type ?? 'REPORT'}`,
      reversible: true,
    },
  ];
  const sideEffects: SimulatedEffect[] = [
    {
      type: 'NOTIFY',
      model: 'User',
      description: 'Document owner will be notified of generation',
      reversible: false,
    },
  ];
  return { effects, sideEffects, warnings: [] };
}

function simulateCallApi(request: SimulationRequest) {
  const endpoint = request.parameters.endpoint as string | undefined;
  const effects: SimulatedEffect[] = [
    {
      type: 'SEND',
      model: 'ExternalAPI',
      description: `Call external API: ${endpoint ?? request.target}`,
      reversible: false,
    },
  ];
  const warnings = [
    'External API call cannot be reversed once executed.',
  ];
  return { effects, sideEffects: [], warnings };
}

function simulateBulkSend(request: SimulationRequest) {
  const recipientCount =
    typeof request.parameters.recipientCount === 'number'
      ? request.parameters.recipientCount
      : Array.isArray(request.parameters.recipients)
        ? request.parameters.recipients.length
        : 1;

  const effects: SimulatedEffect[] = [
    {
      type: 'SEND',
      model: 'Message',
      description: `Send bulk message to ${recipientCount} recipients`,
      reversible: false,
    },
  ];
  const sideEffects: SimulatedEffect[] = [
    {
      type: 'CREATE',
      model: 'Message',
      description: `${recipientCount} message records will be created`,
      reversible: true,
    },
  ];
  const warnings = [
    `Mass communication to ${recipientCount} recipients. Cannot be unsent.`,
  ];
  if (recipientCount > 100) {
    warnings.push('CRITICAL: Mass send exceeds 100 recipients. Review recipient list carefully.');
  }

  return { effects, sideEffects, warnings };
}

// --- Default Simulator ---

function simulateGeneric(request: SimulationRequest) {
  return {
    effects: [
      {
        type: 'UPDATE' as const,
        model: 'Unknown',
        description: `Execute ${request.actionType} on ${request.target}`,
        reversible: false,
      },
    ],
    sideEffects: [],
    warnings: [`Unknown action type "${request.actionType}". Unable to predict effects precisely.`],
  };
}

// --- AI-Powered Side Effect Prediction ---

async function predictSideEffectsWithAI(
  request: SimulationRequest,
  ruleBasedEffects: SimulatedEffect[]
): Promise<{
  additionalEffects: SimulatedEffect[];
  riskAssessment: string;
  recommendations: string[];
}> {
  return generateJSON<{
    additionalEffects: SimulatedEffect[];
    riskAssessment: string;
    recommendations: string[];
  }>(`Analyze this planned action and predict additional side effects.

Action: ${request.actionType}
Entity: ${request.entityId}
Parameters: ${JSON.stringify(request.parameters)}
Already-identified effects: ${JSON.stringify(ruleBasedEffects)}

Return JSON with:
- additionalEffects: array of {type, model, description, reversible} for effects not yet identified
- riskAssessment: brief assessment of overall risk
- recommendations: array of suggestions to reduce blast radius`, {
    maxTokens: 512,
    temperature: 0.3,
    system: 'You are a system operations risk analyst. Identify side effects of actions. Be thorough but realistic. Focus on non-obvious cascading effects.',
  });
}

// --- Public API ---

export async function simulateAction(
  request: SimulationRequest
): Promise<SimulationResult> {
  const simulator = simulators[request.actionType] ?? simulateGeneric;
  const { effects, sideEffects, warnings } = simulator(request);

  // AI-powered side effect prediction (non-blocking, fallback to rule-based)
  let aiRiskAssessment: string | undefined;
  let allSideEffects = sideEffects;
  try {
    const aiPrediction = await predictSideEffectsWithAI(request, [...effects, ...sideEffects]);
    if (aiPrediction.additionalEffects?.length > 0) {
      allSideEffects = [...sideEffects, ...aiPrediction.additionalEffects];
    }
    if (aiPrediction.recommendations?.length > 0) {
      warnings.push(...aiPrediction.recommendations);
    }
    aiRiskAssessment = aiPrediction.riskAssessment;
  } catch {
    // AI prediction failed — proceed with rule-based results only
  }

  const blastRadiusScore = await scoreAction(
    request.actionType,
    request.target,
    request.parameters,
    request.entityId
  );

  const costEstimate = estimateActionCost(request.actionType, request.parameters);

  const allEffectsReversible = effects.every((e) => e.reversible);

  let recommendation: SimulationResult['recommendation'];
  if (blastRadiusScore.overall === 'CRITICAL') {
    recommendation = 'BLOCKED';
  } else if (blastRadiusScore.overall === 'HIGH') {
    recommendation = 'HIGH_RISK';
  } else if (blastRadiusScore.overall === 'MEDIUM' || warnings.length > 0) {
    recommendation = 'REVIEW_RECOMMENDED';
  } else {
    recommendation = 'SAFE_TO_EXECUTE';
  }

  return {
    id: uuidv4(),
    request,
    wouldDo: effects,
    sideEffects: allSideEffects,
    blastRadius: blastRadiusScore.overall,
    reversible: allEffectsReversible,
    estimatedCost: costEstimate.estimatedCost,
    warnings,
    recommendation,
    simulatedAt: new Date(),
    ...(aiRiskAssessment ? { aiRiskAssessment } : {}),
  };
}

export async function simulateMultipleActions(
  requests: SimulationRequest[]
): Promise<SimulationResult[]> {
  return Promise.all(requests.map(simulateAction));
}

export function generateImpactReport(result: SimulationResult): string {
  const lines: string[] = [
    `=== Impact Report ===`,
    `Action: ${result.request.actionType} on ${result.request.target}`,
    `Blast Radius: ${result.blastRadius}`,
    `Reversible: ${result.reversible ? 'Yes' : 'No'}`,
    `Estimated Cost: $${result.estimatedCost.toFixed(4)}`,
    `Recommendation: ${result.recommendation}`,
    '',
    `--- What Would Happen (${result.wouldDo.length} effects) ---`,
  ];

  for (const effect of result.wouldDo) {
    lines.push(`  [${effect.type}] ${effect.model}: ${effect.description}`);
  }

  if (result.sideEffects.length > 0) {
    lines.push('');
    lines.push(`--- Side Effects (${result.sideEffects.length}) ---`);
    for (const effect of result.sideEffects) {
      lines.push(`  [${effect.type}] ${effect.model}: ${effect.description}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push(`--- Warnings (${result.warnings.length}) ---`);
    for (const warning of result.warnings) {
      lines.push(`  ! ${warning}`);
    }
  }

  return lines.join('\n');
}
