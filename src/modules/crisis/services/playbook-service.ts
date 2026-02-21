import { v4 as uuidv4 } from 'uuid';
import type { CrisisPlaybook, CrisisType, CrisisEvent } from '../types';
import { getCrisisById, updateCrisis } from './detection-service';

const customPlaybooks = new Map<string, CrisisPlaybook>();

const builtInPlaybooks: Record<string, CrisisPlaybook> = {
  DATA_BREACH: {
    id: 'pb-data-breach',
    name: 'Data Breach Response',
    crisisType: 'DATA_BREACH',
    estimatedResolutionHours: 72,
    steps: [
      { order: 1, title: 'Contain the breach', description: 'Isolate affected systems and revoke compromised credentials.', actionType: 'TECHNICAL', isAutomatable: true, isComplete: false },
      { order: 2, title: 'Assess scope', description: 'Determine what data was affected and how many users are impacted.', actionType: 'TECHNICAL', isAutomatable: false, isComplete: false },
      { order: 3, title: 'Notify legal', description: 'Inform legal counsel of the breach details and timeline.', actionType: 'LEGAL', isAutomatable: true, isComplete: false },
      { order: 4, title: 'Notify affected parties', description: 'Send breach notification to affected users.', actionType: 'COMMUNICATION', isAutomatable: true, isComplete: false },
      { order: 5, title: 'Regulatory filing', description: 'File required regulatory notifications within mandated timeframes.', actionType: 'LEGAL', isAutomatable: false, isComplete: false },
      { order: 6, title: 'Post-mortem', description: 'Conduct thorough post-incident review and implement preventive measures.', actionType: 'DOCUMENTATION', isAutomatable: false, isComplete: false },
    ],
  },
  CLIENT_COMPLAINT: {
    id: 'pb-client-complaint',
    name: 'Client Complaint Resolution',
    crisisType: 'CLIENT_COMPLAINT',
    estimatedResolutionHours: 24,
    steps: [
      { order: 1, title: 'Acknowledge complaint', description: 'Send immediate acknowledgment to the client.', actionType: 'COMMUNICATION', isAutomatable: true, isComplete: false },
      { order: 2, title: 'Investigate issue', description: 'Gather facts and identify root cause of the complaint.', actionType: 'DOCUMENTATION', isAutomatable: false, isComplete: false },
      { order: 3, title: 'Draft response', description: 'Prepare detailed response with resolution plan.', actionType: 'COMMUNICATION', isAutomatable: false, isComplete: false },
      { order: 4, title: 'Executive review', description: 'Have executive review and approve the response.', actionType: 'HUMAN', isAutomatable: false, isComplete: false },
      { order: 5, title: 'Resolve', description: 'Implement the resolution and communicate to client.', actionType: 'COMMUNICATION', isAutomatable: false, isComplete: false },
      { order: 6, title: 'Follow-up', description: 'Check in with client after resolution to ensure satisfaction.', actionType: 'COMMUNICATION', isAutomatable: true, isComplete: false },
    ],
  },
  FINANCIAL_ANOMALY: {
    id: 'pb-financial-anomaly',
    name: 'Financial Anomaly Response',
    crisisType: 'FINANCIAL_ANOMALY',
    estimatedResolutionHours: 48,
    steps: [
      { order: 1, title: 'Freeze accounts', description: 'Temporarily freeze affected accounts to prevent further anomalies.', actionType: 'FINANCIAL', isAutomatable: true, isComplete: false },
      { order: 2, title: 'Audit trail', description: 'Pull complete audit trail of suspicious transactions.', actionType: 'FINANCIAL', isAutomatable: true, isComplete: false },
      { order: 3, title: 'Notify finance', description: 'Alert finance team and external accountant.', actionType: 'COMMUNICATION', isAutomatable: true, isComplete: false },
      { order: 4, title: 'Investigate', description: 'Conduct thorough investigation of the anomaly.', actionType: 'FINANCIAL', isAutomatable: false, isComplete: false },
      { order: 5, title: 'Resolve', description: 'Implement corrective actions and reverse unauthorized transactions.', actionType: 'FINANCIAL', isAutomatable: false, isComplete: false },
      { order: 6, title: 'New controls', description: 'Implement additional controls to prevent recurrence.', actionType: 'TECHNICAL', isAutomatable: false, isComplete: false },
    ],
  },
  REGULATORY_INQUIRY: {
    id: 'pb-regulatory-inquiry',
    name: 'Regulatory Inquiry Response',
    crisisType: 'REGULATORY_INQUIRY',
    estimatedResolutionHours: 168,
    steps: [
      { order: 1, title: 'Acknowledge receipt', description: 'Formally acknowledge the regulatory inquiry.', actionType: 'LEGAL', isAutomatable: true, isComplete: false },
      { order: 2, title: 'Engage legal', description: 'Retain outside counsel specializing in the relevant regulation.', actionType: 'LEGAL', isAutomatable: false, isComplete: false },
      { order: 3, title: 'Document preservation', description: 'Implement litigation hold and preserve all relevant documents.', actionType: 'DOCUMENTATION', isAutomatable: true, isComplete: false },
      { order: 4, title: 'Response preparation', description: 'Prepare comprehensive response with supporting documentation.', actionType: 'DOCUMENTATION', isAutomatable: false, isComplete: false },
      { order: 5, title: 'Submit response', description: 'Submit formal response to regulatory body.', actionType: 'LEGAL', isAutomatable: false, isComplete: false },
      { order: 6, title: 'Monitor', description: 'Monitor for follow-up inquiries and compliance requirements.', actionType: 'LEGAL', isAutomatable: false, isComplete: false },
    ],
  },
  LEGAL_THREAT: {
    id: 'pb-legal-threat',
    name: 'Legal Threat Response',
    crisisType: 'LEGAL_THREAT',
    estimatedResolutionHours: 72,
    steps: [
      { order: 1, title: 'Do not respond', description: 'Do not respond directly to the threatening party.', actionType: 'COMMUNICATION', isAutomatable: false, isComplete: false },
      { order: 2, title: 'Engage legal counsel', description: 'Immediately contact legal counsel with all relevant materials.', actionType: 'LEGAL', isAutomatable: true, isComplete: false },
      { order: 3, title: 'Preserve documents', description: 'Implement document preservation hold on all related materials.', actionType: 'DOCUMENTATION', isAutomatable: true, isComplete: false },
      { order: 4, title: 'Assess exposure', description: 'Work with legal to assess potential liability and exposure.', actionType: 'LEGAL', isAutomatable: false, isComplete: false },
      { order: 5, title: 'Strategy session', description: 'Hold strategy session with legal team to determine response approach.', actionType: 'HUMAN', isAutomatable: false, isComplete: false },
      { order: 6, title: 'Respond through counsel', description: 'Issue formal response through legal counsel.', actionType: 'LEGAL', isAutomatable: false, isComplete: false },
    ],
  },
};

export function getPlaybook(crisisType: CrisisType): CrisisPlaybook {
  return builtInPlaybooks[crisisType] ?? {
    id: `pb-generic-${crisisType.toLowerCase()}`,
    name: `${crisisType} Response`,
    crisisType,
    estimatedResolutionHours: 48,
    steps: [
      { order: 1, title: 'Assess situation', description: 'Evaluate the scope and impact.', actionType: 'DOCUMENTATION', isAutomatable: false, isComplete: false },
      { order: 2, title: 'Notify stakeholders', description: 'Alert relevant parties.', actionType: 'COMMUNICATION', isAutomatable: true, isComplete: false },
      { order: 3, title: 'Take action', description: 'Implement response measures.', actionType: 'HUMAN', isAutomatable: false, isComplete: false },
      { order: 4, title: 'Resolve', description: 'Resolve the crisis and verify resolution.', actionType: 'HUMAN', isAutomatable: false, isComplete: false },
    ],
  };
}

export async function executePlaybookStep(
  crisisId: string,
  stepOrder: number
): Promise<CrisisEvent> {
  const crisis = getCrisisById(crisisId);
  if (!crisis) throw new Error(`Crisis ${crisisId} not found`);
  if (!crisis.playbook) throw new Error(`No playbook assigned to crisis ${crisisId}`);

  const step = crisis.playbook.steps.find(s => s.order === stepOrder);
  if (step) {
    step.isComplete = true;
    step.completedAt = new Date();
  }

  // Update crisis status based on playbook progress
  const allComplete = crisis.playbook.steps.every(s => s.isComplete);
  if (allComplete) {
    crisis.status = 'MITIGATED';
  } else if (crisis.status === 'DETECTED' || crisis.status === 'ACKNOWLEDGED') {
    crisis.status = 'IN_PROGRESS';
  }

  updateCrisis(crisis);
  return crisis;
}

export async function getCustomPlaybooks(_userId: string): Promise<CrisisPlaybook[]> {
  return Array.from(customPlaybooks.values());
}

export async function createPlaybook(
  playbook: Omit<CrisisPlaybook, 'id' | 'lastUsed'>
): Promise<CrisisPlaybook> {
  const newPlaybook: CrisisPlaybook = {
    ...playbook,
    id: uuidv4(),
  };
  customPlaybooks.set(newPlaybook.id, newPlaybook);
  return newPlaybook;
}
