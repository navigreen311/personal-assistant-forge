import { NextRequest } from 'next/server';
import { success } from '@/shared/utils/api-response';
import { withRole } from '@/shared/middleware/auth';
import { recorder, sentryTransport, RECORDER_LIMITS } from '@/lib/observability';
import { readWorkerHealth } from '@/lib/observability/worker-health';

/**
 * P-28 (T-013/T-025) — `GET /api/admin/observability`.
 *
 * ============================================================================
 * THIS IS THE "NO VENDOR ACCOUNT" ANSWER
 * ============================================================================
 *
 * Nobody has provisioned Sentry for this platform and nobody may. The design
 * requirement was therefore that the unconfigured path be the one that works,
 * and this route is where that pays out: with no `SENTRY_DSN` anywhere, an
 * operator can ask a running process what has been failing and get counts,
 * groupings, first-seen and last-seen times, and the most recent events with
 * their stacks. With a DSN, the same events additionally go to Sentry. Nothing
 * about this route changes either way.
 *
 * ============================================================================
 * WHY IT IS ROLE-GATED WHEN /api/health IS NOT
 * ============================================================================
 *
 * `/api/health` is exempted from auth by `src/middleware.ts` and carries counts
 * only. This route carries messages and stack traces. Even after the recorder
 * scrubs emails, uuids and long tokens (`scrubMessage` in recorder.ts), an
 * error message is application text that was produced while serving some
 * tenant's request, and eleven packages of this build were spent proving one
 * tenant cannot read another's data. Scrubbing is a reduction, not a proof, so
 * the second control is that you must be an owner or an admin.
 *
 * ============================================================================
 * WHY IT IS NOT ENTITY-SCOPED
 * ============================================================================
 *
 * Every other admin route in this codebase uses `withEntityScope` or
 * `withAuditedRoleEntityScope`, and this one deliberately does not. What it
 * returns is not a tenant's data — it is a property of the PROCESS: which
 * queries are failing, which delegate is missing from the schema, whether the
 * worker tier is alive. There is no entity that owns "the Prisma client cannot
 * find table X". Scoping it to an entity would have produced a filter that
 * looked like tenancy while filtering nothing, and this platform already has
 * ten bugs of the form "a control that looks present and does nothing".
 *
 * The honest consequence is stated rather than hidden: any owner or admin sees
 * platform-wide operational data. That is documented in docs/observability.md.
 */

/** Recent events returned by default. `?limit=` raises it up to the ring size. */
const DEFAULT_EVENT_LIMIT = 50;

export async function GET(request: NextRequest) {
  return withRole(request, ['owner', 'admin'], async (req) => {
    const requested = Number.parseInt(req.nextUrl.searchParams.get('limit') ?? '', 10);
    const limit = Number.isFinite(requested)
      ? Math.min(Math.max(requested, 1), RECORDER_LIMITS.ringCapacity)
      : DEFAULT_EVENT_LIMIT;

    const snapshot = recorder.snapshot();
    const workers = await readWorkerHealth();

    return success({
      process: {
        startedAt: snapshot.processStartedAt,
        uptimeSeconds: Math.round(process.uptime()),
        nodeEnv: process.env.NODE_ENV ?? 'development',
        pid: process.pid,
      },

      /**
       * Whether events are ALSO being shipped to Sentry, and whether shipping
       * is working. `configured` is a boolean derived from the DSN; the DSN
       * itself is never returned, because a Sentry public key in an HTTP
       * response is a credential in a log somewhere.
       *
       * `failed` and `lastError` are the point of this block. A transport that
       * silently dropped everything would leave an empty Sentry project, which
       * reads exactly like a healthy platform — the same "plausible default"
       * failure this whole package exists to end. Here it reads as
       * `sent: 0, failed: 812`.
       */
      sentry: sentryTransport.state(),

      workers: {
        status: workers.status,
        detail: workers.workers,
        down: workers.down,
        error: workers.error,
      },

      /**
       * Distinct problems, most frequent first. This is the table to read.
       *
       * A row `prisma:attentionEvent.findMany:P2021 x 4,112, first seen at
       * deploy time` is the report that `/api/attention/insights` was serving
       * every user a constant score of 100 — the bug that survived months of
       * production because a bare `catch` turned it into a 200.
       */
      counters: snapshot.counters,

      /** Exact counts over rolling windows, independent of the ring buffer. */
      rates: snapshot.rates,
      totals: snapshot.totals,

      recent: snapshot.recent.slice(0, limit),

      /**
       * The bounds, returned rather than documented elsewhere, so a reader can
       * tell "there were 12 problems" from "there were at least 500 and the
       * table is full". An observability tool that hides its own truncation
       * is lying by omission.
       */
      limits: {
        ...RECORDER_LIMITS,
        eventsEvicted: snapshot.evicted,
        fingerprintOverflow: snapshot.fingerprintOverflow,
        returned: Math.min(limit, snapshot.recent.length),
      },
    });
  });
}

export const dynamic = 'force-dynamic';
