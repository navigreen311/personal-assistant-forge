/**
 * Sentry Error Tracking Integration
 *
 * Provides error reporting, performance monitoring, and user context tracking.
 * All functions are safe no-ops when SENTRY_DSN is not configured or when
 * the @sentry/nextjs package is not installed, ensuring the application
 * never crashes due to monitoring infrastructure.
 */

type SeverityLevel = 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug';

export type SentryUser = {
  id: string;
  email?: string;
  username?: string;
  [key: string]: unknown;
};

export type SentryBreadcrumb = {
  category?: string;
  message?: string;
  level?: SeverityLevel;
  type?: string;
  data?: Record<string, unknown>;
};

export type SentryContext = {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user?: SentryUser;
  level?: SeverityLevel;
  fingerprint?: string[];
};

export type SentryTransaction = {
  finish: () => void;
  setStatus: (status: string) => void;
  setData: (key: string, value: unknown) => void;
  startChild: (op: { op: string; description?: string }) => SentryTransaction;
};

// Lazy-loaded Sentry module reference
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sentry: any = null;
let _initAttempted = false;
let _isEnabled = false;

/**
 * Attempts to load and initialize the Sentry SDK.
 * Returns true if Sentry is available and configured, false otherwise.
 */
function ensureInitialized(): boolean {
  if (_initAttempted) return _isEnabled;
  _initAttempted = true;

  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

  if (!dsn || dsn === 'YOUR_SENTRY_DSN_HERE') {
    _isEnabled = false;
    return false;
  }

  try {
    // Dynamic import is not usable synchronously, so we rely on
    // @sentry/nextjs being available at module resolution time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _sentry = require('@sentry/nextjs');

    if (_sentry && typeof _sentry.init === 'function') {
      _sentry.init({
        dsn,
        environment: process.env.NODE_ENV ?? 'development',
        release: process.env.SENTRY_RELEASE ?? process.env.NEXT_PUBLIC_APP_VERSION,
        tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
        debug: process.env.NODE_ENV === 'development',
        enabled: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        integrations: (defaults: any) => defaults,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        beforeSend(event: any) {
          // Scrub sensitive data from event
          if (event.request?.headers) {
            delete event.request.headers['authorization'];
            delete event.request.headers['cookie'];
          }
          return event;
        },
      });
      _isEnabled = true;
    }
  } catch {
    // @sentry/nextjs is not installed — all calls become no-ops
    _sentry = null;
    _isEnabled = false;
  }

  return _isEnabled;
}

/**
 * Captures an exception and reports it to Sentry.
 *
 * @param error - The error to report
 * @param context - Optional additional context (tags, extra data, user, level)
 */
export function captureException(
  error: unknown,
  context?: SentryContext
): string | undefined {
  if (!ensureInitialized() || !_sentry) return undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return _sentry.withScope((scope: any) => {
    if (context?.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }

    if (context?.extra) {
      Object.entries(context.extra).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }

    if (context?.user) {
      scope.setUser(context.user);
    }

    if (context?.level) {
      scope.setLevel(context.level);
    }

    if (context?.fingerprint) {
      scope.setFingerprint(context.fingerprint);
    }

    return _sentry!.captureException(error) as unknown as string;
  }) as unknown as string | undefined;
}

/**
 * Captures a message and reports it to Sentry.
 *
 * @param message - The message to report
 * @param level - Severity level (defaults to 'info')
 */
export function captureMessage(
  message: string,
  level: SeverityLevel = 'info'
): string | undefined {
  if (!ensureInitialized() || !_sentry) return undefined;

  return _sentry.captureMessage(message, level) as unknown as string | undefined;
}

/**
 * Sets the user context for all subsequent Sentry events.
 * Pass null to clear user context.
 *
 * @param user - The user to associate with events, or null to clear
 */
export function setUser(user: SentryUser | null): void {
  if (!ensureInitialized() || !_sentry) return;

  _sentry.setUser(user);
}

/**
 * Adds a breadcrumb to the current Sentry scope.
 * Breadcrumbs are used to track navigation, user actions, and other
 * contextual events leading up to an error.
 *
 * @param breadcrumb - The breadcrumb data to add
 */
export function addBreadcrumb(breadcrumb: SentryBreadcrumb): void {
  if (!ensureInitialized() || !_sentry) return;

  _sentry.addBreadcrumb({
    timestamp: Date.now() / 1000,
    ...breadcrumb,
  });
}

/**
 * Starts a performance monitoring transaction.
 *
 * @param name - Human-readable transaction name (e.g., "POST /api/tasks")
 * @param op - Operation type (e.g., "http.server", "db.query", "task.process")
 * @returns A transaction object with finish(), setStatus(), setData(), and startChild() methods
 */
export function startTransaction(
  name: string,
  op: string
): SentryTransaction {
  const noopTransaction: SentryTransaction = {
    finish: () => {},
    setStatus: () => {},
    setData: () => {},
    startChild: () => noopTransaction,
  };

  if (!ensureInitialized() || !_sentry) return noopTransaction;

  try {
    return _sentry.startSpan(
      { name, op },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (span: any) => {
        const transaction: SentryTransaction = {
          finish: () => span?.end(),
          setStatus: (status: string) => span?.setStatus({ code: status === 'ok' ? 1 : 2, message: status }),
          setData: (key: string, value: unknown) => span?.setAttribute(key, value as string),
          startChild: (childOp) => {
            const childSpan = _sentry?.startInactiveSpan({
              name: childOp.description ?? childOp.op,
              op: childOp.op,
            });
            return {
              finish: () => childSpan?.end(),
              setStatus: (status: string) => childSpan?.setStatus({ code: status === 'ok' ? 1 : 2, message: status }),
              setData: (key: string, value: unknown) => childSpan?.setAttribute(key, value as string),
              startChild: () => noopTransaction,
            };
          },
        };
        return transaction;
      }
    ) as SentryTransaction;
  } catch {
    return noopTransaction;
  }
}

/**
 * Sets a tag on the current Sentry scope.
 *
 * @param key - Tag name
 * @param value - Tag value
 */
export function setTag(key: string, value: string): void {
  if (!ensureInitialized() || !_sentry) return;

  _sentry.setTag(key, value);
}

/**
 * Sets extra context data on the current Sentry scope.
 *
 * @param key - Context key
 * @param value - Context value
 */
export function setExtra(key: string, value: unknown): void {
  if (!ensureInitialized() || !_sentry) return;

  _sentry.setExtra(key, value);
}

/**
 * Flushes the Sentry event queue. Useful before serverless function shutdown.
 *
 * @param timeout - Maximum time in ms to wait for flush (default: 2000)
 */
export async function flush(timeout = 2000): Promise<boolean> {
  if (!ensureInitialized() || !_sentry) return true;

  try {
    return await _sentry.flush(timeout);
  } catch {
    return false;
  }
}

/**
 * Returns whether Sentry is currently initialized and active.
 */
export function isEnabled(): boolean {
  return _isEnabled;
}
