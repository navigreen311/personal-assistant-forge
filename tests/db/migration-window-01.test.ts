/**
 * P-36 — the four models of migration window 01, proved across a restart.
 *
 * ============================================================================
 * WHY THIS FILE IS THE ONLY PROOF THAT COUNTS
 * ============================================================================
 *
 * `prisma/schema.prisma` had been frozen since P-00 wrote the single migration
 * of this build. Thirty-five packages worked around it. Ivan authorized one
 * second window for four of P-33's five escalations, and this file is the
 * evidence that the window was spent on tables that are actually used.
 *
 * P-33's headline finding is the reason it has to be. FIVE of the 75 Prisma
 * models were referenced nowhere in `src/` — `VoicePersona`, `PluginRecord`,
 * `PluginReview`, `DNDConfig`, `ShadowSmsCode` — and
 * `tests/db/control-plane-schema.test.ts` stayed green over every one of them
 * for the whole run, **because it only asserted the table could be counted.**
 * `ShadowSmsCode`'s own doc-comment named the line it was written to replace.
 * P-00 shipped eleven such models; ten got wired; the one left behind was the
 * second factor.
 *
 * **A model is not done when it exists.** A table that exists and is ignored is
 * worse than no table, because the next audit counts it as done.
 *
 * So each case below drives the PRODUCT code path the model was created for,
 * discards every module-level object the process holds, and reads the value
 * back through code that has been re-imported from scratch.
 *
 * ============================================================================
 * WHAT A RESTART IS, HERE
 * ============================================================================
 *
 * `jest.resetModules()` is a restart expressed exactly: every Map, every Set,
 * every array and every `let` initialised at import is gone, and the next
 * `import` rebuilds it empty. Anything that was only in memory does not come
 * back. Anything in Postgres does. That is the whole discriminator, and it is
 * the idiom P-01, P-09, P-20 and P-33 established in
 * `restart-survivability.test.ts` and `store-persistence.test.ts`.
 *
 * A second `PrismaClient` is used for the far-side reads where it adds
 * something: a client the pre-restart code never touched is a different
 * process's view of the same row.
 *
 * ============================================================================
 * WHAT IS UNDER TEST
 * ============================================================================
 *
 *   ESC-1  processedEventIds (Set)  -> InboundWebhookEvent    LIVE, money
 *   ESC-2  documentStore (Map)      -> StoredDocument(+Version) LIVE, data loss
 *   ESC-3  suppressedEmails (Set),
 *          unsubscribeRecords,
 *          optOutRecords/Index      -> CommunicationOptOut    latent, compliance
 *   ESC-5  reason: JSON({expiresAt})-> DNDConfig.expiresAt     trivial
 *
 * ESC-4 (`ActionThrottleCounter`) is deliberately absent. See
 * docs/parallel-build/migration-window-01.md: `checkThrottle`'s only caller is
 * the route that reports its own status, so persisting its counters would make
 * a decorative control durable and convincing.
 *
 * ============================================================================
 * THE ESC-1 CASE IS ABOUT THE INDEX, NOT THE TABLE
 * ============================================================================
 *
 * `@@unique([provider, eventId])` IS the idempotency guarantee. Idempotency
 * without a unique index is a read-then-write race: two concurrent deliveries
 * of one event both pass the check and both run the handler. A test that calls
 * `isEventProcessed()` twice proves nothing — it exercises the race rather than
 * the constraint. So the test below attempts a genuine duplicate INSERT and
 * asserts Postgres rejects it with P2002.
 *
 * ============================================================================
 * MUTATION NUMBERS
 * ============================================================================
 *
 * `git stash push -- src/` (the fix removed, this file kept), then this suite:
 *
 *     15 failed, 4 passed, 19 total     without the fix
 *     19 passed,           19 total     with it
 *
 * The four that pass either way are named here rather than deleted, because a
 * test that cannot fail is worth nothing unless you know which one it is:
 *
 *   1. "REJECTS a genuine duplicate insert" and
 *   2. "the entity-scoped unique key is enforced by the index"
 *      test the MIGRATION, and `git stash push -- src/` does not stash a
 *      migration. They fail if the constraint is missing from the schema, which
 *      is the only way they can fail, and that is what they are for.
 *   3. "an indefinite DND is unaffected" is the control case: it asserts that
 *      adding an expiry did not break the DND that has none, so it must pass
 *      both before and after. It sits beside the timed case for that reason.
 *   4. "disabling a timed DND clears the expiry" passes for the WRONG reason
 *      without the fix — nothing ever writes `expiresAt`, so finding it null
 *      proves nothing. With the fix it proves that `disableDND` disarms a timed
 *      DND rather than leaving it to fire later. Stated plainly because the
 *      alternative is a green line that quietly means nothing.
 *
 * In the other direction, with the fix applied: unit 329 suites / 5,501 tests
 * and db 31 suites / 974 tests, both green, and the P-20 scoreboard still
 * prints nine of nine.
 *
 * Requires a real Postgres. No skip.
 */

import { Prisma, PrismaClient } from '@prisma/client';

import { db, setupTestDatabase } from '../helpers/db';
import { createEntity, createTenant, createUser, type Tenant } from '../helpers/factories';

/**
 * The ONLY mock in this file, and it is not the thing under test.
 *
 * `sendEmail` ends in a SendGrid API call. There is no API key in CI, so the
 * real client returns `false` for every recipient and the suppression assertion
 * would pass for the wrong reason -- a suppressed address and a delivered one
 * would be indistinguishable. Stubbing the transport keeps "the suppressed
 * address was never handed to the transport" a real assertion.
 *
 * Note what is NOT mocked: `@/lib/db`. A tests/db file that mocked the database
 * would prove nothing, which is the entire point of this directory. The SMS
 * transport is not mocked either -- every SMS case here is refused before the
 * client is reached, which is what it is asserting.
 */
jest.mock('@/lib/integrations/email/client', () => ({
  sendEmail: jest.fn(async () => true),
  sendBulkEmail: jest.fn(async () => 0),
}));

setupTestDatabase();

jest.setTimeout(120_000);

/** A second client — a different process's view of the same rows. */
async function withSecondClient<T>(fn: (client: PrismaClient) => Promise<T>): Promise<T> {
  const client = new PrismaClient();
  try {
    return await fn(client);
  } finally {
    await client.$disconnect();
  }
}

// ===========================================================================
// ESC-1 — inbound payment webhook idempotency
// ===========================================================================

describe('ESC-1 InboundWebhookEvent — the unique index is the idempotency guarantee', () => {
  it('REJECTS a genuine duplicate insert at the database, not at a read', async () => {
    // This is the assertion the whole model exists for, and it deliberately
    // bypasses every line of application code: if the constraint is not in the
    // migration, nothing in `webhooks.ts` can make idempotency safe under
    // concurrency, however carefully it checks first.
    const row = {
      provider: 'stripe',
      eventId: 'evt_constraint_probe',
      type: 'invoice.paid',
      payload: { id: 'inv_probe' },
    };

    await db.inboundWebhookEvent.create({ data: row });

    let rejected: unknown = null;
    try {
      await db.inboundWebhookEvent.create({ data: row });
    } catch (err) {
      rejected = err;
    }

    expect(rejected).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    const known = rejected as Prisma.PrismaClientKnownRequestError;
    expect(known.code).toBe('P2002');
    // Postgres names the columns it refused on. This is the index, not a check.
    expect(JSON.stringify(known.meta)).toContain('eventId');

    expect(await db.inboundWebhookEvent.count({ where: { eventId: row.eventId } })).toBe(1);
  });

  it('a duplicate delivery ARRIVING AFTER A RESTART is still refused, and the handler does not run twice', async () => {
    const before = await import('@/lib/integrations/payments/webhooks');

    let handlerRuns = 0;
    before.registerHandler('payment_intent.succeeded', async () => {
      handlerRuns += 1;
    });

    const event = {
      id: 'evt_paid_once',
      type: 'payment_intent.succeeded',
      data: { id: 'pi_once', amount: 42_00 },
      status: 'received' as const,
    };

    expect((await before.processWebhookEvent({ ...event })).status).toBe('processed');
    expect(handlerRuns).toBe(1);

    // THE RESTART. `processedEventIds` and `eventHistory` are gone; under the
    // Set this is precisely the deploy that made Stripe's replay run the
    // handler a second time and charge the work twice.
    jest.resetModules();

    const after = await import('@/lib/integrations/payments/webhooks');
    let handlerRunsAfter = 0;
    after.registerHandler('payment_intent.succeeded', async () => {
      handlerRunsAfter += 1;
    });

    const replay = await after.processWebhookEvent({ ...event });
    expect(replay.status).toBe('ignored');
    expect(replay.error).toContain('already processed');
    expect(handlerRunsAfter).toBe(0);

    // And a second process agrees, which a Set could never arrange.
    await withSecondClient(async (client) => {
      const row = await client.inboundWebhookEvent.findUnique({
        where: { provider_eventId: { provider: 'stripe', eventId: 'evt_paid_once' } },
      });
      expect(row).not.toBeNull();
      expect(row!.status).toBe('processed');
      expect(row!.processedAt).not.toBeNull();
    });
  });

  it('a FAILED handler is recorded failed, survives the restart as failed, and is retried', async () => {
    // P-33's defect #1: `processWebhookEvent` called `markEventProcessed` on the
    // failure branch, and the route returns 200 so Stripe stops retrying. A
    // failed `invoice.paid` was therefore lost permanently, and the retry that
    // could have saved it was answered `ignored`.
    const before = await import('@/lib/integrations/payments/webhooks');
    before.registerHandler('invoice.paid', async () => {
      throw new Error('ledger unavailable');
    });

    const event = {
      id: 'evt_failed_then_retried',
      type: 'invoice.paid',
      data: { id: 'inv_retry' },
      status: 'received' as const,
    };

    expect((await before.processWebhookEvent({ ...event })).status).toBe('failed');

    const failedRow = await db.inboundWebhookEvent.findUnique({
      where: { provider_eventId: { provider: 'stripe', eventId: event.id } },
    });
    expect(failedRow!.status).toBe('failed');
    expect(failedRow!.error).toBe('ledger unavailable');
    expect(failedRow!.processedAt).toBeNull();

    jest.resetModules();

    const after = await import('@/lib/integrations/payments/webhooks');
    // The failure state is what survived — not a "processed" marker.
    expect(await after.isEventProcessed(event.id)).toBe(false);

    let recovered = 0;
    after.registerHandler('invoice.paid', async () => {
      recovered += 1;
    });

    expect((await after.processWebhookEvent({ ...event })).status).toBe('processed');
    expect(recovered).toBe(1);

    const settled = await db.inboundWebhookEvent.findUnique({
      where: { provider_eventId: { provider: 'stripe', eventId: event.id } },
    });
    expect(settled!.status).toBe('processed');
    // Two deliveries reached the handler path; the row counted both.
    expect(settled!.attempts).toBe(2);
  });

  it('keeps the event history across a restart, which was an array', async () => {
    const before = await import('@/lib/integrations/payments/webhooks');
    await before.processWebhookEvent({
      id: 'evt_history_1',
      type: 'checkout.session.completed',
      data: { id: 'cs_hist' },
      status: 'received',
    });

    jest.resetModules();

    const after = await import('@/lib/integrations/payments/webhooks');
    const history = await after.getWebhookHistory(10);
    expect(history.map((e) => e.id)).toContain('evt_history_1');
    expect(history.find((e) => e.id === 'evt_history_1')!.data.id).toBe('cs_hist');
  });
});

// ===========================================================================
// ESC-2 — uploaded document metadata
// ===========================================================================

describe('ESC-2 StoredDocument — the blob outliving its metadata', () => {
  let tenant: Tenant;

  beforeEach(async () => {
    tenant = await createTenant();
  });

  it('a documentId handed to the caller still resolves after a restart', async () => {
    const before = await import('@/lib/integrations/storage/documents');

    const created = await before.createDocument({
      entityId: tenant.entity.id,
      title: 'Signed lease',
      description: 'the one that mattered',
      category: 'contracts',
      tags: ['legal', 'signed'],
      file: {
        key: `${tenant.entity.id}/documents/lease.pdf`,
        sizeBytes: 4096,
        checksum: 'sha256:abc',
        mimeType: 'application/pdf',
      },
      userId: tenant.user.id,
    });

    // THE RESTART. Under the Map, the object stayed in S3 and this id 404'd
    // forever — the worst version, because nothing errored and nothing was
    // recoverable by hand.
    jest.resetModules();

    const after = await import('@/lib/integrations/storage/documents');
    const found = await after.getDocument(created.id);

    expect(found).not.toBeNull();
    expect(found!.title).toBe('Signed lease');
    expect(found!.description).toBe('the one that mattered');
    expect(found!.mimeType).toBe('application/pdf');
    expect(found!.tags).toEqual(['legal', 'signed']);
    expect(found!.createdBy).toBe(tenant.user.id);
    // The storage key is the whole point: without it the blob is unreachable.
    expect(found!.versions[0].storageKey).toBe(`${tenant.entity.id}/documents/lease.pdf`);
    expect(found!.versions[0].checksum).toBe('sha256:abc');
  });

  it('carries the version history across a restart, and the version numbers with it', async () => {
    const before = await import('@/lib/integrations/storage/documents');
    const doc = await before.createDocument({
      entityId: tenant.entity.id,
      title: 'Policy',
      category: 'documents',
      file: { key: 'k1', sizeBytes: 10, checksum: 'c1', mimeType: 'text/plain' },
      userId: tenant.user.id,
    });
    await before.addDocumentVersion({
      documentId: doc.id,
      file: { key: 'k2', sizeBytes: 20, checksum: 'c2' },
      userId: tenant.user.id,
      changelog: 'second draft',
    });

    jest.resetModules();

    const after = await import('@/lib/integrations/storage/documents');
    const found = await after.getDocument(doc.id);
    expect(found!.currentVersion).toBe(2);
    expect(found!.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(found!.versions[1].changelog).toBe('second draft');

    // A third version added by the RESTARTED module still continues the count.
    const third = await after.addDocumentVersion({
      documentId: doc.id,
      file: { key: 'k3', sizeBytes: 30, checksum: 'c3' },
      userId: tenant.user.id,
    });
    expect(third.version).toBe(3);
  });

  it('refuses a duplicate version number at the database', async () => {
    // `@@unique([documentId, version])` is load-bearing: two concurrent uploads
    // both compute currentVersion + 1, and without it one storage key becomes
    // unreachable with no error anywhere.
    const documents = await import('@/lib/integrations/storage/documents');
    const doc = await documents.createDocument({
      entityId: tenant.entity.id,
      title: 'Race',
      category: 'documents',
      file: { key: 'k1', sizeBytes: 1, checksum: 'c1', mimeType: 'text/plain' },
      userId: tenant.user.id,
    });

    await expect(
      db.storedDocumentVersion.create({
        data: {
          documentId: doc.id,
          version: 1,
          storageKey: 'k1-again',
          sizeBytes: 1,
          checksum: 'c1',
          uploadedBy: tenant.user.id,
        },
      })
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('a soft delete survives a restart — a deleted document does not come back', async () => {
    const before = await import('@/lib/integrations/storage/documents');
    const doc = await before.createDocument({
      entityId: tenant.entity.id,
      title: 'Retracted',
      category: 'documents',
      file: { key: 'k', sizeBytes: 1, checksum: 'c', mimeType: 'text/plain' },
      userId: tenant.user.id,
    });
    expect(await before.deleteDocument(doc.id, tenant.user.id)).toBe(true);

    jest.resetModules();

    const after = await import('@/lib/integrations/storage/documents');
    expect(await after.getDocument(doc.id)).toBeNull();
    const listed = await after.listDocuments({ entityId: tenant.entity.id });
    expect(listed.documents).toHaveLength(0);
    // The row is still there, soft-deleted, which is what "not remove files" means.
    expect(await db.storedDocument.count({ where: { id: doc.id } })).toBe(1);
  });

  it('scopes a listing to one entity after a restart', async () => {
    const other = await createEntity(tenant.user.id, { name: 'Second entity' });
    const before = await import('@/lib/integrations/storage/documents');

    await before.createDocument({
      entityId: tenant.entity.id,
      title: 'Mine',
      category: 'documents',
      file: { key: 'a', sizeBytes: 1, checksum: 'a', mimeType: 'text/plain' },
      userId: tenant.user.id,
    });
    await before.createDocument({
      entityId: other.id,
      title: 'Theirs',
      category: 'documents',
      file: { key: 'b', sizeBytes: 1, checksum: 'b', mimeType: 'text/plain' },
      userId: tenant.user.id,
    });

    jest.resetModules();

    const after = await import('@/lib/integrations/storage/documents');
    const listed = await after.listDocuments({ entityId: tenant.entity.id });
    expect(listed.total).toBe(1);
    expect(listed.documents[0].title).toBe('Mine');
  });
});

// ===========================================================================
// ESC-3 — communication opt-outs and suppression
// ===========================================================================

describe('ESC-3 CommunicationOptOut — a suppression list that outlives the process', () => {
  let tenant: Tenant;

  beforeEach(async () => {
    tenant = await createTenant();
  });

  it('an SMS opt-out still blocks a send after a restart', async () => {
    // This is the sharpest case in the escalation, because `sendTemplatedSms`
    // genuinely consults its opt-out list before every send. The check was real
    // and the Set underneath it was emptied by every deploy: a STOP reply is
    // the legal instruction, and texting the person again after a restart is
    // the violation itself.
    const before = await import('@/lib/integrations/sms/workflows');
    await before.handleOptOut({
      phoneNumber: '+15550001111',
      entityId: tenant.entity.id,
      reason: 'replied STOP',
    });
    expect(await before.isOptedOut('+15550001111', tenant.entity.id)).toBe(true);

    jest.resetModules();

    const after = await import('@/lib/integrations/sms/workflows');
    expect(await after.isOptedOut('+15550001111', tenant.entity.id)).toBe(true);

    // Through the product, not the predicate: the send must be refused.
    const send = await after.sendTemplatedSms({
      to: '+15550001111',
      templateId: 'verification-code',
      data: { code: '123456', expiresInMinutes: 5 },
      entityId: tenant.entity.id,
    });
    expect(send.status).toBe('failed');
    expect(send.failureReason).toBe('Recipient has opted out');
  });

  it('scopes an opt-out to its entity, and survives an opt-in, across a restart', async () => {
    const other = await createEntity(tenant.user.id, { name: 'Other' });
    const before = await import('@/lib/integrations/sms/workflows');
    await before.handleOptOut({ phoneNumber: '+15550002222', entityId: tenant.entity.id });

    jest.resetModules();
    const after = await import('@/lib/integrations/sms/workflows');

    expect(await after.isOptedOut('+15550002222', tenant.entity.id)).toBe(true);
    expect(await after.isOptedOut('+15550002222', other.id)).toBe(false);

    await after.handleOptIn({ phoneNumber: '+15550002222', entityId: tenant.entity.id });

    jest.resetModules();
    const later = await import('@/lib/integrations/sms/workflows');
    expect(await later.isOptedOut('+15550002222', tenant.entity.id)).toBe(false);
  });

  it('a hard bounce suppresses the address platform-wide, after a restart, on a real batch send', async () => {
    const before = await import('@/lib/integrations/email/workflows');
    await before.handleBounce({
      email: 'gone@example.com',
      type: 'hard',
      reason: 'mailbox does not exist',
    });
    await before.handleBounce({
      email: 'slow@example.com',
      type: 'soft',
      reason: 'mailbox full',
    });

    jest.resetModules();

    const after = await import('@/lib/integrations/email/workflows');
    expect(await after.isEmailSuppressed('gone@example.com')).toBe(true);
    // A soft bounce must NOT suppress. It is a bounce log entry, and the log is
    // still process-local — which is why this reads `false` for the right
    // reason before the restart and for two reasons after it. See the comment
    // in email/workflows.ts.
    expect(await after.isEmailSuppressed('slow@example.com')).toBe(false);

    // Through the product: the batch send skips it. The transport is imported
    // after the restart because `jest.resetModules()` rebuilds the mock too.
    const transport = await import('@/lib/integrations/email/client');
    const sendEmail = transport.sendEmail as jest.MockedFunction<typeof transport.sendEmail>;

    const job = await after.sendBatchEmails({
      templateId: 'welcome',
      recipients: [
        { email: 'ok@example.com', data: { userName: 'A', entityName: 'C', loginUrl: 'https://x' } },
        {
          email: 'gone@example.com',
          data: { userName: 'B', entityName: 'C', loginUrl: 'https://x' },
        },
      ],
      rateLimit: 1000,
    });

    expect(job.sentCount).toBe(1);
    expect(job.failedCount).toBe(1);
    // The assertion that matters: the suppressed address never reached the
    // transport. A durable suppression list nothing consults is not a fix.
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe('ok@example.com');
  });

  it('an unsubscribe outlives the Contact row it was given against', async () => {
    // The reason this cannot live on `Contact.preferences`: deleting a contact
    // would silently re-enable sending to someone who unsubscribed, which is
    // precisely the failure the law is about.
    const contact = await db.contact.create({
      data: { entityId: tenant.entity.id, name: 'Ex customer', email: 'ex@example.com' },
    });

    const before = await import('@/lib/integrations/email/workflows');
    await before.handleUnsubscribe({
      email: 'ex@example.com',
      entityId: tenant.entity.id,
      reason: 'too many emails',
    });

    await db.contact.delete({ where: { id: contact.id } });
    jest.resetModules();

    const after = await import('@/lib/integrations/email/workflows');
    expect(await after.isUnsubscribed('ex@example.com', tenant.entity.id)).toBe(true);
  });

  it('keeps category-scoped unsubscribes distinct across a restart', async () => {
    const before = await import('@/lib/integrations/email/workflows');
    await before.handleUnsubscribe({
      email: 'picky@example.com',
      entityId: tenant.entity.id,
      categories: ['marketing'],
    });

    jest.resetModules();

    const after = await import('@/lib/integrations/email/workflows');
    expect(await after.isUnsubscribed('picky@example.com', tenant.entity.id, 'marketing')).toBe(
      true
    );
    expect(await after.isUnsubscribed('picky@example.com', tenant.entity.id, 'transactional')).toBe(
      false
    );

    const stats = await after.getDeliverabilityStats(tenant.entity.id);
    expect(stats.unsubscribes).toBe(1);
  });

  it('the entity-scoped unique key is enforced by the index, and the platform-wide one is not', async () => {
    // Recorded because it is a real property of the AUTHORIZED model rather
    // than of this code: `@@unique([channel, address, entityId, scope])` cannot
    // constrain rows whose `entityId` is NULL, because Postgres indexes NULLs
    // as DISTINCT and Prisma cannot emit NULLS NOT DISTINCT. The write path
    // guards the platform-wide case with a read instead, and says so.
    const row = {
      channel: 'email',
      address: 'dup@example.com',
      entityId: tenant.entity.id,
      scope: 'all',
      source: 'unsubscribe',
    };
    await db.communicationOptOut.create({ data: row });
    await expect(db.communicationOptOut.create({ data: row })).rejects.toMatchObject({
      code: 'P2002',
    });

    const platformWide = { ...row, entityId: null, source: 'hard_bounce' };
    await db.communicationOptOut.create({ data: platformWide });
    await db.communicationOptOut.create({ data: platformWide });
    expect(
      await db.communicationOptOut.count({ where: { entityId: null, address: 'dup@example.com' } })
    ).toBe(2);

    // …which is why `recordOptOut` does not rely on the index for that case.
    const optOuts = await import('@/lib/integrations/communication/opt-outs');
    await optOuts.recordOptOut({
      channel: 'email',
      address: 'dup@example.com',
      entityId: null,
      source: 'hard_bounce',
    });
    expect(
      await db.communicationOptOut.count({ where: { entityId: null, address: 'dup@example.com' } })
    ).toBe(2);
  });
});

// ===========================================================================
// ESC-5 — the timed do-not-disturb that never ended
// ===========================================================================

describe('ESC-5 DNDConfig.expiresAt — no timed do-not-disturb had ever expired', () => {
  it('carries a timed DND across a restart AND ends it when the time comes', async () => {
    const user = await createUser();
    const before = await import('@/modules/attention/services/dnd-service');

    await before.enableDND(user.id, { durationMinutes: 60 });
    expect(await before.isDNDActive(user.id)).toBe(true);

    // The column exists and holds the value `reason` used to carry as JSON.
    const stored = await db.dNDConfig.findUnique({ where: { userId: user.id } });
    expect(stored!.expiresAt).not.toBeNull();
    expect(stored!.isActive).toBe(true);

    // THE RESTART — the whole config used to be a Map, and P-33 moved it; what
    // moves here is the expiry, which had no column at all.
    jest.resetModules();

    const after = await import('@/modules/attention/services/dnd-service');
    expect(await after.isDNDActive(user.id)).toBe(true);
    const config = await after.getDNDConfig(user.id);
    expect(config.expiresAt).toBeInstanceOf(Date);
    // `reason` is now derived from the column, so the field that used to be
    // returned-once-and-lost survives with it.
    expect(JSON.parse(config.reason!).expiresAt).toBe(config.expiresAt!.toISOString());

    // Move the deadline into the past — the same thing sixty minutes does.
    await db.dNDConfig.update({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    jest.resetModules();
    const later = await import('@/modules/attention/services/dnd-service');

    // Before this column existed, this answered `true` forever.
    expect(await later.isDNDActive(user.id)).toBe(false);
    const expired = await later.getDNDConfig(user.id);
    expect(expired.isActive).toBe(false);
    expect(expired.expiresAt).toBeUndefined();

    // Expiry-on-read cleared the row, so a second process agrees rather than
    // each one re-deciding. This replaces a `setInterval` sweeper, which would
    // have been state in the process again.
    await withSecondClient(async (client) => {
      const row = await client.dNDConfig.findUnique({ where: { userId: user.id } });
      expect(row!.expiresAt).toBeNull();
      expect(row!.isActive).toBe(false);
    });
  });

  it('an expired timed DND stops suppressing notifications', async () => {
    const user = await createUser();
    const dnd = await import('@/modules/attention/services/dnd-service');

    await dnd.enableDND(user.id, { durationMinutes: 30 });
    expect(await dnd.shouldSuppress(user.id, { priority: 'P2' })).toBe(true);

    await db.dNDConfig.update({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    jest.resetModules();
    const after = await import('@/modules/attention/services/dnd-service');
    expect(await after.shouldSuppress(user.id, { priority: 'P2' })).toBe(false);
  });

  it('an indefinite DND is unaffected — a null expiry never expires', async () => {
    const user = await createUser();
    const dnd = await import('@/modules/attention/services/dnd-service');

    await dnd.enableDND(user.id);
    const row = await db.dNDConfig.findUnique({ where: { userId: user.id } });
    expect(row!.expiresAt).toBeNull();

    jest.resetModules();
    const after = await import('@/modules/attention/services/dnd-service');
    expect(await after.isDNDActive(user.id)).toBe(true);
    expect((await after.getDNDConfig(user.id)).reason).toBeUndefined();
  });

  it('disabling a timed DND clears the expiry rather than leaving it armed', async () => {
    const user = await createUser();
    const dnd = await import('@/modules/attention/services/dnd-service');

    await dnd.enableDND(user.id, { durationMinutes: 15 });
    await dnd.disableDND(user.id);

    const row = await db.dNDConfig.findUnique({ where: { userId: user.id } });
    expect(row!.expiresAt).toBeNull();
    expect(row!.isActive).toBe(false);
  });
});
