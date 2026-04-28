// ============================================================================
// Tests — writeSentimentToMessage
// Asserts the helper writes the canonical { overall, emotions, riskFlags }
// shape to shadowMessage.sentiment via prisma.shadowMessage.update.
// ============================================================================

const mockShadowMessageUpdate = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    shadowMessage: {
      update: (...args: unknown[]) => mockShadowMessageUpdate(...args),
    },
  },
}));

import { writeSentimentToMessage } from '@/lib/shadow/voice/sentiment-storage';
import type { SentimentResult } from '@/lib/vaf/sentiment-client';

function buildSentiment(overrides: Partial<SentimentResult> = {}): SentimentResult {
  return {
    overall: 'neutral',
    confidence: 0.85,
    emotions: {
      anger: 0.1,
      frustration: 0.1,
      anxiety: 0.05,
      satisfaction: 0.6,
      confusion: 0.05,
      urgency: 0.2,
    },
    riskFlags: [],
    ...overrides,
  };
}

describe('writeSentimentToMessage', () => {
  beforeEach(() => {
    mockShadowMessageUpdate.mockReset();
  });

  it('writes the canonical {overall, emotions, riskFlags} shape', async () => {
    mockShadowMessageUpdate.mockResolvedValue({ id: 'msg-1' });

    const sentiment = buildSentiment({
      overall: 'hostile',
      riskFlags: ['threatening'],
    });

    await writeSentimentToMessage('msg-1', sentiment);

    expect(mockShadowMessageUpdate).toHaveBeenCalledTimes(1);
    const arg = mockShadowMessageUpdate.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'msg-1' });
    expect(arg.data.sentiment).toEqual({
      overall: 'hostile',
      emotions: sentiment.emotions,
      riskFlags: ['threatening'],
    });
  });

  it('does NOT include confidence or suggestedAction in the persisted shape', async () => {
    mockShadowMessageUpdate.mockResolvedValue({ id: 'msg-2' });

    const sentiment = buildSentiment({
      confidence: 0.99,
      suggestedAction: 'transfer_to_human',
    });

    await writeSentimentToMessage('msg-2', sentiment);

    const written = mockShadowMessageUpdate.mock.calls[0][0].data.sentiment;
    expect(written).not.toHaveProperty('confidence');
    expect(written).not.toHaveProperty('suggestedAction');
  });

  it('rejects when prisma.update throws (caller decides how to handle)', async () => {
    mockShadowMessageUpdate.mockRejectedValue(new Error('record not found'));

    await expect(
      writeSentimentToMessage('does-not-exist', buildSentiment()),
    ).rejects.toThrow('record not found');
  });
});
