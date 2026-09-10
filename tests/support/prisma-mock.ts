/**
 * P-35 — the typed replacement for `prisma as any` in a mocked test.
 *
 * ============================================================================
 * WHAT THIS IS FOR
 * ============================================================================
 *
 * 203 test files call `jest.mock('@/lib/db')`. P-28 wrote the sentence that
 * explains why that matters:
 *
 *     A mocked delegate returns whatever the test told it to, so a mocked
 *     `prisma.attentionEvent.findMany` PROVES THE OPPOSITE of what is true in
 *     production: it proves the delegate exists.
 *
 * A mock is a claim about an interface. `any` is what stops anyone checking the
 * claim, and ten phantom-delegate bugs passed 5,000 green tests behind exactly
 * that. `const mockPrisma = prisma as any` deletes the only check the compiler
 * could have made here.
 *
 * ============================================================================
 * WHY NOT JUST `jest.mocked(prisma)`
 * ============================================================================
 *
 * `jest.mocked` was tried first and it is genuinely stronger: it types
 * `mockResolvedValue` against the delegate's real return type. It was not kept,
 * and the reason is worth recording rather than rediscovering.
 *
 * Applied to `tests/unit/analytics/bias-detection.test.ts` it produced:
 *
 *     Type '{ id: string; name: string; userId: string; }' is missing the
 *     following properties from type Entity: type, complianceProfile,
 *     brandKit, voicePersonaId, and 3 more
 *
 * That is not a bug report. It is the compiler observing that the fixture
 * supplies the three fields the service reads and not the seven it ignores,
 * which is ordinary and correct test practice. Adopting it would mean
 * rewriting the row fixtures of ~145 suites — feeding the code under test
 * values it was not being fed before — and this is a lint package that may not
 * change what a test exercises.
 *
 * ============================================================================
 * SO THIS SPLITS THE TWO CLAIMS A MOCK MAKES
 * ============================================================================
 *
 *   1. "this delegate and this method exist on the real client"  <- CHECKED
 *   2. "a row looks like this"                                   <- not checked
 *
 * (1) is the phantom-delegate defect class, and it is checked here against the
 * REAL `Db` type, so `prisma.attentionEvent` and `prisma.entity.findUniqe` are
 * both compile errors in a mocked test — which is what `as any` was hiding.
 * (2) is fixture completeness, a different and much larger question, and it is
 * left exactly where it was. Nothing here is looser than the `as any` it
 * replaces; it is strictly tighter, on the axis where the bugs were.
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 *   jest.mock('@/lib/db', () => ({ prisma: { entity: { findUnique: jest.fn() } } }));
 *
 *   import { prisma as prismaImpl } from '@/lib/db';
 *   import { asMockedPrisma } from '../../support/prisma-mock';
 *
 *   const prisma = asMockedPrisma(prismaImpl);
 *   prisma.entity.findUnique.mockResolvedValue({ id: 'e1', userId: 'u1' });
 *
 * The cast inside is the ONE place in the repository that asserts a mocked
 * client is a bag of mocks, it is named, and `grep -rn asMockedPrisma tests`
 * finds every test relying on it.
 */

import type { Db } from '@/lib/db';

/**
 * The client's model delegates, without `$connect` / `$transaction` / etc.
 *
 * The `$` methods are not delegates and mapping over them would produce
 * nonsense (`{ [M in keyof someFunction]: ... }` walks `call`, `apply`,
 * `bind`), so they are excluded rather than mangled. A test that needs
 * `prisma.$transaction` should reach for the real import.
 */
type DelegateName = Exclude<keyof Db, `$${string}`>;

/**
 * `Db` with every delegate method replaced by a jest mock.
 *
 * The KEYS come from `Db`, which is what does the work: the set of delegates
 * and the set of methods on each are the real ones, read off the generated
 * client. Only the method SIGNATURES are widened, so a partial row fixture
 * still passes.
 */
export type MockedPrisma = {
  [K in DelegateName]: { [M in keyof Db[K]]: jest.Mock };
};

/** See the file header. The one named cast, in the one place. */
export function asMockedPrisma(client: Db): MockedPrisma {
  return client as unknown as MockedPrisma;
}

/**
 * An annotation for a hand-built mock client -- the `const mockPrisma = { rule:
 * {...} }` literal that ~40 suites hand to `jest.mock('@/lib/db', ...)`.
 *
 * `asMockedPrisma` cannot help those: they never touch the real client at all,
 * so nothing about them was ever checked, with or without `any`. This type
 * gives them the same check for the cost of one annotation:
 *
 *   const mockPrisma: MockedDelegates<'rule' | 'actionLog'> = {
 *     rule: { create: jest.fn(), findMany: jest.fn() },
 *     actionLog: { create: jest.fn() },
 *   };
 *
 * The delegate names are constrained to real delegates, and each delegate's
 * method names are constrained to that delegate's real methods -- `Partial`,
 * because a mock legitimately stubs only the handful of methods the code under
 * test calls, and object-literal excess-property checking still rejects a name
 * that is not a method at all. `prisma.attentionEvent` and
 * `prisma.rule.findUniqe` are both compile errors.
 */
export type MockedDelegates<K extends DelegateName> = {
  [D in K]: Partial<{ [M in keyof Db[D]]: jest.Mock }>;
};
