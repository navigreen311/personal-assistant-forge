import {
  generateReview,
  addActionItem,
  addLessonLearned,
} from '@/modules/crisis/services/post-incident-service';
import type { CrisisEvent, CrisisPlaybook, PostIncidentReview } from '@/modules/crisis/types';

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn().mockResolvedValue({
    rootCause: 'System vulnerability was exploited due to outdated dependencies.',
    whatWorked: ['War room was activated promptly', 'Escalation chain responded quickly'],
    whatFailed: ['Detection took too long', 'Documentation was incomplete'],
    actionItems: [
      { title: 'Update dependencies', assignee: 'Engineering', dueDate: '2026-02-01T00:00:00Z', status: 'OPEN' },
    ],
    lessonsLearned: ['Implement automated dependency scanning'],
  }),
}));

const { generateJSON } = require('@/lib/ai');

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
  const playbook: CrisisPlaybook = {
    id: 'pb-test',
    name: 'Test Playbook',
    crisisType: 'LEGAL_THREAT',
    estimatedResolutionHours: 72,
    steps: [
      { order: 1, title: 'Step 1', description: 'First step', actionType: 'COMMUNICATION', isAutomatable: true, isComplete: true, completedAt: new Date('2026-01-15T12:00:00Z') },
      { order: 2, title: 'Step 2', description: 'Second step', actionType: 'LEGAL', isAutomatable: false, isComplete: false },
    ],
  };

  const crisis: CrisisEvent = {
    id: 'crisis-pir-1',
    userId: 'user-1',
    entityId: 'entity-1',
    type: 'LEGAL_THREAT',
    severity: 'HIGH',
    status: 'MITIGATED',
    title: 'Test Crisis',
    description: 'A test crisis for post-incident review',
    detectedAt: new Date('2026-01-15T10:00:00Z'),
    acknowledgedAt: new Date('2026-01-15T10:30:00Z'),
    resolvedAt: new Date('2026-01-15T18:00:00Z'),
    escalationChain: [
      {
        order: 1,
        contactName: 'Legal Counsel',
        contactMethod: 'PHONE',
        escalateAfterMinutes: 15,
        status: 'ACKNOWLEDGED',
        notifiedAt: new Date('2026-01-15T10:05:00Z'),
        acknowledgedAt: new Date('2026-01-15T10:20:00Z'),
      },
      {
        order: 2,
        contactName: 'CEO',
        contactMethod: 'PHONE',
        escalateAfterMinutes: 30,
        status: 'SKIPPED',
      },
    ],
    playbook,
    warRoom: {
      isActive: true,
      activatedAt: new Date('2026-01-15T10:15:00Z'),
      clearedCalendarEvents: ['meeting-1'],
      surfacedDocuments: ['doc-1'],
      draftedComms: ['comm-1'],
      participants: ['user-1', 'user-2'],
    },
    ...overrides,
  };

  mockCrisisStore.set(crisis.id, crisis);
  return crisis;
}

describe('PostIncidentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCrisisStore.clear();
  });

  describe('generateReview', () => {
    it('should generate an AI-powered post-incident review', async () => {
      const crisis = createMockCrisis();

      const review = await generateReview(crisis.id);

      expect(review.crisisId).toBe(crisis.id);
      expect(review.rootCause).toBe('System vulnerability was exploited due to outdated dependencies.');
      expect(review.whatWorked).toContain('War room was activated promptly');
      expect(review.whatFailed).toContain('Detection took too long');
      expect(review.lessonsLearned).toContain('Implement automated dependency scanning');
    });

    it('should build timeline from crisis events', async () => {
      const crisis = createMockCrisis();

      const review = await generateReview(crisis.id);

      expect(review.timeline.length).toBeGreaterThanOrEqual(1);
      // First event should be detection
      const detectedEvent = review.timeline.find(t => t.event === 'Crisis detected');
      expect(detectedEvent).toBeDefined();
      expect(detectedEvent!.actor).toBe('SYSTEM');
    });

    it('should include acknowledged and resolved events in timeline', async () => {
      const crisis = createMockCrisis();

      const review = await generateReview(crisis.id);

      const ackEvent = review.timeline.find(t => t.event === 'Crisis acknowledged');
      expect(ackEvent).toBeDefined();
      expect(ackEvent!.actor).toBe('HUMAN');

      const resolvedEvent = review.timeline.find(t => t.event === 'Crisis resolved');
      expect(resolvedEvent).toBeDefined();
    });

    it('should include escalation chain events in timeline', async () => {
      const crisis = createMockCrisis();

      const review = await generateReview(crisis.id);

      const notifyEvent = review.timeline.find(t => t.event.includes('Legal Counsel notified'));
      expect(notifyEvent).toBeDefined();

      const ackEscEvent = review.timeline.find(t => t.event.includes('Legal Counsel acknowledged'));
      expect(ackEscEvent).toBeDefined();
    });

    it('should include completed playbook steps in timeline', async () => {
      const crisis = createMockCrisis();

      const review = await generateReview(crisis.id);

      const playbookEvent = review.timeline.find(t => t.event.includes('Playbook step completed: Step 1'));
      expect(playbookEvent).toBeDefined();
    });

    it('should set crisis status to POST_MORTEM after review', async () => {
      const crisis = createMockCrisis();

      await generateReview(crisis.id);

      expect(updateCrisis).toHaveBeenCalled();
      const updated = mockCrisisStore.get(crisis.id)!;
      expect(updated.status).toBe('POST_MORTEM');
    });

    it('should throw when crisis is not found', async () => {
      await expect(generateReview('nonexistent')).rejects.toThrow(
        'Crisis nonexistent not found'
      );
    });

    it('should fall back to rule-based review when AI fails', async () => {
      generateJSON.mockRejectedValueOnce(new Error('AI unavailable'));
      const crisis = createMockCrisis();

      const review = await generateReview(crisis.id);

      expect(review.crisisId).toBe(crisis.id);
      expect(review.rootCause).toBe('To be determined during post-incident analysis.');
      // War room was active, so this should appear in whatWorked
      expect(review.whatWorked).toContain('War room was activated promptly');
      // Escalation step was acknowledged
      expect(review.whatWorked).toContain('Escalation chain resulted in acknowledgment');
    });

    it('should include "no escalation acknowledged" in whatFailed when no escalation was acknowledged (AI fallback)', async () => {
      generateJSON.mockRejectedValueOnce(new Error('AI unavailable'));
      const crisis = createMockCrisis({
        id: 'crisis-no-ack',
        escalationChain: [
          {
            order: 1,
            contactName: 'Legal Counsel',
            contactMethod: 'PHONE',
            escalateAfterMinutes: 15,
            status: 'NOTIFIED',
            notifiedAt: new Date('2026-01-15T10:05:00Z'),
          },
        ],
        warRoom: {
          isActive: false,
          clearedCalendarEvents: [],
          surfacedDocuments: [],
          draftedComms: [],
          participants: [],
        },
      });

      const review = await generateReview(crisis.id);

      expect(review.whatFailed).toContain('No escalation steps were acknowledged');
    });

    it('should convert AI action item due dates to Date objects', async () => {
      const crisis = createMockCrisis({ id: 'crisis-dates' });

      const review = await generateReview(crisis.id);

      expect(review.actionItems).toHaveLength(1);
      expect(review.actionItems[0].dueDate).toBeInstanceOf(Date);
      expect(review.actionItems[0].title).toBe('Update dependencies');
    });

    it('should sort timeline chronologically', async () => {
      const crisis = createMockCrisis({ id: 'crisis-sorted' });

      const review = await generateReview(crisis.id);

      for (let i = 1; i < review.timeline.length; i++) {
        const prev = new Date(review.timeline[i - 1].timestamp).getTime();
        const curr = new Date(review.timeline[i].timestamp).getTime();
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    });
  });

  describe('addActionItem', () => {
    it('should add an action item to an existing review', async () => {
      const crisis = createMockCrisis();
      await generateReview(crisis.id);

      const updatedReview = await addActionItem(crisis.id, {
        title: 'Conduct training session',
        assignee: 'HR',
        dueDate: new Date('2026-03-01'),
      });

      // One from AI + one added manually
      expect(updatedReview.actionItems.length).toBeGreaterThanOrEqual(2);
      const addedItem = updatedReview.actionItems.find(i => i.title === 'Conduct training session');
      expect(addedItem).toBeDefined();
      expect(addedItem!.assignee).toBe('HR');
      expect(addedItem!.status).toBe('OPEN');
    });

    it('should throw when review does not exist', async () => {
      await expect(
        addActionItem('nonexistent', {
          title: 'Test',
          assignee: 'Someone',
          dueDate: new Date(),
        })
      ).rejects.toThrow('Review for crisis nonexistent not found');
    });

    it('should update the crisis with the modified review', async () => {
      const crisis = createMockCrisis({ id: 'crisis-action-update' });
      await generateReview(crisis.id);
      jest.clearAllMocks();

      await addActionItem(crisis.id, {
        title: 'New Action',
        assignee: 'Team',
        dueDate: new Date('2026-04-01'),
      });

      expect(updateCrisis).toHaveBeenCalled();
    });
  });

  describe('addLessonLearned', () => {
    it('should add a lesson learned to an existing review', async () => {
      const crisis = createMockCrisis();
      await generateReview(crisis.id);

      const updatedReview = await addLessonLearned(crisis.id, 'Always verify backups before deployment.');

      expect(updatedReview.lessonsLearned).toContain('Always verify backups before deployment.');
    });

    it('should throw when review does not exist', async () => {
      await expect(
        addLessonLearned('nonexistent', 'Some lesson')
      ).rejects.toThrow('Review for crisis nonexistent not found');
    });

    it('should update the crisis with the modified review', async () => {
      const crisis = createMockCrisis({ id: 'crisis-lesson-update' });
      await generateReview(crisis.id);
      jest.clearAllMocks();

      await addLessonLearned(crisis.id, 'Keep runbooks up to date.');

      expect(updateCrisis).toHaveBeenCalled();
    });

    it('should accumulate multiple lessons learned', async () => {
      const crisis = createMockCrisis({ id: 'crisis-multi-lessons' });
      await generateReview(crisis.id);

      await addLessonLearned(crisis.id, 'Lesson 1');
      const review = await addLessonLearned(crisis.id, 'Lesson 2');

      expect(review.lessonsLearned).toContain('Lesson 1');
      expect(review.lessonsLearned).toContain('Lesson 2');
    });
  });
});
