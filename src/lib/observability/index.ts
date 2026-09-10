/**
 * P-28 (T-013 error reporting / T-025 metrics) — public surface.
 *
 * Deliberately does NOT re-export `prisma-instrumentation` or `worker-health`.
 * The first imports `@prisma/client` and the second imports `ioredis`; pulling
 * either into this barrel would make `import { report } from '@/lib/observability'`
 * drag a Postgres driver and a Redis client into the edge runtime, where
 * neither can run. P-18 learned that the hard way with its rate limiter. Import
 * those two modules by path, from Node-runtime code only.
 *
 * See docs/observability.md for what an operator gets with and without a DSN.
 */

export { report, reportError, recorder, sentryTransport } from './report';
export { scrubMessage, RECORDER_LIMITS } from './recorder';
export { parseDsn } from './sentry-transport';
export type {
  ContextValue,
  CounterEntry,
  EventKind,
  ObservedEvent,
  RateWindow,
  RecorderSnapshot,
  ReportInput,
  Severity,
} from './types';
export type { ReportErrorOptions } from './report';
export type { TransportState } from './sentry-transport';
