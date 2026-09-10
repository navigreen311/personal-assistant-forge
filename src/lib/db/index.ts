import { PrismaClient } from '@prisma/client';
import {
  instrumentDelegateAccess,
  observabilityExtension,
} from '@/lib/observability/prisma-instrumentation';

/**
 * P-28 (T-013/T-025): the client is instrumented here, at the single place the
 * whole platform imports its database from.
 *
 * Ten confirmed bugs in this codebase are the same bug: a query fails, a bare
 * `catch` swallows it, a hardcoded default is returned with a 200. There are
 * 553 bare catches in `src` and 337 route files, so editing the catches was
 * never the lever. This is: every query the platform makes passes through this
 * object, so counting failures here counts all of them, and not one route has
 * to cooperate.
 *
 * Behaviour is unchanged in both directions. `observabilityExtension` rethrows
 * the original error unmodified; `instrumentDelegateAccess` returns the same
 * `undefined` for an unknown property that the bare client returns. See
 * `src/lib/observability/prisma-instrumentation.ts` for why there are two
 * mechanisms and what each one cannot see.
 *
 * ---------------------------------------------------------------------------
 * WHY THE EXPORTED TYPE IS INFERRED AND NOT `PrismaClient`
 * ---------------------------------------------------------------------------
 *
 * `$extends` returns `DynamicClientExtensionThis`, which carries every model
 * delegate and every `$` method but is not assignable to `PrismaClient` --
 * `tsc` reports exactly one missing member, `$on`. The obvious fix is
 * `as unknown as PrismaClient`, and it was written that way first.
 *
 * It is not written that way now. A double cast is `as any` with more
 * keystrokes: it asserts a shape the value provably does not have, and P-19
 * removed 173 `any`s from this repository after finding ten real bugs behind
 * them. Here the assertion would be false in a specific, checkable way -- the
 * result has no `$on` -- and a future caller reaching for `prisma.$on` would
 * get a clean compile and a TypeError at runtime, which is the exact failure
 * mode of the ten bugs this file is being changed to detect.
 *
 * So the type is inferred instead, and `grep -rn '\$on\b' src tests scripts`
 * returns nothing, which is what makes that safe rather than merely convenient.
 * Every other member the platform uses is present and still fully checked.
 */
function createClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

  return instrumentDelegateAccess(base.$extends(observabilityExtension));
}

/** The instrumented client's type, for anything that needs to name it. */
export type Db = ReturnType<typeof createClient>;

const globalForPrisma = globalThis as unknown as { prisma?: Db };

export const prisma: Db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
