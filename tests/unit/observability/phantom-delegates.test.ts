/**
 * P-28 (T-013) — the check that would have caught `/api/attention/insights`,
 * before merge, with no database, no traffic and no vendor account.
 *
 * ============================================================================
 * THE BUG, AND WHY NOTHING CAUGHT IT
 * ============================================================================
 *
 * Ten confirmed bugs in this codebase are one bug wearing ten hats. A route
 * queries a Prisma model that does not exist in `schema.prisma`:
 *
 *     const events = await prisma.attentionEvent.findMany({ ... });
 *
 * `prisma.attentionEvent` is `undefined`, so `.findMany` is a TypeError, so a
 * bare `catch` swallows it, so the route returns its hardcoded default with a
 * 200. `/api/attention/insights` served every user an attention score of
 * exactly 100 (`100 - 0 + 0`) for months. `/api/ai-quality/stats` served a
 * hardcoded B+/88. `/api/health/dashboard` served invented vitals.
 *
 * Four things that exist in this repository failed to notice, and it is worth
 * being specific about why, because it is the argument for this file:
 *
 *   - `tsc --noEmit` passes at zero errors. It passed then too. A property read
 *     off `PrismaClient` for a name that is not a delegate is an error TS would
 *     catch — but 173 `as any` casts stood between the client and the type
 *     checker, and P-19 found ten bugs when it removed them.
 *   - `npx eslint src` reports zero errors. No lint rule knows what a Prisma
 *     schema contains.
 *   - The unit suite is 5,346 tests, and 186 of its 320 files call
 *     `jest.mock('@/lib/db')`. A mocked delegate returns whatever the test told
 *     it to, so a mocked `prisma.attentionEvent.findMany` PROVES THE OPPOSITE
 *     of what is true in production: it proves the delegate exists.
 *   - The real-database suite would catch it, but only for a route someone
 *     wrote a case for.
 *
 * ============================================================================
 * WHAT THIS DOES INSTEAD
 * ============================================================================
 *
 * It reads the delegate names the generated client actually has, out of the
 * DMMF — the schema's own model list, so it is right today and right after the
 * next migration with nothing to keep in step. Then it reads every `prisma.X`
 * in `src` off the filesystem and asserts X is one of them.
 *
 * It needs no database, no Redis, no HTTP and no fixtures, it runs in the
 * default `npm test` lane on every pull request, and it cannot be defeated by
 * mocking `@/lib/db`, because it never imports it. It is a comparison between
 * two files on disk.
 *
 * A route added tomorrow is covered tomorrow, and a route nobody wrote a test
 * for is covered anyway. That is the property the 149 unscoped routes and the
 * ten phantom delegates both needed and neither had.
 *
 * ============================================================================
 * WHAT IT CANNOT SEE
 * ============================================================================
 *
 * A delegate reached by a computed name — `prisma[model]`, which
 * `bulkUpsert` in `src/lib/db/helpers.ts` really does — is invisible to a
 * regex. That case is covered at runtime instead, by the proxy in
 * `src/lib/observability/prisma-instrumentation.ts`. Neither half subsumes the
 * other, which is why there are two.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Prisma } from '@prisma/client';
import { knownDelegateNames } from '@/lib/observability/prisma-instrumentation';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const SRC_ROOT = join(REPO_ROOT, 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

/**
 * Remove comments AND string literals before matching.
 *
 * `tests/helpers/routes.ts` records the same lesson for the same reason and it
 * is worth restating: this codebase documents its bugs in prose, inside the
 * files that had them. Matching over raw source would find `prisma.attentionEvent`
 * in the comment that explains that `prisma.attentionEvent` was removed.
 *
 * Strings matter too, and not hypothetically: the first run of this scan
 * flagged exactly one name, `update`, and its only occurrence was inside the
 * jest title `'rejects when prisma.update throws'` in
 * `src/lib/shadow/voice/__tests__/sentiment-storage.test.ts`. A check whose
 * only finding is a test title is a check people turn off.
 */
export function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}

/** Every `prisma.X` and `tx.X` in a file, with the line it is on. */
function delegateReferences(code: string): { name: string; line: number }[] {
  const found: { name: string; line: number }[] = [];
  const lines = code.split('\n');
  lines.forEach((text, index) => {
    for (const match of text.matchAll(/\b(?:prisma|tx)\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g)) {
      found.push({ name: match[1], line: index + 1 });
    }
  });
  return found;
}

describe('P-28: no route may query a Prisma model that does not exist', () => {
  const delegates = knownDelegateNames();

  it('reads the delegate list from the schema, not from a hand-written list', () => {
    // If this ever reads zero, every assertion below passes vacuously and the
    // check has silently stopped checking — the exact failure mode of a green
    // suite over a broken control that this platform has seen repeatedly.
    expect(delegates.size).toBe(Prisma.dmmf.datamodel.models.length);
    expect(delegates.size).toBeGreaterThan(50);
    expect(delegates.has('user')).toBe(true);
    expect(delegates.has('entity')).toBe(true);
  });

  it('derives delegate names the way Prisma does', () => {
    for (const model of Prisma.dmmf.datamodel.models) {
      const expected = model.name.charAt(0).toLowerCase() + model.name.slice(1);
      expect(delegates.has(expected)).toBe(true);
    }
  });

  it('finds every `prisma.X` in src and X is a real model or a client method', () => {
    const files = walk(SRC_ROOT);
    // Guards against a refactor that moves `src` and turns this into a no-op.
    expect(files.length).toBeGreaterThan(500);

    const offences: string[] = [];
    let referencesChecked = 0;

    for (const file of files) {
      const code = stripCommentsAndStrings(readFileSync(file, 'utf8'));
      for (const { name, line } of delegateReferences(code)) {
        // `$queryRaw`, `$transaction`, `$connect`, ... are client methods, not
        // model delegates, and are checked by `tsc` like any other method.
        if (name.startsWith('$')) continue;
        referencesChecked += 1;
        if (!delegates.has(name)) {
          offences.push(
            `${relative(REPO_ROOT, file).replace(/\\/g, '/')}:${line} — prisma.${name} ` +
              `is not a model in schema.prisma`
          );
        }
      }
    }

    // The scan must actually be scanning. Without this, deleting the regex
    // would leave a passing test.
    expect(referencesChecked).toBeGreaterThan(200);

    expect(offences).toEqual([]);
  });

  it('would flag a phantom delegate — the scan is not vacuous', () => {
    // The mutation this file exists to catch, run against the scanner itself
    // rather than against the tree. If the ten historical bugs were restored,
    // each would produce one of these lines.
    const source = `
      import { prisma } from '@/lib/db';
      // prisma.attentionEvent was removed and this comment mentions it
      const label = 'prisma.aiQualityScore in a string';
      const rows = await prisma.attentionEvent.findMany({ where: { userId } });
      const ok = await prisma.user.findMany();
    `;
    const stripped = stripCommentsAndStrings(source);
    const names = delegateReferences(stripped)
      .map((r) => r.name)
      .filter((n) => !delegates.has(n));

    // The comment and the string literal are gone; the real call is caught.
    expect(names).toEqual(['attentionEvent']);
  });
});
