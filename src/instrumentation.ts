/**
 * P-28 — the server-side error boundary for the web process.
 *
 * ============================================================================
 * WHY THIS FILE, RATHER THAN 337 EDITED ROUTES
 * ============================================================================
 *
 * Next.js calls `onRequestError` for every uncaught server error: App Router
 * route handlers, server components, server actions, and middleware. It is the
 * framework's own choke point, it needs no cooperation from the handler that
 * threw, and it costs nothing when nothing throws.
 *
 * The alternative was a wrapper applied at each route. That would have meant
 * touching 337 files -- four of whose directories are frozen because P-27 is
 * editing them right now -- to install something the framework already offers.
 * More importantly it would have meant a wrapper that a new route can forget to
 * use, and "the check exists but this file didn't call it" is how this platform
 * arrived at 149 unscoped routes and a monitoring module with zero importers.
 *
 * ============================================================================
 * WHAT IT CANNOT SEE, STATED PLAINLY
 * ============================================================================
 *
 * `onRequestError` fires for errors that ESCAPE the handler. This codebase's
 * signature bug is the opposite: 553 bare `catch` blocks that convert a throw
 * into a 200 with a plausible default, so nothing escapes and nothing here
 * fires. That gap is not closed by this file; it is closed one layer down, by
 * the Prisma instrumentation in `src/lib/observability/prisma-instrumentation.ts`,
 * which counts the failure before the `catch` ever gets to swallow it.
 *
 * Both are needed and neither subsumes the other. This one knows the route and
 * the HTTP method; that one sees the errors this one never will.
 *
 * ============================================================================
 * `register()` AND THE HANDLER THAT IS DELIBERATELY NOT INSTALLED
 * ============================================================================
 *
 * `register()` runs once per server instance, in each runtime. In Node it
 * installs `uncaughtExceptionMonitor`.
 *
 * `uncaughtExceptionMonitor` and not `uncaughtException`, and the difference is
 * the whole point: attaching an `uncaughtException` listener SUPPRESSES Node's
 * default behaviour of printing the error and exiting non-zero. A process that
 * keeps serving after an uncaught throw, with whatever state that throw left
 * behind, is a strictly worse outcome than a crash an orchestrator can restart
 * -- and installing that suppression accidentally, in the name of observability,
 * would be this package shipping the very failure mode it was written to
 * detect. `uncaughtExceptionMonitor` is invoked for exactly the same events and
 * changes nothing about what happens next.
 *
 * There is no `unhandledRejection` listener here for the same reason and with
 * no monitor-only variant available: in Node 20 an unhandled rejection
 * terminates the process by default, and attaching any listener silently turns
 * that off. Unhandled rejections that originate inside a request still reach
 * `onRequestError`. Ones that do not are NOT reported by this process, and that
 * is a known gap rather than an oversight. `scripts/worker.ts` does handle them,
 * because it already had a handler that owns the shutdown decision, so adding
 * reporting there changes no behaviour.
 */

import type { Instrumentation } from 'next/dist/server/instrumentation/types';
import { report, reportError } from '@/lib/observability/report';

export function register(): void {
  // `register` runs in every runtime, including edge, where `process.on` does
  // not exist. Guard on the runtime Next sets rather than on `typeof process`,
  // because the edge runtime does provide a partial `process` shim.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const globalForRegister = globalThis as unknown as { __pafObsRegistered?: boolean };
  if (globalForRegister.__pafObsRegistered) return;
  globalForRegister.__pafObsRegistered = true;

  process.on('uncaughtExceptionMonitor', (err: Error, origin: string) => {
    reportError(err, {
      kind: 'request_error',
      severity: 'fatal',
      fingerprint: `uncaught:${err.name}`,
      message: 'uncaught exception in web process',
      context: { origin, runtime: 'nodejs' },
    });
  });

  report({
    kind: 'manual',
    severity: 'warning',
    message: 'observability registered',
    fingerprint: 'lifecycle:web-start',
    context: { runtime: 'nodejs', nodeEnv: process.env.NODE_ENV ?? 'development' },
  });
}

/**
 * Report an error Next.js caught at the request boundary.
 *
 * The fingerprint is `route:<method> <routePath>:<ErrorName>`. `routePath` is
 * the ROUTE PATTERN (`/api/tasks/[id]`), not the resolved URL, so a route that
 * fails for every id produces one counter row instead of one per id. That
 * distinction is the difference between a table an operator can read and a
 * table that fills its 500-fingerprint cap in a minute.
 *
 * Declared as a plain `async function` rather than a const so that the module's
 * export shape is what Next.js looks for, and typed against Next's own
 * `Instrumentation.onRequestError` so a signature change in a future Next
 * upgrade is a compile error rather than a hook that silently stops being
 * called.
 */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const name = error instanceof Error ? error.name : typeof error;
  const routePath = context.routePath || 'unknown';

  reportError(error, {
    kind: 'request_error',
    severity: 'error',
    // `routePath` and NOT `request.path`, even when the pattern is empty.
    // Falling back to the resolved URL looked harmless and is not: a route
    // Next cannot name that fails for every id would mint one counter row per
    // id and fill the 500-fingerprint cap in a minute, evicting every other
    // problem in the process. `unknown` groups them into one honest row, and
    // the resolved path is still in the context below.
    fingerprint: `route:${request.method} ${routePath}:${name}`,
    context: {
      method: request.method,
      routePath,
      routeType: context.routeType,
      routerKind: context.routerKind,
      renderSource: context.renderSource ?? null,
      revalidateReason: context.revalidateReason ?? null,
      // `request.path` is the resolved URL and can carry ids and query values.
      // It is recorded because it is what makes an error reproducible, and the
      // recorder scrubs uuids, emails and long tokens out of it first. It is
      // NOT part of the fingerprint -- see above.
      path: request.path,
    },
  });
};
