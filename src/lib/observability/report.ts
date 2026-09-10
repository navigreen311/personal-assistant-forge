/**
 * P-28 — `report()`. The one entry point. Everything else calls this.
 *
 * ============================================================================
 * THE CONTRACT
 * ============================================================================
 *
 *   report(...)  never throws
 *                never returns a promise
 *                never blocks on I/O
 *                always writes to at least two places
 *
 * The first three exist because this is called from inside `catch` blocks and
 * from inside Prisma's error path. A reporter that can throw turns a handled
 * error into an unhandled one; a reporter that returns a promise creates an
 * unhandled rejection at every call site that forgets to `void` it; a reporter
 * that blocks adds its latency to every failing request, which is the worst
 * possible time to add latency.
 *
 * ============================================================================
 * "ALWAYS TWO PLACES" — AND WHY THAT ANSWERS THE `catch {}` PROBLEM
 * ============================================================================
 *
 * This codebase's defining bug is `catch {}` — 553 bare catches in `src`, and
 * ten confirmed cases where a swallowed throw became a plausible default served
 * to users for months. A reporting layer built out of the same material would
 * be the eleventh instance, not a fix for the first ten.
 *
 * The property that prevents it: the two sinks that always run are
 * SYNCHRONOUS AND CANNOT FAIL PARTWAY.
 *
 *   1. `recorder.record()` — pure in-memory writes into pre-sized structures.
 *      No I/O, no serialisation, no callback. It is not "unlikely to throw";
 *      there is nothing in it that can.
 *   2. a JSON line on stderr — one `write` call, already wrapped.
 *
 * The one genuinely fallible sink, the Sentry POST, is fire-and-forget, and its
 * failure is itself recorded (`transport_error`, plus `failed`/`lastError`
 * counters on the transport). So there is no state this module can reach in
 * which something went wrong and nothing anywhere says so.
 *
 * There is exactly ONE silent catch in this file, at the very bottom of
 * `emitLine`, and it wraps the `write` to stderr itself. When writing to stderr
 * fails there is, by construction, nowhere left to report to; the alternative
 * to swallowing it is throwing out of a reporter, which the contract above
 * forbids. That is the entire list, and it is deliberately in one place so a
 * reviewer can check it.
 */

import { recorder } from './recorder';
import { sentryTransport } from './sentry-transport';
import type { ContextValue, EventKind, ObservedEvent, ReportInput, Severity } from './types';

/**
 * Write one structured line to the process's error stream.
 *
 * `process.stderr.write` is preferred (unbuffered, ordered, and what a
 * container log driver collects) but does not exist on the edge runtime, where
 * `console.error` is the only channel. `src/lib/monitoring/logger.ts` calls
 * `process.stderr.write` unconditionally, which would throw on the edge; this
 * package cannot, because `src/middleware.ts` is edge and reporting an error
 * from middleware must not itself be an error.
 */
function emitLine(event: ObservedEvent): void {
  try {
    const line = JSON.stringify({
      level: event.severity,
      msg: event.message,
      kind: event.kind,
      fingerprint: event.fingerprint,
      at: event.at,
      ...event.context,
    });
    const stderr: unknown = (globalThis as { process?: { stderr?: unknown } }).process?.stderr;
    if (stderr && typeof (stderr as { write?: unknown }).write === 'function') {
      (stderr as { write: (chunk: string) => boolean }).write(`${line}\n`);
    } else {
      console.error(line);
    }
  } catch {
    // The only silent catch in this package. See the header: if stderr itself
    // is broken there is nowhere left to report to, and throwing out of the
    // reporter would convert a logging problem into an application crash.
  }
}

/**
 * Record an event, everywhere it should go.
 *
 * Returns the stored event so a caller that wants the id (for a correlation
 * header, say) can have it, and so tests can assert on exactly what was stored
 * rather than on what was passed in.
 */
export function report(input: ReportInput): ObservedEvent {
  const event = recorder.record(input);
  emitLine(event);
  sentryTransport.send(event, (reason) => {
    // Not `catch {}`. The transport's failure becomes an ordinary event with
    // its own fingerprint, so "Sentry has been unreachable for an hour" is
    // visible in the same snapshot as everything else. `send` refuses to
    // transmit `transport_error` events, which is what stops this recursing.
    const failure = recorder.record({
      kind: 'transport_error',
      severity: 'warning',
      message: `sentry transport failed: ${reason}`,
      fingerprint: 'transport:sentry',
    });
    emitLine(failure);
  });
  return event;
}

/** Narrow `unknown` to something reportable without asserting a type onto it. */
function describe(err: unknown): { message: string; name: string; stack?: string; code?: string } {
  if (err instanceof Error) {
    const code = (err as Error & { code?: unknown }).code;
    return {
      message: err.message || err.name,
      name: err.name,
      stack: err.stack,
      ...(typeof code === 'string' ? { code } : {}),
    };
  }
  if (typeof err === 'string') return { message: err, name: 'string' };
  if (err && typeof err === 'object') {
    const maybe = err as { message?: unknown; name?: unknown; code?: unknown };
    return {
      message: typeof maybe.message === 'string' ? maybe.message : 'non-Error thrown',
      name: typeof maybe.name === 'string' ? maybe.name : 'object',
      ...(typeof maybe.code === 'string' ? { code: maybe.code } : {}),
    };
  }
  return { message: String(err), name: typeof err };
}

export interface ReportErrorOptions {
  kind?: EventKind;
  severity?: Severity;
  /** Overrides the derived fingerprint. Must be low cardinality — see types.ts. */
  fingerprint?: string;
  context?: Record<string, ContextValue | undefined>;
  /** Prefixed to the error's own message. */
  message?: string;
}

/**
 * Report a caught `unknown`.
 *
 * The default fingerprint is `<kind>:<ErrorName>` — deliberately coarse. A
 * fingerprint derived from the message would split one problem into one row per
 * distinct interpolated value, which is how a counter table becomes a memory
 * leak and how a dashboard becomes unreadable. Call sites that can name the
 * problem more precisely (`prisma:attentionEvent.findMany`) pass `fingerprint`.
 */
export function reportError(err: unknown, options: ReportErrorOptions = {}): ObservedEvent {
  const described = describe(err);
  const kind = options.kind ?? 'manual';
  const message = options.message ? `${options.message}: ${described.message}` : described.message;

  return report({
    kind,
    severity: options.severity ?? 'error',
    message,
    fingerprint: options.fingerprint ?? `${kind}:${described.name}`,
    context: {
      errorName: described.name,
      ...(described.code ? { errorCode: described.code } : {}),
      ...options.context,
    },
    ...(described.stack ? { stack: described.stack } : {}),
  });
}

export { recorder } from './recorder';
export { sentryTransport } from './sentry-transport';
