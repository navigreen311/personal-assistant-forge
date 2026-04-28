import { VAFVision } from '../vision-client';

describe('VAFVision', () => {
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

  it('analyzeDocument posts FormData with the file field to /vision/document', async () => {
    const fetchMock = mockFetchOk({
      type: 'general',
      extractedFields: {},
      tables: [],
      signatures: [],
      summary: '',
      compliance: { issues: [], missingFields: [], expirations: [] },
    });

    const client = new VAFVision();
    const buffer = Buffer.from('fake-pdf-bytes');
    await client.analyzeDocument(buffer, 'application/pdf');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/vision/document');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    const fd = init.body as FormData;
    const file = fd.get('file');
    expect(file).toBeInstanceOf(Blob);
    expect((file as Blob).type).toBe('application/pdf');
  });

  it('analyzeScreen posts FormData with the image field to /vision/screen', async () => {
    const fetchMock = mockFetchOk({
      elements: [],
      currentPage: '/dashboard',
      errors: [],
      suggestions: [],
    });

    const client = new VAFVision();
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header bytes
    await client.analyzeScreen(buffer);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/vision/screen');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    const fd = init.body as FormData;
    const image = fd.get('image');
    expect(image).toBeInstanceOf(Blob);
    expect((image as Blob).type).toBe('image/png');
  });

  it('throws on non-2xx responses', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    } as unknown as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new VAFVision();
    await expect(client.analyzeDocument(Buffer.from('x'), 'image/png')).rejects.toThrow(
      /500/
    );
  });
});
