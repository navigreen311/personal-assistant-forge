/**
 * P-28 (T-013 / T-025) — the vocabulary of an observed event.
 *
 * Kept in its own module with no imports so that every other file in this
 * directory — including the ones that must run on the edge runtime — can depend
 * on it without dragging in Node built-ins.
 */

/**
 * What kind of thing happened. This is a closed set on purpose.
 *
 * A free-form string would let each call site invent its own label, and the
 * counters keyed by it would then be uncountable — which is the failure mode of
 * a metric nobody looks at. Each member below corresponds to a failure this
 * codebase has actually produced, and is listed with the incident that motivates
 * it in `docs/observability.md`.
 */
export type EventKind =
  /** A server error Next.js caught at the request boundary (route, RSC, middleware). */
  | 'request_error'
  /** A Prisma query threw. Counted whether or not the caller swallowed it. */
  | 'prisma_query_error'
  /** Code read a property off the Prisma client that is not a model delegate. */
  | 'phantom_delegate'
  /** A BullMQ job exhausted its attempts and failed. */
  | 'job_failed'
  /** A BullMQ job was found stalled — a worker took it and stopped reporting. */
  | 'job_stalled'
  /** A worker's Redis connection or event stream errored. */
  | 'worker_error'
  /** A worker process is going down on a signal or an unhandled throw. */
  | 'worker_shutdown'
  /** The reporter's own outbound transport failed. Self-observation; see report.ts. */
  | 'transport_error'
  /** Explicitly reported by application code. */
  | 'manual';

export type Severity = 'warning' | 'error' | 'fatal';

/** Context values are scalars only — see `scrubValue` in recorder.ts for why. */
export type ContextValue = string | number | boolean | null;

export interface ReportInput {
  kind: EventKind;
  severity?: Severity;
  message: string;
  /**
   * The grouping key. Two events with the same fingerprint are the same
   * problem and are counted together rather than filling the ring buffer.
   *
   * Must be LOW CARDINALITY: `prisma:attentionEvent.findMany`, not
   * `prisma:attentionEvent.findMany:user_abc123`. A fingerprint containing an
   * id produces one counter per request, which is a memory leak wearing a
   * metric's clothes. `recorder.ts` caps the number of distinct fingerprints
   * for exactly this reason.
   */
  fingerprint: string;
  context?: Record<string, ContextValue | undefined>;
  /** Retained only for the ring buffer, never sent to a counter. */
  stack?: string;
}

/** A report after scrubbing and stamping, as stored and as serialised. */
export interface ObservedEvent {
  id: string;
  at: string;
  kind: EventKind;
  severity: Severity;
  message: string;
  fingerprint: string;
  context: Record<string, ContextValue>;
  stack?: string;
}

/** One row of the counter table: a problem, and how often and how recently. */
export interface CounterEntry {
  fingerprint: string;
  kind: EventKind;
  severity: Severity;
  count: number;
  firstSeen: string;
  lastSeen: string;
  /** The most recent message for this fingerprint, scrubbed and truncated. */
  lastMessage: string;
}

export interface RateWindow {
  /** Events in the last minute, per kind. */
  lastMinute: Record<string, number>;
  /** Events in the last 15 minutes, per kind. */
  last15Minutes: Record<string, number>;
  /** Events in the last 60 minutes, per kind. */
  lastHour: Record<string, number>;
}

export interface RecorderSnapshot {
  /** Wall-clock start of this process, so an operator can tell a restart from a fix. */
  processStartedAt: string;
  /** Total events recorded since process start, per kind. Never resets. */
  totals: Record<string, number>;
  /** Exact counts over rolling windows. Independent of the ring buffer's size. */
  rates: RateWindow;
  /** Distinct problems, most frequent first. */
  counters: CounterEntry[];
  /** Distinct fingerprints dropped because the counter table hit its cap. */
  fingerprintOverflow: number;
  /** The most recent events, newest first. Bounded; older ones are gone. */
  recent: ObservedEvent[];
  /** How many events the ring buffer has evicted since process start. */
  evicted: number;
}
