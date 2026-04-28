import { VAFMeetingIntelligence } from '../meeting-intel-client';

describe('VAFMeetingIntelligence', () => {
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

  it('posts to /meeting/process with default extraction flags', async () => {
    const fetchMock = mockFetchOk({
      segments: [],
      summary: 'short summary',
      actionItems: [],
      decisions: [],
      keyTopics: [],
      duration: 0,
      speakerCount: 0,
    });

    const client = new VAFMeetingIntelligence();
    const out = await client.processRecording('https://recording.example/audio.mp3');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.audioUrl).toBe('https://recording.example/audio.mp3');
    expect(body.extractActionItems).toBe(true);
    expect(body.extractDecisions).toBe(true);
    expect(body.generateSummary).toBe(true);
    expect(out.summary).toBe('short summary');
  });

  it('respects explicit option overrides', async () => {
    const fetchMock = mockFetchOk({
      segments: [],
      summary: '',
      actionItems: [],
      decisions: [],
      keyTopics: [],
      duration: 0,
      speakerCount: 0,
    });

    const client = new VAFMeetingIntelligence();
    await client.processRecording('https://recording.example/audio.mp3', {
      extractActionItems: false,
      extractDecisions: false,
      generateSummary: false,
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.extractActionItems).toBe(false);
    expect(body.extractDecisions).toBe(false);
    expect(body.generateSummary).toBe(false);
  });

  it('throws when the service returns a non-2xx response', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({}),
    } as unknown as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new VAFMeetingIntelligence();
    await expect(
      client.processRecording('https://recording.example/audio.mp3')
    ).rejects.toThrow(/502/);
  });
});
