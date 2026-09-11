/**
 * P-38 — a service singleton nobody calls now fails CI.
 *
 * ===========================================================================
 * WHY THIS FILE EXISTS
 * ===========================================================================
 *
 * Thirty-three packages found three failure modes in this repository, and
 * every one of them shipped green. Two had an instrument. This is the third:
 *
 *     A module is imported and nobody calls its functions.
 *
 * P-16's entire Sprint 5 was that bug nine times. P-17 found five more,
 * including the PII/PHI redaction pipeline, which had zero callers while
 * `prisma.shadowMessage.create` appeared in six files -- so every transcript
 * was stored raw. Two sprints of correct, tested, type-checked, lint-clean code
 * that never ran.
 *
 * The mechanism is `tests/support/reachability.ts`; its header explains the
 * design and the scope that was deliberately refused. This file is the gate.
 *
 * ===========================================================================
 * HOW IT WAS VALIDATED, BECAUSE A CHECK NOBODY WATCHED REJECT ANYTHING IS PROSE
 * ===========================================================================
 *
 * Run against the trees where the answer is already known:
 *
 *   commit    tree                       subject                  verdict
 *   -------   ------------------------   ----------------------   -----------
 *   53d0caf   master just before P-16    notificationEscalator    dead  (true)
 *   53d0caf   "                          digestOptimizer          dead  (true)
 *   53d0caf   "                          redactionPipeline        dead  (true)
 *   53d0caf   "                          adaptiveChannelService   dead  (true)
 *   4ffb406   master just before P-17    redactionPipeline        dead  (true)
 *   4ffb406   "                          notificationEscalator    live  (true)
 *   2efebaa   master just before P-37    breakGlassRevoke         dead  (true)
 *   639731e   master today               all four above           live  (true)
 *
 * `digestOptimizer` is how `addToDigest` is caught: the method had no caller
 * because the singleton that owns it had no caller. `breakGlassRevoke` is a
 * bare function, so it is only visible to `kinds: ['function']` -- which is
 * measured and NOT gated, for the reason in the support module's header and
 * proved by the last test in this file.
 *
 * Nineteen of the 19 dead singletons found at pre-P-16 master, and 13 of 13
 * found today, were checked by hand against `grep -rn <name> src/ scripts/`.
 * Zero false positives: every one had nothing but its own file, a barrel
 * re-export, and in some cases a test.
 *
 * ===========================================================================
 * WHAT THE LIST BELOW IS FOR
 * ===========================================================================
 *
 * Guarded both directions, exactly as P-36's KNOWN_ORPHANS is: an unlisted dead
 * singleton fails, AND a listed one that has since been wired fails. That is
 * what makes a list shrink instead of rot into the place dead code goes to be
 * forgiven. Wiring one of these is a one-line deletion here and a test that
 * proves the wiring; adding one is a deliberate, reviewed act.
 */

import { join } from 'node:path';
import {
  analyze,
  fixtureBarrelOnly,
  fixtureDispatchTable,
  fixtureKnownFalse,
  fixtureWithRouteCaller,
  identify,
  readTree,
  toPosix,
  type Reachability,
} from '../../support/reachability';

const REPO_ROOT = toPosix(join(__dirname, '..', '..', '..'));

/**
 * Every service singleton in `src/` that no non-test file outside its own file
 * calls, as of P-38 (master @ 639731e). Hand-verified one by one.
 *
 * They are recorded rather than deleted or wired because P-38 builds the
 * instrument; deciding the fate of thirteen services is thirteen product
 * decisions, and three of them are load-bearing enough to name here:
 *
 *   `security/services/vault-service.ts :: vaultService`
 *       AES-256-GCM secret storage over `prisma.vaultEntry`, `vaultSecret` and
 *       `vaultKey`. It is the ONLY code in `src/` that touches those three
 *       delegates, and there is no `/api/vault` route at all. So the three
 *       tables can never receive a row, and `createCipheriv` appears nowhere
 *       else in `src/` -- there is no second, live encryption path. Genuinely
 *       dead, not a false positive.
 *
 *   `security/services/provenance-service.ts :: provenanceService`
 *       The hash-chained tamper-evidence trail. Sole toucher of
 *       `prisma.provenanceRecord`. Same shape, same conclusion.
 *
 *   `lib/ai/usage.ts :: usageTracker`   -- CLOSED BY P-39, see below.
 *       Token and cost accounting for Anthropic calls. Stronger than the other
 *       twelve: `src/lib/ai/usage.ts` is imported by NOTHING -- not by
 *       `lib/ai/client.ts`, not even re-exported by `lib/ai/index.ts` -- so no
 *       barrel mentions it. Every model call this platform makes is unmetered.
 *       (`engines/cost/model-router.ts :: estimateCost` is live, but it
 *       PREDICTS a cost before a call; nothing records what was actually spent.)
 *
 *       P-39 deleted the file. Per `docs/parallel-build/decision-02-throttle.md`
 *       and its amendment -- two implementations, one in-memory and dead, one
 *       persisted and live, neither wired: delete the first and WIRE THE SECOND
 *       -- `src/lib/ai/client.ts` now writes every call to the `UsageRecord`
 *       table through `src/lib/ai/metering.ts`. An in-memory tracker would have
 *       given metering that resets on every deploy.
 *
 *       One correction to the paragraph above, recorded because a measurement
 *       that is 95% right is how the next one gets trusted: "no test touches
 *       it" was wrong. `tests/unit/ai/usage.test.ts` existed and passed 21
 *       assertions against it, one of which -- "should use default pricing for
 *       unknown models" -- was a passing test encoding the defect. The VERDICT
 *       was right anyway, because this scan does not count a test as a caller;
 *       the prose overstated the evidence for it.
 *
 * Those first two are worth one more sentence, because they are precisely the
 * hole P-36 could not see. `tests/db/control-plane-schema.test.ts` asserts that
 * every model in the schema is REFERENCED by `src/`, and `VaultEntry`,
 * `VaultSecret`, `VaultKey` and `ProvenanceRecord` all pass it -- the dead
 * service references them thirty times over. Reference was the right assertion
 * for P-36 and it is not sufficient: a reference inside a service with no
 * caller is a table that is named and never written. Four models are in that
 * state today, and only this check can see it.
 *
 * Two more that this check calls live and a human would not, named here rather
 * than folded into the verdict (widening the definition is how a check becomes
 * a guess): `capture/services/ocr-service.ts :: ocrService` is called only by
 * `screenshot-service.ts`, which is itself on this list, and
 * `security/services/legal-hold-service.ts :: legalHoldService` is called only
 * by `security/services/retention-service.ts`, also on this list. The verdict
 * here is direct-caller, not reachable-from-a-route.
 */
const KNOWN_DEAD: readonly string[] = [
  // 'src/lib/ai/usage.ts :: usageTracker' was here. P-39 deleted the file; the
  // AI client seam now writes to the persisted `UsageRecord` ledger instead.
  // This deletion is not bookkeeping -- the list is guarded both ways, so the
  // line had to go in the same commit as the wiring, and leaving it would fail
  // 'keeps the list honest: every recorded name still exists'.
  'src/modules/capture/services/offline-queue.ts :: offlineQueue',
  'src/modules/capture/services/screenshot-service.ts :: screenshotService',
  'src/modules/security/services/provenance-service.ts :: provenanceService',
  // Distinct from `shadow/compliance/retention.ts :: retentionService`, which
  // IS live. Two singletons, one name -- the reason this scan resolves imports
  // instead of grepping for the identifier.
  'src/modules/security/services/retention-service.ts :: retentionService',
  'src/modules/security/services/vault-service.ts :: vaultService',
  'src/modules/shadow/interfaces/web-chat.ts :: webChatHandler',
  'src/modules/shadow/monitoring/failover.ts :: failoverManager',
  'src/modules/shadow/proactive/workflow-companion.ts :: workflowCompanionService',
  'src/modules/voice/services/command-parser.ts :: commandParser',
  'src/modules/voice/services/stt-service.ts :: sttService',
  'src/modules/voice/services/voiceforge-handoff.ts :: voiceForgeHandoffService',
  'src/modules/voice/services/wake-word-service.ts :: wakeWordService',
];

// One scan of the real tree, reused by every case below.
const tree = readTree(join(REPO_ROOT, 'src'), join(REPO_ROOT, 'scripts'));
const scan: Reachability[] = analyze({
  tree,
  srcRoot: REPO_ROOT + '/src',
  // `scripts/worker.ts` may CALL a singleton -- a BullMQ worker is a caller --
  // but it may not declare one.
  declarationRoots: [REPO_ROOT + '/src'],
});
const idOf = (entry: Reachability): string => identify(entry.subject, REPO_ROOT);

describe('P-38: every service singleton has a caller outside its own file', () => {
  it('scanned the real tree (without this, every case below is vacuous)', () => {
    // The failure this guards is the one that keeps happening here: a control
    // that silently stops controlling and reports success. If `readTree` is
    // pointed at the wrong place it returns an empty Map and the gate passes
    // forever.
    expect(tree.size).toBeGreaterThan(1200);
    // P-39: was '/src/lib/ai/usage.ts', deleted with that package. Repointed at
    // the file that replaced it so the canary keeps naming a file that exists --
    // an assertion against a deleted path passes vacuously the moment it is
    // loosened, and this line exists to catch `readTree` reading nothing.
    expect([...tree.keys()].some((f) => f.endsWith('/src/lib/ai/metering.ts'))).toBe(true);
    expect([...tree.keys()].some((f) => f.endsWith('/scripts/worker.ts'))).toBe(true);
    expect(scan.length).toBeGreaterThan(35);
    expect(scan.filter((entry) => entry.verdict === 'live').length).toBeGreaterThan(25);
  });

  it('resolves a barrel import to the declaration behind it', () => {
    // `app/api/shadow/retention/route.ts` imports from
    // `@/modules/shadow/compliance/retention`, and `consentReceiptService` is
    // reached through `@/modules/shadow/safety/consent-receipt`. If module
    // resolution broke, these would read `dead` and the list below would
    // explode rather than quietly pass -- but assert it directly, so the
    // failure names the cause instead of the symptom.
    const live = scan.filter((entry) => entry.verdict === 'live').map(idOf);
    expect(live).toContain('src/modules/shadow/compliance/retention.ts :: retentionService');
    expect(live).toContain('src/modules/shadow/safety/consent-receipt.ts :: consentReceiptService');
  });

  it('the two singletons P-16 and P-17 wired are live, and were dead before', () => {
    // The regression these packages closed. If either reads `dead` again,
    // something has unwired `proactive-runner.ts` or `message-store.ts`.
    const byId = new Map(scan.map((entry) => [idOf(entry), entry]));
    const escalator = byId.get(
      'src/modules/shadow/proactive/notification-escalator.ts :: notificationEscalator'
    );
    const redaction = byId.get('src/modules/shadow/compliance/redaction.ts :: redactionPipeline');
    expect(escalator?.verdict).toBe('live');
    expect(redaction?.verdict).toBe('live');
    // ...and specifically from the product, not from a test.
    expect(escalator?.callers.length).toBeGreaterThan(0);
    expect(redaction?.callers.length).toBeGreaterThan(0);
  });

  it('every dead singleton is on the recorded list, and nothing else is', () => {
    const dead = scan
      .filter((entry) => entry.verdict === 'dead')
      .map(idOf)
      .sort();
    // Both directions in one assertion: a new dead singleton fails because it
    // is not in KNOWN_DEAD, and a KNOWN_DEAD entry that someone wired fails
    // because it is no longer in `dead`. Wire one, delete its line.
    expect(dead).toEqual([...KNOWN_DEAD].sort());
  });

  it('keeps the list honest: every recorded name still exists', () => {
    // A service that was deleted or renamed must leave the list rather than sit
    // in it forever describing a file that is gone.
    const present = new Set(scan.map(idOf));
    expect(KNOWN_DEAD.filter((entry) => !present.has(entry))).toEqual([]);
  });
});

describe('P-38: the check itself', () => {
  it('rejects a true positive — declared, re-exported by a barrel, called by nobody', () => {
    const { tree: fixture, srcRoot } = fixtureBarrelOnly();
    const result = analyze({ tree: fixture, srcRoot });
    expect(result.map((entry) => [entry.subject.name, entry.verdict])).toEqual([
      ['vaultService', 'dead'],
    ]);
    // And the barrel is recorded as what it is, so the failure message can say
    // "a re-export is not a call" rather than "unreferenced".
    expect(result[0].callers).toEqual([]);
    expect(result[0].reExportOnly).toEqual(['/repo/src/modules/security/index.ts']);
  });

  it('accepts a true negative — the same tree, plus one route that calls it', () => {
    const { tree: fixture, srcRoot } = fixtureWithRouteCaller();
    const result = analyze({ tree: fixture, srcRoot });
    expect(result.map((entry) => [entry.subject.name, entry.verdict])).toEqual([
      ['vaultService', 'live'],
    ]);
  });

  it('does not flag the known-false cases', () => {
    // The list the coordinator named, each one a way a live service can look
    // dead to a lazier check. A single false positive here is worse than no
    // check at all: the first one teaches everyone to ignore the gate, which is
    // how `continue-on-error` reached the lint step and cost P-19 a package.
    const { tree: fixture, srcRoot, declarationRoots } = fixtureKnownFalse();
    const verdicts = new Map(
      analyze({ tree: fixture, srcRoot, declarationRoots }).map((entry) => [
        entry.subject.name,
        entry.verdict,
      ])
    );

    // renamed through a barrel: `export { aliasedService as renamed }`
    expect(verdicts.get('aliasedService')).toBe('live');
    // `import * as services` then `services.namespacedService.go()`
    expect(verdicts.get('namespacedService')).toBe('live');
    // called from scripts/, not from a route -- a BullMQ worker is a caller
    expect(verdicts.get('workerOnlyService')).toBe('live');
    // a type-only import sitting next to a real one must not mask the real one
    expect(verdicts.get('typedService')).toBe('live');
    // `import { x } from './a'; export { x };` -- a re-export in two statements
    expect(verdicts.get('longhandService')).toBe('live');
    // reached only by `await import(...)`: unresolvable, so NOT reported dead
    expect(verdicts.get('lazyService')).toBe('dynamic');
  });

  it('does not count a test as a caller — the line P-16 and P-17 turn on', () => {
    // `addToDigest` had a unit test and no product caller, and so did the
    // escalation ladder and `redactionPipeline`. If a test counted, all three
    // would have read `live` and this instrument would find nothing.
    const { tree: fixture, srcRoot, declarationRoots } = fixtureKnownFalse();
    const result = analyze({ tree: fixture, srcRoot, declarationRoots }).find(
      (entry) => entry.subject.name === 'testedOnlyService'
    );
    expect(result?.verdict).toBe('dead');
    expect(result?.testCallers).toEqual(['/repo/src/services/__tests__/tested-only.test.ts']);
    expect(result?.callers).toEqual([]);
  });

  it('ignores `new Map()` — a store is not a service', () => {
    // Seven of the nineteen the coordinator's grep found were module-private
    // Maps exported only so a test could `.clear()` them (`dlpStore`,
    // `policyStore`, ...), in modules whose functions routes call perfectly
    // well. Reporting those beside `vaultService` is how a gate earns its first
    // "oh, ignore that one".
    const result = analyze({
      tree: new Map([
        ['/repo/src/modules/admin/services/dlp-service.ts', 'export const dlpStore = new Map();'],
      ]),
      srcRoot: '/repo/src',
    });
    expect(result).toEqual([]);
  });

  it('records the scope that was refused: a dispatch table defeats the function scan', () => {
    // DO NOT GATE ON `kinds: ['function']`, and do not rebuild this thinking it
    // will come out clean. Measured on master: 773 exported service functions,
    // 291 live, 482 dead. Twenty hand-checked, nineteen true, and the
    // twentieth -- `workflows/services/action-handlers.ts ::
    // handleLogFinancial` -- runs in production, reached through the
    // `ACTION_HANDLERS` table in its own file by an `executeAction` that
    // `workflow-executor.ts` imports. 122 of the 482 are referenced a second
    // time inside their own file, so each needs an intra-file call graph before
    // its verdict means anything.
    //
    // P-35 refused a scan for the same reason from the other side
    // (import-granular where the question is function-granular) and recorded
    // the dead end so nobody rebuilt it. This is that record, executable.
    const { tree: fixture, srcRoot } = fixtureDispatchTable();
    const verdicts = new Map(
      analyze({ tree: fixture, srcRoot, kinds: ['function'] }).map((entry) => [
        entry.subject.name,
        entry.verdict,
      ])
    );
    expect(verdicts.get('executeAction')).toBe('live');
    // Wrong, and known to be wrong: `handleThing` is called every time
    // `executeAction('THING')` runs.
    expect(verdicts.get('handleThing')).toBe('dead');
  });
});
