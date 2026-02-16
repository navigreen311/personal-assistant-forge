import { generateText } from '@/lib/ai';
import type { CrisisType, EscalationChainConfig, EscalationStep, CrisisEvent } from '../types';
import { getCrisisById, updateCrisis } from './detection-service';

const customChains = new Map<CrisisType, EscalationChainConfig>();

const defaultChains: Record<CrisisType, EscalationChainConfig> = {
  LEGAL_THREAT: {
    crisisType: 'LEGAL_THREAT',
    steps: [
      { order: 1, contactName: 'Legal Counsel', contactMethod: 'PHONE', escalateAfterMinutes: 15 },
      { order: 2, contactName: 'CEO', contactMethod: 'PHONE', escalateAfterMinutes: 30 },
      { order: 3, contactName: 'Board Chair', contactMethod: 'EMAIL', escalateAfterMinutes: 60 },
    ],
  },
  PR_ISSUE: {
    crisisType: 'PR_ISSUE',
    steps: [
      { order: 1, contactName: 'PR Director', contactMethod: 'PHONE', escalateAfterMinutes: 10 },
      { order: 2, contactName: 'CEO', contactMethod: 'SMS', escalateAfterMinutes: 20 },
      { order: 3, contactName: 'External PR Agency', contactMethod: 'EMAIL', escalateAfterMinutes: 45 },
    ],
  },
  HEALTH_EMERGENCY: {
    crisisType: 'HEALTH_EMERGENCY',
    steps: [
      { order: 1, contactName: 'Emergency Contact', contactMethod: 'PHONE', escalateAfterMinutes: 5 },
      { order: 2, contactName: 'Family Member', contactMethod: 'PHONE', escalateAfterMinutes: 10 },
      { order: 3, contactName: 'Personal Assistant', contactMethod: 'SMS', escalateAfterMinutes: 15 },
    ],
  },
  FINANCIAL_ANOMALY: {
    crisisType: 'FINANCIAL_ANOMALY',
    steps: [
      { order: 1, contactName: 'CFO', contactMethod: 'PHONE', escalateAfterMinutes: 15 },
      { order: 2, contactName: 'Accountant', contactMethod: 'EMAIL', escalateAfterMinutes: 30 },
      { order: 3, contactName: 'CEO', contactMethod: 'PHONE', escalateAfterMinutes: 60 },
    ],
  },
  DATA_BREACH: {
    crisisType: 'DATA_BREACH',
    steps: [
      { order: 1, contactName: 'CTO', contactMethod: 'PHONE', escalateAfterMinutes: 5 },
      { order: 2, contactName: 'Security Team Lead', contactMethod: 'PHONE', escalateAfterMinutes: 10 },
      { order: 3, contactName: 'Legal Counsel', contactMethod: 'PHONE', escalateAfterMinutes: 20 },
      { order: 4, contactName: 'CEO', contactMethod: 'PHONE', escalateAfterMinutes: 30 },
    ],
  },
  CLIENT_COMPLAINT: {
    crisisType: 'CLIENT_COMPLAINT',
    steps: [
      { order: 1, contactName: 'Account Manager', contactMethod: 'PHONE', escalateAfterMinutes: 15 },
      { order: 2, contactName: 'VP of Client Services', contactMethod: 'EMAIL', escalateAfterMinutes: 30 },
      { order: 3, contactName: 'CEO', contactMethod: 'PHONE', escalateAfterMinutes: 60 },
    ],
  },
  REGULATORY_INQUIRY: {
    crisisType: 'REGULATORY_INQUIRY',
    steps: [
      { order: 1, contactName: 'Compliance Officer', contactMethod: 'PHONE', escalateAfterMinutes: 15 },
      { order: 2, contactName: 'Legal Counsel', contactMethod: 'PHONE', escalateAfterMinutes: 30 },
      { order: 3, contactName: 'CEO', contactMethod: 'PHONE', escalateAfterMinutes: 60 },
    ],
  },
  NATURAL_DISASTER: {
    crisisType: 'NATURAL_DISASTER',
    steps: [
      { order: 1, contactName: 'Emergency Contact', contactMethod: 'PHONE', escalateAfterMinutes: 5 },
      { order: 2, contactName: 'Family Member', contactMethod: 'SMS', escalateAfterMinutes: 10 },
      { order: 3, contactName: 'Insurance Agent', contactMethod: 'PHONE', escalateAfterMinutes: 30 },
    ],
  },
};

export function getEscalationChain(crisisType: CrisisType): EscalationChainConfig {
  return customChains.get(crisisType) ?? defaultChains[crisisType];
}

export function setEscalationChain(config: EscalationChainConfig): void {
  customChains.set(config.crisisType, config);
}

export async function executeEscalation(crisisId: string): Promise<EscalationStep[]> {
  const crisis = getCrisisById(crisisId);
  if (!crisis) throw new Error(`Crisis ${crisisId} not found`);

  // Notify first pending contact with AI-generated personalized message
  const firstPending = crisis.escalationChain.find(s => s.status === 'PENDING');
  if (firstPending) {
    firstPending.status = 'NOTIFIED';
    firstPending.notifiedAt = new Date();

    // Generate personalized notification message
    try {
      const message = await generateText(
        `Draft a concise, urgent notification message for ${firstPending.contactName} about a ${crisis.type} crisis.
Severity: ${crisis.severity}
Title: ${crisis.title}
Description: ${crisis.description}
Contact method: ${firstPending.contactMethod}
Escalation step: ${firstPending.order} of ${crisis.escalationChain.length}

The message should be appropriate for the contact method (${firstPending.contactMethod === 'SMS' ? 'brief, under 160 chars' : firstPending.contactMethod === 'EMAIL' ? 'professional but concise' : 'spoken, clear and direct'}).`,
        {
          temperature: 0.5,
          system: 'You are a crisis communication specialist. Draft clear, actionable notification messages appropriate for the urgency and communication channel.',
        }
      );
      // Store the generated message on the step for reference
      (firstPending as Record<string, unknown>).notificationMessage = message;
    } catch {
      // Continue without AI message
    }

    updateCrisis(crisis);
  }

  return crisis.escalationChain;
}

export async function acknowledgeEscalation(
  crisisId: string,
  stepOrder: number
): Promise<CrisisEvent> {
  const crisis = getCrisisById(crisisId);
  if (!crisis) throw new Error(`Crisis ${crisisId} not found`);

  const step = crisis.escalationChain.find(s => s.order === stepOrder);
  if (step) {
    step.status = 'ACKNOWLEDGED';
    step.acknowledgedAt = new Date();

    // Skip remaining steps
    for (const s of crisis.escalationChain) {
      if (s.order > stepOrder && s.status === 'PENDING') {
        s.status = 'SKIPPED';
      }
    }
  }

  crisis.status = 'ACKNOWLEDGED';
  crisis.acknowledgedAt = new Date();
  updateCrisis(crisis);

  return crisis;
}

export async function getEscalationStatus(crisisId: string): Promise<EscalationStep[]> {
  const crisis = getCrisisById(crisisId);
  if (!crisis) throw new Error(`Crisis ${crisisId} not found`);
  return crisis.escalationChain;
}
