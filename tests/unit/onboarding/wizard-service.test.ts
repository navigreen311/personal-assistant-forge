jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import {
  startWizard,
  completeStep,
  skipStep,
  getProgress,
  resetWizard,
  getWizardState,
  ONBOARDING_STEPS,
} from '@/modules/onboarding/services/wizard-service';

const mockUser = prisma.user as jest.Mocked<typeof prisma.user>;

describe('Wizard Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockUserRecord = {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    hashedPassword: null,
    preferences: {} as Record<string, unknown>,
    timezone: 'America/Chicago',
    chronotype: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('startWizard', () => {
    it('should initialize onboarding state', async () => {
      (mockUser.findUnique as jest.Mock).mockResolvedValue({ ...mockUserRecord });
      (mockUser.update as jest.Mock).mockResolvedValue({ ...mockUserRecord });

      const result = await startWizard('user-1');

      expect(result.currentStep).toBe(0);
      expect(result.completedSteps).toHaveLength(0);
      expect(result.totalSteps).toBe(ONBOARDING_STEPS.length);
    });

    it('should set startedAt to current time', async () => {
      (mockUser.findUnique as jest.Mock).mockResolvedValue({ ...mockUserRecord });
      (mockUser.update as jest.Mock).mockResolvedValue({ ...mockUserRecord });

      const result = await startWizard('user-1');

      expect(result.startedAt).toBeDefined();
      expect(result.startedAt).not.toBeNull();
    });
  });

  describe('completeStep', () => {
    it('should add step to completedSteps', async () => {
      const prefs = {
        onboarding: {
          currentStep: 0,
          completedSteps: [],
          totalSteps: 7,
          startedAt: new Date().toISOString(),
          completedAt: null,
          stepData: {},
        },
      };
      (mockUser.findUnique as jest.Mock).mockResolvedValue({ ...mockUserRecord, preferences: prefs });
      (mockUser.update as jest.Mock).mockResolvedValue({ ...mockUserRecord });

      const result = await completeStep('user-1', 'PROFILE_SETUP');

      expect(result.completedSteps).toContain('PROFILE_SETUP');
    });

    it('should advance currentStep', async () => {
      const prefs = {
        onboarding: {
          currentStep: 0,
          completedSteps: [],
          totalSteps: 7,
          startedAt: new Date().toISOString(),
          completedAt: null,
          stepData: {},
        },
      };
      (mockUser.findUnique as jest.Mock).mockResolvedValue({ ...mockUserRecord, preferences: prefs });
      (mockUser.update as jest.Mock).mockResolvedValue({ ...mockUserRecord });

      const result = await completeStep('user-1', 'PROFILE_SETUP');

      expect(result.currentStep).toBe(1);
    });

    it('should set completedAt when all steps done', async () => {
      const allButLast = ONBOARDING_STEPS.slice(0, -1).map((s) => s);
      const prefs = {
        onboarding: {
          currentStep: 6,
          completedSteps: [...allButLast],
          totalSteps: 7,
          startedAt: new Date().toISOString(),
          completedAt: null,
          stepData: {},
        },
      };
      (mockUser.findUnique as jest.Mock).mockResolvedValue({ ...mockUserRecord, preferences: prefs });
      (mockUser.update as jest.Mock).mockResolvedValue({ ...mockUserRecord });

      const result = await completeStep('user-1', 'REVIEW_COMPLETE');

      expect(result.completedAt).toBeDefined();
      expect(result.completedAt).not.toBeNull();
    });
  });

  describe('getProgress', () => {
    it('should calculate correct percentage', async () => {
      const prefs = {
        onboarding: {
          currentStep: 3,
          completedSteps: ['PROFILE_SETUP', 'ENTITY_CREATION', 'TONE_CALIBRATION'],
          totalSteps: 7,
          startedAt: new Date().toISOString(),
          completedAt: null,
          stepData: {},
        },
      };
      (mockUser.findUnique as jest.Mock).mockResolvedValue({ ...mockUserRecord, preferences: prefs });

      const result = await getProgress('user-1');

      expect(result.percentage).toBe(43); // 3/7 * 100 = 42.857 -> 43
    });

    it('should report isComplete when all steps done', async () => {
      const prefs = {
        onboarding: {
          currentStep: 6,
          completedSteps: [...ONBOARDING_STEPS],
          totalSteps: 7,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          stepData: {},
        },
      };
      (mockUser.findUnique as jest.Mock).mockResolvedValue({ ...mockUserRecord, preferences: prefs });

      const result = await getProgress('user-1');

      expect(result.isComplete).toBe(true);
      expect(result.percentage).toBe(100);
    });

    it('should handle zero completed steps', async () => {
      const prefs = {
        onboarding: {
          currentStep: 0,
          completedSteps: [],
          totalSteps: 7,
          startedAt: new Date().toISOString(),
          completedAt: null,
          stepData: {},
        },
      };
      (mockUser.findUnique as jest.Mock).mockResolvedValue({ ...mockUserRecord, preferences: prefs });

      const result = await getProgress('user-1');

      expect(result.percentage).toBe(0);
      expect(result.isComplete).toBe(false);
    });
  });

  describe('resetWizard', () => {
    it('should reset to initial state', async () => {
      const prefs = {
        onboarding: {
          currentStep: 5,
          completedSteps: ['PROFILE_SETUP', 'ENTITY_CREATION'],
          totalSteps: 7,
          startedAt: new Date().toISOString(),
          completedAt: null,
          stepData: { PROFILE_SETUP: { name: 'Test' } },
        },
      };
      (mockUser.findUnique as jest.Mock).mockResolvedValue({ ...mockUserRecord, preferences: prefs });
      (mockUser.update as jest.Mock).mockResolvedValue({ ...mockUserRecord });

      const result = await resetWizard('user-1');

      expect(result.currentStep).toBe(0);
      expect(result.completedSteps).toHaveLength(0);
      expect(result.startedAt).toBeNull();
      expect(result.completedAt).toBeNull();
    });
  });

  describe('skipStep', () => {
    it('should advance currentStep without adding to completedSteps', async () => {
      const prefs = {
        onboarding: {
          currentStep: 2,
          completedSteps: ['PROFILE_SETUP', 'ENTITY_CREATION'],
          totalSteps: 7,
          startedAt: new Date().toISOString(),
          completedAt: null,
          stepData: {},
        },
      };
      (mockUser.findUnique as jest.Mock).mockResolvedValue({ ...mockUserRecord, preferences: prefs });
      (mockUser.update as jest.Mock).mockResolvedValue({ ...mockUserRecord });

      const result = await skipStep('user-1', 'TONE_CALIBRATION');

      expect(result.currentStep).toBe(3);
      expect(result.completedSteps).not.toContain('TONE_CALIBRATION');
    });
  });
});
