// ============================================================================
// Tests — VAFSpeakerID client
// Mocks global fetch and asserts URL/method/body for every public method.
// ============================================================================

import {
  VAFSpeakerID,
  type VoiceprintEnrollment,
  type VoiceprintVerification,
} from '@/lib/vaf/speaker-id-client';

// ---------------------------------------------------------------------------
// fetch helpers
// ---------------------------------------------------------------------------

interface MockFetchCall {
  url: string;
  init: RequestInit | undefined;
}

function installMockFetch(responder: (url: string, init?: RequestInit) => Response): {
  calls: MockFetchCall[];
  restore: () => void;
} {
  const calls: MockFetchCall[] = [];
  const original = globalThis.fetch;

  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    return responder(url, init);
  }) as unknown as typeof fetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VAFSpeakerID', () => {
  const baseUrl = 'http://vaf.test';
  const apiKey = 'test-key';

  describe('enroll', () => {
    it('POSTs three samples to /api/v1/speaker/enroll and returns the parsed body', async () => {
      const enrollment: VoiceprintEnrollment = {
        userId: 'user-1',
        sampleUrls: ['s1', 's2', 's3'],
        qualityScores: [0.9, 0.85, 0.92],
        enrolled: true,
        enrolledAt: '2026-01-01T00:00:00Z',
      };

      const fetchMock = installMockFetch(() => jsonResponse(enrollment));
      const client = new VAFSpeakerID({ apiKey, baseUrl });

      const samples = [Buffer.from('a'), Buffer.from('b'), Buffer.from('c')];
      const result = await client.enroll('user-1', samples);

      expect(result).toEqual(enrollment);
      expect(fetchMock.calls).toHaveLength(1);
      expect(fetchMock.calls[0].url).toBe(`${baseUrl}/api/v1/speaker/enroll`);
      expect(fetchMock.calls[0].init?.method).toBe('POST');

      const headers = fetchMock.calls[0].init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${apiKey}`);

      // Body should be FormData with the three samples
      expect(fetchMock.calls[0].init?.body).toBeInstanceOf(FormData);

      fetchMock.restore();
    });

    it('throws when the VAF response is not ok', async () => {
      const fetchMock = installMockFetch(() => new Response('nope', { status: 500 }));
      const client = new VAFSpeakerID({ apiKey, baseUrl });

      await expect(client.enroll('user-1', [Buffer.from('a')])).rejects.toThrow(
        /VAF enrollment failed: 500/,
      );

      fetchMock.restore();
    });
  });

  describe('verify', () => {
    it('POSTs the audio sample and returns the verification body', async () => {
      const verification: VoiceprintVerification = {
        match: true,
        confidence: 0.92,
        threshold: 0.85,
        latencyMs: 120,
        antiSpoofResult: { isLiveVoice: true, isNotSynthesized: true, confidence: 0.97 },
      };

      const fetchMock = installMockFetch(() => jsonResponse(verification));
      const client = new VAFSpeakerID({ apiKey, baseUrl });

      const result = await client.verify('user-1', Buffer.from('audio'));

      expect(result).toEqual(verification);
      expect(fetchMock.calls[0].url).toBe(`${baseUrl}/api/v1/speaker/verify`);
      expect(fetchMock.calls[0].init?.method).toBe('POST');
      expect(fetchMock.calls[0].init?.body).toBeInstanceOf(FormData);

      fetchMock.restore();
    });

    it('propagates errors when VAF returns 4xx/5xx', async () => {
      const fetchMock = installMockFetch(() => new Response('unauthorized', { status: 401 }));
      const client = new VAFSpeakerID({ apiKey, baseUrl });

      await expect(client.verify('user-1', Buffer.from('audio'))).rejects.toThrow(
        /VAF verification failed: 401/,
      );

      fetchMock.restore();
    });
  });

  describe('createContinuousSession', () => {
    it('POSTs JSON to /api/v1/speaker/continuous/create with correct payload', async () => {
      const session = {
        sessionId: 'sess-1',
        websocketUrl: 'ws://vaf.test/cont/sess-1',
      };

      const fetchMock = installMockFetch(() => jsonResponse(session));
      const client = new VAFSpeakerID({ apiKey, baseUrl });

      const result = await client.createContinuousSession('user-1');

      expect(result).toEqual(session);
      expect(fetchMock.calls[0].url).toBe(`${baseUrl}/api/v1/speaker/continuous/create`);
      const headers = fetchMock.calls[0].init?.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers.Authorization).toBe(`Bearer ${apiKey}`);

      const body = JSON.parse(fetchMock.calls[0].init?.body as string);
      expect(body).toEqual({
        userId: 'user-1',
        threshold: 0.85,
        checkIntervalSeconds: 30,
        enableAntiSpoof: true,
      });

      fetchMock.restore();
    });
  });

  describe('deleteVoiceprint', () => {
    it('issues DELETE to /api/v1/speaker/:userId', async () => {
      const fetchMock = installMockFetch(() => new Response(null, { status: 204 }));
      const client = new VAFSpeakerID({ apiKey, baseUrl });

      await client.deleteVoiceprint('user 1!');

      expect(fetchMock.calls[0].url).toBe(`${baseUrl}/api/v1/speaker/user%201!`);
      expect(fetchMock.calls[0].init?.method).toBe('DELETE');

      fetchMock.restore();
    });

    it('throws if VAF rejects the delete', async () => {
      const fetchMock = installMockFetch(() => new Response('boom', { status: 500 }));
      const client = new VAFSpeakerID({ apiKey, baseUrl });

      await expect(client.deleteVoiceprint('user-1')).rejects.toThrow(
        /VAF voiceprint delete failed: 500/,
      );

      fetchMock.restore();
    });
  });
});
