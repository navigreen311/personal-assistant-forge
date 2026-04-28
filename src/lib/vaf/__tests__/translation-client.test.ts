import { VAFTranslation } from '../translation-client';

describe('VAFTranslation', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function mockFetchOk(payload: unknown) {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    } as unknown as Response);
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  it('posts FormData with source/target language to /translate/speech', async () => {
    const fetchMock = mockFetchOk({
      sourceText: 'Hola mundo',
      translatedText: 'Hello world',
      sourceLanguage: 'es',
      confidence: 0.97,
    });

    const client = new VAFTranslation();
    const buffer = Buffer.from('audio-bytes');
    const out = await client.translateSpeech(buffer, {
      sourceLanguage: 'es',
      targetLanguage: 'en',
      respondInSource: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/translate/speech');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);

    const fd = init.body as FormData;
    expect(fd.get('sourceLanguage')).toBe('es');
    expect(fd.get('targetLanguage')).toBe('en');
    expect(fd.get('respondInSource')).toBe('true');
    expect(fd.get('audio')).toBeInstanceOf(Blob);

    expect(out.sourceLanguage).toBe('es');
    expect(out.translatedText).toBe('Hello world');
  });

  it('omits respondInSource when not provided', async () => {
    const fetchMock = mockFetchOk({
      sourceText: '',
      translatedText: '',
      sourceLanguage: 'fr',
      confidence: 0,
    });

    const client = new VAFTranslation();
    await client.translateSpeech(Buffer.from('a'), {
      sourceLanguage: 'fr',
      targetLanguage: 'en',
    });

    const [, init] = fetchMock.mock.calls[0];
    const fd = init.body as FormData;
    expect(fd.has('respondInSource')).toBe(false);
  });

  it('throws on non-2xx responses', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
    } as unknown as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new VAFTranslation();
    await expect(
      client.translateSpeech(Buffer.from('x'), { sourceLanguage: 'es', targetLanguage: 'en' })
    ).rejects.toThrow(/503/);
  });
});
