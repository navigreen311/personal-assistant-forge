/**
 * P-28 — the runtime half of the phantom-delegate check, and the query counter.
 *
 * Run against a hand-built stand-in rather than a real client, so it needs no
 * database and runs in the default lane. `tests/db/observability.test.ts` proves
 * the same two mechanisms against a real Postgres and a real generated client.
 *
 * The false-positive cases matter as much as the true-positive one. A phantom
 * delegate report is `fatal`; if `await prisma` or an `expect(prisma)` produced
 * one, the loudest signal this package emits would fire on ordinary code, and
 * an operator would learn to ignore it inside a week. That is the "a metric
 * nobody will look at is worse than none" failure, and it is easier to ship
 * than to notice.
 */

import {
  instrumentDelegateAccess,
  looksLikePhantomDelegate,
  knownDelegateNames,
  observabilityExtension,
  observabilityExtensionArgs,
} from '@/lib/observability/prisma-instrumentation';
import { recorder } from '@/lib/observability/recorder';
import { sentryTransport } from '@/lib/observability/sentry-transport';

beforeEach(() => {
  recorder.reset();
  sentryTransport.reset();
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  recorder.reset();
  jest.restoreAllMocks();
});

describe('looksLikePhantomDelegate', () => {
  it('accepts names shaped like a Prisma model delegate', () => {
    for (const name of ['attentionEvent', 'aiQualityScore', 'healthVital', 'task']) {
      expect(looksLikePhantomDelegate(name)).toBe(true);
    }
  });

  it('rejects the probes that tooling reads off any object', () => {
    // `then` is the one that would actually bite: every `await`, every
    // `Promise.resolve`, every `.then` chain reads it.
    for (const name of [
      'then', 'catch', 'finally', 'toJSON', 'toString', 'valueOf', 'inspect',
      'constructor', 'asymmetricMatch', 'nodeType', 'mock', 'jest', '$$typeof',
      '__esModule', '_internal', 'Prisma', 'a', 'ab',
    ]) {
      expect(looksLikePhantomDelegate(name)).toBe(false);
    }
  });
});

describe('instrumentDelegateAccess', () => {
  interface Stub {
    user: { findMany: () => Promise<string[]> };
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
    $connected: boolean;
  }

  function makeStub(): Stub {
    return {
      user: { findMany: async () => ['a'] },
      $transaction: async (fn) => fn({}),
      $connected: true,
    };
  }

  it('passes real delegates straight through', async () => {
    const proxy = instrumentDelegateAccess(makeStub());
    await expect(proxy.user.findMany()).resolves.toEqual(['a']);
    expect(recorder.recentEvents()).toHaveLength(0);
  });

  it('reports a phantom delegate and still returns undefined', () => {
    const proxy = instrumentDelegateAccess(makeStub()) as unknown as Record<string, unknown>;

    // BEHAVIOUR IS UNCHANGED. The bare client returns undefined here and so
    // does this; the caller's subsequent TypeError is the same TypeError it
    // always was. The report is a side effect and nothing more.
    expect(proxy.attentionEvent).toBeUndefined();

    const events = recorder.recentEvents();
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('phantom_delegate');
    expect(events[0].severity).toBe('fatal');
    expect(events[0].fingerprint).toBe('phantom-delegate:attentionEvent');
    expect(events[0].context.delegate).toBe('attentionEvent');
    expect(events[0].message).toContain('not a model in schema.prisma');
  });

  it('reproduces the /api/attention/insights failure exactly', async () => {
    const proxy = instrumentDelegateAccess(makeStub()) as unknown as {
      attentionEvent?: { findMany: () => Promise<unknown> };
    };

    // This is the shape of the bug, verbatim: a query against a model that is
    // not in the schema, wrapped in the bare catch that turned it into a 200
    // with a constant score of 100.
    let served: number;
    try {
      await proxy.attentionEvent!.findMany();
      served = 0;
    } catch {
      served = 100 - 0 + 0;
    }

    // The route still serves its plausible default — nothing about the
    // application changed...
    expect(served).toBe(100);
    // ...but the reason is now written down where an operator can find it.
    expect(recorder.snapshot().counters[0]).toMatchObject({
      fingerprint: 'phantom-delegate:attentionEvent',
      severity: 'fatal',
      count: 1,
    });
  });

  it('reports each distinct phantom name once, not once per access', () => {
    const proxy = instrumentDelegateAccess(makeStub()) as unknown as Record<string, unknown>;
    for (let i = 0; i < 1000; i += 1) void proxy.attentionEvent;
    expect(recorder.recentEvents()).toHaveLength(1);
  });

  describe('does not fire on ordinary interactions with the client', () => {
    it('when the client is awaited', async () => {
      const proxy = instrumentDelegateAccess(makeStub());
      await Promise.resolve(proxy);
      expect(recorder.recentEvents()).toHaveLength(0);
    });

    it('when jest compares it', () => {
      const proxy = instrumentDelegateAccess(makeStub());
      expect(proxy).toBeDefined();
      expect(proxy).toEqual(expect.objectContaining({ $connected: true }));
      expect(recorder.recentEvents()).toHaveLength(0);
    });

    it('when it is serialised or stringified', () => {
      const proxy = instrumentDelegateAccess(makeStub());
      expect(() => JSON.stringify(proxy)).not.toThrow();
      expect(String(typeof proxy)).toBe('object');
      expect(recorder.recentEvents()).toHaveLength(0);
    });

    it('when a symbol property is read', () => {
      const proxy = instrumentDelegateAccess(makeStub()) as unknown as Record<symbol, unknown>;
      expect(proxy[Symbol.toStringTag]).toBeUndefined();
      expect(proxy[Symbol.iterator]).toBeUndefined();
      expect(recorder.recentEvents()).toHaveLength(0);
    });

    it('when a `$` client method or a falsy-but-present property is read', () => {
      const proxy = instrumentDelegateAccess({ ...makeStub(), $connected: false });
      expect(proxy.$connected).toBe(false);
      expect(recorder.recentEvents()).toHaveLength(0);
    });
  });

  it('binds client methods to the target so a private field cannot break', async () => {
    // A Proxy does NOT forward private-field access: `this.#x` on a proxy
    // throws. Prisma's client is generated code whose internals are not this
    // package's to guarantee, so methods are bound to the real target rather
    // than called with the proxy as `this`.
    class WithPrivate {
      readonly #secret = 'kept';
      reveal(): string {
        return this.#secret;
      }
    }
    const proxy = instrumentDelegateAccess(new WithPrivate());
    expect(() => proxy.reveal()).not.toThrow();
    expect(proxy.reveal()).toBe('kept');
  });

  it('returns a stable identity for a bound method', () => {
    const proxy = instrumentDelegateAccess(makeStub());
    expect(proxy.$transaction).toBe(proxy.$transaction);
  });
});

describe('knownDelegateNames', () => {
  it('is derived from the schema and is non-empty', () => {
    const names = knownDelegateNames();
    expect(names.size).toBeGreaterThan(50);
    expect(names.has('user')).toBe(true);
    expect(names.has('attentionEvent')).toBe(false);
  });
});

describe('observabilityExtension', () => {
  it('is a Prisma query extension covering all operations', () => {
    // Structural, because the behavioural proof needs a real client and lives
    // in tests/db/observability.test.ts. This asserts the extension is wired to
    // `$allOperations` — the key that also covers `$queryRaw`, where `model` is
    // undefined — rather than to a per-model list something could fall off.
    expect(observabilityExtensionArgs.name).toBe('paf-observability');
    expect(typeof observabilityExtensionArgs.query.$allOperations).toBe('function');
    // `defineExtension` hands back an opaque `(client) => client.$extends(args)`
    // callback, so the args object above is the only inspectable form.
    expect(typeof observabilityExtension).toBe('function');
  });

  it('rethrows the original error unchanged — behaviour is not modified', async () => {
    const original = Object.assign(new Error('Table does not exist'), { code: 'P2021' });
    const hook = observabilityExtensionArgs.query.$allOperations;

    await expect(
      hook({
        model: 'AttentionEvent',
        operation: 'findMany',
        args: { where: { userId: 'u1' } },
        query: () => Promise.reject(original),
      })
    ).rejects.toBe(original);

    // Counted at `fatal`, because a missing table cannot be transient: it will
    // fail identically on every request until code or schema changes.
    const counter = recorder.snapshot().counters[0];
    expect(counter.fingerprint).toBe('prisma:AttentionEvent.findMany:P2021');
    expect(counter.severity).toBe('fatal');
  });

  it('passes a successful query through untouched', async () => {
    const hook = observabilityExtensionArgs.query.$allOperations;
    await expect(
      hook({
        model: 'User',
        operation: 'findMany',
        args: {},
        query: (args) => Promise.resolve([args]),
      })
    ).resolves.toEqual([{}]);
    expect(recorder.recentEvents()).toHaveLength(0);
  });

  it('never records query arguments', async () => {
    const hook = observabilityExtensionArgs.query.$allOperations;
    await expect(
      hook({
        model: 'User',
        operation: 'findMany',
        args: { where: { email: 'victim@example.com', ssn: '123456789' } },
        query: () => Promise.reject(new Error('boom')),
      })
    ).rejects.toThrow();

    // Arguments are one tenant's data. Model, operation and error code identify
    // all ten historical bugs and carry nobody's.
    const serialised = JSON.stringify(recorder.snapshot());
    expect(serialised).not.toContain('victim@example.com');
    expect(serialised).not.toContain('123456789');
    expect(recorder.recentEvents()[0].context.model).toBe('User');
  });

  it('covers client-level raw operations, where there is no model', async () => {
    const hook = observabilityExtensionArgs.query.$allOperations;
    await expect(
      hook({ operation: '$queryRaw', args: [], query: () => Promise.reject(new Error('down')) })
    ).rejects.toThrow();
    expect(recorder.snapshot().counters[0].fingerprint).toBe('prisma:$queryRaw');
    expect(recorder.recentEvents()[0].context.model).toBeNull();
  });

  it('grades an expected application condition below a schema fault', async () => {
    const hook = observabilityExtensionArgs.query.$allOperations;
    // A unique-constraint violation is the normal outcome of an upsert race
    // that src/lib/shadow/vaf-config.ts catches deliberately. Counting it as an
    // error would pin any alert threshold permanently above zero.
    await expect(
      hook({
        model: 'User',
        operation: 'create',
        args: {},
        query: () => Promise.reject(Object.assign(new Error('dup'), { code: 'P2002' })),
      })
    ).rejects.toThrow();

    const counter = recorder
      .snapshot()
      .counters.find((c) => c.fingerprint === 'prisma:User.create:P2002');
    expect(counter?.severity).toBe('warning');
  });
});
