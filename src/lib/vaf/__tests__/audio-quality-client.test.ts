import { VAFAudioQuality } from '../audio-quality-client';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
  delete process.env.VAF_SERVICE_URL;
  delete process.env.VAF_API_KEY;
});

function mockFetchOnce(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  global.fetch = jest.fn(handler as unknown as typeof fetch);
}

describe('VAFAudioQuality', () => {
  it('POSTs multipart form with enhance/denoise/removeEcho flags when set', async () => {
    process.env.VAF_SERVICE_URL = 'http://vaf.test';
    process.env.VAF_API_KEY = 'k';

    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;

    mockFetchOnce(async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(
        JSON.stringify({
          noiseLevel: 0.2,
          echoDetected: false,
          clippingDetected: false,
          signalToNoise: 28.5,
          packetLoss: 0,
          bandwidth: 'wideband',
          recommendation: 'good',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const aq = new VAFAudioQuality();
    const report = await aq.analyze(Buffer.from('audio'), {
      enhance: true,
      denoise: true,
      removeEcho: true,
    });

    expect(capturedUrl).toBe('http://vaf.test/api/v1/audio/quality');
    expect(capturedInit?.method).toBe('POST');
    const fd = capturedInit?.body as FormData;
    expect(fd.get('enhance')).toBe('true');
    expect(fd.get('denoise')).toBe('true');
    expect(fd.get('removeEcho')).toBe('true');
    expect(fd.get('audio')).toBeInstanceOf(Blob);
    expect(report.recommendation).toBe('good');
    expect(report.signalToNoise).toBeCloseTo(28.5);
  });

  it('omits flag fields that are not set', async () => {
    let capturedInit: RequestInit | undefined;
    mockFetchOnce(async (_url, init) => {
      capturedInit = init;
      return new Response(
        JSON.stringify({
          noiseLevel: 0,
          echoDetected: false,
          clippingDetected: false,
          signalToNoise: 30,
          packetLoss: 0,
          bandwidth: 'wideband',
          recommendation: 'good',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const aq = new VAFAudioQuality();
    await aq.analyze(Buffer.from('audio'));

    const fd = capturedInit?.body as FormData;
    expect(fd.get('enhance')).toBeNull();
    expect(fd.get('denoise')).toBeNull();
    expect(fd.get('removeEcho')).toBeNull();
  });

  it('throws on non-ok response', async () => {
    mockFetchOnce(async () => new Response('bad', { status: 502 }));
    const aq = new VAFAudioQuality();
    await expect(aq.analyze(Buffer.from('x'))).rejects.toThrow(/VAF audio quality failed: 502/);
  });
});
