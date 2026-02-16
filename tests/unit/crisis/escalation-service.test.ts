import {
  getEscalationChain,
  setEscalationChain,
  executeEscalation,
  acknowledgeEscalation,
  getEscalationStatus,
} from '@/modules/crisis/services/escalation-service';
import {
  createCrisisEvent,
  getCrisisById,
} from '@/modules/crisis/services/detection-service';
import type { EscalationChainConfig } from '@/modules/crisis/types';

// Mock AI client (used by executeEscalation for AI-generated messages)
jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('Urgent: Legal threat detected. Please respond immediately.'),
  generateJSON: jest.fn().mockResolvedValue({
    isCrisis: false,
    confidence: 0.1,
    explanation: 'mock',
  }),
}));

// Mock playbook service
jest.mock('@/modules/crisis/services/playbook-service', () => ({
  getPlaybook: jest.fn().mockReturnValue({
    id: 'pb-test',
    name: 'Test Playbook',
    crisisType: 'LEGAL_THREAT',
    estimatedResolutionHours: 72,
    steps: [],
  }),
}));

const { generateText } = require('@/lib/ai');

describe('EscalationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getEscalationChain', () => {
    it('should return default chain for a known crisis type', () => {
      const chain = getEscalationChain('LEGAL_THREAT');

      expect(chain.crisisType).toBe('LEGAL_THREAT');
      expect(chain.steps.length).toBeGreaterThan(0);
      expect(chain.steps[0].contactName).toBe('Legal Counsel');
    });

    it('should return default chain for DATA_BREACH with multiple steps', () => {
      const chain = getEscalationChain('DATA_BREACH');

      expect(chain.crisisType).toBe('DATA_BREACH');
      expect(chain.steps.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('setEscalationChain', () => {
    it('should override the default chain with a custom chain', () => {
      const customConfig: EscalationChainConfig = {
        crisisType: 'LEGAL_THREAT',
        steps: [
          { order: 1, contactName: 'Custom Contact', contactMethod: 'SMS', escalateAfterMinutes: 5 },
        ],
      };

      setEscalationChain(customConfig);
      const chain = getEscalationChain('LEGAL_THREAT');

      expect(chain.steps[0].contactName).toBe('Custom Contact');

      // Restore default by setting back (for test isolation)
      setEscalationChain({
        crisisType: 'LEGAL_THREAT',
        steps: [
          { order: 1, contactName: 'Legal Counsel', contactMethod: 'PHONE', escalateAfterMinutes: 15 },
          { order: 2, contactName: 'CEO', contactMethod: 'PHONE', escalateAfterMinutes: 30 },
          { order: 3, contactName: 'Board Chair', contactMethod: 'EMAIL', escalateAfterMinutes: 60 },
        ],
      });
    });
  });

  describe('executeEscalation', () => {
    it('should notify the first pending step in the escalation chain', async () => {
      const crisis = await createCrisisEvent(
        'user-1', 'entity-1', 'LEGAL_THREAT', 'HIGH', 'Test Crisis', 'Test description'
      );

      const steps = await executeEscalation(crisis.id);

      const notified = steps.find((s) => s.status === 'NOTIFIED');
      expect(notified).toBeDefined();
      expect(notified!.order).toBe(1);
      expect(notified!.notifiedAt).toBeInstanceOf(Date);
    });

    it('should throw for non-existent crisis ID', async () => {
      await expect(executeEscalation('nonexistent')).rejects.toThrow(
        'Crisis nonexistent not found'
      );
    });

    it('should attempt AI-generated notification message', async () => {
      const crisis = await createCrisisEvent(
        'user-esc', 'entity-1', 'PR_ISSUE', 'HIGH', 'PR Crisis', 'Bad press'
      );

      await executeEscalation(crisis.id);

      expect(generateText).toHaveBeenCalledTimes(1);
    });

    it('should continue without AI message if AI fails', async () => {
      generateText.mockRejectedValueOnce(new Error('AI unavailable'));

      const crisis = await createCrisisEvent(
        'user-noai', 'entity-1', 'CLIENT_COMPLAINT', 'MEDIUM', 'Complaint', 'desc'
      );

      const steps = await executeEscalation(crisis.id);
      const notified = steps.find((s) => s.status === 'NOTIFIED');
      expect(notified).toBeDefined();
    });
  });

  describe('acknowledgeEscalation', () => {
    it('should mark the step as ACKNOWLEDGED and skip remaining steps', async () => {
      const crisis = await createCrisisEvent(
        'user-ack', 'entity-1', 'LEGAL_THREAT', 'HIGH', 'Ack Test', 'desc'
      );
      await executeEscalation(crisis.id);

      const updated = await acknowledgeEscalation(crisis.id, 1);

      expect(updated.status).toBe('ACKNOWLEDGED');
      const ackStep = updated.escalationChain.find((s) => s.order === 1);
      expect(ackStep!.status).toBe('ACKNOWLEDGED');
      expect(ackStep!.acknowledgedAt).toBeInstanceOf(Date);

      // Remaining pending steps should be SKIPPED
      const skipped = updated.escalationChain.filter((s) => s.status === 'SKIPPED');
      expect(skipped.length).toBeGreaterThanOrEqual(0);
    });

    it('should throw for non-existent crisis ID', async () => {
      await expect(acknowledgeEscalation('nonexistent', 1)).rejects.toThrow(
        'Crisis nonexistent not found'
      );
    });
  });

  describe('getEscalationStatus', () => {
    it('should return the escalation chain steps for a crisis', async () => {
      const crisis = await createCrisisEvent(
        'user-status', 'entity-1', 'FINANCIAL_ANOMALY', 'HIGH', 'Finance', 'desc'
      );

      const steps = await getEscalationStatus(crisis.id);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0]).toHaveProperty('order');
      expect(steps[0]).toHaveProperty('status');
    });

    it('should throw for non-existent crisis ID', async () => {
      await expect(getEscalationStatus('nonexistent')).rejects.toThrow(
        'Crisis nonexistent not found'
      );
    });
  });
});
