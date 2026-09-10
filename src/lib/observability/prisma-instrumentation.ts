/**
 * P-28 — the check that would have caught `/api/attention/insights`.
 *
 * ============================================================================
 * THE FAILURE THIS EXISTS FOR
 * ============================================================================
 *
 * Over twenty packages this platform accumulated ten confirmed cases of the
 * same bug: a route queries a Prisma table that does not exist, the throw is
 * swallowed by a bare `catch`, and a hardcoded default is returned with a 200.
 * `/api/attention/insights` served every user an attention score of exactly 100
 * (`100 - 0 + 0`) from the day it was written. `/api/ai-quality/stats` served a
 * B+/88. `/api/health/dashboard` served invented vitals.
 *
 * Every one of them was found by a human reading code. None was found by a
 * test, because a test that mocks Prisma gets whatever the test told it to
 * return, and 186 of 320 test files mock Prisma. And none produced an alert,
 * because there was nowhere for an error to go.
 *
 * The thing they all have in common is not the swallowed catch and not the
 * hardcoded default. It is that A DATABASE QUERY FAILED AND NOBODY COUNTED IT.
 * That is the observable, it is observable at a single choke point, and
 * counting it does not require the 553 `catch` blocks in `src` to be edited or
 * even to cooperate. A route can swallow its exception as thoroughly as it
 * likes; the throw passed through here first.
 *
 * ============================================================================
 * TWO MECHANISMS, BECAUSE THERE ARE TWO SHAPES OF THE BUG
 * ============================================================================
 *
 * 1. THE MODEL EXISTS IN THE CLIENT BUT THE QUERY FAILS — a dropped table, a
 *    renamed column, an unmigrated database, a bad filter. Prisma throws.
 *    Caught by the `$extends` query hook below and counted as
 *    `prisma:<model>.<operation>`.
 *
 * 2. THE MODEL DOES NOT EXIST IN THE CLIENT AT ALL — `prisma.attentionEvent`
 *    where `schema.prisma` has no `AttentionEvent`. This is the shape that
 *    produced the ten. Prisma never sees it: the property read returns
 *    `undefined` and the failure is a plain JavaScript TypeError on
 *    `undefined.findMany`. A query extension cannot help, because no query was
 *    ever made. Caught by the `get` proxy below and counted as
 *    `phantom-delegate:<name>`.
 *
 * The second is also caught statically, before merge, by
 * `tests/unit/observability/phantom-delegates.test.ts`, which scans `src` and
 * fails CI on a delegate name that is not in the schema. The static check is
 * the better one — it runs on every PR and needs no traffic — and this runtime
 * half exists for what it cannot see: a delegate named by a computed string,
 * and a schema that drifts from the deployed database after the code merged.
 *
 * ============================================================================
 * WHAT IT DOES NOT DO
 * ============================================================================
 *
 * It does not change behaviour. The query hook rethrows the original error
 * unmodified; the proxy returns the same `undefined` the bare client returned.
 * A route that swallows and defaults still swallows and defaults, and every one
 * of the 5,346 existing tests still describes the same system. The only
 * difference is that a number moved.
 *
 * It does not record query ARGUMENTS. Arguments contain tenant data, and this
 * platform has spent eleven packages proving one tenant cannot read another's.
 * Model name, operation name and error code are enough to identify all ten
 * historical bugs and carry nobody's data.
 *
 * It does not attribute a failure to a ROUTE. Doing that needs a request-scoped
 * context installed at the boundary, and the boundary — `withAuth` in
 * `src/shared/middleware/auth.ts` — is frozen for this package. `model.operation`
 * is sufficient here because each of the ten phantom models was referenced by
 * exactly one route, but it is a real limit and it is stated in
 * docs/observability.md rather than papered over.
 */

import { Prisma } from '@prisma/client';
import { report } from './report';

/**
 * Prisma error codes that mean "the application asked for something reasonable
 * and the answer was no", as opposed to "this code is wrong".
 *
 * This distinction is the difference between a metric an operator watches and
 * a metric they learn to ignore. A unique-constraint violation is the normal
 * outcome of a race that `src/lib/shadow/vaf-config.ts` catches deliberately;
 * a "table does not exist" is never normal. Both are recorded — suppressing
 * either would be the swallowing this package exists to end — but only the
 * second is counted at `error` severity, so an alert threshold on the error
 * rate is not permanently pinned above zero by ordinary application behaviour.
 */
const EXPECTED_ERROR_CODES = new Set([
  'P2002', // unique constraint violation — upsert races, duplicate submits
  'P2025', // record required but not found — update/delete of a deleted row
]);

/**
 * Codes that mean the code and the database disagree about what exists.
 *
 * This is the `/api/attention/insights` set. Anything here is a schema-drift
 * signal and is reported at `fatal`, because unlike an ordinary query failure
 * it cannot be transient: it will fail identically on every request until
 * somebody changes the code or the schema.
 */
const SCHEMA_DRIFT_CODES = new Set([
  'P2021', // table does not exist in the current database
  'P2022', // column does not exist in the current database
]);

/**
 * The code to group this failure by.
 *
 * `instanceof` first, then a plain `code` property. The fallback is not
 * belt-and-braces: `instanceof` compares against the constructor from THIS
 * module's copy of `@prisma/client`, and an error raised by a differently
 * resolved copy -- a second client in a test, a hoisted duplicate in a
 * workspace install -- fails that check while still carrying a perfectly good
 * `P2021`. Losing the code would silently downgrade a schema fault to an
 * ungraded `error`, which is exactly the kind of quiet degradation of a control
 * this package exists to stop.
 *
 * It also picks up Node's own codes (`ECONNREFUSED`, `ETIMEDOUT`) off a
 * connection failure, which is a strictly better fingerprint than none.
 */
function errorCodeOf(err: unknown): string | undefined {
  if (err instanceof Prisma.PrismaClientKnownRequestError) return err.code;
  if (err instanceof Prisma.PrismaClientValidationError) return 'VALIDATION';
  if (err instanceof Prisma.PrismaClientInitializationError) return err.errorCode ?? 'INIT';
  if (err && typeof err === 'object') {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string' && code.length > 0 && code.length <= 32) return code;
  }
  return undefined;
}

function severityFor(code: string | undefined): 'warning' | 'error' | 'fatal' {
  if (code && SCHEMA_DRIFT_CODES.has(code)) return 'fatal';
  if (code && EXPECTED_ERROR_CODES.has(code)) return 'warning';
  // A validation error means the query names a field the schema does not have.
  // Same family as a phantom delegate, one level down, and equally permanent.
  if (code === 'VALIDATION') return 'fatal';
  return 'error';
}

/**
 * The query extension. Counts every Prisma failure, then rethrows it unchanged.
 *
 * `$allOperations` at the top level of `query` covers model operations and
 * client-level raw operations (`$queryRaw`, `$executeRaw`), where `model` is
 * undefined. Nine raw call sites in `src` are therefore covered too.
 */
/**
 * The extension's arguments, exported separately from the extension itself.
 *
 * `Prisma.defineExtension` returns an opaque callback -- `(client) =>
 * client.$extends(args)` -- so the object below is the only inspectable form.
 * A unit test can therefore assert that the hook is attached to
 * `$allOperations`, the key that also covers `$queryRaw` and `$executeRaw`,
 * rather than to a per-model list a new model could silently fall off.
 */
export const observabilityExtensionArgs = {
  name: 'paf-observability',
  query: {
    async $allOperations({
      model,
      operation,
      args,
      query,
    }: {
      model?: string;
      operation: string;
      args: unknown;
      query: (args: unknown) => Promise<unknown>;
    }): Promise<unknown> {
      try {
        return await query(args);
      } catch (err) {
        const code = errorCodeOf(err);
        const target = model ? `${model}.${operation}` : operation;
        report({
          kind: 'prisma_query_error',
          severity: severityFor(code),
          message: err instanceof Error ? err.message : String(err),
          // Low cardinality by construction: one row per (model, operation,
          // code) triple, of which there are at most a few hundred possible.
          fingerprint: `prisma:${target}${code ? `:${code}` : ''}`,
          context: {
            model: model ?? null,
            operation,
            prismaCode: code ?? null,
            // NOT `args`. See the header.
          },
          ...(err instanceof Error && err.stack ? { stack: err.stack } : {}),
        });
        throw err;
      }
    },
  },
} as const;

export const observabilityExtension = Prisma.defineExtension(observabilityExtensionArgs);

/**
 * Property names that are read off objects by tooling rather than by
 * application code, and must never be mistaken for a model delegate.
 *
 * `then` is the important one: any `await`, `Promise.resolve` or
 * `.then`-chaining on the client reads it, and reporting that as a phantom
 * delegate would fire on perfectly ordinary code. The rest are the jest, React
 * and Node inspection probes that touch a value the moment it appears in an
 * assertion or a console.
 *
 * Names beginning with `$`, `_` or an uppercase letter never reach this set —
 * `DELEGATE_NAME_PATTERN` excludes them, which covers `$$typeof`, `__esModule`,
 * every Prisma `$` method and every constructor reference.
 */
const PROBE_NAMES = new Set([
  'then', 'catch', 'finally', 'toJSON', 'toString', 'valueOf', 'inspect',
  'constructor', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
  'toLocaleString', 'asymmetricMatch', 'nodeType', 'tagName', 'prototype',
  'name', 'length', 'caller', 'callee', 'arguments', 'default', 'type',
  'props', 'key', 'ref', 'displayName', 'render', 'mock', 'calls', 'jest',
  'stack', 'message', 'code', 'data', 'value', 'raw', 'sql', 'client',
]);

/** A plausible Prisma delegate: camelCase, starts lowercase, three chars or more. */
const DELEGATE_NAME_PATTERN = /^[a-z][A-Za-z0-9]{2,}$/;

/**
 * Model delegate names the generated client actually exposes.
 *
 * Read from the DMMF rather than hand-listed, so it is right for whatever
 * `schema.prisma` says today and stays right when a model is added. Prisma
 * derives a delegate name by lowercasing the first character of the model name
 * and nothing else.
 */
export function knownDelegateNames(): Set<string> {
  const names = new Set<string>();
  for (const model of Prisma.dmmf.datamodel.models) {
    names.add(model.name.charAt(0).toLowerCase() + model.name.slice(1));
  }
  return names;
}

/**
 * Should reading `prop` off the Prisma client and getting `undefined` be
 * reported as a phantom delegate?
 *
 * Exported for the test that pins the probe behaviour: a false positive here
 * is a counter row that makes an operator chase a bug that does not exist,
 * which is the "metric nobody will look at" failure in miniature.
 */
export function looksLikePhantomDelegate(prop: string): boolean {
  if (PROBE_NAMES.has(prop)) return false;
  return DELEGATE_NAME_PATTERN.test(prop);
}

/**
 * Wrap a client so that reading a non-existent delegate is reported.
 *
 * Returns `undefined` for the unknown property exactly as the unwrapped client
 * does, so the caller's subsequent TypeError is the same TypeError it always
 * was. The report is a side effect and nothing more.
 *
 * Two details that are not decoration:
 *
 *   - `Reflect.get(target, prop, target)` passes the TARGET as the receiver,
 *     not the proxy. Prisma's delegates are lazy getters; resolving them
 *     against the proxy would re-enter this trap on every internal property
 *     read the getter performs.
 *   - client methods are returned `.bind(target)`. Called as `proxy.$transaction()`
 *     the method's `this` would otherwise be the proxy, and a private class
 *     field (`this.#x`) does NOT pass through a Proxy — it throws. Binding
 *     removes that entire class of hazard rather than betting on Prisma's
 *     internals never using one. The bound functions are cached so that
 *     `proxy.$transaction === proxy.$transaction`.
 */
export function instrumentDelegateAccess<T extends object>(client: T): T {
  const boundMethods = new Map<string, unknown>();
  const reported = new Set<string>();

  return new Proxy(client, {
    get(target, prop) {
      if (typeof prop !== 'string') {
        return Reflect.get(target, prop, target);
      }

      const cached = boundMethods.get(prop);
      if (cached !== undefined) return cached;

      const value: unknown = Reflect.get(target, prop, target);

      if (value === undefined) {
        // Report each distinct name once per client, not once per access. The
        // recorder would deduplicate by fingerprint anyway, but a route hit a
        // thousand times a minute would otherwise pay for a `report` call a
        // thousand times a minute for a fact that never changes.
        if (!reported.has(prop) && looksLikePhantomDelegate(prop)) {
          reported.add(prop);
          report({
            kind: 'phantom_delegate',
            severity: 'fatal',
            message:
              `prisma.${prop} is not a model in schema.prisma. Every call through it ` +
              `throws a TypeError, which a bare catch will turn into a default response.`,
            fingerprint: `phantom-delegate:${prop}`,
            context: { delegate: prop },
          });
        }
        return undefined;
      }

      if (typeof value === 'function') {
        const bound = (value as (...args: unknown[]) => unknown).bind(target);
        boundMethods.set(prop, bound);
        return bound;
      }

      return value;
    },
  });
}
