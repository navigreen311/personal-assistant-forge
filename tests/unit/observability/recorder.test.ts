/**
 * P-28 — the local sink: bounded, scrubbing, and incapable of throwing.
 *
 * The last of those is the one that matters most and is the least obvious to
 * test. `recorder.record` runs inside `catch` blocks and inside the Prisma
 * error path; if it can throw, it replaces the error being reported with its
 * own, and this package becomes the eleventh instance of the bug it was written
 * to end. The `does not throw on...` cases below feed it every hostile input a
 * caller could produce.
 */

import { recorder, RECORDER_LIMITS, scrubMessage } from '@/lib/observability/recorder';
import type { ReportInput } from '@/lib/observability/types';

const base: ReportInput = { kind: 'manual', message: 'x', fingerprint: 'test:base' };

beforeEach(() => {
  recorder.reset();
});

afterAll(() => {
  recorder.reset();
});

describe('scrubMessage', () => {
  it('removes emails, uuids, long tokens and long digit runs', () => {
    expect(scrubMessage('failed for alice@example.com')).toBe('failed for <email>');
    expect(scrubMessage('entity 3f2504e0-4f89-11d3-9a0c-0305e82c3301 missing')).toBe(
      'entity <uuid> missing'
    );
    expect(scrubMessage('card 4111111111111111 declined')).toBe('card <digits> declined');
    // Deliberately NOT shaped like any real vendor's key prefix. The first
    // draft used a plausible `sk_live_...` string and GitHub's push protection
    // rejected the push for containing a Stripe API key — correctly, in the
    // sense that a scanner cannot tell a fabricated credential from a real one,
    // and a repository that trains its people to click "allow this secret" has
    // disabled the control. An opaque run of characters exercises the rule
    // exactly as well.
    expect(scrubMessage('bearer QWxhZGRpbjpvcGVuIHNlc2FtZQQWxhZGRpb')).toContain('<token>');
  });

  it('keeps the shape of a message, which is the diagnosable part', () => {
    const scrubbed = scrubMessage(
      'Invalid `prisma.user.findMany()` invocation: user bob@corp.io not found'
    );
    expect(scrubbed).toContain('prisma.user.findMany()');
    expect(scrubbed).not.toContain('bob@corp.io');
  });

  it('truncates rather than storing an unbounded message', () => {
    const scrubbed = scrubMessage('word '.repeat(2000));
    expect(scrubbed.length).toBeLessThan(300);
    expect(scrubbed.endsWith('...')).toBe(true);
  });

  it('collapses a long unbroken run to a token, which also bounds it', () => {
    // A 5,000-character identifier is either a secret or a serialised blob;
    // either way the token rule fires before the length rule ever needs to.
    expect(scrubMessage('a'.repeat(5000))).toBe('<token>');
  });
});

describe('recorder.record', () => {
  it('stores the event and returns what was stored, not what was passed', () => {
    const event = recorder.record({ ...base, message: 'call bob@corp.io' });
    expect(event.message).toBe('call <email>');
    expect(event.severity).toBe('error');
    expect(event.kind).toBe('manual');
    expect(recorder.recentEvents()).toHaveLength(1);
  });

  it('scrubs context strings the same way it scrubs messages', () => {
    const event = recorder.record({
      ...base,
      context: { path: '/api/tasks/3f2504e0-4f89-11d3-9a0c-0305e82c3301', count: 3, ok: true },
    });
    expect(event.context.path).toBe('/api/tasks/<uuid>');
    expect(event.context.count).toBe(3);
    expect(event.context.ok).toBe(true);
  });

  it('drops undefined context keys instead of storing them as null', () => {
    const event = recorder.record({ ...base, context: { a: 'x', b: undefined } });
    expect(Object.keys(event.context)).toEqual(['a']);
  });

  it('groups repeats by fingerprint rather than filling the buffer with one problem', () => {
    for (let i = 0; i < 50; i += 1) {
      recorder.record({ ...base, fingerprint: 'prisma:attentionEvent.findMany:P2021' });
    }
    const snapshot = recorder.snapshot();
    expect(snapshot.counters).toHaveLength(1);
    expect(snapshot.counters[0].count).toBe(50);
    expect(snapshot.counters[0].fingerprint).toBe('prisma:attentionEvent.findMany:P2021');
  });

  it('escalates a fingerprint severity but never lowers it', () => {
    recorder.record({ ...base, fingerprint: 'f', severity: 'fatal' });
    recorder.record({ ...base, fingerprint: 'f', severity: 'warning' });
    expect(recorder.snapshot().counters[0].severity).toBe('fatal');
  });

  it('sorts counters by frequency, so the loudest problem reads first', () => {
    recorder.record({ ...base, fingerprint: 'rare' });
    for (let i = 0; i < 5; i += 1) recorder.record({ ...base, fingerprint: 'common' });
    expect(recorder.snapshot().counters.map((c) => c.fingerprint)).toEqual(['common', 'rare']);
  });
});

describe('recorder bounds', () => {
  it('caps the ring buffer and reports how many it evicted', () => {
    const over = RECORDER_LIMITS.ringCapacity + 25;
    for (let i = 0; i < over; i += 1) {
      recorder.record({ ...base, fingerprint: `f${i}`, message: `m${i}` });
    }
    const snapshot = recorder.snapshot();
    expect(snapshot.recent).toHaveLength(RECORDER_LIMITS.ringCapacity);
    expect(snapshot.evicted).toBe(25);
    // Newest first, and the newest survived the eviction.
    expect(snapshot.recent[0].message).toBe(`m${over - 1}`);
  });

  it('caps the counter table and says so rather than growing without limit', () => {
    const over = RECORDER_LIMITS.maxFingerprints + 40;
    for (let i = 0; i < over; i += 1) {
      recorder.record({ ...base, fingerprint: `unique:${i}` });
    }
    const snapshot = recorder.snapshot();
    expect(snapshot.counters).toHaveLength(RECORDER_LIMITS.maxFingerprints);
    expect(snapshot.fingerprintOverflow).toBe(40);
  });

  it('truncates fingerprints and context keys', () => {
    const event = recorder.record({
      ...base,
      fingerprint: 'f'.repeat(400),
      context: { ['k'.repeat(200)]: 'v' },
    });
    expect(event.fingerprint.length).toBe(200);
    expect(Object.keys(event.context)[0].length).toBe(60);
  });
});

describe('recorder rates', () => {
  it('counts over a window independently of the ring buffer size', () => {
    // Deliberately more events than the ring holds. This is the realistic case
    // — a route failing on every request overruns 200 entries in seconds — and
    // it is why rates are bucketed rather than derived from stored events.
    const over = RECORDER_LIMITS.ringCapacity * 3;
    for (let i = 0; i < over; i += 1) {
      recorder.record({ ...base, kind: 'prisma_query_error', fingerprint: 'p' });
    }
    expect(recorder.countOver('prisma_query_error', 15)).toBe(over);
    expect(recorder.snapshot().recent.length).toBe(RECORDER_LIMITS.ringCapacity);
    expect(recorder.snapshot().rates.last15Minutes.prisma_query_error).toBe(over);
  });

  it('reports zero for a kind that has never occurred', () => {
    expect(recorder.countOver('job_failed', 15)).toBe(0);
    expect(recorder.snapshot().rates.lastHour.job_failed).toBeUndefined();
  });

  it('keeps a monotonic total separate from the windowed rate', () => {
    recorder.record({ ...base, kind: 'job_failed', fingerprint: 'j' });
    recorder.record({ ...base, kind: 'job_failed', fingerprint: 'j' });
    expect(recorder.snapshot().totals.job_failed).toBe(2);
  });
});

describe('recorder.record cannot throw', () => {
  // If any of these throws, an error somewhere in the platform becomes a
  // DIFFERENT error raised from inside the reporter — strictly worse than the
  // swallowed catch this package exists to replace.
  const hostile: { name: string; input: ReportInput }[] = [
    { name: 'an empty fingerprint', input: { ...base, fingerprint: '' } },
    {
      name: 'a message that is not a string',
      input: { ...base, message: undefined as unknown as string },
    },
    {
      name: 'a context that is not an object',
      input: { ...base, context: null as unknown as Record<string, string> },
    },
    { name: 'NaN and Infinity in context', input: { ...base, context: { a: NaN, b: Infinity } } },
    { name: 'a giant stack', input: { ...base, stack: 'x'.repeat(200_000) } },
    {
      name: 'a self-referential context value',
      input: (() => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        return { ...base, context: circular as Record<string, string> };
      })(),
    },
  ];

  for (const { name, input } of hostile) {
    it(`does not throw on ${name}`, () => {
      expect(() => recorder.record(input)).not.toThrow();
    });
  }

  it('always produces a usable fingerprint even when given none', () => {
    const event = recorder.record({ ...base, fingerprint: '' });
    expect(event.fingerprint).toBe('manual:unknown');
  });

  it('bounds the stack it stores', () => {
    const event = recorder.record({ ...base, stack: 'x'.repeat(200_000) });
    expect(event.stack?.length).toBe(2000);
  });
});
