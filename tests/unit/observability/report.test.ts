/**
 * P-28 — `report()`: the contract, and the anti-swallow property.
 *
 * The whole package rests on one claim: there is no state this reporter can
 * reach in which something went wrong and nothing anywhere says so. These cases
 * try to reach that state.
 */

import { report, reportError } from '@/lib/observability/report';
import { recorder } from '@/lib/observability/recorder';
import { sentryTransport } from '@/lib/observability/sentry-transport';

const realFetch = globalThis.fetch;
const originalDsn = process.env.SENTRY_DSN;

beforeEach(() => {
  recorder.reset();
  sentryTransport.reset();
  delete process.env.SENTRY_DSN;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (originalDsn === undefined) delete process.env.SENTRY_DSN;
  else process.env.SENTRY_DSN = originalDsn;
  recorder.reset();
  sentryTransport.reset();
  jest.restoreAllMocks();
});

/** Capture the stderr line without letting it reach the test output. */
function captureStderr(): jest.SpyInstance {
  return jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
}

describe('report', () => {
  it('writes to the recorder AND to stderr — always two places', () => {
    const stderr = captureStderr();
    report({ kind: 'manual', message: 'hello', fingerprint: 'test:hello' });

    expect(recorder.recentEvents()).toHaveLength(1);
    expect(stderr).toHaveBeenCalledTimes(1);
    const line = String(stderr.mock.calls[0][0]);
    expect(() => JSON.parse(line)).not.toThrow();
    expect(JSON.parse(line)).toMatchObject({
      level: 'error',
      msg: 'hello',
      kind: 'manual',
      fingerprint: 'test:hello',
    });
  });

  it('flattens context into the stderr line so a log search can filter on it', () => {
    const stderr = captureStderr();
    report({
      kind: 'prisma_query_error',
      message: 'boom',
      fingerprint: 'f',
      context: { model: 'user', operation: 'findMany' },
    });
    expect(JSON.parse(String(stderr.mock.calls[0][0]))).toMatchObject({
      model: 'user',
      operation: 'findMany',
    });
  });

  it('returns the stored event, not the input', () => {
    captureStderr();
    const event = report({ kind: 'manual', message: 'mail bob@x.io', fingerprint: 'f' });
    expect(event.message).toBe('mail <email>');
    expect(event.id).toBeTruthy();
    expect(event.at).toBeTruthy();
  });

  it('does not throw when stderr itself fails', () => {
    // The one deliberately silent catch in the package. If stderr is broken
    // there is nowhere left to report to, and throwing out of a reporter would
    // turn a logging problem into an application crash.
    jest.spyOn(process.stderr, 'write').mockImplementation(() => {
      throw new Error('EPIPE');
    });
    expect(() => report({ kind: 'manual', message: 'x', fingerprint: 'f' })).not.toThrow();
    // And the recorder still has it: stderr failing loses one sink, not both.
    expect(recorder.recentEvents()).toHaveLength(1);
  });

  it('returns synchronously — it never hands the caller a promise to forget', () => {
    captureStderr();
    const result: unknown = report({ kind: 'manual', message: 'x', fingerprint: 'f' });
    expect(result).not.toHaveProperty('then');
  });
});

describe('report does not become the eleventh swallowed catch', () => {
  it('records a transport failure as an ordinary, inspectable event', async () => {
    captureStderr();
    process.env.SENTRY_DSN = 'https://key@o1.ingest.sentry.io/5';
    sentryTransport.reset();
    globalThis.fetch = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    report({ kind: 'manual', message: 'original problem', fingerprint: 'orig' });
    for (let i = 0; i < 5; i += 1) await Promise.resolve();

    const kinds = recorder.recentEvents().map((e) => e.kind);
    // The original event AND the report that shipping it failed.
    expect(kinds).toContain('manual');
    expect(kinds).toContain('transport_error');

    const transportEvent = recorder.recentEvents().find((e) => e.kind === 'transport_error');
    expect(transportEvent?.message).toContain('ECONNREFUSED');
    expect(transportEvent?.fingerprint).toBe('transport:sentry');
    expect(sentryTransport.state().failed).toBe(1);
  });

  it('does not recurse when the transport keeps failing', async () => {
    captureStderr();
    process.env.SENTRY_DSN = 'https://key@o1.ingest.sentry.io/5';
    sentryTransport.reset();
    const fetchSpy = jest.fn().mockRejectedValue(new Error('down'));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    report({ kind: 'manual', message: 'x', fingerprint: 'orig' });
    for (let i = 0; i < 20; i += 1) await Promise.resolve();

    // One application event, one transport failure report, and the transport
    // refuses to ship the latter — so exactly one POST was attempted.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(recorder.recentEvents()).toHaveLength(2);
  });
});

describe('reportError', () => {
  it('derives a coarse fingerprint from the error type, not from its message', () => {
    captureStderr();
    // A message-derived fingerprint would make one problem into one counter row
    // per interpolated id — a memory leak wearing a metric's clothes.
    reportError(new TypeError('cannot read x of undefined'), { kind: 'request_error' });
    reportError(new TypeError('cannot read y of undefined'), { kind: 'request_error' });
    expect(recorder.snapshot().counters).toHaveLength(1);
    expect(recorder.snapshot().counters[0].fingerprint).toBe('request_error:TypeError');
    expect(recorder.snapshot().counters[0].count).toBe(2);
  });

  it('keeps the stack for the ring buffer but not for the counter', () => {
    captureStderr();
    const event = reportError(new Error('boom'));
    expect(event.stack).toContain('Error: boom');
    expect(recorder.snapshot().counters[0]).not.toHaveProperty('stack');
  });

  it('lifts an error `code` into context, which is how Prisma codes surface', () => {
    captureStderr();
    const err = Object.assign(new Error('nope'), { code: 'P2021' });
    const event = reportError(err);
    expect(event.context.errorCode).toBe('P2021');
    expect(event.context.errorName).toBe('Error');
  });

  it('handles a thrown non-Error without asserting a type onto it', () => {
    captureStderr();
    for (const thrown of ['a string', 42, null, undefined, { message: 'obj' }, Symbol('s')]) {
      expect(() => reportError(thrown)).not.toThrow();
    }
    expect(recorder.recentEvents()).toHaveLength(6);
  });

  it('prefixes the caller message onto the error message', () => {
    captureStderr();
    const event = reportError(new Error('ECONNRESET'), { message: 'failed to write heartbeat' });
    expect(event.message).toBe('failed to write heartbeat: ECONNRESET');
  });
});
