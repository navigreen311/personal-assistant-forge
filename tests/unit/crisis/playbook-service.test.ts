import {
  getPlaybook,
  executePlaybookStep,
  getCustomPlaybooks,
  createPlaybook,
} from '@/modules/crisis/services/playbook-service';
import type { CrisisType, CrisisPlaybook, CrisisEvent } from '@/modules/crisis/types';

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('mock-uuid-1234'),
}));

// Track crisis store for detection-service mock
const mockCrisisStore = new Map<string, CrisisEvent>();

jest.mock('@/modules/crisis/services/detection-service', () => ({
  getCrisisById: jest.fn((id: string) => mockCrisisStore.get(id)),
  updateCrisis: jest.fn((crisis: CrisisEvent) => {
    mockCrisisStore.set(crisis.id, crisis);
  }),
}));

const { getCrisisById, updateCrisis } = require('@/modules/crisis/services/detection-service');

function createMockCrisis(overrides: Partial<CrisisEvent> = {}): CrisisEvent {
  const defaultPlaybook: CrisisPlaybook = {
    id: 'pb-test',
    name: 'Test Playbook',
    crisisType: 'LEGAL_THREAT',
    estimatedResolutionHours: 72,
    steps: [
      { order: 1, title: 'Step 1', description: 'First step', actionType: 'COMMUNICATION', isAutomatable: true, isComplete: false },
      { order: 2, title: 'Step 2', description: 'Second step', actionType: 'LEGAL', isAutomatable: false, isComplete: false },
      { order: 3, title: 'Step 3', description: 'Third step', actionType: 'DOCUMENTATION', isAutomatable: false, isComplete: false },
    ],
  };

  const crisis: CrisisEvent = {
    id: 'crisis-1',
    userId: 'user-1',
    entityId: 'entity-1',
    type: 'LEGAL_THREAT',
    severity: 'HIGH',
    status: 'DETECTED',
    title: 'Test Crisis',
    description: 'A test crisis event',
    detectedAt: new Date('2026-01-15T10:00:00Z'),
    escalationChain: [],
    playbook: defaultPlaybook,
    warRoom: {
      isActive: false,
      clearedCalendarEvents: [],
      surfacedDocuments: [],
      draftedComms: [],
      participants: [],
    },
    ...overrides,
  };

  mockCrisisStore.set(crisis.id, crisis);
  return crisis;
}

describe('PlaybookService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCrisisStore.clear();
  });

  describe('getPlaybook', () => {
    it('should return built-in playbook for DATA_BREACH', () => {
      const playbook = getPlaybook('DATA_BREACH');

      expect(playbook.id).toBe('pb-data-breach');
      expect(playbook.name).toBe('Data Breach Response');
      expect(playbook.crisisType).toBe('DATA_BREACH');
      expect(playbook.estimatedResolutionHours).toBe(72);
      expect(playbook.steps).toHaveLength(6);
    });

    it('should return built-in playbook for CLIENT_COMPLAINT', () => {
      const playbook = getPlaybook('CLIENT_COMPLAINT');

      expect(playbook.id).toBe('pb-client-complaint');
      expect(playbook.name).toBe('Client Complaint Resolution');
      expect(playbook.estimatedResolutionHours).toBe(24);
      expect(playbook.steps).toHaveLength(6);
      expect(playbook.steps[0].title).toBe('Acknowledge complaint');
    });

    it('should return built-in playbook for FINANCIAL_ANOMALY', () => {
      const playbook = getPlaybook('FINANCIAL_ANOMALY');

      expect(playbook.id).toBe('pb-financial-anomaly');
      expect(playbook.crisisType).toBe('FINANCIAL_ANOMALY');
      expect(playbook.steps[0].title).toBe('Freeze accounts');
      expect(playbook.steps[0].actionType).toBe('FINANCIAL');
    });

    it('should return built-in playbook for REGULATORY_INQUIRY', () => {
      const playbook = getPlaybook('REGULATORY_INQUIRY');

      expect(playbook.id).toBe('pb-regulatory-inquiry');
      expect(playbook.estimatedResolutionHours).toBe(168);
      expect(playbook.steps).toHaveLength(6);
    });

    it('should return built-in playbook for LEGAL_THREAT', () => {
      const playbook = getPlaybook('LEGAL_THREAT');

      expect(playbook.id).toBe('pb-legal-threat');
      expect(playbook.name).toBe('Legal Threat Response');
      expect(playbook.steps[0].title).toBe('Do not respond');
    });

    it('should return a generic playbook for unknown crisis types', () => {
      const playbook = getPlaybook('NATURAL_DISASTER' as CrisisType);

      expect(playbook.id).toBe('pb-generic-natural_disaster');
      expect(playbook.name).toBe('NATURAL_DISASTER Response');
      expect(playbook.estimatedResolutionHours).toBe(48);
      expect(playbook.steps).toHaveLength(4);
    });

    it('should include all required step fields in built-in playbooks', () => {
      const playbook = getPlaybook('DATA_BREACH');

      for (const step of playbook.steps) {
        expect(step).toHaveProperty('order');
        expect(step).toHaveProperty('title');
        expect(step).toHaveProperty('description');
        expect(step).toHaveProperty('actionType');
        expect(step).toHaveProperty('isAutomatable');
        expect(step.isComplete).toBe(false);
      }
    });
  });

  describe('executePlaybookStep', () => {
    it('should mark the specified step as complete', async () => {
      const crisis = createMockCrisis();

      await executePlaybookStep(crisis.id, 1);

      const updated = mockCrisisStore.get(crisis.id)!;
      const step = updated.playbook!.steps.find(s => s.order === 1);
      expect(step!.isComplete).toBe(true);
      expect(step!.completedAt).toBeInstanceOf(Date);
    });

    it('should set crisis status to IN_PROGRESS when first step is completed', async () => {
      const crisis = createMockCrisis({ status: 'DETECTED' });

      await executePlaybookStep(crisis.id, 1);

      const updated = mockCrisisStore.get(crisis.id)!;
      expect(updated.status).toBe('IN_PROGRESS');
    });

    it('should set crisis status to MITIGATED when all steps are completed', async () => {
      const crisis = createMockCrisis();

      // Complete all three steps
      await executePlaybookStep(crisis.id, 1);
      await executePlaybookStep(crisis.id, 2);
      await executePlaybookStep(crisis.id, 3);

      const updated = mockCrisisStore.get(crisis.id)!;
      expect(updated.status).toBe('MITIGATED');
    });

    it('should throw when crisis is not found', async () => {
      await expect(executePlaybookStep('nonexistent', 1)).rejects.toThrow(
        'Crisis nonexistent not found'
      );
    });

    it('should throw when crisis has no playbook', async () => {
      createMockCrisis({ id: 'no-pb-crisis', playbook: undefined });

      await expect(executePlaybookStep('no-pb-crisis', 1)).rejects.toThrow(
        'No playbook assigned to crisis no-pb-crisis'
      );
    });

    it('should call updateCrisis after completing a step', async () => {
      const crisis = createMockCrisis();

      await executePlaybookStep(crisis.id, 1);

      expect(updateCrisis).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCustomPlaybooks', () => {
    it('should return empty array when no custom playbooks exist', async () => {
      const playbooks = await getCustomPlaybooks('user-1');

      expect(playbooks).toEqual([]);
    });

    it('should return custom playbooks after one is created', async () => {
      await createPlaybook({
        name: 'Custom PB',
        crisisType: 'LEGAL_THREAT',
        steps: [
          { order: 1, title: 'Custom Step', description: 'desc', actionType: 'HUMAN', isAutomatable: false, isComplete: false },
        ],
        estimatedResolutionHours: 24,
      });

      const playbooks = await getCustomPlaybooks('user-1');

      expect(playbooks).toHaveLength(1);
      expect(playbooks[0].name).toBe('Custom PB');
    });
  });

  describe('createPlaybook', () => {
    it('should create a playbook with a generated ID', async () => {
      const playbook = await createPlaybook({
        name: 'My Custom Playbook',
        crisisType: 'DATA_BREACH',
        steps: [
          { order: 1, title: 'Step A', description: 'First', actionType: 'TECHNICAL', isAutomatable: true, isComplete: false },
        ],
        estimatedResolutionHours: 36,
      });

      expect(playbook.id).toBe('mock-uuid-1234');
      expect(playbook.name).toBe('My Custom Playbook');
      expect(playbook.crisisType).toBe('DATA_BREACH');
      expect(playbook.estimatedResolutionHours).toBe(36);
      expect(playbook.steps).toHaveLength(1);
    });

    it('should preserve all provided fields in the created playbook', async () => {
      const steps = [
        { order: 1, title: 'Step 1', description: 'First step', actionType: 'COMMUNICATION' as const, isAutomatable: true, isComplete: false },
        { order: 2, title: 'Step 2', description: 'Second step', actionType: 'LEGAL' as const, isAutomatable: false, isComplete: false },
      ];

      const playbook = await createPlaybook({
        name: 'Multi-step PB',
        crisisType: 'REGULATORY_INQUIRY',
        steps,
        estimatedResolutionHours: 100,
      });

      expect(playbook.steps).toHaveLength(2);
      expect(playbook.steps[0].actionType).toBe('COMMUNICATION');
      expect(playbook.steps[1].actionType).toBe('LEGAL');
    });
  });
});
