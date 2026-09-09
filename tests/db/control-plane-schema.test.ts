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
