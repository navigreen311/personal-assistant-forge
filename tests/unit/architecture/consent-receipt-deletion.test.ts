/**
 * P-44 — ONE FILE IN `src/` MAY DELETE A CONSENT RECEIPT, AND IT IS NOT A
 * SESSION-DELETE PATH.
 *
 * ===========================================================================
 * WHY THIS GATE EXISTS RATHER THAN A LINT RULE
 * ===========================================================================
 *
 * The natural instrument is `no-restricted-syntax` in `eslint.config.mjs`, which
 * is exactly how P-17 gave `ShadowMessage` and `ShadowConsentReceipt` one
 * permitted WRITER each. It cannot be used for the deletion side, and the reason
 * is P-39's and P-41's recorded lesson about that file: flat config merges by
 * RULE NAME, P-17's block already sets `no-restricted-syntax` over
 * `src/**\/*.ts`, and any later block setting the same rule name over a glob
 * that overlaps would REPLACE P-17's two selectors for every file in the
 * intersection — silently, with a green lint run. There is no glob for
 * `src/modules/shadow/**` that does not overlap `src/**`, so adding the rule
 * there would have traded this guard for the one that keeps every transcript
 * going through redaction. `tests/unit/shadow/session-manager.test.ts` asserts
 * the P-17 selectors still fire by exercising the writer; this file is the
 * deletion half, built where it cannot take anything else down with it.
 *
 * ===========================================================================
 * THE DISTINCTION THIS FILE PROTECTS, WHICH IS THE ONE THAT GOT CONFUSED
 * ===========================================================================
 *
 * A consent receipt may be deleted by ONE clock: its own.
 * `shadow/compliance/retention.ts` buckets receipts on `executedAt` against
 * `consentReceiptsDays` (2555 — seven years) and removes them when that expires.
 * That is correct, it is the whole point of P-17's work, and this test asserts
 * it is still there rather than merely permitting it.
 *
 * A consent receipt may NOT be deleted because the session it pointed at was
 * deleted. That is the bug P-44 fixed, and what made it expensive is that the
 * two are the same Prisma call one line apart in files a directory apart:
 *
 *     retention.ts:460   deleteMany({ where: { executedAt: { lt: ... } } })   ok
 *     session-store.ts   deleteMany({ where: { sessionId } })                 BUG
 *
 * P-17 removed the second from `gdpr-export.ts` and from `retention.ts`'s own
 * session sweep and could not see the copy in `interfaces/`, which was reachable
 * from `DELETE /api/shadow/conversations/[id]` — the interactive "delete this
 * conversation" button — for every day between.
 *
 * BOTH DIRECTIONS ARE ASSERTED, for the reason P-36's `KNOWN_ORPHANS` and P-38's
 * `KNOWN_DEAD` both are: a test that only forbids passes trivially the day
 * somebody deletes the legitimate caller, and a seven-year retention clock that
 * quietly stopped running is a compliance failure that looks like nothing.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const SRC = join(REPO_ROOT, 'src');

/** The one file permitted to delete a consent receipt, on the receipt's own clock. */
const RETENTION_FILE = 'src/modules/shadow/compliance/retention.ts';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return name.endsWith('.ts') || name.endsWith('.tsx') ? [full] : [];
  });
}

/**
 * Strip line and block comments.
 *
 * Load-bearing, not tidiness: every file P-44 touched now explains the banned
 * call IN A COMMENT, quoting `prisma.shadowConsentReceipt.deleteMany(...)`
 * verbatim so the next reader knows what used to be there. A grep over raw text
 * would report five violations, all of them prose, and the honest response to
 * that would be to delete the explanations.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const files = walk(SRC).map((file) => ({
  rel: relative(REPO_ROOT, file).split(sep).join('/'),
  code: stripComments(readFileSync(file, 'utf8')),
}));

/** `prisma.shadowConsentReceipt.deleteMany` / `.delete`, however the client is aliased. */
const DELETES_A_RECEIPT = /\bshadowConsentReceipt\s*\.\s*delete(Many)?\s*\(/;

describe('P-44 — consent receipts are deleted by one clock, in one file', () => {
  it('finds the retention sweep, so the seven-year clock is proved to still exist', () => {
    // The positive control, and it is the half that catches the regression
    // nobody would notice. A receipt must eventually expire: retaining it
    // forever under Article 17(3)(b) is not "retained for regulatory
    // compliance", it is a refusal to erase.
    const retention = files.find((f) => f.rel === RETENTION_FILE);
    expect(retention).toBeDefined();
    expect(DELETES_A_RECEIPT.test(retention!.code)).toBe(true);

    // And that it is aged on the receipt's OWN column, not on a session's
    // lifetime. `executedAt` against `consentReceiptsDays` is the distinction
    // the whole file exists to keep.
    expect(retention!.code).toContain('consentReceiptsDays');
    expect(retention!.code).toMatch(/executedAt:\s*\{\s*lt:/);
  });

  it('finds it NOWHERE ELSE in src/ — the session-delete paths may not', () => {
    const offenders = files.filter(
      (f) => f.rel !== RETENTION_FILE && DELETES_A_RECEIPT.test(f.code)
    );

    // Named in the failure message, because "1 !== 0" would send the next
    // reader hunting. The list was, before P-44:
    //   src/modules/shadow/interfaces/session-store.ts
    expect(offenders.map((f) => f.rel)).toEqual([]);
  });

  it('the scrub is what those paths use instead, and they all use the same one', () => {
    // The other direction again: forbidding the delete is worth nothing if the
    // paths simply stopped touching the receipt, which would leave `reasoning`
    // — the field that quotes the conversation — intact after the user deleted
    // the session. That is the "preserved under a different label" outcome Ivan
    // ruled against, and two routes were doing it.
    // MATCHED IN A `data:` POSITION, not merely mentioned. An earlier draft of
    // this test looked for the identifier anywhere in the file, and it passed
    // against a mutant that removed the spread from all three `updateMany` calls
    // in `history/clear` -- the `import` line still named it, and an unused import
    // is a lint WARNING in this repository, not an error. A guard that a dead
    // import satisfies is the shape P-38 spent a package separating from a real
    // one.
    const APPLIES_THE_SCRUB =
      /data:\s*(?:RECEIPT_CONTENT_SCRUB|\{[^}]*\.\.\.RECEIPT_CONTENT_SCRUB)/;

    const scrubbers = files
      .filter((f) => APPLIES_THE_SCRUB.test(f.code))
      .map((f) => f.rel)
      .sort();

    expect(scrubbers).toEqual([
      'src/app/api/shadow/history/clear/route.ts',
      'src/modules/shadow/compliance/receipt-retention.ts',
      'src/modules/shadow/interfaces/session-store.ts',
    ]);

    // `gdpr-export.ts` reaches the same payload through `retainAndScrubReceipts`
    // rather than naming it, which is why it is absent above and asserted here.
    const gdpr = files.find(
      (f) => f.rel === 'src/modules/shadow/compliance/gdpr-export.ts'
    );
    expect(gdpr!.code).toContain('retainAndScrubReceipts');
  });
});
