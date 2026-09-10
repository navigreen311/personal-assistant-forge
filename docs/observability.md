# Observability (P-28 / T-013 + T-025)

> **The one-sentence version.** With **no vendor account configured**, an
> operator can now ask a running process which database queries are failing and
> how often, which Prisma model the code expects and the schema does not have,
> which queue is accepting jobs nobody is consuming, and which routes are
> throwing — grouped, counted and inspectable at `GET /api/admin/observability`.
> With a `SENTRY_DSN` set, the same events **additionally** go to Sentry over its
> ingest API. Nothing else changes between those two states.

---

## Why this package exists

Over twenty packages this platform accumulated **ten confirmed phantom-delegate
bugs**: code querying a Prisma table that does not exist, the throw swallowed by
a bare `catch`, a plausible-looking default returned with a 200.

- `/api/attention/insights` served every user an attention score of exactly
  **100** (`100 - 0 + 0`) from the day it was written.
- `/api/ai-quality/stats` served a hardcoded **B+/88**.
- `/api/health/dashboard` served invented vitals.

Every one was found by a human reading code. **Not one produced a single alert,
because there was nowhere for an error to go.**

There was a `src/lib/monitoring/` directory — 350 lines, fully typed, carefully
documented. `grep -rn "lib/monitoring" src | grep -v '^src/lib/monitoring/'`
returned **nothing**: zero importers. And `@sentry/nextjs` is not in
`package.json`, so its `require` throws and it was a no-op **even with a DSN
configured**. A monitoring module that reports nothing under every possible
configuration is the same bug as a route that returns a constant 100: a
plausible default that makes a reviewer stop looking.

---

## What you get, in each configuration

| | no `SENTRY_DSN` (the default, today) | `SENTRY_DSN` set |
|---|---|---|
| Structured JSON line on stderr | yes | yes |
| In-process counters, grouped and rated | yes | yes |
| `GET /api/admin/observability` | yes | yes |
| Error counts on `GET /api/health` | yes | yes |
| Worker liveness on `GET /api/health` | yes (needs Redis) | yes |
| Events in a Sentry project | no | yes |
| Survives a process restart | **no** | yes |
| Aggregated across replicas | **no** | yes |

The unconfigured column is the one that had to work, and it is the one that is
tested end-to-end in `tests/db/observability.test.ts`.

---

## The four things it watches, and why these four

Argued from this platform's failure history, not from a generic checklist.

### 1. `prisma_query_error` — a database query failed

**The metric that would have caught `/api/attention/insights`.** The ten bugs
have nothing in common at the route level; what they share is that *a query
failed and nobody counted it*. Counting happens in a Prisma client extension in
`src/lib/db/index.ts`, so it does not need any of the 553 bare `catch` blocks in
`src` to cooperate — the throw passed through the extension before the `catch`
got to swallow it.

Grouped as `prisma:<Model>.<operation>:<code>`. Graded:

- **`fatal`** — `P2021` (table missing), `P2022` (column missing), validation
  errors (a field the schema does not have). These cannot be transient: they
  will fail identically on every request until code or schema changes.
- **`warning`** — `P2002` (unique violation), `P2025` (record not found). The
  normal outcome of an upsert race, which `src/lib/shadow/vaf-config.ts` catches
  on purpose. Grading these as errors would pin any alert threshold permanently
  above zero, which is how a metric becomes one nobody looks at.
- **`error`** — everything else.

**Query arguments are never recorded.** Arguments are tenant data. Model,
operation and error code identify all ten historical bugs and carry nobody's.

### 2. `phantom_delegate` — the model is not in the schema at all

The exact shape of the ten. `prisma.attentionEvent` is `undefined`; the failure
is a plain `TypeError`, so Prisma never sees it and no query extension can help.
A `get` proxy on the client reports it and returns the same `undefined` as
before.

**This is also checked statically, before merge**, by
`tests/unit/observability/phantom-delegates.test.ts`: it reads the delegate list
out of the DMMF and every `prisma.X` in `src` off the filesystem, and fails CI
on a mismatch. That is the better half — it needs no traffic and no database,
and it cannot be defeated by `jest.mock('@/lib/db')` because it never imports
it. The runtime half exists for what the static one cannot see: a delegate named
by a computed string (`bulkUpsert` in `src/lib/db/helpers.ts` really does this),
and a schema that drifts from the deployed database after the code merged.

### 3. `job_failed` / `job_stalled` / worker liveness — nobody is consuming

Before P-11 this platform had **no BullMQ consumer at all**: jobs were enqueued
and read by nobody, and `POST /api/workflows/[id]/trigger` returned 200 forever.
That failure recurs on its own — a worker container that OOMs, a rotated Redis
credential, a deploy that scales the web tier and forgets the worker tier — and
from the web tier every one of them is indistinguishable from a healthy system.

Workers publish a heartbeat to Redis; `GET /api/health` reads it.

- registered **and** heartbeating → `up`
- registered **and no heartbeat** → `down` — reported at `fatal`
- **never registered** → `unknown`, and *nothing is claimed*

That third state is why `/api/health` does not go red on a developer machine
with no worker. Registration is removed on a *graceful* shutdown, so a rolling
restart is not an outage; an unclean death (SIGKILL, OOM, crash) leaves it
behind, which is exactly the case worth alerting on.

`job_failed` distinguishes an attempt that will be retried (`warning`) from a
job that has exhausted its attempts and **will never complete** (`error`).

### 4. `request_error` — an uncaught error at the request boundary

Via Next.js's own `onRequestError` hook in `src/instrumentation.ts`. Covers App
Router route handlers, server components, server actions and middleware, with no
per-route wrapper to forget. Grouped by route **pattern**
(`route:GET /api/tasks/[id]:TypeError`), never by resolved URL.

---

## The boundaries, and what is *not* covered

| Boundary | Covered by | Gap |
|---|---|---|
| Route handler (Node) | `onRequestError` + Prisma extension | — |
| Server component / action | `onRequestError` | — |
| Edge middleware | `onRequestError`; Sentry POST works on edge | The in-process recorder is per-runtime, so an edge error is **not** visible at `/api/admin/observability`. stderr and Sentry are its only sinks. |
| BullMQ worker | `scripts/worker.ts` | Its recorder is the **worker process's**, and `/api/admin/observability` is served by the **web** process. Worker events reach stderr and Sentry; only worker *liveness* crosses the process boundary, via Redis. |
| Web process uncaught exception | `uncaughtExceptionMonitor` | — |
| Web process unhandled rejection | **not covered** unless it reaches `onRequestError` | See below. |

**Why no `unhandledRejection` handler in the web process.** In Node 20 an
unhandled rejection terminates the process by default, and attaching *any*
listener silently turns that off. There is no monitor-only variant, as there is
for `uncaughtException`. A process that keeps serving after an unhandled
rejection, with whatever state it left behind, is worse than one an orchestrator
restarts — and installing that suppression as a side effect of adding monitoring
would be this package committing the class of error it was written to detect.
`scripts/worker.ts` *does* report both, because it already had handlers that own
the shutdown decision, so adding a report changes no behaviour there.

**No per-request correlation.** A failing query is attributed to
`Model.operation`, not to the route that made it. Doing better needs a
request-scoped context installed at the boundary, and that boundary —
`withAuth` in `src/shared/middleware/auth.ts` — is frozen for this package. For
the ten historical bugs it is sufficient, because each phantom model was
referenced by exactly one route. It is a real limit.

**The recorder is process-local and in-memory.** It does not survive a restart,
and each replica has its own. `prisma/schema.prisma` is frozen for this package
so there is no table to write to, and choosing a durable store the platform has
not chosen would be a bigger claim than the evidence supports. Bounds are
returned in the response (`limits`) rather than hidden: ring buffer 200 events,
counter table 500 fingerprints, with `eventsEvicted` and `fingerprintOverflow`
so truncation is visible instead of silent.

---

## Why Sentry has no SDK dependency

`SENTRY_DSN` is shipped over Sentry's documented envelope ingest API — a single
`POST` of newline-delimited JSON — rather than through `@sentry/nextjs`. Three
reasons, in order of weight:

1. **The Docker image build runs only on pushes to master, never on a PR.**
   Master has already been broken once this way. `@sentry/nextjs` installs a
   webpack plugin, wraps the Next build, and uploads source maps; adding a
   build-time-active package whose effect on the image cannot be observed on the
   PR is precisely that risk.
2. **`npm audit` is at 0 and must stay there.** The SDK brings ~40 transitive
   packages. **This package adds no dependency at all**, so that number cannot
   move for anything P-28 did.
3. **What is being bought is one HTTP POST**, on a stable, versioned wire
   format.

Not implemented, and therefore not claimed: breadcrumbs, tracing, release
health, session replay, source-map upload. If the platform wants those, install
the SDK — everything is wired to the recorder, and only
`src/lib/observability/sentry-transport.ts` changes.

---

## How this is not another swallowed `catch`

The defining bug of this codebase is `catch {}`. A reporting layer made of the
same material would be the eleventh instance, not a fix for the first ten.

The property that prevents it: **the two sinks that always run are synchronous
and have nothing in them that can fail.** `recorder.record()` is pure in-memory
writes into pre-sized structures — no I/O, no serialisation, no callback. The
stderr line is one `write`.

The one genuinely fallible sink, the Sentry POST, is fire-and-forget — and
**its failures are themselves recorded**. Every rejection increments `failed`,
sets `lastError`, and is reported as a `transport_error` event visible in the
same snapshot. An operator who sees `sent: 0, failed: 812, lastError:
"getaddrinfo ENOTFOUND"` knows the DSN host is wrong. Under `catch {}` they
would have seen an empty Sentry project and concluded the platform was healthy.
Five consecutive failures open a breaker for a minute, and the suppressed events
are counted as `dropped`.

There is exactly **one** silent catch in the package, at the bottom of
`emitLine` in `report.ts`, wrapping the write to stderr itself. When stderr is
broken there is nowhere left to report to, and throwing out of a reporter would
convert a logging problem into an application crash. It is in one place on
purpose, so a reviewer can check that claim.

---

## Configuration

All optional. **The platform behaves identically with none of these set.**

| Variable | Default | Effect |
|---|---|---|
| `SENTRY_DSN` | unset | Ship events to Sentry as well. The `.env.example` placeholder `YOUR_SENTRY_DSN_HERE` is treated as unset. A malformed DSN degrades to "no Sentry" and never throws at boot. |
| `SENTRY_RELEASE` | unset | Tags outbound events with a release. |
| `PAF_OBS_BUFFER` | `200` | Recent events retained per process (10–2000). |
| `WORKER_CONCURRENCY`, `REDIS_URL` | existing | `REDIS_URL=disabled` disables the heartbeat; liveness then reports `unknown`. |

No secret is ever returned by an endpoint or written to a log: `sentry.configured`
is a boolean and the DSN itself is never serialised.

---

## Reading it

```bash
# counts only, world-readable (middleware.ts exempts /api/health from auth)
curl -s localhost:3000/api/health | jq '.errors, .checks.workers'

# full detail — requires an owner or admin session
curl -s localhost:3000/api/admin/observability -H "Cookie: next-auth.session-token=..." \
  | jq '.data.counters[:10], .data.sentry, .data.workers'
```

`/api/health` deliberately carries **counts only** — no messages, fingerprints
or model names. A fingerprint such as `prisma:attentionEvent.findMany:P2021`
tells an anonymous caller which tables exist and which are broken. A count is
enough to alert on; the detail is for whoever responds, behind the role gate.

`/api/health` also **does not** return 503 for a dead worker or a raised error
rate. It is what a load balancer polls; both of those failures are
platform-wide, so every replica would report them at once and a degraded
background tier would become a total outage of the foreground one. The status
code stays a statement about *this process's* ability to serve a request.

---

## Proof

- `tests/unit/observability/` — 92 cases: bounds, scrubbing, the "cannot throw"
  contract, DSN parsing, the transport's self-observation, probe false
  positives, and the static schema scan.
- `tests/db/observability.test.ts` — 24 cases against a real Postgres, a real
  Redis and the real generated client: a missing table is counted while the
  caller still returns its default; transactions still roll back; a phantom
  delegate is reported; the endpoint refuses anonymous/member/viewer; a dead
  worker is reported as down; `/api/health` leaks no detail.
