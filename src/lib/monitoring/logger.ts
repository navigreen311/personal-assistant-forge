/**
 * Structured Logging Utility
 *
 * Provides JSON-structured logging with automatic Sentry integration
 * for error and warning levels. Each log entry includes timestamp,
 * level, module, and optional requestId for tracing.
 */

import { captureException, captureMessage, addBreadcrumb } from './sentry';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type LogMeta = {
  module?: string;
  requestId?: string;
  userId?: string;
  [key: string]: unknown;
};

type LogEntry = {
  timestamp: string;
  level: LogLevel;
  message: string;
  module: string;
  requestId?: string;
  meta?: Record<string, unknown>;
};

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

/**
 * Resolves the minimum log level from environment variable.
 * Defaults to 'debug' in development, 'info' in production.
 */
function getMinLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
  if (envLevel && envLevel in LOG_LEVEL_PRIORITY) {
    return envLevel;
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

/**
 * Formats a structured log entry as a JSON string.
 */
function formatEntry(entry: LogEntry): string {
  return JSON.stringify(entry);
}

/**
 * Extracts module and requestId from meta, returning remaining fields separately.
 */
function extractMeta(meta?: LogMeta): {
  module: string;
  requestId?: string;
  rest: Record<string, unknown>;
} {
  if (!meta) {
    return { module: 'app', rest: {} };
  }

  const { module: mod, requestId, ...rest } = meta;
  return {
    module: mod ?? 'app',
    requestId,
    rest,
  };
}

/**
 * Core log function. Writes structured JSON to stdout/stderr and
 * forwards error/warn/fatal levels to Sentry.
 */
function log(level: LogLevel, message: string, meta?: LogMeta): void {
  const minLevel = getMinLogLevel();

  if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[minLevel]) {
    return;
  }

  const { module: mod, requestId, rest } = extractMeta(meta);
  const hasRestMeta = Object.keys(rest).length > 0;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    module: mod,
    ...(requestId && { requestId }),
    ...(hasRestMeta && { meta: rest }),
  };

  const formatted = formatEntry(entry);

  // Write to appropriate stream
  if (level === 'error' || level === 'fatal') {
    process.stderr.write(formatted + '\n');
  } else {
    process.stdout.write(formatted + '\n');
  }

  // Forward to Sentry based on level
  if (level === 'fatal' || level === 'error') {
    captureException(new Error(message), {
      level: level === 'fatal' ? 'fatal' : 'error',
      tags: {
        module: mod,
        ...(requestId && { requestId }),
      },
      extra: hasRestMeta ? rest : undefined,
    });
  } else if (level === 'warn') {
    captureMessage(`[${mod}] ${message}`, 'warning');
    addBreadcrumb({
      category: mod,
      message,
      level: 'warning',
      data: hasRestMeta ? rest : undefined,
    });
  } else if (level === 'info') {
    addBreadcrumb({
      category: mod,
      message,
      level: 'info',
      data: hasRestMeta ? rest : undefined,
    });
  }
}

/**
 * Structured logger interface.
 *
 * Usage:
 * ```ts
 * import { logger } from '@/lib/monitoring';
 *
 * logger.info('User signed in', { module: 'auth', userId: '123' });
 * logger.error('Payment failed', { module: 'billing', requestId: 'req_abc', amount: 99 });
 * ```
 */
export const logger = {
  /**
   * Debug-level log. Only emitted when LOG_LEVEL=debug (default in development).
   * Not forwarded to Sentry.
   */
  debug(message: string, meta?: LogMeta): void {
    log('debug', message, meta);
  },

  /**
   * Informational log. Added as a Sentry breadcrumb for error context.
   */
  info(message: string, meta?: LogMeta): void {
    log('info', message, meta);
  },

  /**
   * Warning log. Reported to Sentry as a message with 'warning' severity
   * and added as a breadcrumb.
   */
  warn(message: string, meta?: LogMeta): void {
    log('warn', message, meta);
  },

  /**
   * Error log. Reported to Sentry as a captured exception.
   */
  error(message: string, meta?: LogMeta): void {
    log('error', message, meta);
  },

  /**
   * Fatal log. Reported to Sentry as a captured exception with 'fatal' severity.
   * Use for unrecoverable errors that require immediate attention.
   */
  fatal(message: string, meta?: LogMeta): void {
    log('fatal', message, meta);
  },

  /**
   * Creates a child logger with preset meta fields.
   * Useful for module-scoped logging where you don't want to repeat the module name.
   *
   * Usage:
   * ```ts
   * const log = logger.child({ module: 'auth', requestId: req.id });
   * log.info('Processing login');
   * log.error('Login failed', { reason: 'invalid_password' });
   * ```
   */
  child(defaultMeta: LogMeta) {
    return {
      debug: (message: string, meta?: LogMeta) =>
        log('debug', message, { ...defaultMeta, ...meta }),
      info: (message: string, meta?: LogMeta) =>
        log('info', message, { ...defaultMeta, ...meta }),
      warn: (message: string, meta?: LogMeta) =>
        log('warn', message, { ...defaultMeta, ...meta }),
      error: (message: string, meta?: LogMeta) =>
        log('error', message, { ...defaultMeta, ...meta }),
      fatal: (message: string, meta?: LogMeta) =>
        log('fatal', message, { ...defaultMeta, ...meta }),
    };
  },
} as const;
