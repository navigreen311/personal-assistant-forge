jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
  generateText: jest.fn(),
}));

import { generateJSON } from '@/lib/ai';
import {
  startCalibration,
  updateCalibration,
  getCalibration,
  completeCalibration,
  calibrationStore,
} from '@/modules/onboarding/services/calibration-service';

const mockGenerateJSON = generateJSON as jest.Mock;

describe('Calibration Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    calibrationStore.clear();
  });

  describe('calibration exercises', () => {
    it('should run calibration with AI analysis', async () => {
      const calibration = await startCalibration('user-1');
      expect(calibration.userId).toBe('user-1');
      expect(calibration.calibrationComplete).toBe(false);

      mockGenerateJSON.mockResolvedValue({
        behavioralPreferences: { responseLength: 'concise' },
        recommendations: ['Be direct'],
        suggestedAutonomyLevel: 'DRAFT',
      });

      const result = await completeCalibration('user-1');
      expect(result.calibrationComplete).toBe(true);
      expect(result.aiProfile).toBeDefined();
      expect(mockGenerateJSON).toHaveBeenCalled();
    });

    it('should store results in user preferences (calibrationStore)', async () => {
      await startCalibration('user-1');
      await updateCalibration('user-1', { communicationStyle: 'FORMAL' });

      const stored = await getCalibration('user-1');
      expect(stored.communicationStyle).toBe('FORMAL');
    });

    it('should handle AI failure gracefully', async () => {
      await startCalibration('user-1');
      mockGenerateJSON.mockRejectedValue(new Error('AI service unavailable'));

      const result = await completeCalibration('user-1');
      expect(result.calibrationComplete).toBe(true);
      expect(result.aiProfile).toBeUndefined();
    });
  });

  describe('preference profile', () => {
    it('should build preference profile from responses', async () => {
      await startCalibration('user-1');
      await updateCalibration('user-1', {
        communicationStyle: 'FORMAL',
        decisionSpeed: 'DELIBERATE',
        detailPreference: 'HIGH',
        riskTolerance: 'CONSERVATIVE',
        autonomyComfort: 'LOW',
      });

      mockGenerateJSON.mockResolvedValue({
        behavioralPreferences: { responseLength: 'detailed', proactivity: 'low' },
        recommendations: ['Provide detailed explanations', 'Always seek approval'],
        suggestedAutonomyLevel: 'SUGGEST',
      });

      const result = await completeCalibration('user-1');
      expect(result.aiProfile).toBeDefined();
      expect(result.communicationStyle).toBe('FORMAL');
      expect(result.riskTolerance).toBe('CONSERVATIVE');
    });

    it('should update profile on recalibration', async () => {
      await startCalibration('user-1');
      await updateCalibration('user-1', { communicationStyle: 'FORMAL' });

      let cal = await getCalibration('user-1');
      expect(cal.communicationStyle).toBe('FORMAL');

      await updateCalibration('user-1', { communicationStyle: 'CASUAL' });
      cal = await getCalibration('user-1');
      expect(cal.communicationStyle).toBe('CASUAL');
    });
  });

  describe('startCalibration', () => {
    it('should create default calibration with adaptive defaults', async () => {
      const result = await startCalibration('user-2');
      expect(result.communicationStyle).toBe('ADAPTIVE');
      expect(result.decisionSpeed).toBe('BALANCED');
      expect(result.detailPreference).toBe('MEDIUM');
      expect(result.riskTolerance).toBe('MODERATE');
      expect(result.autonomyComfort).toBe('MEDIUM');
    });
  });
});
