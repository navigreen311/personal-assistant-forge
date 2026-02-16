import { generateSample, rateSample, applyTraining, getSamples, sampleStore } from '@/modules/onboarding/services/tone-training-service';

jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('AI-generated sample message for tone calibration.'),
  generateJSON: jest.fn().mockResolvedValue({
    formality: 'balanced',
    warmth: 'warm',
    directness: 'diplomatic',
    preferredLength: 'moderate',
    topAdjustments: ['more concise'],
    averageRating: 4,
    samplesRated: 3,
    summary: 'User prefers warm, diplomatic communication.',
  }),
  chat: jest.fn().mockResolvedValue('AI response'),
}));

beforeEach(() => {
  sampleStore.clear();
  jest.clearAllMocks();
});

describe('generateSample (AI-powered)', () => {
  const { generateText } = jest.requireMock('@/lib/ai');

  it('should call generateText with context and calibration data', async () => {
    const sample = await generateSample('user-1', 'Client follow-up email');
    expect(generateText).toHaveBeenCalled();
    const callArgs = (generateText as jest.Mock).mock.calls[0][0];
    expect(callArgs).toContain('Client follow-up email');
  });

  it('should produce a message matching approximate style', async () => {
    const sample = await generateSample('user-1', 'Team update');
    expect(sample.sampleText).toBe('AI-generated sample message for tone calibration.');
    expect(sample.context).toBe('Team update');
  });

  it('should handle AI failure gracefully', async () => {
    (generateText as jest.Mock).mockRejectedValue(new Error('AI unavailable'));
    const sample = await generateSample('user-1', 'Test context');
    // Should fall back to template
    expect(sample.sampleText).toBeDefined();
    expect(sample.sampleText.length).toBeGreaterThan(0);
    expect(sample.userId).toBe('user-1');
  });

  it('should use default context when not provided', async () => {
    const sample = await generateSample('user-1', '');
    expect(sample.context).toBeDefined();
    expect(sample.context.length).toBeGreaterThan(0);
  });

  it('should store the generated sample', async () => {
    const sample = await generateSample('user-1', 'Test');
    expect(sampleStore.has(sample.id)).toBe(true);
  });
});

describe('applyTraining (AI-powered)', () => {
  const { generateJSON } = jest.requireMock('@/lib/ai');

  it('should call generateJSON with all samples and ratings', async () => {
    const sample1 = await generateSample('user-1', 'Context 1');
    const sample2 = await generateSample('user-1', 'Context 2');
    await rateSample(sample1.id, 4, ['more concise']);
    await rateSample(sample2.id, 3, ['warmer tone']);

    await applyTraining('user-1');
    expect(generateJSON).toHaveBeenCalled();
    const callArgs = (generateJSON as jest.Mock).mock.calls[0][0];
    expect(callArgs).toContain('more concise');
    expect(callArgs).toContain('warmer tone');
  });

  it('should produce structured tone profile', async () => {
    const sample = await generateSample('user-1', 'Test');
    await rateSample(sample.id, 5);

    const result = await applyTraining('user-1');
    expect(result.toneProfile).toBeDefined();
    expect(result.toneProfile.formality).toBeDefined();
  });

  it('should handle AI failure gracefully', async () => {
    (generateJSON as jest.Mock).mockRejectedValue(new Error('AI failed'));

    const sample = await generateSample('user-1', 'Test');
    await rateSample(sample.id, 4);

    const result = await applyTraining('user-1');
    // Should fall back to rule-based profile
    expect(result.toneProfile).toBeDefined();
    expect(result.toneProfile.averageRating).toBe(4);
    expect(result.toneProfile.formality).toBe('formal');
  });

  it('should handle no rated samples', async () => {
    await generateSample('user-1', 'Test');

    const result = await applyTraining('user-1');
    expect(result.toneProfile).toBeDefined();
  });
});
