/**
 * P-06 acceptance — Inbox, Communication and Contacts tenancy, proven against a
 * real Postgres.
 *
 * ============================================================================
 * WHAT THIS FILE EXISTS TO PROVE
 * ============================================================================
 *
 * Two defects, in the same twenty-five route files.
 *
 * T-001. Eleven of those routes called `withAuth`, discarded the session as
 * `_session`, and then took the entity straight off the caller's own request --
 * or took nothing at all and queried unscoped. Three routes under
 * `/api/contacts/[id]/` did not import `withAuth` in the first place: cadence,
 * commitments and relationship-score answered anyone who could reach the URL,
 * about any contact in the database, by id. These are messages and contacts:
 * the PII is the payload.
 *
 * T-005. `src/modules/inbox/inbox.service.ts` exported:
 *
 *     // Extracts userId from the x-user-id header, falling back to 'default-user'
 *     export function getCurrentUserId(headers?): string
 *
 * and two write paths -- `createFollowUp` and `createCannedResponse` -- called
 * it with NO ARGUMENT, so the identity written on every follow-up reminder and
 * every canned response was the literal string 'default-user'. Not a trusted
 * header: a hardcoded identity belonging to nobody. `FollowUpReminder.userId`
 * and `CannedResponse.userId` are foreign keys to `User`, so those two writes
 * could only ever succeed against a database that happened to contain a user
 * with that id -- and if one ever did, every tenant's reminders would have
 * landed on it together.
 *
 * The assertions that matter, per route:
 *
 *   1. the owner reaches their own data                                -> 200/201
 *   2. tenant A cannot reach tenant B's data                           -> 403/404
 *   3. a write into B changes nothing in the database
 *   4. a FORGED `x-user-id` header naming the victim changes nothing   -> 403/404
 *   5. no session at all                                               -> 401
 *   6. symmetry: B reaches B's own data (a fix that denies everyone is not a fix)
 *
 * Plus the two shapes a single-record 403 does not cover:
 *   - a LIST route: an ordinary request whose filter matches B's row returns
 *     nothing. Leaking rows is a different failure from a refused record.
 *   - a BULK route: foreign ids are reported as not processed, and unchanged.
 *
 * Real Postgres, `getToken` unmocked, requests through the production route
 * handlers. A mocked-Prisma unit test cannot observe a missing tenant check.
 */

// ---------------------------------------------------------------------------
// The ONLY mock in this file, and it is not a seam.
//
// `uuid` ships ESM-only, and jest.db.config.ts is frozen for this build with no
// transform for node_modules -- so importing the commitments route, which
// reaches uuid through commitment-tracker, fails to parse. This replaces the id
// GENERATOR and nothing else. The database is real, `getToken` is unmocked, and
// every tenancy check below runs the production code path.
// ---------------------------------------------------------------------------
let uuidCounter = 0;
jest.mock('uuid', () => ({ v4: () => `db-test-uuid-${++uuidCounter}` }));

import { GET as inboxListGET } from '@/app/api/inbox/route';
import { GET as inboxStatsGET } from '@/app/api/inbox/stats/route';
import {
  GET as messageGET,
  PATCH as messagePATCH,
  DELETE as messageDELETE,
} from '@/app/api/inbox/[messageId]/route';
import { POST as sendPOST } from '@/app/api/inbox/send/route';
import {
  GET as followUpGET,
  POST as followUpPOST,
} from '@/app/api/inbox/follow-up/route';
import {
  PATCH as followUpPATCH,
  DELETE as followUpDELETE,
} from '@/app/api/inbox/follow-up/[followUpId]/route';
import {
  GET as cannedGET,
  POST as cannedPOST,
} from '@/app/api/inbox/canned-responses/route';
import {
  GET as cannedItemGET,
  PATCH as cannedItemPATCH,
  DELETE as cannedItemDELETE,
} from '@/app/api/inbox/canned-responses/[responseId]/route';
import { POST as batchTriagePOST } from '@/app/api/inbox/triage/batch/route';

import {
  GET as contactsGET,
  POST as contactsPOST,
} from '@/app/api/contacts/route';
import {
  GET as contactGET,
  PUT as contactPUT,
  DELETE as contactDELETE,
} from '@/app/api/contacts/[id]/route';
import {
  GET as cadenceGET,
  PUT as cadencePUT,
} from '@/app/api/contacts/[id]/cadence/route';
import {
  GET as commitmentsGET,
  POST as commitmentsPOST,
} from '@/app/api/contacts/[id]/commitments/route';
import { GET as scoreGET } from '@/app/api/contacts/[id]/relationship-score/route';

import { GET as commStatsGET } from '@/app/api/communication/stats/route';
import { GET as commHistoryGET } from '@/app/api/communication/history/route';

import { db, setupTestDatabase } from '../helpers/db';
import { createContact, createTwoTenants, type Tenant } from '../helpers/factories';
import { anonymousRequest, readJson, requestAs } from '../helpers/session';

setupTestDatabase();

type ErrBody = { success: false; error: { code: string; message: string } };
type OkBody<T> = { success: true; data: T };

/** The victim id an attacker would forge. Also the sentinel T-005 used to write. */
const FORGED = { 'x-user-id': 'default-user' } as const;

// ---------------------------------------------------------------------------
// Fixtures
//
// tests/helpers/factories.ts is frozen for this build and has no message
// factory, so this file builds one. Message.senderId is a foreign key to
// Contact, so a message always needs a contact in the same entity.
// ---------------------------------------------------------------------------

async function createMessage(
  entityId: string,
  senderId: string,
  overrides: Record<string, unknown> = {}
) {
  return db.message.create({
    data: {
      entityId,
      senderId,
      recipientId: 'recipient-1',
      channel: 'EMAIL',
      subject: 'Quarterly numbers',
      body: 'Please review the attached figures before Friday.',
      triageScore: 5,
      sensitivity: 'INTERNAL',
      ...overrides,
    },
  });
}

interface Fixture {
  tenantA: Tenant;
  tenantB: Tenant;
  contactA: Awaited<ReturnType<typeof createContact>>;
  contactB: Awaited<ReturnType<typeof createContact>>;
  messageA: Awaited<ReturnType<typeof createMessage>>;
  messageB: Awaited<ReturnType<typeof createMessage>>;
}

async function seed(): Promise<Fixture> {
  const { tenantA, tenantB } = await createTwoTenants();
  const contactA = await createContact(tenantA.entity.id, { name: 'Alice Anderson' });
  const contactB = await createContact(tenantB.entity.id, { name: 'Bob Baker' });
  const messageA = await createMessage(tenantA.entity.id, contactA.id, {
    subject: "A's private subject",
  });
  const messageB = await createMessage(tenantB.entity.id, contactB.id, {
    subject: "B's private subject",
    draftStatus: 'DRAFT',
  });
  return { tenantA, tenantB, contactA, contactB, messageA, messageB };
}

const messageCtx = (messageId: string) => ({ params: Promise.resolve({ messageId }) });
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });
const followUpCtx = (followUpId: string) => ({ params: Promise.resolve({ followUpId }) });
const responseCtx = (responseId: string) => ({ params: Promise.resolve({ responseId }) });

// ===========================================================================
// T-005 — the function is gone, not merely unused
// ===========================================================================

describe('the inbox module surface (T-005)', () => {
  it('no longer exports getCurrentUserId from the service', async () => {
    const service = await import('@/modules/inbox/inbox.service');
    expect('getCurrentUserId' in service).toBe(false);
  });

  it('no longer re-exports getCurrentUserId from the module index', async () => {
    const index = await import('@/modules/inbox/index');
    expect('getCurrentUserId' in index).toBe(false);
  });
});

// ===========================================================================
// T-005 — the two unparameterised call sites now write the real caller
// ===========================================================================

describe("the two writes that used to stamp 'default-user'", () => {
  it('writes the authenticated user on a follow-up reminder, never a literal', async () => {
    const { tenantA, messageA } = await seed();

    const res = await followUpPOST(
      requestAs(tenantA, '/api/inbox/follow-up', {
        method: 'POST',
        body: {
          messageId: messageA.id,
          entityId: tenantA.entity.id,
          reminderAt: new Date('2030-01-01').toISOString(),
          reason: 'Chase the numbers',
        },
      })
    );

    expect(res.status).toBe(201);

    const rows = await db.followUpReminder.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(tenantA.user.id);
    expect(rows[0].userId).not.toBe('default-user');
  });

  it('writes the authenticated user on a canned response, never a literal', async () => {
    const { tenantA } = await seed();

    const res = await cannedPOST(
      requestAs(tenantA, '/api/inbox/canned-responses', {
        method: 'POST',
        body: {
          name: 'Out of office',
          entityId: tenantA.entity.id,
          channel: 'EMAIL',
          category: 'General',
          body: 'I am away until Monday.',
          tone: 'FORMAL',
        },
      })
    );

    expect(res.status).toBe(201);

    const rows = await db.cannedResponse.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(tenantA.user.id);
    expect(rows[0].userId).not.toBe('default-user');
  });

  it('ignores a forged x-user-id header on the write path', async () => {
    const { tenantA, messageA } = await seed();

    const res = await followUpPOST(
      requestAs(tenantA, '/api/inbox/follow-up', {
        method: 'POST',
        headers: { 'x-user-id': 'default-user' },
        body: {
          messageId: messageA.id,
          entityId: tenantA.entity.id,
          reminderAt: new Date('2030-01-01').toISOString(),
        },
      })
    );

    expect(res.status).toBe(201);
    const rows = await db.followUpReminder.findMany();
    expect(rows[0].userId).toBe(tenantA.user.id);
  });
});

// ===========================================================================
// The inbox list route — the leak shape, not the refusal shape
// ===========================================================================

describe('GET /api/inbox', () => {
  it("lets A read A's own inbox", async () => {
    const { tenantA } = await seed();
    const res = await inboxListGET(requestAs(tenantA, '/api/inbox'));

    expect(res.status).toBe(200);
    const body = await readJson<OkBody<{ items: Array<{ message: { subject: string } }> }>>(res);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].message.subject).toBe("A's private subject");
  });

  it("refuses A naming B's entity", async () => {
    const { tenantA, tenantB } = await seed();
    const res = await inboxListGET(
      requestAs(tenantA, `/api/inbox?entityId=${tenantB.entity.id}`)
    );

    expect(res.status).toBe(403);
    expect((await readJson<ErrBody>(res)).error.code).toBe('FORBIDDEN');
  });

  it("does not leak B's row through an ordinary filter that matches it", async () => {
    // Not "refuses ?entityId=B" -- an ordinary request, with a search filter
    // that matches B's message and not A's. Under the old code the entity was
    // applied only `if (params.entityId)`, so this returned B's message.
    const { tenantA } = await seed();

    const res = await inboxListGET(
      requestAs(tenantA, "/api/inbox?search=B's private subject")
    );

    expect(res.status).toBe(200);
    const body = await readJson<OkBody<{ items: unknown[] }>>(res);
    expect(body.data.items).toHaveLength(0);
  });

  it('ignores a forged x-user-id header naming the victim', async () => {
    const { tenantA, tenantB } = await seed();
    const res = await inboxListGET(
      requestAs(tenantA, `/api/inbox?entityId=${tenantB.entity.id}`, {
        headers: { 'x-user-id': tenantB.user.id },
      })
    );

    expect(res.status).toBe(403);
  });

  it('refuses a request with no session', async () => {
    await seed();
    const res = await inboxListGET(anonymousRequest('/api/inbox'));
    expect(res.status).toBe(401);
  });

  it("lets B read B's own inbox (symmetry)", async () => {
    const { tenantB } = await seed();
    const res = await inboxListGET(requestAs(tenantB, '/api/inbox'));

    expect(res.status).toBe(200);
    const body = await readJson<OkBody<{ items: Array<{ message: { subject: string } }> }>>(res);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].message.subject).toBe("B's private subject");
  });
});

// ===========================================================================
// Inbox stats — the unscoped-count shape
// ===========================================================================

describe('GET /api/inbox/stats', () => {
  it("counts only A's messages, not the whole table", async () => {
    // getInboxStats took an OPTIONAL entityId and counted everything when it
    // was omitted. Two tenants have one message each; A must see exactly one.
    const { tenantA } = await seed();
    const res = await inboxStatsGET(requestAs(tenantA, '/api/inbox/stats'));

    expect(res.status).toBe(200);
    expect((await readJson<OkBody<{ total: number }>>(res)).data.total).toBe(1);
  });

  it("refuses A naming B's entity", async () => {
    const { tenantA, tenantB } = await seed();
    const res = await inboxStatsGET(
      requestAs(tenantA, `/api/inbox/stats?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });

  it('refuses a request with no session', async () => {
    await seed();
    expect((await inboxStatsGET(anonymousRequest('/api/inbox/stats'))).status).toBe(401);
  });
});

// ===========================================================================
// A single message — the entity is a property of the row
// ===========================================================================

describe('/api/inbox/[messageId]', () => {
  it("lets A read A's own message", async () => {
    const { tenantA, messageA } = await seed();
    const res = await messageGET(
      requestAs(tenantA, `/api/inbox/${messageA.id}`),
      messageCtx(messageA.id)
    );
    expect(res.status).toBe(200);
  });

  it("refuses A reading B's message", async () => {
    const { tenantA, messageB } = await seed();
    const res = await messageGET(
      requestAs(tenantA, `/api/inbox/${messageB.id}`),
      messageCtx(messageB.id)
    );
    expect(res.status).toBe(403);
  });

  it("refuses A writing to B's message, and writes nothing", async () => {
    const { tenantA, messageB } = await seed();
    const res = await messagePATCH(
      requestAs(tenantA, `/api/inbox/${messageB.id}`, {
        method: 'PATCH',
        body: { isRead: true, isStarred: true },
      }),
      messageCtx(messageB.id)
    );

    expect(res.status).toBe(403);
    // a 403 that still writes is not a fix
    const after = await db.message.findUniqueOrThrow({ where: { id: messageB.id } });
    expect(after.read).toBe(false);
    expect(after.starred).toBe(false);
  });

  it("refuses A archiving B's message, and changes nothing", async () => {
    const { tenantA, messageB } = await seed();
    const res = await messageDELETE(
      requestAs(tenantA, `/api/inbox/${messageB.id}`, { method: 'DELETE' }),
      messageCtx(messageB.id)
    );

    expect(res.status).toBe(403);
    const after = await db.message.findUniqueOrThrow({ where: { id: messageB.id } });
    expect(after.read).toBe(false);
  });

  it('ignores a forged x-user-id header naming the victim', async () => {
    const { tenantA, messageB, tenantB } = await seed();
    const res = await messageGET(
      requestAs(tenantA, `/api/inbox/${messageB.id}`, {
        headers: { 'x-user-id': tenantB.user.id },
      }),
      messageCtx(messageB.id)
    );
    expect(res.status).toBe(403);
  });

  it('refuses an anonymous caller before it reaches the database', async () => {
    const { messageA } = await seed();
    const res = await messageGET(
      anonymousRequest(`/api/inbox/${messageA.id}`),
      messageCtx(messageA.id)
    );
    expect(res.status).toBe(401);
  });

  it("lets B write to B's own message (symmetry)", async () => {
    const { tenantB, messageB } = await seed();
    const res = await messagePATCH(
      requestAs(tenantB, `/api/inbox/${messageB.id}`, {
        method: 'PATCH',
        body: { isRead: true },
      }),
      messageCtx(messageB.id)
    );

    expect(res.status).toBe(200);
    const after = await db.message.findUniqueOrThrow({ where: { id: messageB.id } });
    expect(after.read).toBe(true);
  });
});

// ===========================================================================
// Sending someone else's draft
// ===========================================================================

describe('POST /api/inbox/send', () => {
  it("refuses to send B's draft, and leaves it a draft", async () => {
    const { tenantA, messageB } = await seed();
    const res = await sendPOST(
      requestAs(tenantA, '/api/inbox/send', {
        method: 'POST',
        body: { messageId: messageB.id },
      })
    );

    expect(res.status).toBe(403);
    const after = await db.message.findUniqueOrThrow({ where: { id: messageB.id } });
    expect(after.draftStatus).toBe('DRAFT');
  });

  it("lets B send B's own draft (symmetry)", async () => {
    const { tenantB, messageB } = await seed();
    const res = await sendPOST(
      requestAs(tenantB, '/api/inbox/send', {
        method: 'POST',
        body: { messageId: messageB.id },
      })
    );

    expect(res.status).toBe(200);
    const after = await db.message.findUniqueOrThrow({ where: { id: messageB.id } });
    expect(after.draftStatus).toBe('SENT');
  });

  it('refuses a request with no session', async () => {
    const { messageB } = await seed();
    const res = await sendPOST(
      anonymousRequest('/api/inbox/send', {
        method: 'POST',
        body: { messageId: messageB.id },
      })
    );
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// Follow-up reminders — scope column is userId, not entityId
// ===========================================================================

describe('/api/inbox/follow-up', () => {
  async function seedFollowUps() {
    const f = await seed();
    const forA = await db.followUpReminder.create({
      data: {
        userId: f.tenantA.user.id,
        messageId: f.messageA.id,
        description: "A's reminder",
        dueDate: new Date('2030-01-01'),
        priority: `PENDING:${f.tenantA.entity.id}`,
      },
    });
    const forB = await db.followUpReminder.create({
      data: {
        userId: f.tenantB.user.id,
        messageId: f.messageB.id,
        description: "B's reminder",
        dueDate: new Date('2030-01-02'),
        priority: `PENDING:${f.tenantB.entity.id}`,
      },
    });
    return { ...f, forA, forB };
  }

  it("lists only A's reminders", async () => {
    const { tenantA } = await seedFollowUps();
    const res = await followUpGET(requestAs(tenantA, '/api/inbox/follow-up'));

    expect(res.status).toBe(200);
    const body = await readJson<OkBody<Array<{ reason: string }>>>(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].reason).toBe("A's reminder");
  });

  it("refuses to create a reminder on B's message, and writes nothing", async () => {
    const { tenantA, tenantB, messageB } = await seedFollowUps();
    const before = await db.followUpReminder.count();

    const res = await followUpPOST(
      requestAs(tenantA, '/api/inbox/follow-up', {
        method: 'POST',
        body: {
          messageId: messageB.id,
          entityId: tenantB.entity.id,
          reminderAt: new Date('2030-01-01').toISOString(),
        },
      })
    );

    expect(res.status).toBe(403);
    expect(await db.followUpReminder.count()).toBe(before);
  });

  it("refuses to complete B's reminder, and leaves it pending", async () => {
    const { tenantA, forB } = await seedFollowUps();
    const res = await followUpPATCH(
      requestAs(tenantA, `/api/inbox/follow-up/${forB.id}`, {
        method: 'PATCH',
        body: { status: 'COMPLETED' },
      }),
      followUpCtx(forB.id)
    );

    expect(res.status).toBe(404);
    const after = await db.followUpReminder.findUniqueOrThrow({ where: { id: forB.id } });
    expect(after.completed).toBe(false);
    expect(after.priority.startsWith('PENDING')).toBe(true);
  });

  it("refuses to cancel B's reminder, and leaves it pending", async () => {
    const { tenantA, forB } = await seedFollowUps();
    const res = await followUpDELETE(
      requestAs(tenantA, `/api/inbox/follow-up/${forB.id}`, { method: 'DELETE' }),
      followUpCtx(forB.id)
    );

    expect(res.status).toBe(404);
    const after = await db.followUpReminder.findUniqueOrThrow({ where: { id: forB.id } });
    expect(after.priority.startsWith('PENDING')).toBe(true);
  });

  it('ignores a forged x-user-id header naming the victim', async () => {
    const { tenantA, tenantB, forB } = await seedFollowUps();
    const res = await followUpPATCH(
      requestAs(tenantA, `/api/inbox/follow-up/${forB.id}`, {
        method: 'PATCH',
        headers: { 'x-user-id': tenantB.user.id },
        body: { status: 'COMPLETED' },
      }),
      followUpCtx(forB.id)
    );

    expect(res.status).toBe(404);
    const after = await db.followUpReminder.findUniqueOrThrow({ where: { id: forB.id } });
    expect(after.completed).toBe(false);
  });

  it("lets B complete B's own reminder (symmetry)", async () => {
    const { tenantB, forB } = await seedFollowUps();
    const res = await followUpPATCH(
      requestAs(tenantB, `/api/inbox/follow-up/${forB.id}`, {
        method: 'PATCH',
        body: { status: 'COMPLETED' },
      }),
      followUpCtx(forB.id)
    );

    expect(res.status).toBe(200);
    const after = await db.followUpReminder.findUniqueOrThrow({ where: { id: forB.id } });
    expect(after.completed).toBe(true);
  });

  it('refuses a request with no session', async () => {
    await seedFollowUps();
    expect((await followUpGET(anonymousRequest('/api/inbox/follow-up'))).status).toBe(401);
  });
});

// ===========================================================================
// Canned responses — scope column is userId
// ===========================================================================

describe('/api/inbox/canned-responses', () => {
  async function seedCanned() {
    const f = await seed();
    const meta = (entityId: string) =>
      JSON.stringify({
        entityId,
        channel: 'EMAIL',
        category: 'General',
        tone: 'FORMAL',
        usageCount: 0,
      });
    const forA = await db.cannedResponse.create({
      data: {
        userId: f.tenantA.user.id,
        title: "A's template",
        content: 'A body',
        shortcut: meta(f.tenantA.entity.id),
      },
    });
    const forB = await db.cannedResponse.create({
      data: {
        userId: f.tenantB.user.id,
        title: "B's template",
        content: 'B body',
        shortcut: meta(f.tenantB.entity.id),
      },
    });
    return { ...f, forA, forB };
  }

  it("lists only A's templates", async () => {
    const { tenantA } = await seedCanned();
    const res = await cannedGET(requestAs(tenantA, '/api/inbox/canned-responses'));

    expect(res.status).toBe(200);
    const body = await readJson<OkBody<Array<{ name: string }>>>(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("A's template");
  });

  it("refuses A reading B's template", async () => {
    const { tenantA, forB } = await seedCanned();
    const res = await cannedItemGET(
      requestAs(tenantA, `/api/inbox/canned-responses/${forB.id}`),
      responseCtx(forB.id)
    );
    expect(res.status).toBe(404);
  });

  it("refuses A editing B's template, and changes nothing", async () => {
    const { tenantA, forB } = await seedCanned();
    const res = await cannedItemPATCH(
      requestAs(tenantA, `/api/inbox/canned-responses/${forB.id}`, {
        method: 'PATCH',
        body: { name: 'Owned by A now', body: 'replaced' },
      }),
      responseCtx(forB.id)
    );

    expect(res.status).toBe(404);
    const after = await db.cannedResponse.findUniqueOrThrow({ where: { id: forB.id } });
    expect(after.title).toBe("B's template");
    expect(after.content).toBe('B body');
  });

  it("refuses A deleting B's template, and the row survives", async () => {
    const { tenantA, forB } = await seedCanned();
    const res = await cannedItemDELETE(
      requestAs(tenantA, `/api/inbox/canned-responses/${forB.id}`, { method: 'DELETE' }),
      responseCtx(forB.id)
    );

    expect(res.status).toBe(404);
    expect(await db.cannedResponse.count({ where: { id: forB.id } })).toBe(1);
  });

  it('ignores a forged x-user-id header naming the victim', async () => {
    const { tenantA, tenantB, forB } = await seedCanned();
    const res = await cannedItemGET(
      requestAs(tenantA, `/api/inbox/canned-responses/${forB.id}`, {
        headers: { 'x-user-id': tenantB.user.id },
      }),
      responseCtx(forB.id)
    );
    expect(res.status).toBe(404);
  });

  it("lets B read B's own template (symmetry)", async () => {
    const { tenantB, forB } = await seedCanned();
    const res = await cannedItemGET(
      requestAs(tenantB, `/api/inbox/canned-responses/${forB.id}`),
      responseCtx(forB.id)
    );
    expect(res.status).toBe(200);
  });

  it('refuses a request with no session', async () => {
    await seedCanned();
    expect(
      (await cannedGET(anonymousRequest('/api/inbox/canned-responses'))).status
    ).toBe(401);
  });
});

// ===========================================================================
// The bulk route
// ===========================================================================

describe('POST /api/inbox/triage/batch', () => {
  it("reports 0 processed for B's message ids, and changes nothing", async () => {
    const { tenantA, messageB } = await seed();
    const before = await db.message.findUniqueOrThrow({ where: { id: messageB.id } });

    const res = await batchTriagePOST(
      requestAs(tenantA, '/api/inbox/triage/batch', {
        method: 'POST',
        body: { messageIds: [messageB.id] },
      })
    );

    expect(res.status).toBe(201);
    const body = await readJson<OkBody<{ processed: number }>>(res);
    expect(body.data.processed).toBe(0);

    const after = await db.message.findUniqueOrThrow({ where: { id: messageB.id } });
    expect(after.triageScore).toBe(before.triageScore);
    expect(after.intent).toBe(before.intent);
  });

  it("refuses outright when A names B's entity", async () => {
    const { tenantA, tenantB, messageB } = await seed();
    const res = await batchTriagePOST(
      requestAs(tenantA, '/api/inbox/triage/batch', {
        method: 'POST',
        body: { entityId: tenantB.entity.id, messageIds: [messageB.id] },
      })
    );
    expect(res.status).toBe(403);
  });

  it('refuses a request with no session', async () => {
    await seed();
    const res = await batchTriagePOST(
      anonymousRequest('/api/inbox/triage/batch', {
        method: 'POST',
        body: { messageIds: [] },
      })
    );
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// Contacts
// ===========================================================================

describe('/api/contacts', () => {
  it("lists only A's contacts", async () => {
    const { tenantA } = await seed();
    const res = await contactsGET(requestAs(tenantA, '/api/contacts'));

    expect(res.status).toBe(200);
    const body = await readJson<{ success: true; data: Array<{ name: string }> }>(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Alice Anderson');
  });

  it("does not leak B's contact through an ordinary tag filter", async () => {
    const { tenantA, tenantB } = await seed();
    await createContact(tenantB.entity.id, { name: 'Hidden', tags: ['vip'] });

    const res = await contactsGET(requestAs(tenantA, '/api/contacts?tags=vip'));

    expect(res.status).toBe(200);
    const body = await readJson<{ success: true; data: unknown[] }>(res);
    expect(body.data).toHaveLength(0);
  });

  it("refuses to create a contact inside B's entity, and writes nothing", async () => {
    const { tenantA, tenantB } = await seed();
    const before = await db.contact.count({ where: { entityId: tenantB.entity.id } });

    const res = await contactsPOST(
      requestAs(tenantA, '/api/contacts', {
        method: 'POST',
        body: { entityId: tenantB.entity.id, name: 'Planted by A' },
      })
    );

    expect(res.status).toBe(403);
    expect(await db.contact.count({ where: { entityId: tenantB.entity.id } })).toBe(before);
  });

  it("creates into A's own entity when the caller names none", async () => {
    const { tenantA } = await seed();
    const res = await contactsPOST(
      requestAs(tenantA, '/api/contacts', {
        method: 'POST',
        body: { name: 'No entity named' },
      })
    );

    expect(res.status).toBe(201);
    const created = await db.contact.findFirstOrThrow({ where: { name: 'No entity named' } });
    expect(created.entityId).toBe(tenantA.entity.id);
  });

  it("refuses A reading B's contact", async () => {
    const { tenantA, contactB } = await seed();
    const res = await contactGET(
      requestAs(tenantA, `/api/contacts/${contactB.id}`),
      idCtx(contactB.id)
    );
    expect(res.status).toBe(403);
  });

  it("refuses A editing B's contact, and changes nothing", async () => {
    const { tenantA, contactB } = await seed();
    const res = await contactPUT(
      requestAs(tenantA, `/api/contacts/${contactB.id}`, {
        method: 'PUT',
        body: { name: 'Renamed by A', email: 'a@attacker.test' },
      }),
      idCtx(contactB.id)
    );

    expect(res.status).toBe(403);
    const after = await db.contact.findUniqueOrThrow({ where: { id: contactB.id } });
    expect(after.name).toBe('Bob Baker');
    expect(after.email).toBeNull();
  });

  it("refuses A deleting B's contact, and changes nothing", async () => {
    const { tenantA, contactB } = await seed();
    const res = await contactDELETE(
      requestAs(tenantA, `/api/contacts/${contactB.id}`, { method: 'DELETE' }),
      idCtx(contactB.id)
    );

    expect(res.status).toBe(403);
    const after = await db.contact.findUniqueOrThrow({ where: { id: contactB.id } });
    expect(after.tags).not.toContain('_deleted');
  });

  it('ignores a forged x-user-id header naming the victim', async () => {
    const { tenantA, tenantB, contactB } = await seed();
    const res = await contactGET(
      requestAs(tenantA, `/api/contacts/${contactB.id}`, {
        headers: { 'x-user-id': tenantB.user.id },
      }),
      idCtx(contactB.id)
    );
    expect(res.status).toBe(403);
  });

  it('refuses a request with no session', async () => {
    const { contactA } = await seed();
    expect((await contactsGET(anonymousRequest('/api/contacts'))).status).toBe(401);
    expect(
      (await contactGET(anonymousRequest(`/api/contacts/${contactA.id}`), idCtx(contactA.id)))
        .status
    ).toBe(401);
  });

  it("lets B edit B's own contact (symmetry)", async () => {
    const { tenantB, contactB } = await seed();
    const res = await contactPUT(
      requestAs(tenantB, `/api/contacts/${contactB.id}`, {
        method: 'PUT',
        body: { name: 'Bob Renamed' },
      }),
      idCtx(contactB.id)
    );

    expect(res.status).toBe(200);
    const after = await db.contact.findUniqueOrThrow({ where: { id: contactB.id } });
    expect(after.name).toBe('Bob Renamed');
  });
});

// ===========================================================================
// The three routes that had NO AUTHENTICATION AT ALL
//
// Before this package, none of these imported withAuth. An anonymous request
// returned 200 and the tenant's data. The 401 cases below are therefore not a
// formality: they are the whole finding.
// ===========================================================================

describe('/api/contacts/[id]/cadence — was unauthenticated', () => {
  it('refuses an anonymous caller', async () => {
    const { contactA } = await seed();
    const res = await cadenceGET(
      anonymousRequest(`/api/contacts/${contactA.id}/cadence`),
      idCtx(contactA.id)
    );
    expect(res.status).toBe(401);
  });

  it("refuses A reading B's cadence", async () => {
    const { tenantA, contactB } = await seed();
    const res = await cadenceGET(
      requestAs(tenantA, `/api/contacts/${contactB.id}/cadence`),
      idCtx(contactB.id)
    );
    expect(res.status).toBe(403);
  });

  it("refuses A setting B's cadence, and changes nothing", async () => {
    const { tenantA, contactB } = await seed();
    const res = await cadencePUT(
      requestAs(tenantA, `/api/contacts/${contactB.id}/cadence`, {
        method: 'PUT',
        body: { frequency: 'DAILY' },
      }),
      idCtx(contactB.id)
    );

    expect(res.status).toBe(403);
    const after = await db.contact.findUniqueOrThrow({ where: { id: contactB.id } });
    expect((after.preferences as Record<string, unknown>).cadenceFrequency).toBeUndefined();
  });

  it("lets B set B's own cadence (symmetry)", async () => {
    const { tenantB, contactB } = await seed();
    const res = await cadencePUT(
      requestAs(tenantB, `/api/contacts/${contactB.id}/cadence`, {
        method: 'PUT',
        body: { frequency: 'WEEKLY' },
      }),
      idCtx(contactB.id)
    );

    expect(res.status).toBe(200);
    const after = await db.contact.findUniqueOrThrow({ where: { id: contactB.id } });
    expect((after.preferences as Record<string, unknown>).cadenceFrequency).toBe('WEEKLY');
  });
});

describe('/api/contacts/[id]/commitments — was unauthenticated', () => {
  it('refuses an anonymous caller', async () => {
    const { contactA } = await seed();
    const res = await commitmentsGET(
      anonymousRequest(`/api/contacts/${contactA.id}/commitments`),
      idCtx(contactA.id)
    );
    expect(res.status).toBe(401);
  });

  it("refuses A reading B's commitments", async () => {
    const { tenantA, contactB } = await seed();
    const res = await commitmentsGET(
      requestAs(tenantA, `/api/contacts/${contactB.id}/commitments`),
      idCtx(contactB.id)
    );
    expect(res.status).toBe(403);
  });

  it("refuses A adding a commitment to B's contact, and writes nothing", async () => {
    const { tenantA, contactB } = await seed();
    const res = await commitmentsPOST(
      requestAs(tenantA, `/api/contacts/${contactB.id}/commitments`, {
        method: 'POST',
        body: { description: 'Planted by A', direction: 'TO' },
      }),
      idCtx(contactB.id)
    );

    expect(res.status).toBe(403);
    const after = await db.contact.findUniqueOrThrow({ where: { id: contactB.id } });
    expect(after.commitments as unknown[]).toHaveLength(0);
  });

  it("lets B add a commitment to B's own contact (symmetry)", async () => {
    const { tenantB, contactB } = await seed();
    const res = await commitmentsPOST(
      requestAs(tenantB, `/api/contacts/${contactB.id}/commitments`, {
        method: 'POST',
        body: { description: "B's own commitment", direction: 'TO' },
      }),
      idCtx(contactB.id)
    );

    expect(res.status).toBe(201);
    const after = await db.contact.findUniqueOrThrow({ where: { id: contactB.id } });
    expect(after.commitments as unknown[]).toHaveLength(1);
  });
});

describe('/api/contacts/[id]/relationship-score — was unauthenticated', () => {
  it('refuses an anonymous caller', async () => {
    const { contactA } = await seed();
    const res = await scoreGET(
      anonymousRequest(`/api/contacts/${contactA.id}/relationship-score`),
      idCtx(contactA.id)
    );
    expect(res.status).toBe(401);
  });

  it("ignores the old 'default-user' sentinel in a forged header", async () => {
    // 'default-user' was the identity T-005 wrote for everyone. If any code
    // still recognised it, forging it would be the cheapest possible bypass.
    const { tenantA, contactB } = await seed();
    const res = await scoreGET(
      requestAs(tenantA, `/api/contacts/${contactB.id}/relationship-score`, {
        headers: { ...FORGED },
      }),
      idCtx(contactB.id)
    );
    expect(res.status).toBe(403);
  });

  it("refuses A scoring B's contact", async () => {
    const { tenantA, contactB } = await seed();
    const res = await scoreGET(
      requestAs(tenantA, `/api/contacts/${contactB.id}/relationship-score`),
      idCtx(contactB.id)
    );
    expect(res.status).toBe(403);
  });

  it('ignores a forged x-user-id header naming the victim', async () => {
    const { tenantA, tenantB, contactB } = await seed();
    const res = await scoreGET(
      requestAs(tenantA, `/api/contacts/${contactB.id}/relationship-score`, {
        headers: { 'x-user-id': tenantB.user.id },
      }),
      idCtx(contactB.id)
    );
    expect(res.status).toBe(403);
  });

  it("lets B score B's own contact (symmetry)", async () => {
    const { tenantB, contactB } = await seed();
    const res = await scoreGET(
      requestAs(tenantB, `/api/contacts/${contactB.id}/relationship-score`),
      idCtx(contactB.id)
    );
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// Communication — the "no entityId means no scope" shape
// ===========================================================================

describe('/api/communication', () => {
  it("counts only A's rows when the caller names no entity", async () => {
    // GET /api/communication/stats verified ownership only `if (entityId)` and
    // spread the scope into each count only `if (entityId)`. Omitting the
    // parameter therefore counted the whole table. A has one message today; B
    // has one too. A must see exactly its own.
    const { tenantA } = await seed();
    await db.message.updateMany({ data: { draftStatus: 'draft' } });

    const res = await commStatsGET(requestAs(tenantA, '/api/communication/stats'));

    expect(res.status).toBe(200);
    expect((await readJson<OkBody<{ draftsToday: number }>>(res)).data.draftsToday).toBe(1);
  });

  it("refuses A naming B's entity on stats", async () => {
    const { tenantA, tenantB } = await seed();
    const res = await commStatsGET(
      requestAs(tenantA, `/api/communication/stats?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });

  it("returns only A's history", async () => {
    const { tenantA } = await seed();
    const res = await commHistoryGET(requestAs(tenantA, '/api/communication/history'));

    expect(res.status).toBe(200);
    const body = await readJson<{ success: true; data: Array<{ subject: string }> }>(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].subject).toBe("A's private subject");
  });

  it("refuses A naming B's entity on history", async () => {
    const { tenantA, tenantB } = await seed();
    const res = await commHistoryGET(
      requestAs(tenantA, `/api/communication/history?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });

  it('refuses a request with no session', async () => {
    await seed();
    expect((await commStatsGET(anonymousRequest('/api/communication/stats'))).status).toBe(401);
    expect((await commHistoryGET(anonymousRequest('/api/communication/history'))).status).toBe(401);
  });
});
