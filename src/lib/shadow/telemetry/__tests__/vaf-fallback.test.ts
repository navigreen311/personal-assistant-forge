/**
 * Unit tests: vaf-fallback telemetry helpers.
 *
 * Covers:
 *   - recordVafFallback writes a `[vaf-fallback]`-prefixed structured warn
 *   - getVafFallbackRate aggregates STT + TTS groupBy results
 *   - getVafFallbackRate filters by userId via the session relation
 *   - empty result set returns rate=0 (no divide-by-zero)
 */

const mockGroupBy = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    shadowMessage: {
      groupBy: (...args: unknown[]) => mockGroupBy(...args),
    },
  },
}));

import {
  recordVafFallback,
  getVafFallbackRate,
} from '@/lib/shadow/telemetry/vaf-fallback';

describe('recordVafFallback', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('emits a structured [vaf-fallback] warn with the userId, feature, and reason', async () => {
    await recordVafFallback({
      userId: 'user-1',
      feature: 'stt',
      reason: 'vaf timeout',
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [prefix, payload] = warnSpy.mock.calls[0];
    expect(prefix).toBe('[vaf-fallback]');
    const parsed = JSON.parse(payload);
    expect(parsed.userId).toBe('user-1');
    expect(parsed.feature).toBe('stt');
    expect(parsed.reason).toBe('vaf timeout');
    expect(typeof parsed.timestamp).toBe('string');
  });
});

describe('getVafFallbackRate', () => {
  beforeEach(() => {
    mockGroupBy.mockReset();
  });

  it('aggregates STT + TTS provider counts and computes the rate', async () => {
    // First call → STT, second call → TTS.
    mockGroupBy
      .mockResolvedValueOnce([
        { sttProvider: 'vaf', _count: { _all: 80 } },
        { sttProvider: 'whisper', _count: { _all: 20 } },
      ])
      .mockResolvedValueOnce([
        { ttsProvider: 'vaf', _count: { _all: 50 } },
        { ttsProvider: 'browser', _count: { _all: 10 } },
        { ttsProvider: 'elevenlabs', _count: { _all: 40 } },
      ]);

    const out = await getVafFallbackRate({ windowHours: 24 });

    // 100 + 100 attempts, 20 + 50 fallbacks → 70 / 200 = 0.35.
    expect(out.totalAttempts).toBe(200);
    expect(out.fallbacks).toBe(70);
    expect(out.rate).toBeCloseTo(0.35, 5);

    // First groupBy = stt, second = tts.
    expect(mockGroupBy).toHaveBeenCalledTimes(2);
    expect(mockGroupBy.mock.calls[0][0].by).toEqual(['sttProvider']);
    expect(mockGroupBy.mock.calls[1][0].by).toEqual(['ttsProvider']);
  });

  it('limits to a single feature when feature is set', async () => {
    mockGroupBy.mockResolvedValueOnce([
      { sttProvider: 'vaf', _count: { _all: 8 } },
      { sttProvider: 'whisper', _count: { _all: 2 } },
    ]);

    const out = await getVafFallbackRate({ feature: 'stt' });

    expect(mockGroupBy).toHaveBeenCalledTimes(1);
    expect(mockGroupBy.mock.calls[0][0].by).toEqual(['sttProvider']);
    expect(out.totalAttempts).toBe(10);
    expect(out.fallbacks).toBe(2);
    expect(out.rate).toBeCloseTo(0.2, 5);
  });

  it('filters by userId via the session relation', async () => {
    mockGroupBy.mockResolvedValue([]);

    await getVafFallbackRate({ userId: 'user-9', feature: 'stt' });

    expect(mockGroupBy).toHaveBeenCalledTimes(1);
    const args = mockGroupBy.mock.calls[0][0];
    expect(args.where.session).toEqual({ userId: 'user-9' });
  });

  it('returns rate=0 when there are no attempts in the window (no NaN)', async () => {
    mockGroupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const out = await getVafFallbackRate();
    expect(out.totalAttempts).toBe(0);
    expect(out.fallbacks).toBe(0);
    expect(out.rate).toBe(0);
  });

  it('uses a 24h window by default', async () => {
    mockGroupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const before = Date.now();
    await getVafFallbackRate();
    const after = Date.now();

    const sinceArg = mockGroupBy.mock.calls[0][0].where.createdAt.gte as Date;
    const sinceMs = sinceArg.getTime();
    // sinceMs should be approximately Date.now() - 24h, with a small
    // tolerance for the test execution time.
    expect(sinceMs).toBeLessThanOrEqual(before - 24 * 60 * 60 * 1000 + 5);
    expect(sinceMs).toBeGreaterThanOrEqual(after - 24 * 60 * 60 * 1000 - 5);
  });
});
