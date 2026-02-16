import {
  analyzeSignals,
  createCrisisEvent,
  getActiveCrises,
  getCrisisById,
  updateCrisis,
} from '@/modules/crisis/services/detection-service';
import type { CrisisDetectionSignal } from '@/modules/crisis/types';

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn().mockResolvedValue({
    isCrisis: false,
    confidence: 0.1,
    explanation: 'AI: No crisis detected.',
  }),
}));

// Mock escalation and playbook services used by createCrisisEvent
jest.mock('@/modules/crisis/services/escalation-service', () => ({
  getEscalationChain: jest.fn().mockReturnValue({
    crisisType: 'LEGAL_THREAT',
    steps: [
      { order: 1, contactName: 'Legal Counsel', contactMethod: 'PHONE', escalateAfterMinutes: 15 },
    ],
  }),
}));

jest.mock('@/modules/crisis/services/playbook-service', () => ({
  getPlaybook: jest.fn().mockReturnValue({
    id: 'pb-legal',
    name: 'Legal Threat Response',
    crisisType: 'LEGAL_THREAT',
    estimatedResolutionHours: 72,
    steps: [],
  }),
}));

const { generateJSON } = require('@/lib/ai');

// Helper to get the internal crisis store (via getCrisisById and createCrisisEvent)
async function clearCrisisStore() {
  // No direct access to crisisStore, so we work with test isolation via unique IDs
}

describe('DetectionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('analyzeSignals', () => {
    it('should return no crisis for empty signals array', async () => {
      const result = await analyzeSignals([]);

      expect(result.isCrisis).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.explanation).toBe('No signals to analyze.');
    });

    it('should detect LEGAL_THREAT when signals contain legal keywords', async () => {
      const signals: CrisisDetectionSignal[] = [
        {
          source: 'email',
          signalType: 'message',
          confidence: 0.9,
          rawData: { body: 'We will file a lawsuit against your company.' },
          timestamp: new Date(),
        },
      ];

      const result = await analyzeSignals(signals);

      expect(result.isCrisis).toBe(true);
      expect(result.type).toBe('LEGAL_THREAT');
      expect(result.severity).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should detect DATA_BREACH when security-related messages are found', async () => {
      const signals: CrisisDetectionSignal[] = [
        {
          source: 'security',
          signalType: 'alert',
          confidence: 0.8,
          rawData: { body: 'Unauthorized access detected on server cluster.' },
          timestamp: new Date(),
        },
      ];

      const result = await analyzeSignals(signals);

      expect(result.isCrisis).toBe(true);
      expect(result.type).toBe('DATA_BREACH');
      expect(result.severity).toBe('CRITICAL');
    });

    it('should detect HEALTH_EMERGENCY when cancellations, missed check-ins, and medical messages all present', async () => {
      const now = new Date();
      const signals: CrisisDetectionSignal[] = [
        {
          source: 'calendar',
          signalType: 'calendar_cancellation',
          confidence: 0.7,
          rawData: { body: '' },
          timestamp: now,
        },
        {
          source: 'checkin',
          signalType: 'missed_checkin',
          confidence: 0.8,
          rawData: { body: '' },
          timestamp: now,
        },
        {
          source: 'message',
          signalType: 'message',
          confidence: 0.9,
          rawData: { body: 'I am at the hospital for an emergency procedure.' },
          timestamp: now,
        },
      ];

      const result = await analyzeSignals(signals);

      expect(result.isCrisis).toBe(true);
      expect(result.type).toBe('HEALTH_EMERGENCY');
      expect(result.severity).toBe('CRITICAL');
    });

    it('should fall back to AI analysis when no keyword patterns match', async () => {
      const signals: CrisisDetectionSignal[] = [
        {
          source: 'generic',
          signalType: 'generic',
          confidence: 0.5,
          rawData: { body: 'Something unusual happened today.' },
          timestamp: new Date(),
        },
      ];

      const result = await analyzeSignals(signals);

      expect(generateJSON).toHaveBeenCalledTimes(1);
      expect(result.isCrisis).toBe(false);
    });

    it('should return no crisis when AI also fails', async () => {
      generateJSON.mockRejectedValueOnce(new Error('AI unavailable'));

      const signals: CrisisDetectionSignal[] = [
        {
          source: 'generic',
          signalType: 'generic',
          confidence: 0.5,
          rawData: { body: 'Something unusual.' },
          timestamp: new Date(),
        },
      ];

      const result = await analyzeSignals(signals);

      expect(result.isCrisis).toBe(false);
      expect(result.confidence).toBe(0.1);
      expect(result.explanation).toBe('No crisis patterns detected in the provided signals.');
    });

    it('should detect FINANCIAL_ANOMALY for multiple financial signals in short period', async () => {
      const signals: CrisisDetectionSignal[] = [
        { source: 'financial', signalType: 'transaction', confidence: 0.7, rawData: { amount: 100 }, timestamp: new Date() },
        { source: 'financial', signalType: 'transaction', confidence: 0.7, rawData: { amount: 200 }, timestamp: new Date() },
        { source: 'financial', signalType: 'transaction', confidence: 0.7, rawData: { amount: 150 }, timestamp: new Date() },
      ];

      const result = await analyzeSignals(signals);

      expect(result.isCrisis).toBe(true);
      expect(result.type).toBe('FINANCIAL_ANOMALY');
    });

    it('should detect PR_ISSUE for multiple negative sentiment signals from different contacts', async () => {
      const now = new Date();
      const signals: CrisisDetectionSignal[] = [
        {
          source: 'social', signalType: 'negative_sentiment', confidence: 0.8,
          rawData: { body: 'Terrible service', contactId: 'contact-1' },
          timestamp: now,
        },
        {
          source: 'social', signalType: 'negative_sentiment', confidence: 0.7,
          rawData: { body: 'Very disappointed', contactId: 'contact-2' },
          timestamp: now,
        },
      ];

      const result = await analyzeSignals(signals);

      expect(result.isCrisis).toBe(true);
      expect(result.type).toBe('PR_ISSUE');
    });
  });

  describe('createCrisisEvent', () => {
    it('should create a crisis event with escalation chain and playbook', async () => {
      const crisis = await createCrisisEvent(
        'user-1',
        'entity-1',
        'LEGAL_THREAT',
        'HIGH',
        'Lawsuit Notice',
        'Received legal threat via email'
      );

      expect(crisis.id).toBeDefined();
      expect(crisis.userId).toBe('user-1');
      expect(crisis.entityId).toBe('entity-1');
      expect(crisis.type).toBe('LEGAL_THREAT');
      expect(crisis.severity).toBe('HIGH');
      expect(crisis.status).toBe('DETECTED');
      expect(crisis.escalationChain).toBeDefined();
      expect(crisis.escalationChain.length).toBeGreaterThan(0);
      expect(crisis.playbook).toBeDefined();
      expect(crisis.warRoom.isActive).toBe(false);
    });
  });

  describe('getActiveCrises', () => {
    it('should return active (non-resolved) crises for a user', async () => {
      const crisis = await createCrisisEvent(
        'user-active',
        'entity-1',
        'LEGAL_THREAT',
        'HIGH',
        'Active crisis',
        'desc'
      );

      const actives = await getActiveCrises('user-active');
      expect(actives.length).toBeGreaterThanOrEqual(1);
      expect(actives.some((c) => c.id === crisis.id)).toBe(true);
    });
  });

  describe('getCrisisById / updateCrisis', () => {
    it('should retrieve a crisis by its ID', async () => {
      const crisis = await createCrisisEvent(
        'user-1', 'entity-1', 'DATA_BREACH', 'CRITICAL', 'Breach', 'desc'
      );

      const found = getCrisisById(crisis.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(crisis.id);
    });

    it('should return undefined for non-existent crisis ID', () => {
      const found = getCrisisById('nonexistent');
      expect(found).toBeUndefined();
    });

    it('should update crisis state via updateCrisis', async () => {
      const crisis = await createCrisisEvent(
        'user-1', 'entity-1', 'PR_ISSUE', 'MEDIUM', 'PR', 'desc'
      );

      crisis.status = 'RESOLVED';
      updateCrisis(crisis);

      const updated = getCrisisById(crisis.id);
      expect(updated!.status).toBe('RESOLVED');
    });
  });
});
