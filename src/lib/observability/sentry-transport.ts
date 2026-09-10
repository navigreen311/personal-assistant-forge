/**
 * P-28 — the optional outbound leg: Sentry over its documented ingest API.
 *
 * ============================================================================
 * WHY THERE IS NO `@sentry/nextjs` DEPENDENCY
 * ============================================================================
 *
 * The obvious implementation is `npm i @sentry/nextjs` and call `init()`. Three
 * facts about THIS repository argued against it, in order of weight:
 *
 * 1. The Docker image build runs only on pushes to master, never on a pull
 *    request (`.github/workflows/ci.yml`, `if: github.ref == 'refs/heads/master'`).
 *    Master has already been broken once this way, by a `.dockerignore` pattern
 *    that behaved differently inside the image than outside it. `@sentry/nextjs`
 *    is not an ordinary library: it installs a webpack plugin, wraps the Next
 *    build, wants `instrumentation-client.ts`, and uploads source maps. Adding a
 *    build-time-active package whose effect on the image cannot be observed on
 *    this PR is precisely the risk that broke master before.
 *
 * 2. `npm audit` is at 0 vulnerabilities and the card requires it stay there.
 *    The SDK brings ~40 transitive packages, which is 40 more chances for that
 *    number to change later for reasons unrelated to this platform.
 *
 * 3. The thing being bought is a single HTTP POST. Sentry's store/envelope
 *    endpoint is a documented, versioned, stable wire format: a POST of
 *    newline-delimited JSON to `/api/<project>/envelope/` with an
 *    `X-Sentry-Auth` header. The 70 lines below are the whole of it.
 *
 * This is not "a lightweight reimplementation of Sentry". It is an event
 * shipper for the one event type this platform emits. Breadcrumbs, tracing,
 * release health, session replay and source-map upload are NOT implemented and
 * are listed in docs/observability.md as not implemented. If the platform later
 * wants those, install the SDK — the recorder above is what everything is
 * actually wired to, and swapping this file changes nothing else.
 *
 * ============================================================================
 * RUNTIME
 * ============================================================================
 *
 * Uses `fetch`, `AbortSignal.timeout` and `crypto.randomUUID` and nothing else,
 * so it runs unchanged on the edge runtime. That matters: `src/middleware.ts`
 * is edge, `ioredis` cannot run there (this is why P-18's rate limiter had to
 * move into the route handlers), and an error thrown in middleware would
 * otherwise have no outbound path at all.
 */

import type { ObservedEvent } from './types';

/** Wall-clock budget for one POST. A monitoring call must never outlive a request. */
const SEND_TIMEOUT_MS = 4000;

/** Concurrent in-flight sends. Beyond this, events are dropped and counted. */
const MAX_IN_FLIGHT = 8;

/** Consecutive failures before the breaker opens. */
const BREAKER_THRESHOLD = 5;

/** How long the breaker stays open before one probe is allowed through. */
const BREAKER_COOLDOWN_MS = 60_000;

export interface ParsedDsn {
  publicKey: string;
  envelopeUrl: string;
  projectId: string;
}

/**
 * Parse a Sentry DSN into the ingest URL and key.
 *
 * DSN shape: `<scheme>://<publicKey>@<host>[:<port>][/<path>]/<projectId>`.
 * The legacy `<publicKey>:<secretKey>@` form is accepted and the secret
 * discarded — modern ingest ignores it, and carrying it would mean a secret in
 * a structure that gets logged.
 *
 * Returns null for anything unparseable, INCLUDING the `.env.example`
 * placeholder `YOUR_SENTRY_DSN_HERE`. A malformed DSN must degrade to "no
 * Sentry", never to a throw at import time — a typo in an env var is not a
 * reason for the application to fail to boot.
 */
export function parseDsn(dsn: string | undefined): ParsedDsn | null {
  if (!dsn) return null;
  const trimmed = dsn.trim();
  if (!trimmed || trimmed.startsWith('YOUR_')) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const publicKey = url.username;
  if (!publicKey) return null;

  const segments = url.pathname.split('/').filter(Boolean);
  const projectId = segments.pop();
  if (!projectId || !/^\d+$/.test(projectId)) return null;

  const prefix = segments.length > 0 ? `/${segments.join('/')}` : '';
  return {
    publicKey,
    projectId,
    envelopeUrl: `${url.protocol}//${url.host}${prefix}/api/${projectId}/envelope/`,
  };
}

export interface TransportState {
  /** Whether a DSN parsed. Never exposes the DSN itself. */
  configured: boolean;
  sent: number;
  failed: number;
  dropped: number;
  inFlight: number;
  consecutiveFailures: number;
  breakerOpen: boolean;
  /** Scrubbed reason for the most recent failure, or null. */
  lastError: string | null;
  lastErrorAt: string | null;
}

class SentryTransport {
  private dsn: ParsedDsn | null = null;
  private resolved = false;

  private sent = 0;
  private failed = 0;
  private dropped = 0;
  private inFlight = 0;
  private consecutiveFailures = 0;
  private breakerOpenedAt = 0;

  private lastError: string | null = null;
  private lastErrorAt: string | null = null;

  /**
   * Read SENTRY_DSN lazily rather than at module load.
   *
   * `src/lib/queue/connection.ts` documents the same choice for REDIS_URL and
   * the reason applies verbatim: a value captured at first import cannot be
   * changed by a jest `globalSetup`, and whether it was depended on module
   * import order.
   */
  private getDsn(): ParsedDsn | null {
    if (!this.resolved) {
      this.dsn = parseDsn(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN);
      this.resolved = true;
    }
    return this.dsn;
  }

  /** Test-only: forget the cached DSN so a changed env var is re-read. */
  reset(): void {
    this.resolved = false;
    this.dsn = null;
    this.sent = 0;
    this.failed = 0;
    this.dropped = 0;
    this.inFlight = 0;
    this.consecutiveFailures = 0;
    this.breakerOpenedAt = 0;
    this.lastError = null;
    this.lastErrorAt = null;
  }

  isConfigured(): boolean {
    return this.getDsn() !== null;
  }

  private breakerIsOpen(): boolean {
    if (this.consecutiveFailures < BREAKER_THRESHOLD) return false;
    if (Date.now() - this.breakerOpenedAt >= BREAKER_COOLDOWN_MS) {
      // Cooldown elapsed: let exactly one probe through by resetting the count.
      this.consecutiveFailures = 0;
      return false;
    }
    return true;
  }

  /**
   * Ship one event. Returns immediately; the caller never awaits it.
   *
   * ------------------------------------------------------------------------
   * THIS IS THE ONE PLACE THAT COULD HAVE BECOME THE ELEVENTH `catch {}`
   * ------------------------------------------------------------------------
   *
   * A fire-and-forget POST has a rejected promise nobody awaits. The tempting
   * shape is `void fetch(...).catch(() => {})`, and that is character-for-
   * character the pattern that produced ten silent bugs in this codebase.
   *
   * What makes the catch below different is that it WRITES DOWN THAT IT
   * CAUGHT. Every rejection increments `failed`, sets `lastError`, and is
   * reported into the recorder as a `transport_error` event — so the reporting
   * layer's own failures show up in the same snapshot as everything else. An
   * operator who sees `sent: 0, failed: 812, lastError: "getaddrinfo ENOTFOUND"`
   * knows the DSN host is wrong. Under `catch {}` they would have seen an empty
   * Sentry project and concluded the platform was healthy.
   *
   * The failure is also BOUNDED rather than merely observed: five consecutive
   * failures open a breaker for a minute, so a dead ingest host cannot turn
   * every application error into an additional four-second hanging socket.
   */
  send(event: ObservedEvent, onFailure: (reason: string) => void): void {
    const dsn = this.getDsn();
    if (!dsn) return;

    // Never let the transport report its own failures — that is an infinite
    // loop with a network call in it.
    if (event.kind === 'transport_error') return;

    if (this.inFlight >= MAX_IN_FLIGHT || this.breakerIsOpen()) {
      this.dropped += 1;
      return;
    }

    this.inFlight += 1;

    const body = buildEnvelope(event, dsn);
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': [
        'Sentry sentry_version=7',
        'sentry_client=paf-observability/1.0.0',
        `sentry_key=${dsn.publicKey}`,
      ].join(', '),
    };

    let request: Promise<Response>;
    try {
      request = fetch(dsn.envelopeUrl, {
        method: 'POST',
        headers,
        body,
        // A monitoring POST must never keep a request or a worker alive.
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        cache: 'no-store',
      });
    } catch (err) {
      // `fetch` throwing synchronously (no global fetch, bad URL) still has to
      // decrement in-flight, or the transport wedges shut after MAX_IN_FLIGHT.
      this.inFlight -= 1;
      this.noteFailure(err, onFailure);
      return;
    }

    void request
      .then((response) => {
        if (response.ok) {
          this.sent += 1;
          this.consecutiveFailures = 0;
        } else {
          this.noteFailure(new Error(`sentry ingest responded ${response.status}`), onFailure);
        }
      })
      .catch((err: unknown) => {
        this.noteFailure(err, onFailure);
      })
      .finally(() => {
        this.inFlight -= 1;
      });
  }

  private noteFailure(err: unknown, onFailure: (reason: string) => void): void {
    this.failed += 1;
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures === BREAKER_THRESHOLD) {
      this.breakerOpenedAt = Date.now();
    }
    const reason = err instanceof Error ? err.message : String(err);
    this.lastError = reason;
    this.lastErrorAt = new Date().toISOString();
    onFailure(reason);
  }

  state(): TransportState {
    return {
      configured: this.isConfigured(),
      sent: this.sent,
      failed: this.failed,
      dropped: this.dropped,
      inFlight: this.inFlight,
      consecutiveFailures: this.consecutiveFailures,
      breakerOpen: this.consecutiveFailures >= BREAKER_THRESHOLD,
      lastError: this.lastError,
      lastErrorAt: this.lastErrorAt,
    };
  }
}

const SEVERITY_TO_SENTRY: Record<ObservedEvent['severity'], string> = {
  warning: 'warning',
  error: 'error',
  fatal: 'fatal',
};

/**
 * Build a Sentry envelope: three newline-delimited JSON documents.
 *
 * `{envelope header}\n{item header}\n{item payload}\n`
 *
 * The item payload is a standard Sentry event. `fingerprint` is set explicitly
 * so Sentry groups by the same key the local counters do — otherwise the same
 * problem is one row here and several issues there, and the two views disagree
 * about how many distinct problems exist.
 */
export function buildEnvelope(event: ObservedEvent, dsn: ParsedDsn): string {
  const eventId = randomEventId();
  const envelopeHeader = JSON.stringify({
    event_id: eventId,
    sent_at: new Date().toISOString(),
    dsn: `${dsn.envelopeUrl}`,
  });

  const payload = JSON.stringify({
    event_id: eventId,
    timestamp: event.at,
    platform: 'node',
    level: SEVERITY_TO_SENTRY[event.severity],
    logger: 'paf.observability',
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE ?? undefined,
    fingerprint: [event.fingerprint],
    message: { formatted: event.message },
    tags: {
      kind: event.kind,
      fingerprint: event.fingerprint,
    },
    extra: event.context,
    ...(event.stack
      ? { exception: { values: [{ type: event.kind, value: event.message }] } }
      : {}),
  });

  const itemHeader = JSON.stringify({
    type: 'event',
    content_type: 'application/json',
    length: payload.length,
  });

  return `${envelopeHeader}\n${itemHeader}\n${payload}\n`;
}

/** `crypto.randomUUID` exists on Node 20 and on the edge runtime. */
function randomEventId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, '');
}

const globalForTransport = globalThis as unknown as { __pafSentryTransport?: SentryTransport };

export const sentryTransport: SentryTransport = (globalForTransport.__pafSentryTransport ??=
  new SentryTransport());

export type { SentryTransport };
