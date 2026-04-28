/**
 * Unit tests: VAF integration config helpers.
 *
 * Mocks `@/lib/db` with an in-memory prisma stub so the helpers can be
 * exercised without a real database. Verifies:
 *   - getVafConfig auto-creates a default row on first read (upsert)
 *   - getVafConfig returns the stored row when it already exists
 *   - updateVafConfig upserts and only writes patchable fields
 *   - updateVafConfig drops malformed input (wrong types, out-of-range)
 */

const mockUpsert = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    vafIntegrationConfig: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
  },
}));

import {
  getVafConfig,
  updateVafConfig,
  DEFAULT_VAF_CONFIG,
} from '@/lib/shadow/vaf-config';

const USER_ID = 'user-abc-123';

const STORED_ROW = {
  id: 'cfg-1',
  userId: USER_ID,
  sttProvider: 'whisper',
  ttsProvider: 'elevenlabs',
  audioEnhancement: false,
  noiseCancellation: true,
  echoSuppression: false,
  voiceprintEnrolled: true,
  voiceprintEnrolledAt: new Date('2026-04-20T00:00:00Z'),
  voiceprintUseForAuth: true,
  sentimentOnVoiceforgeCalls: false,
  sentimentAlertThreshold: 0.7,
  autoProcessMeetings: true,
  autoExtractActionItems: false,
  autoCreateTasks: false,
  documentAnalysisEnabled: false,
  screenVisionFallback: true,
  primaryLanguage: 'es-MX',
  secondaryLanguage: 'en-US',
  autoDetectLanguage: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  mockUpsert.mockReset();
});

describe('getVafConfig', () => {
  it('auto-creates a default row when none exists and returns the new row', async () => {
    // Simulate Prisma's upsert behavior: when the row is missing, the
    // create branch fires and returns a fresh row populated from the
    // create payload (plus DB-side timestamps).
    mockUpsert.mockImplementationOnce(async (args: { create: Record<string, unknown> }) => ({
      id: 'cfg-new',
      ...args.create,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await getVafConfig(USER_ID);

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const call = mockUpsert.mock.calls[0][0];
    expect(call.where).toEqual({ userId: USER_ID });
    // Auto-create branch must seed the full default config.
    expect(call.create).toEqual({ userId: USER_ID, ...DEFAULT_VAF_CONFIG });
    // Empty update — we do not touch existing values on read.
    expect(call.update).toEqual({});

    // Returned shape mirrors the defaults.
    expect(result.userId).toBe(USER_ID);
    expect(result.sttProvider).toBe(DEFAULT_VAF_CONFIG.sttProvider);
    expect(result.ttsProvider).toBe(DEFAULT_VAF_CONFIG.ttsProvider);
    expect(result.audioEnhancement).toBe(DEFAULT_VAF_CONFIG.audioEnhancement);
    expect(result.voiceprintEnrolled).toBe(false);
  });

  it('returns the stored row when one already exists (upsert update branch is a no-op)', async () => {
    mockUpsert.mockResolvedValueOnce(STORED_ROW);

    const result = await getVafConfig(USER_ID);

    expect(result.userId).toBe(USER_ID);
    expect(result.sttProvider).toBe('whisper');
    expect(result.ttsProvider).toBe('elevenlabs');
    expect(result.voiceprintEnrolled).toBe(true);
    expect(result.sentimentAlertThreshold).toBe(0.7);
    expect(result.primaryLanguage).toBe('es-MX');
    expect(result.secondaryLanguage).toBe('en-US');
  });
});

describe('updateVafConfig', () => {
  it('upserts the row using a sanitized patch and returns the post-update config', async () => {
    // First call: write upsert. Second call: read upsert (no-op update).
    mockUpsert
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        ...STORED_ROW,
        sttProvider: 'whisper',
        audioEnhancement: false,
      });

    const patch = { sttProvider: 'whisper', audioEnhancement: false };
    const result = await updateVafConfig(USER_ID, patch);

    expect(mockUpsert).toHaveBeenCalledTimes(2);
    const writeCall = mockUpsert.mock.calls[0][0];
    expect(writeCall.where).toEqual({ userId: USER_ID });
    expect(writeCall.create).toEqual({
      userId: USER_ID,
      sttProvider: 'whisper',
      audioEnhancement: false,
    });
    expect(writeCall.update).toEqual({
      sttProvider: 'whisper',
      audioEnhancement: false,
    });
    expect(result.sttProvider).toBe('whisper');
    expect(result.audioEnhancement).toBe(false);
  });

  it('drops fields with the wrong type (string for boolean, etc.)', async () => {
    mockUpsert
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(STORED_ROW);

    await updateVafConfig(USER_ID, {
      audioEnhancement: 'yes', // wrong type
      noiseCancellation: true, // valid
      sentimentAlertThreshold: 5, // out of range
      autoCreateTasks: false, // valid
    });

    const call = mockUpsert.mock.calls[0][0];
    expect(call.update).toEqual({
      noiseCancellation: true,
      autoCreateTasks: false,
    });
    expect(call.update).not.toHaveProperty('audioEnhancement');
    expect(call.update).not.toHaveProperty('sentimentAlertThreshold');
  });

  it('ignores fields that are not on the patchable allowlist', async () => {
    mockUpsert
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(STORED_ROW);

    await updateVafConfig(USER_ID, {
      voiceprintEnrolled: true, // not patchable — server-side only
      voiceprintEnrolledAt: new Date(), // not patchable
      ttsProvider: 'google', // patchable
    });

    const call = mockUpsert.mock.calls[0][0];
    expect(call.update).toEqual({ ttsProvider: 'google' });
    expect(call.update).not.toHaveProperty('voiceprintEnrolled');
    expect(call.update).not.toHaveProperty('voiceprintEnrolledAt');
  });

  it('accepts null / empty string for nullable secondaryLanguage', async () => {
    mockUpsert
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ ...STORED_ROW, secondaryLanguage: null });

    await updateVafConfig(USER_ID, { secondaryLanguage: null });

    const call = mockUpsert.mock.calls[0][0];
    expect(call.update).toEqual({ secondaryLanguage: null });
  });

  it('returns gracefully on a non-object patch', async () => {
    mockUpsert
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(STORED_ROW);

    await updateVafConfig(USER_ID, 'not an object');

    const call = mockUpsert.mock.calls[0][0];
    expect(call.update).toEqual({});
  });
});
