/**
 * P-28 — the local sink. This is what an operator gets with NO vendor account.
 *
 * ============================================================================
 * WHY THE LOCAL SINK IS THE PRIMARY ONE, NOT THE FALLBACK
 * ============================================================================
 *
 * `src/lib/monitoring/sentry.ts` was already in this repository before P-28:
 * ~350 lines, fully typed, every function a documented no-op when SENTRY_DSN is
 * absent. It is also imported by exactly zero files — `grep -rn "lib/monitoring"
 * src | grep -v "^src/lib/monitoring/"` returned nothing — and `@sentry/nextjs`
 * is not in package.json, so its `require` throws and it is a no-op even WITH a
 * DSN configured. An error-reporting module that reports nothing under every
 * possible configuration is the same bug as `/api/attention/insights` returning
 * a constant 100: a plausible-looking default that makes a reviewer stop
 * looking.
 *
 * So the design rule for this package is that the path requiring no
 * configuration must be the path that actually works. This recorder is always
 * on, needs no environment variable, opens no socket, and allocates a fixed
 * amount of memory. Sentry is strictly additive on top of it.
 *
 * ============================================================================
 * WHAT IT IS NOT
 * ============================================================================
 *
 * It is process-local and in-memory. It does not survive a restart, and in a
 * multi-replica deployment each replica has its own. `prisma/schema.prisma` is
 * frozen for this package so there is no table to write to, and inventing a
 * durable store the platform has not chosen would be a bigger claim than the
 * evidence supports. What it buys is the thing that was missing: you can ask a
 * running process what has been failing and get a real answer, instead of
 * grepping stdout for a `console.error` that may never have been written.
 *
 * The counters are exact over their windows even when the ring buffer has long
 * since evicted the events behind them — that separation is deliberate, because
 * the interesting case (a route failing on every request) is precisely the case
 * that overruns a 200-entry buffer in seconds.
 *
 * ============================================================================
 * EVERY BOUND IS EXPLICIT
 * ============================================================================
 *
 * Three things here could grow without limit, and each is capped: the ring
 * buffer (RING_CAPACITY), the counter table (MAX_FINGERPRINTS, with an overflow
 * count so the cap is visible rather than silent), and the rate buckets (a
 * fixed 60-slot array per kind, reused forever). An observability layer that
 * OOMs the process it observes is worse than none.
 */

import type {
  ContextValue,
  CounterEntry,
  EventKind,
  ObservedEvent,
  RateWindow,
  RecorderSnapshot,
  ReportInput,
  Severity,
} from './types';

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** Recent events retained for inspection. Override with PAF_OBS_BUFFER. */
const RING_CAPACITY = clampInt(process.env.PAF_OBS_BUFFER, 200, 10, 2000);

/**
 * Distinct fingerprints the counter table will hold.
 *
 * Reached only if a fingerprint carries something high-cardinality despite the
 * contract in types.ts. When it is reached the table stops growing and
 * `fingerprintOverflow` starts counting, so the snapshot says "I am no longer
 * telling you the whole truth" rather than quietly telling a partial one.
 */
const MAX_FINGERPRINTS = 500;

/** Rolling-rate resolution: 60 one-minute buckets. */
const RATE_BUCKETS = 60;

/** Messages are truncated to this before storage. See scrubMessage. */
const MAX_MESSAGE_LENGTH = 240;

/** Stacks are truncated to this. A stack is for a human, not for a parser. */
const MAX_STACK_LENGTH = 2000;

/**
 * Remove the things most likely to be somebody's data from a message.
 *
 * A Prisma error message can quote the offending value; an application message
 * can contain whatever the developer interpolated. The inspection endpoint is
 * role-gated, but "an owner of tenant A can read a message produced by tenant
 * B's request" is still a cross-tenant read, and this platform has spent eleven
 * packages closing those. Emails, UUIDs, long opaque tokens and long digit runs
 * are replaced with a type marker, which preserves the shape of the message —
 * the part that makes it diagnosable — without preserving the value.
 *
 * This is a reduction, not a guarantee, and is documented as such. It is why
 * the inspection endpoint is role-gated as well as scrubbed.
 */
export function scrubMessage(input: string): string {
  const scrubbed = input
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, '<token>')
    .replace(/\b\d{7,}\b/g, '<digits>');
  return scrubbed.length > MAX_MESSAGE_LENGTH
    ? `${scrubbed.slice(0, MAX_MESSAGE_LENGTH)}...`
    : scrubbed;
}

/** Context is scalars only; see types.ts. Strings are scrubbed like messages. */
function scrubValue(value: ContextValue | undefined): ContextValue | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return scrubMessage(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return value;
}

function rank(severity: Severity): number {
  return severity === 'fatal' ? 3 : severity === 'error' ? 2 : 1;
}

interface CounterState {
  kind: EventKind;
  severity: Severity;
  count: number;
  firstSeen: string;
  lastSeen: string;
  lastMessage: string;
}

/** One kind's rolling minute buckets. `stamps[i]` says which minute `counts[i]` is for. */
interface RateState {
  counts: Int32Array;
  stamps: Float64Array;
}

class Recorder {
  readonly processStartedAt = new Date().toISOString();

  private ring: ObservedEvent[] = [];
  private ringNext = 0;
  private evicted = 0;

  private counters = new Map<string, CounterState>();
  private fingerprintOverflow = 0;

  private totals = new Map<EventKind, number>();
  private rates = new Map<EventKind, RateState>();

  private seq = 0;

  /**
   * Record an event. Synchronous, allocation-bounded, and cannot throw.
   *
   * "Cannot throw" is load-bearing. This runs inside `catch` blocks and inside
   * the Prisma error path; if it threw it would replace the error being
   * reported with its own, which is strictly worse than the bug it was
   * reporting. Everything it does is a property read, an arithmetic operation,
   * or a write into a pre-sized structure. There is no I/O here, no JSON
   * serialisation, and no user-supplied callback.
   */
  record(input: ReportInput): ObservedEvent {
    const now = new Date();
    const kind = input.kind;
    const severity: Severity = input.severity ?? 'error';
    const message = scrubMessage(String(input.message ?? ''));
    const fingerprint = String(input.fingerprint || `${kind}:unknown`).slice(0, 200);

    const context: Record<string, ContextValue> = {};
    if (input.context) {
      for (const [key, value] of Object.entries(input.context)) {
        const scrubbed = scrubValue(value);
        if (scrubbed !== undefined) context[key.slice(0, 60)] = scrubbed;
      }
    }

    const event: ObservedEvent = {
      id: `${now.getTime().toString(36)}-${(this.seq++).toString(36)}`,
      at: now.toISOString(),
      kind,
      severity,
      message,
      fingerprint,
      context,
      ...(input.stack ? { stack: input.stack.slice(0, MAX_STACK_LENGTH) } : {}),
    };

    this.pushRing(event);
    this.bumpCounter(event);
    this.totals.set(kind, (this.totals.get(kind) ?? 0) + 1);
    this.bumpRate(kind, now.getTime());

    return event;
  }

  private pushRing(event: ObservedEvent): void {
    if (this.ring.length < RING_CAPACITY) {
      this.ring.push(event);
      this.ringNext = this.ring.length % RING_CAPACITY;
      return;
    }
    this.ring[this.ringNext] = event;
    this.ringNext = (this.ringNext + 1) % RING_CAPACITY;
    this.evicted += 1;
  }

  private bumpCounter(event: ObservedEvent): void {
    const existing = this.counters.get(event.fingerprint);
    if (existing) {
      existing.count += 1;
      existing.lastSeen = event.at;
      existing.lastMessage = event.message;
      // Severity only escalates. A fingerprint that has produced a fatal should
      // not read as a warning because the most recent occurrence was milder.
      if (rank(event.severity) > rank(existing.severity)) existing.severity = event.severity;
      return;
    }
    if (this.counters.size >= MAX_FINGERPRINTS) {
      this.fingerprintOverflow += 1;
      return;
    }
    this.counters.set(event.fingerprint, {
      kind: event.kind,
      severity: event.severity,
      count: 1,
      firstSeen: event.at,
      lastSeen: event.at,
      lastMessage: event.message,
    });
  }

  /**
   * Increment the bucket for the current minute.
   *
   * The array is allocated once per kind and never grows. A bucket whose stamp
   * is not the current minute is stale from an earlier hour and is zeroed on
   * write, rather than swept by a timer: P-20 shipped a `setInterval` that was
   * never `unref`ed and hung the entire db suite, and a background sweeper here
   * would be the same mistake for the same reason.
   */
  private bumpRate(kind: EventKind, nowMs: number): void {
    const minute = Math.floor(nowMs / 60_000);
    const slot = minute % RATE_BUCKETS;
    let state = this.rates.get(kind);
    if (!state) {
      state = { counts: new Int32Array(RATE_BUCKETS), stamps: new Float64Array(RATE_BUCKETS) };
      state.stamps.fill(-1);
      this.rates.set(kind, state);
    }
    if (state.stamps[slot] !== minute) {
      state.stamps[slot] = minute;
      state.counts[slot] = 0;
    }
    state.counts[slot] += 1;
  }

  /** Exact count of `kind` over the last `minutes` minutes. Ring-buffer independent. */
  countOver(kind: EventKind, minutes: number): number {
    const state = this.rates.get(kind);
    if (!state) return 0;
    const currentMinute = Math.floor(Date.now() / 60_000);
    const oldest = currentMinute - Math.min(minutes, RATE_BUCKETS) + 1;
    let total = 0;
    for (let i = 0; i < RATE_BUCKETS; i += 1) {
      const stamp = state.stamps[i];
      if (stamp >= oldest && stamp <= currentMinute) total += state.counts[i];
    }
    return total;
  }

  /** Total events across all kinds over the last `minutes` minutes. */
  totalOver(minutes: number): number {
    let total = 0;
    for (const kind of this.rates.keys()) total += this.countOver(kind, minutes);
    return total;
  }

  private rateWindow(): RateWindow {
    const build = (minutes: number): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const kind of this.rates.keys()) {
        const n = this.countOver(kind, minutes);
        if (n > 0) out[kind] = n;
      }
      return out;
    };
    return { lastMinute: build(1), last15Minutes: build(15), lastHour: build(60) };
  }

  snapshot(): RecorderSnapshot {
    const totals: Record<string, number> = {};
    for (const [kind, count] of this.totals) totals[kind] = count;

    const counters: CounterEntry[] = [...this.counters.entries()]
      .map(([fingerprint, state]) => ({ fingerprint, ...state }))
      .sort((a, b) => b.count - a.count);

    return {
      processStartedAt: this.processStartedAt,
      totals,
      rates: this.rateWindow(),
      counters,
      fingerprintOverflow: this.fingerprintOverflow,
      recent: this.recentEvents(),
      evicted: this.evicted,
    };
  }

  /** Newest first. */
  recentEvents(limit = RING_CAPACITY): ObservedEvent[] {
    const ordered: ObservedEvent[] = [];
    const size = this.ring.length;
    if (size === 0) return ordered;
    for (let i = 0; i < size; i += 1) {
      const index = (this.ringNext - 1 - i + size * 2) % size;
      const event = this.ring[index];
      if (event) ordered.push(event);
      if (ordered.length >= limit) break;
    }
    return ordered;
  }

  /** Test-only. Never called from application code. */
  reset(): void {
    this.ring = [];
    this.ringNext = 0;
    this.evicted = 0;
    this.counters.clear();
    this.fingerprintOverflow = 0;
    this.totals.clear();
    this.rates.clear();
    this.seq = 0;
  }
}

/**
 * One recorder per process.
 *
 * Pinned on `globalThis` for the same reason `src/lib/db/index.ts` pins the
 * Prisma client: Next.js re-evaluates server modules across hot reloads and
 * across the several module graphs it builds, and a module-local singleton
 * would hand you a fresh empty recorder — that is, exactly the "no history"
 * state this package exists to remove.
 */
const globalForRecorder = globalThis as unknown as { __pafRecorder?: Recorder };

export const recorder: Recorder = (globalForRecorder.__pafRecorder ??= new Recorder());

export const RECORDER_LIMITS = {
  ringCapacity: RING_CAPACITY,
  maxFingerprints: MAX_FINGERPRINTS,
  rateBuckets: RATE_BUCKETS,
} as const;

export type { Recorder };
