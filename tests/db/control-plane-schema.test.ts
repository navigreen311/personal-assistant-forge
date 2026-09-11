/**
 * P-00 acceptance test — the control-plane migration is real.
 *
 * This is the first test in this repository that touches a real database.
 *
 * It exists because the audit found 186 of 320 test files calling
 * jest.mock('@/lib/db'), and nothing at all exercising Prisma against Postgres.
 * A mocked client will happily accept `prisma.tableThatDoesNotExist.create()`,
 * which is exactly how the shadow/compliance module came to call four delegates
 * that were never in the schema.
 *
 * So this asserts the weakest useful thing, against the real connection: every
 * table P-00 added exists, is queryable, and accepts a write. If the migration
 * did not apply, these fail. P-01 has replaced the ad-hoc client below with the
 * shared harness; P-04..P-14 then add the tenancy tests that matter.
 */

// P-01: the ad-hoc `new PrismaClient()` this file was written with is now the
// shared harness (tests/helpers/db.ts) -- the same singleton the product code
// imports, connected and disconnected in one place. Assertions below unchanged.
import { closeDatabase, connectDatabase, prisma } from '../helpers/db';

beforeAll(async () => {
  await connectDatabase();
});

afterAll(async () => {
  await closeDatabase();
});

describe('P-00 control-plane schema', () => {
  it('connects to a real database, not a mock', async () => {
    const rows = await prisma.$queryRaw<Array<{ one: number }>>`SELECT 1 as one`;
    expect(rows[0].one).toBe(1);
  });

  // Every table the P-00 migration created. Reaching zero rows is a successful
  // query; the assertion is that the delegate and the table both exist.
  const tables: Array<[string, () => Promise<number>]> = [
    ['AuditLogEntry', () => prisma.auditLogEntry.count()],
    ['ExecutionGateRule', () => prisma.executionGateRule.count()],
    ['QueuedAction', () => prisma.queuedAction.count()],
    ['RollbackPlan', () => prisma.rollbackPlan.count()],
    ['WorkflowApproval', () => prisma.workflowApproval.count()],
    ['DeadManSwitch', () => prisma.deadManSwitch.count()],
    ['Role', () => prisma.role.count()],
    ['UserRoleAssignment', () => prisma.userRoleAssignment.count()],
    ['ShadowSmsCode', () => prisma.shadowSmsCode.count()],
    ['ESignRequest', () => prisma.eSignRequest.count()],
    ['WorkflowExecutionRecord', () => prisma.workflowExecutionRecord.count()],
    ['RunbookExecution', () => prisma.runbookExecution.count()],
    ['ShadowCallAttempt', () => prisma.shadowCallAttempt.count()],
  ];

  it.each(tables)('%s exists and is queryable', async (_name, count) => {
    await expect(count()).resolves.toBeGreaterThanOrEqual(0);
  });

  it('survives a write and a read back — the point of the whole exercise', async () => {
    // The audit log was a process-local array. The entire value of moving it to
    // Postgres is that a second reader can see what a first writer wrote, and
    // that a restart does not erase it. Assert the first half here.
    const written = await prisma.auditLogEntry.create({
      data: {
        actor: 'p-00-acceptance',
        actorId: 'p-00',
        action: 'SCHEMA_SMOKE',
        resource: '/tests/db',
        resourceId: 'control-plane',
        entityId: 'p00-smoke-entity',
        requestMethod: 'POST',
        requestPath: '/tests/db',
        statusCode: 200,
        sensitivityLevel: 'INTERNAL',
        details: { note: 'written by the P-00 acceptance test' },
      },
    });

    const readBack = await prisma.auditLogEntry.findUnique({
      where: { id: written.id },
    });

    expect(readBack).not.toBeNull();
    expect(readBack?.actor).toBe('p-00-acceptance');

    await prisma.auditLogEntry.delete({ where: { id: written.id } });
  });

  it('rejects a duplicate idempotency key on QueuedAction', async () => {
    // T-019 depends on this constraint actually being in the database rather
    // than merely in the schema file. A retried enqueue must not double-apply.
    const base = {
      actionLogId: 'p00-smoke',
      actor: 'SYSTEM',
      actionType: 'SMOKE',
      target: 'p00',
      description: 'idempotency constraint check',
      reason: 'P-00 acceptance',
      impact: 'none',
      rollbackPlan: 'none',
      blastRadius: 'LOW',
      entityId: 'p00-smoke-entity',
      idempotencyKey: `p00-smoke-${Date.now()}`,
    };

    const first = await prisma.queuedAction.create({ data: base });

    await expect(prisma.queuedAction.create({ data: base })).rejects.toThrow();

    await prisma.queuedAction.delete({ where: { id: first.id } });
  });
});

// ===========================================================================
// P-36 — EXISTENCE IS NOT THE ASSERTION. REFERENCE IS.
// ===========================================================================
//
// Everything above this line asserts that a table exists and can be counted.
// That is the weakest useful thing, and it was the right first assertion: at
// the time it was written, nothing in this repository touched Postgres at all.
//
// It is also how five of the 75 models shipped, stayed green, and were used by
// nothing for an entire build. P-33 found them: `VoicePersona`, `PluginRecord`,
// `PluginReview`, `DNDConfig`, `ShadowSmsCode`. `ShadowSmsCode`'s own
// doc-comment named the line it was written to replace --
// "T-007 - replaces shadow/safety/auth-manager.ts:109" -- and the second factor
// stayed in a Map anyway. P-00 shipped eleven such models; ten got wired.
// `await prisma.shadowSmsCode.count()` resolved to 0 the whole time, and 0 is a
// successful query.
//
// So this block asserts the thing the count cannot: that every model in the
// schema is REACHED by the product code. A model nobody uses now fails CI.
//
// WHY A KNOWN-ORPHAN LIST RATHER THAN A CLEAN PASS OR A DELETION.
//
// Three models are unreferenced TODAY. Deleting them is a product decision this
// test may not make on its own -- `PluginRecord` and `PluginReview` are
// near-exact fits for `plugin-service :: pluginStore` and
// `security-review-service :: reviewStore`, which currently keep plugins as
// `Document` rows with the manifest JSON-stuffed into `Document.content`, so
// the right move is probably to WIRE them, not to drop them. Recording them
// here names them, dates them, and makes the next package's choice explicit.
//
// The list is guarded in both directions: an unlisted orphan fails, AND a
// listed model that has since been wired fails, so the list cannot quietly
// become the place unused models go to be forgiven.
//
// WHY THE MATCH IS `prisma.<delegate>` AND NOT A BARE GREP.
//
// A bare grep for `voicePersona` matches `config.voicePersona` in the Shadow
// voice pipeline, which is a settings field and not the table. A grep that
// counts comments matches every doc-comment that names a delegate it does not
// call -- including the ones in this very file. Both were checked, and both
// produce a green result over an orphan. Comments are stripped, and the match
// requires a client on the left.

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Unreferenced as of P-36 (migration window 01), recorded for a decision
 * rather than deleted or hidden. See the note above.
 *
 * P-37 removed `PluginRecord` and `PluginReview`. The note above guessed
 * right about where they belonged and half wrong about what for:
 * `PluginRecord` is not a home for `pluginStore` -- it has no `entityId`, so
 * making it the registry would have undone P-13's tenancy scoping. It is a
 * per-user INSTALLATION, which is what let `breakGlassRevoke` stop returning
 * `affectedUsers: 0` as a literal and start counting the rows it revoked.
 * `PluginReview` is the revocation ledger those writes produce.
 * `security-review-service :: reviewStore` is still a Map and still named in
 * that service's own doc-comment: `PluginReview.pluginRecordId` is a required
 * FK to an installation, so a review of an UNINSTALLED registry entry has
 * nothing to hang off. That one needs a schema change, not a wiring.
 */
const KNOWN_ORPHANS = ['VoicePersona'];

/** Prisma's delegate name for a model: first character lower-cased. */
function delegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out);
    } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/** Comments are prose. Prose that names a delegate does not call it. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('P-36 — every model in the schema is reached by src/', () => {
  const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
  const models = Array.from(schema.matchAll(/^model\s+(\w+)\s*\{/gm)).map((m) => m[1]);

  const productCode = collectSourceFiles(join(process.cwd(), 'src'))
    .map((file) => stripComments(readFileSync(file, 'utf8')))
    .join('\n');

  function isReferenced(model: string): boolean {
    const delegate = delegateName(model).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b(?:prisma|db|tx|client)\\s*\\.\\s*${delegate}\\b`).test(productCode);
  }

  it('finds the models (a parse failure would make every case below vacuous)', () => {
    expect(models.length).toBeGreaterThan(70);
    expect(models).toContain('AuditLogEntry');
    expect(models).toContain('InboundWebhookEvent');
  });

  it('references every model except the recorded orphans', () => {
    const unreferenced = models.filter((m) => !isReferenced(m));
    expect(unreferenced.sort()).toEqual([...KNOWN_ORPHANS].sort());
  });

  it('the four models added by migration window 01 are read and written by src/', () => {
    // The specific regression this package must not repeat. Each of these is
    // additionally proved across a restart in tests/db/migration-window-01.test.ts,
    // which is the assertion that a reference is a USE and not an import.
    for (const model of [
      'InboundWebhookEvent',
      'StoredDocument',
      'StoredDocumentVersion',
      'CommunicationOptOut',
    ]) {
      expect({ model, referenced: isReferenced(model) }).toEqual({ model, referenced: true });
    }
  });

  it('keeps the orphan list honest: a listed model that got wired must be removed from it', () => {
    const wired = KNOWN_ORPHANS.filter((m) => isReferenced(m));
    expect(wired).toEqual([]);
  });
});
