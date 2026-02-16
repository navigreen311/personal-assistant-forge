jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('AI generated sample message for tone calibration.'),
  generateJSON: jest.fn().mockResolvedValue({
    formality: 'balanced',
    warmth: 'warm',
    directness: 'direct',
    preferredLength: 'concise',
    topAdjustments: ['more-formal'],
    averageRating: 4,
    samplesRated: 2,
    summary: 'User prefers a balanced, warm tone.',
  }),
}));

import {
  generateSample,
  rateSample,
  getSamples,
  applyTraining,
  sampleStore,
} from '@/modules/onboarding/services/tone-training-service';
import { generateText, generateJSON } from '@/lib/ai';

const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>;
const mockGenerateJSON = generateJSON as jest.MockedFunction<typeof generateJSON>;

describe('tone-training-service', () => {
  beforeEach(() => {
    sampleStore.clear();
    jest.clearAllMocks();
    mockGenerateText.mockResolvedValue('AI generated sample message for tone calibration.');
    mockGenerateJSON.mockResolvedValue({
      formality: 'balanced',
      warmth: 'warm',
      directness: 'direct',
      preferredLength: 'concise',
      topAdjustments: ['more-formal'],
      averageRating: 4,
      samplesRated: 2,
      summary: 'User prefers a balanced, warm tone.',
    });
  });

  describe('generateSample', () => {
    it('should create a sample with correct userId, context, and default rating of 0', async () => {
      const sample = await generateSample('user-1', 'Client email');

      expect(sample.userId).toBe('user-1');
      expect(sample.context).toBe('Client email');
      expect(sample.userRating).toBe(0);
      expect(sample.adjustments).toEqual([]);
      expect(sample.id).toBeDefined();
    });

    it('should call AI generateText to produce the sample text', async () => {
      const sample = await generateSample('user-1', 'Team standup');

      expect(mockGenerateText).toHaveBeenCalledTimes(1);
      expect(sample.sampleText).toBe('AI generated sample message for tone calibration.');
    });

    it('should fall back to template text when AI fails', async () => {
      mockGenerateText.mockRejectedValueOnce(new Error('AI unavailable'));

      const sample = await generateSample('user-1', 'Formal report');

      // Should still return a sample with template text (not the AI text)
      expect(sample.sampleText).toBeTruthy();
      expect(sample.userId).toBe('user-1');
      expect(sample.userRating).toBe(0);
    });

    it('should store the sample in the sampleStore', async () => {
      const sample = await generateSample('user-1', 'Test context');

      expect(sampleStore.has(sample.id)).toBe(true);
      expect(sampleStore.get(sample.id)).toEqual(sample);
    });
  });

  describe('rateSample', () => {
    it('should update userRating and adjustments on existing sample', async () => {
      const sample = await generateSample('user-1', 'Client email');

      const rated = await rateSample(sample.id, 4, ['more-formal', 'shorter']);

      expect(rated.userRating).toBe(4);
      expect(rated.adjustments).toEqual(['more-formal', 'shorter']);
    });

    it('should throw for unknown sampleId', async () => {
      await expect(rateSample('non-existent-id', 3)).rejects.toThrow(
        'Sample non-existent-id not found'
      );
    });
  });

  describe('getSamples', () => {
    it('should return only samples for the given userId', async () => {
      await generateSample('user-1', 'Context A');
      await generateSample('user-1', 'Context B');
      await generateSample('user-2', 'Context C');

      const user1Samples = await getSamples('user-1');
      const user2Samples = await getSamples('user-2');

      expect(user1Samples).toHaveLength(2);
      expect(user2Samples).toHaveLength(1);
      expect(user1Samples.every((s) => s.userId === 'user-1')).toBe(true);
    });

    it('should return empty array for userId with no samples', async () => {
      const samples = await getSamples('user-no-samples');

      expect(samples).toEqual([]);
    });
  });

  describe('applyTraining', () => {
    it('should return tone profile with averageRating, formality, and topAdjustments', async () => {
      const sample = await generateSample('user-1', 'Email');
      await rateSample(sample.id, 4, ['more-formal']);

      const result = await applyTraining('user-1');

      expect(result.toneProfile).toBeDefined();
      expect(result.toneProfile.averageRating).toBeDefined();
      expect(result.toneProfile.formality).toBeDefined();
      expect(result.toneProfile.topAdjustments).toBeDefined();
    });

    it('should call AI generateJSON to produce enhanced profile and merge with fallback', async () => {
      const sample = await generateSample('user-1', 'Email');
      await rateSample(sample.id, 5, ['concise']);

      const result = await applyTraining('user-1');

      expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
      // AI profile fields should be merged in
      expect(result.toneProfile.warmth).toBe('warm');
      expect(result.toneProfile.directness).toBe('direct');
    });

    it('should fall back to computed profile when AI fails', async () => {
      mockGenerateJSON.mockRejectedValueOnce(new Error('AI unavailable'));

      const sample = await generateSample('user-1', 'Email');
      await rateSample(sample.id, 2);

      const result = await applyTraining('user-1');

      expect(result.toneProfile.averageRating).toBe(2);
      expect(result.toneProfile.formality).toBe('casual');
      expect(result.toneProfile.samplesRated).toBe(1);
    });
  });
});
