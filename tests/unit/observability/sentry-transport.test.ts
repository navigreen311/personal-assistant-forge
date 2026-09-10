/**
 * P-28 — the optional outbound leg.
 *
 * Two properties are being pinned here, and they are the two the card asked
 * for by name:
 *
 *   1. NO DSN CONFIGURED => NO NETWORK CALL AT ALL, and the application behaves
 *      exactly as it did before. Not "a call that fails quietly" — no call.
 *   2. THE TRANSPORT CANNOT FAIL SILENTLY. Every failure increments a counter
 *      and sets `lastError`, so an empty Sentry project can be distinguished
 *      from a healthy platform. That distinction is the entire difference
 *      between this and `catch {}`.
 */

import {
  parseDsn,
  sentryTransport,
  buildEnvelope,
} from '@/lib/observability/sentry-transport';
import type { ObservedEvent } from '@/lib/observability/types';

const event: ObservedEvent = {
  id: 'e1',
  at: '2026-09-10T00:00:00.000Z',
  kind: 'prisma_query_error',
  severity: 'error',
  message: 'table does not exist',
  fingerprint: 'prisma:attentionEvent.findMany:P2021',
  context: { model: 'attentionEvent', operation: 'findMany' },
};

const realFetch = globalThis.fetch;
const originalDsn = process.env.SENTRY_DSN;

afterEach(() => {
  globalThis.fetch = realFetch;
  if (originalDsn === undefined) delete process.env.SENTRY_DSN;
  else process.env.SENTRY_DSN = originalDsn;
  sentryTransport.reset();
});

describe('parseDsn', () => {
  it('parses a standard DSN into an envelope URL', () => {
    const parsed = parseDsn('https://abc123@o42.ingest.sentry.io/7654321');
    expect(parsed).toEqual({
      publicKey: 'abc123',
      projectId: '7654321',
      envelopeUrl: 'https://o42.ingest.sentry.io/api/7654321/envelope/',
    });
  });

  it('accepts the legacy key:secret form and discards the secret', () => {
    const parsed = parseDsn('https://pub:sec@sentry.example.com/9');
    expect(parsed?.publicKey).toBe('pub');
    expect(parsed?.envelopeUrl).toBe('https://sentry.example.com/api/9/envelope/');
    expect(JSON.stringify(parsed)).not.toContain('sec');
  });

  it('supports a self-hosted Sentry behind a path prefix', () => {
    // Sentry's documented shape: the prefix stays in front of `/api/`, so a
    // relay mounted at `/sentry` is reached at `/sentry/api/<project>/envelope/`.
    expect(parseDsn('https://k@host.internal/sentry/12')?.envelopeUrl).toBe(
      'https://host.internal/sentry/api/12/envelope/'
    );
  });

  it('returns null for the .env.example placeholder rather than half-configuring', () => {
    expect(parseDsn('YOUR_SENTRY_DSN_HERE')).toBeNull();
  });

  it('returns null, and does not throw, for anything unparseable', () => {
    // A typo in an environment variable must never be a reason the application
    // fails to boot.
    for (const bad of ['', '   ', 'not a url', 'https://o1.sentry.io/7', 'ftp://k@h/1', 'https://k@h/abc']) {
      expect(() => parseDsn(bad)).not.toThrow();
      expect(parseDsn(bad)).toBeNull();
    }
    expect(parseDsn(undefined)).toBeNull();
  });
});

describe('buildEnvelope', () => {
  const dsn = parseDsn('https://k@o1.ingest.sentry.io/5')!;

  it('emits three newline-delimited JSON documents', () => {
    const lines = buildEnvelope(event, dsn).trim().split('\n');
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
  });

  it('sets the fingerprint so Sentry groups the way the local counters do', () => {
    const payload = JSON.parse(buildEnvelope(event, dsn).trim().split('\n')[2]);
    expect(payload.fingerprint).toEqual(['prisma:attentionEvent.findMany:P2021']);
    expect(payload.level).toBe('error');
    expect(payload.message.formatted).toBe('table does not exist');
    expect(payload.extra.model).toBe('attentionEvent');
  });

  it('declares the payload length the item header claims', () => {
    const lines = buildEnvelope(event, dsn).trim().split('\n');
    expect(JSON.parse(lines[1]).length).toBe(lines[2].length);
  });
});

describe('with NO DSN configured', () => {
  it('makes no network call whatsoever', () => {
    delete process.env.SENTRY_DSN;
    sentryTransport.reset();
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    sentryTransport.send(event, () => {
      throw new Error('failure callback must not run when there is no DSN');
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sentryTransport.state()).toMatchObject({ configured: false, sent: 0, failed: 0 });
  });
});

describe('with a DSN configured', () => {
  beforeEach(() => {
    process.env.SENTRY_DSN = 'https://key@o1.ingest.sentry.io/5';
    sentryTransport.reset();
  });

  it('POSTs an envelope to the ingest endpoint with the auth header', async () => {
    const fetchSpy = jest.fn().mockResolvedValue(new Response('', { status: 200 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    sentryTransport.send(event, () => undefined);
    await flush();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://o1.ingest.sentry.io/api/5/envelope/');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Sentry-Auth']).toContain('sentry_key=key');
    expect(init.headers['Content-Type']).toBe('application/x-sentry-envelope');
    expect(init.signal).toBeDefined();
    expect(sentryTransport.state().sent).toBe(1);
  });

  it('records a rejected POST instead of swallowing it', async () => {
    // THE point of this file. Under `catch {}` an operator sees an empty
    // Sentry project and concludes the platform is healthy.
    globalThis.fetch = jest
      .fn()
      .mockRejectedValue(new Error('getaddrinfo ENOTFOUND o1.ingest.sentry.io')) as unknown as typeof fetch;

    const failures: string[] = [];
    sentryTransport.send(event, (reason) => failures.push(reason));
    await flush();

    expect(failures).toEqual(['getaddrinfo ENOTFOUND o1.ingest.sentry.io']);
    const state = sentryTransport.state();
    expect(state.failed).toBe(1);
    expect(state.sent).toBe(0);
    expect(state.lastError).toBe('getaddrinfo ENOTFOUND o1.ingest.sentry.io');
    expect(state.lastErrorAt).not.toBeNull();
  });

  it('treats a non-2xx response as a failure, not a success', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(new Response('rate limited', { status: 429 })) as unknown as typeof fetch;

    const failures: string[] = [];
    sentryTransport.send(event, (reason) => failures.push(reason));
    await flush();

    expect(failures[0]).toContain('429');
    expect(sentryTransport.state().failed).toBe(1);
  });

  it('handles fetch throwing synchronously without wedging in-flight', async () => {
    globalThis.fetch = (() => {
      throw new Error('fetch is not defined');
    }) as unknown as typeof fetch;

    sentryTransport.send(event, () => undefined);
    await flush();

    const state = sentryTransport.state();
    expect(state.failed).toBe(1);
    // If in-flight were not decremented, the transport would refuse to send
    // ever again after MAX_IN_FLIGHT such errors — a silent permanent outage
    // of the reporting layer.
    expect(state.inFlight).toBe(0);
  });

  it('opens a breaker after repeated failures instead of hanging a socket per error', async () => {
    const fetchSpy = jest.fn().mockRejectedValue(new Error('down'));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    for (let i = 0; i < 5; i += 1) {
      sentryTransport.send(event, () => undefined);
      await flush();
    }
    expect(sentryTransport.state().breakerOpen).toBe(true);

    const callsBefore = fetchSpy.mock.calls.length;
    for (let i = 0; i < 10; i += 1) sentryTransport.send(event, () => undefined);
    await flush();

    expect(fetchSpy.mock.calls.length).toBe(callsBefore);
    // Dropped, and COUNTED as dropped. A breaker that hid its own suppression
    // would be the swallowed catch again, one level up.
    expect(sentryTransport.state().dropped).toBe(10);
  });

  it('never transmits its own transport_error events', () => {
    const fetchSpy = jest.fn().mockResolvedValue(new Response('', { status: 200 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    sentryTransport.send({ ...event, kind: 'transport_error' }, () => undefined);

    // Otherwise a dead ingest host produces one failure report per failure
    // report, forever, each one a network call.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never returns the DSN in its state', () => {
    expect(JSON.stringify(sentryTransport.state())).not.toContain('key@');
    expect(sentryTransport.state().configured).toBe(true);
  });
});

/** Let the fire-and-forget promise chain settle. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}
