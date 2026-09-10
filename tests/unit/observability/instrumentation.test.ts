/**
 * P-28 — the Next.js request boundary, and the handler that is NOT installed.
 *
 * The second half is the more important test. Installing an `uncaughtException`
 * listener would make this package silently stop the web process from exiting
 * on an uncaught throw — a process that keeps serving with whatever state that
 * throw left behind. Shipping that in the name of observability would be this
 * package committing the exact class of error it was written to detect, and
 * nothing else in CI would notice.
 */

import { register, onRequestError } from '@/instrumentation';
import { recorder } from '@/lib/observability/recorder';

const request = { path: '/api/tasks/abc-123?x=1', method: 'GET', headers: {} };
const context = {
  routerKind: 'App Router' as const,
  routePath: '/api/tasks/[id]',
  routeType: 'route' as const,
  revalidateReason: undefined,
};

beforeEach(() => {
  recorder.reset();
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  recorder.reset();
  jest.restoreAllMocks();
});

describe('onRequestError', () => {
  it('records an uncaught route error with the route and method', () => {
    onRequestError(new TypeError('cannot read findMany of undefined'), request, context);

    const event = recorder.recentEvents()[0];
    expect(event.kind).toBe('request_error');
    expect(event.context.method).toBe('GET');
    expect(event.context.routePath).toBe('/api/tasks/[id]');
    expect(event.context.routeType).toBe('route');
    expect(event.stack).toContain('TypeError');
  });

  it('fingerprints by route PATTERN, so one broken route is one counter row', () => {
    for (const id of ['abc-123', 'def-456', 'ghi-789']) {
      onRequestError(new Error('boom'), { ...request, path: `/api/tasks/${id}` }, context);
    }
    const counters = recorder.snapshot().counters;
    expect(counters).toHaveLength(1);
    expect(counters[0].fingerprint).toBe('route:GET /api/tasks/[id]:Error');
    expect(counters[0].count).toBe(3);
  });

  it('keeps the resolved path in context, scrubbed, for reproducibility', () => {
    onRequestError(
      new Error('boom'),
      { ...request, path: '/api/tasks/3f2504e0-4f89-11d3-9a0c-0305e82c3301' },
      context
    );
    // Useful enough to keep, so the error can be reproduced; scrubbed, because
    // a resolved path carries ids.
    expect(recorder.recentEvents()[0].context.path).toBe('/api/tasks/<uuid>');
  });

  it('groups unnameable routes under one row rather than one per URL', () => {
    // The first draft fell back to `request.path` here. That looked harmless
    // and is not: a route Next cannot name that fails for every id would mint
    // one counter row per id, fill the 500-fingerprint cap in a minute, and
    // evict every other problem in the process. The resolved path stays in
    // context, where cardinality costs nothing.
    for (const id of ['a1', 'b2', 'c3']) {
      onRequestError(
        new Error('boom'),
        { ...request, path: `/x/${id}` },
        { ...context, routePath: '' }
      );
    }
    const counters = recorder.snapshot().counters;
    expect(counters).toHaveLength(1);
    expect(counters[0].fingerprint).toBe('route:GET unknown:Error');
    expect(recorder.recentEvents()[0].context.path).toBe('/x/c3');
  });

  it('does not throw on a non-Error thrown from a handler', () => {
    for (const thrown of ['string', null, undefined, 42, { code: 'X' }]) {
      expect(() => onRequestError(thrown, request, context)).not.toThrow();
    }
  });

  it('returns synchronously so Next never waits on reporting', () => {
    const result: unknown = onRequestError(new Error('x'), request, context);
    expect(result).toBeUndefined();
  });
});

describe('register', () => {
  const originalRuntime = process.env.NEXT_RUNTIME;

  afterEach(() => {
    if (originalRuntime === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = originalRuntime;
  });

  it('does nothing outside the Node runtime', () => {
    // `register` runs in every runtime including edge, where `process.on` does
    // not exist. Touching it there would make loading the app an error.
    process.env.NEXT_RUNTIME = 'edge';
    const on = jest.spyOn(process, 'on');
    register();
    expect(on).not.toHaveBeenCalled();
  });

  it('installs uncaughtExceptionMonitor and NOT uncaughtException', () => {
    process.env.NEXT_RUNTIME = 'nodejs';
    const globalForRegister = globalThis as unknown as { __pafObsRegistered?: boolean };
    delete globalForRegister.__pafObsRegistered;

    const on = jest.spyOn(process, 'on').mockReturnValue(process);
    register();

    const events = on.mock.calls.map((call) => call[0]);
    expect(events).toContain('uncaughtExceptionMonitor');

    // THE assertion in this file. An `uncaughtException` listener SUPPRESSES
    // Node's default of printing the error and exiting non-zero. A web process
    // that keeps serving after an uncaught throw is strictly worse than one an
    // orchestrator restarts, and installing that suppression as a side effect
    // of adding monitoring is precisely the accident this package must not be.
    expect(events).not.toContain('uncaughtException');

    // Likewise: in Node 20 an unhandled rejection terminates the process by
    // default, and attaching ANY listener silently turns that off. There is no
    // monitor-only variant, so none is attached. Documented as a known gap in
    // src/instrumentation.ts rather than closed by changing crash behaviour.
    expect(events).not.toContain('unhandledRejection');
  });

  it('is idempotent — several server instances do not stack listeners', () => {
    process.env.NEXT_RUNTIME = 'nodejs';
    const globalForRegister = globalThis as unknown as { __pafObsRegistered?: boolean };
    delete globalForRegister.__pafObsRegistered;

    const on = jest.spyOn(process, 'on').mockReturnValue(process);
    register();
    const afterFirst = on.mock.calls.length;
    register();
    register();
    expect(on.mock.calls.length).toBe(afterFirst);
  });
});
