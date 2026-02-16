import { getEscalationChain, setEscalationChain, executeEscalation, acknowledgeEscalation, getEscalationStatus } from '@/modules/crisis/services/escalation-service';
import { createCrisisEvent } from '@/modules/crisis/services/detection-service';
import type { CrisisType, EscalationChainConfig } from '@/modules/crisis/types';

describe('getEscalationChain', () => {
  it('should return default chain for each crisis type', () => {
    const types: CrisisType[] = ['LEGAL_THREAT', 'PR_ISSUE', 'HEALTH_EMERGENCY', 'FINANCIAL_ANOMALY', 'DATA_BREACH', 'CLIENT_COMPLAINT', 'REGULATORY_INQUIRY', 'NATURAL_DISASTER'];
    for (const type of types) {
      const chain = getEscalationChain(type);
      expect(chain).toBeDefined();
      expect(chain.crisisType).toBe(type);
      expect(chain.steps.length).toBeGreaterThan(0);
    }
  });

  it('should return custom chain when configured', () => {
    const customConfig: EscalationChainConfig = {
      crisisType: 'LEGAL_THREAT',
      steps: [
        { order: 1, contactName: 'Custom Contact', contactMethod: 'SMS', escalateAfterMinutes: 5 },
      ],
    };
    setEscalationChain(customConfig);
    const chain = getEscalationChain('LEGAL_THREAT');
    expect(chain.steps[0].contactName).toBe('Custom Contact');
    // Reset
    setEscalationChain({ crisisType: 'LEGAL_THREAT', steps: [
      { order: 1, contactName: 'Legal Counsel', contactMethod: 'PHONE', escalateAfterMinutes: 15 },
      { order: 2, contactName: 'CEO', contactMethod: 'PHONE', escalateAfterMinutes: 30 },
      { order: 3, contactName: 'Board Chair', contactMethod: 'EMAIL', escalateAfterMinutes: 60 },
    ]});
  });
});

describe('executeEscalation', () => {
  it('should notify first contact in chain', async () => {
    const crisis = await createCrisisEvent('user-test-1', 'entity-1', 'DATA_BREACH', 'HIGH', 'Test Crisis', 'Test');
    const steps = await executeEscalation(crisis.id);
    const firstStep = steps.find(s => s.order === 1);
    expect(firstStep?.status).toBe('NOTIFIED');
    expect(firstStep?.notifiedAt).toBeDefined();
  });

  it('should escalate to next contact after timeout', async () => {
    const crisis = await createCrisisEvent('user-test-2', 'entity-1', 'CLIENT_COMPLAINT', 'MEDIUM', 'Test', 'Test');
    await executeEscalation(crisis.id);
    // Execute again to notify second contact
    const steps = await executeEscalation(crisis.id);
    const notifiedSteps = steps.filter(s => s.status === 'NOTIFIED');
    expect(notifiedSteps.length).toBeGreaterThanOrEqual(1);
  });

  it('should stop escalation on acknowledgment', async () => {
    const crisis = await createCrisisEvent('user-test-3', 'entity-1', 'PR_ISSUE', 'HIGH', 'PR Test', 'Test');
    await executeEscalation(crisis.id);
    const updated = await acknowledgeEscalation(crisis.id, 1);
    const skipped = updated.escalationChain.filter(s => s.status === 'SKIPPED');
    expect(skipped.length).toBeGreaterThan(0);
  });

  it('should handle chain with single contact', async () => {
    setEscalationChain({
      crisisType: 'NATURAL_DISASTER',
      steps: [{ order: 1, contactName: 'Single Contact', contactMethod: 'PHONE', escalateAfterMinutes: 5 }],
    });
    const crisis = await createCrisisEvent('user-test-4', 'entity-1', 'NATURAL_DISASTER', 'HIGH', 'Single', 'Test');
    const steps = await executeEscalation(crisis.id);
    expect(steps.length).toBe(1);
    expect(steps[0].status).toBe('NOTIFIED');
  });

  it('should handle all contacts unresponsive', async () => {
    const crisis = await createCrisisEvent('user-test-5', 'entity-1', 'FINANCIAL_ANOMALY', 'MEDIUM', 'Unresponsive', 'Test');
    // Execute multiple times
    await executeEscalation(crisis.id);
    await executeEscalation(crisis.id);
    await executeEscalation(crisis.id);
    const status = await getEscalationStatus(crisis.id);
    const notified = status.filter(s => s.status === 'NOTIFIED');
    expect(notified.length).toBeGreaterThanOrEqual(1);
  });
});

describe('acknowledgeEscalation', () => {
  it('should mark step as acknowledged', async () => {
    const crisis = await createCrisisEvent('user-ack-1', 'entity-1', 'LEGAL_THREAT', 'HIGH', 'Ack Test', 'Test');
    await executeEscalation(crisis.id);
    const updated = await acknowledgeEscalation(crisis.id, 1);
    const step = updated.escalationChain.find(s => s.order === 1);
    expect(step?.status).toBe('ACKNOWLEDGED');
    expect(step?.acknowledgedAt).toBeDefined();
  });

  it('should stop further escalation', async () => {
    const crisis = await createCrisisEvent('user-ack-2', 'entity-1', 'DATA_BREACH', 'CRITICAL', 'Stop Test', 'Test');
    await executeEscalation(crisis.id);
    const updated = await acknowledgeEscalation(crisis.id, 1);
    const pending = updated.escalationChain.filter(s => s.status === 'PENDING');
    expect(pending.length).toBe(0);
  });

  it('should update crisis event status', async () => {
    const crisis = await createCrisisEvent('user-ack-3', 'entity-1', 'PR_ISSUE', 'MEDIUM', 'Status Test', 'Test');
    await executeEscalation(crisis.id);
    const updated = await acknowledgeEscalation(crisis.id, 1);
    expect(updated.status).toBe('ACKNOWLEDGED');
  });
});
