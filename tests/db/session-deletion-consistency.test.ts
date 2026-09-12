/**
 * P-44 — THREE ROUTES DELETE A SESSION. THEY NOW DO THE SAME THING.
 *
 * ===========================================================================
 * THE RULING
 * ===========================================================================
 *
 * Ivan, verbatim:
 *
 *     "404 on all three paths. A deleted session means deleted. Receipts
 *     survive (they have `userId` now thanks to P-40) but session content is
 *     gone. Don't preserve session data under a different label — that's the
 *     kind of thing that fails a privacy audit. If someone deletes a session,
 *     honor it."
 *
 * It resolves a finding P-41 raised and deliberately did not act on: three ways
 * to delete a session produced three different regulatory outcomes. Counting the
 * routes rather than the call sites found FIVE paths, and no two agreed:
 *
 *   route / call site                      receipts            auth events
 *   ------------------------------------   -----------------   -----------
 *   POST /api/shadow/delete-session/[id]   scrub + detach  ok  detach   ok
 *   DELETE /api/shadow/conversations/[id]  DELETED        BUG  DELETED BUG
 *   DELETE /api/shadow/sessions/[id]       detach, NO scrub    DELETED BUG
 *   POST /api/shadow/history/clear         detach, NO scrub    DELETED BUG
 *   retention.ts nightly sweep             own 7-year clock ok  own clock ok
 *
 * The middle three are the defect, in both directions at once. `conversations`
 * destroyed the record that a human authorised the action — the interactive
 * "delete this conversation" button, live every day since the repository was
 * written, and the identical line P-17 had already removed from two other files.
 * The other two retained the receipt with `reasoning` intact, which is the field
 * that quotes what the user actually said: session content preserved under a
 * different label, which is what the ruling names.
 *
 * `retention.ts` is CORRECT and this package did not touch it. Receipts expiring
 * on their own `executedAt` clock against `consentReceiptsDays` (2555) is the
 * whole point of P-17's work; `tests/db/shadow-retention.test.ts` owns that
 * proof and still passes.
 *
 * ===========================================================================
 * WHAT THIS FILE HAS TO SHOW, AND WHY EACH CLAUSE IS HERE
 * ===========================================================================
 *
 * Every case drives a REAL ROUTE, with a real session cookie, and reads the
 * result back after `jest.resetModules()` through a SECOND `PrismaClient` — a
 * different process's view of the same rows. The receipt is written by
 * `POST /api/shadow/action`, which is how a receipt is actually written; calling
 * `createReceipt()` and reading the row back would prove the column can hold a
 * string, not that the attribution survives the thing that destroys it.
 *
 *   the session row, its messages and its outcome are GONE
 *   the consent receipt is PRESENT, `sessionId` null, `userId` = the user
 *   its `reasoning` is the marker, `messageId` null, `sourcesCited` []
 *   its safety metadata is untouched — a receipt scrubbed to a timestamp
 *     proves nothing, which is the opposite of "retained for compliance"
 *   the auth event is PRESENT and detached
 *   another user's deletion attempt is 404 AND THE ROW SURVIVES
 *
 * THE LAST CLAUSE IS THE POSITIVE CONTROL AND IT IS NOT DECORATION. P-20 counted
 * 267 route/method pairs that refuse everyone and are counted nowhere; without
 * proving the legitimate deletion still works, "refuses everything" passes as
 * "refuses correctly", and P-41's mutation M8 showed 18 cases that would have
 * passed without their controls. Both halves run against each route, from one
 * table, so a route added to the repository without a case here is visible as an
 * absence rather than assumed covered.
 *
 * Requires a real Postgres. There is deliberately no skip.
 */

import { PrismaClient } from '@prisma/client';

import { db, setupTestDatabase } from '../helpers/db';
import { readJson, requestAs } from '../helpers/session';
import { createTenant, type Tenant } from '../helpers/factories';
import { SCRUBBED_REASONING } from '@/modules/shadow/compliance/gdpr-export';

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

// ---------------------------------------------------------------------------
// The three routes, as one table
// ---------------------------------------------------------------------------

type DeleteRoute = (actor: Tenant, sessionId: string) => Promise<Response>;

interface Entry {
  /** How it appears in the P-44 report's table. */
  name: string;
  call: DeleteRoute;
}

const ROUTES: readonly Entry[] = [
  {
    name: 'POST /api/shadow/delete-session/[id]',
    call: async (actor, sessionId) => {
      const { POST } = await import('@/app/api/shadow/delete-session/[id]/route');
      return POST(
        requestAs(actor, `/api/shadow/delete-session/${sessionId}`, { method: 'POST' }),
        { params: Promise.resolve({ id: sessionId }) }
      );
    },
  },
  {
    name: 'DELETE /api/shadow/conversations/[id]',
    call: async (actor, sessionId) => {
      const { DELETE } = await import('@/app/api/shadow/conversations/[id]/route');
      return DELETE(
        requestAs(actor, `/api/shadow/conversations/${sessionId}`, { method: 'DELETE' }),
        { params: Promise.resolve({ id: sessionId }) }
      );
    },
  },
  {
    name: 'DELETE /api/shadow/sessions/[id]',
    call: async (actor, sessionId) => {
      const { DELETE } = await import('@/app/api/shadow/sessions/[id]/route');
      return DELETE(
        requestAs(actor, `/api/shadow/sessions/${sessionId}`, { method: 'DELETE' }),
        { params: Promise.resolve({ id: sessionId }) }
      );
    },
  },
];

// ---------------------------------------------------------------------------
// A conversation worth deleting
// ---------------------------------------------------------------------------

/** The phrase that must not survive. Searched for by value after each deletion. */
const SPOKEN = 'yes go ahead and file the quarterly return';

interface Conversation {
  sessionId: string;
  receiptId: string;
  authEventId: string;
  outcomeId: string;
  /**
   * How many transcript rows the setup produced.
   *
   * Counted rather than hard-coded: the user's line is one, and
   * `POST /api/shadow/action` writes its own confirmation message, so the number
   * is a property of the production route and not of this file. A literal here
   * would turn a change in the action route into a failure in a deletion test.
   */
  messageCount: number;
}

/**
 * One session with everything a deletion has to make a decision about: a
 * transcript, an outcome, an auth event, and a consent receipt written by the
 * production route from the authenticated caller's own identity.
 *
 * `activeEntityId` is deliberately null. That is the receipt Ivan's window-02
 * ruling was about: with no entity, `entityId` cannot stand in for the
 * attribution, so `userId` is the only thing that can keep the surviving row
 * attributable — and P-17's escalation named this exact row as the one its
 * workaround could not reach.
 */
async function openConversation(tenant: Tenant): Promise<Conversation> {
  const voiceSession = await db.shadowVoiceSession.create({
    data: { userId: tenant.user.id, status: 'active', currentChannel: 'web' },
  });

  // The user says something, and it goes in the transcript.
  await db.shadowMessage.create({
    data: {
      sessionId: voiceSession.id,
      role: 'user',
      content: SPOKEN,
      channel: 'web',
    },
  });

  // The real confirmation route. `create_task` needs no step-up, so this is the
  // ordinary path rather than a PIN-gated one.
  const { POST: action } = await import('@/app/api/shadow/action/route');
  const confirmed = await action(
    requestAs(tenant, '/api/shadow/action', {
      method: 'POST',
      body: {
        sessionId: voiceSession.id,
        actionId: 'confirm-create_task-1789000000000',
        response: 'confirm:create_task',
        sourcesCited: [{ type: 'task', id: 'task-quarterly', label: SPOKEN }],
      },
    })
  );
  expect(confirmed.status).toBe(200);
  const receiptId = (
    await readJson<{ data: { receiptId: string } }>(confirmed)
  ).data.receiptId;
  expect(receiptId).toBeTruthy();

  // The outcome is the structured read of the conversation. `decisionsMade` and
  // `commitments` are where its content lives, so SPOKEN goes in both: the
  // deletion has to take the derived record as well as the transcript, or the
  // transcript survives in a normalised form, which is the "different label"
  // outcome.
  const outcome = await db.shadowSessionOutcome.create({
    data: {
      sessionId: voiceSession.id,
      decisionsMade: [SPOKEN],
      commitments: [SPOKEN],
      userVerified: true,
    },
  });

  const authEvent = await db.shadowAuthEvent.create({
    data: {
      userId: tenant.user.id,
      sessionId: voiceSession.id,
      method: 'voice_pin',
      result: 'success',
      actionAttempted: 'create_task',
    },
  });

  const messageCount = await db.shadowMessage.count({
    where: { sessionId: voiceSession.id },
  });
  expect(messageCount).toBeGreaterThan(0);

  return {
    sessionId: voiceSession.id,
    receiptId,
    authEventId: authEvent.id,
    outcomeId: outcome.id,
    messageCount,
  };
}

// ===========================================================================
// 1. THE BAR — each route, all six clauses, after a restart
// ===========================================================================

describe.each(ROUTES.map((r) => [r.name, r] as const))(
  '%s — deletes the session, retains the receipt',
  (_name, entry) => {
    let tenant: Tenant;

    beforeEach(async () => {
      tenant = await createTenant();
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-for-db-suite';
    });

    it('the content is gone and the receipt still names its user', async () => {
      const convo = await openConversation(tenant);

      // ASSERTED BEFORE THE DELETION, so a null afterwards cannot be read as
      // "it was never written". All four fields the scrub touches are populated
      // and the two that carry the conversation carry it verbatim.
      const before = await db.shadowConsentReceipt.findUnique({
        where: { id: convo.receiptId },
      });
      expect(before?.userId).toBe(tenant.user.id);
      expect(before?.sessionId).toBe(convo.sessionId);
      expect(before?.entityId).toBeNull();
      expect(before?.messageId).toBeTruthy();
      expect(before?.reasoning).toBeTruthy();
      expect(before?.reasoning).not.toBe(SCRUBBED_REASONING);
      expect(before?.sourcesCited).toEqual([`task:task-quarterly (${SPOKEN})`]);

      const res = await entry.call(tenant, convo.sessionId);
      expect(res.status).toBe(200);

      // THE RESTART. Every Map, every module-level `let`, every Prisma client
      // this process built is discarded; what comes back comes from Postgres.
      jest.resetModules();

      await withSecondClient(async (client) => {
        // --- GONE. "A deleted session means deleted." --------------------
        expect(
          await client.shadowVoiceSession.findUnique({ where: { id: convo.sessionId } })
        ).toBeNull();
        expect(
          await client.shadowMessage.count({ where: { sessionId: convo.sessionId } })
        ).toBe(0);
        expect(
          await client.shadowSessionOutcome.findUnique({ where: { id: convo.outcomeId } })
        ).toBeNull();

        // No soft-delete, no tombstone, no copy under another label: the phrase
        // the user said is not anywhere in `ShadowMessage` any more, for anyone.
        // Asserted by searching for the VALUE rather than by the per-session
        // count above, because a "scrubbed copy retained elsewhere" would pass
        // that count and is the thing Ivan explicitly forbade.
        expect(
          await client.shadowMessage.count({ where: { content: { contains: SPOKEN } } })
        ).toBe(0);
        // `decisionsMade` is Json, so the scan is over the rows rather than a
        // `contains` filter — and over EVERY row in the table, since the claim is
        // that the phrase is nowhere, not that this session's copy went.
        expect(JSON.stringify(await client.shadowSessionOutcome.findMany())).not.toContain(
          SPOKEN
        );

        // --- RETAINED, AND STILL ATTRIBUTABLE ----------------------------
        const receipt = await client.shadowConsentReceipt.findUnique({
          where: { id: convo.receiptId },
        });
        expect(receipt).not.toBeNull();
        // Detached by `ON DELETE SET NULL`...
        expect(receipt?.sessionId).toBeNull();
        expect(receipt?.entityId).toBeNull();
        // ...and it STILL NAMES ITS USER. Without P-40's column the three lines
        // above would be the entire state of the row and it would be
        // attributable to nobody, which defeats the reason it is retained.
        expect(receipt?.userId).toBe(tenant.user.id);

        // --- THE CONTENT INSIDE IT IS SCRUBBED ---------------------------
        expect(receipt?.reasoning).toBe(SCRUBBED_REASONING);
        expect(receipt?.messageId).toBeNull();
        expect(receipt?.sourcesCited).toEqual([]);
        // The receipt was the one row that quoted the conversation after the
        // transcript went. `sessions/[id]` and `history/clear` both left this.
        expect(JSON.stringify(receipt)).not.toContain(SPOKEN);

        // --- AND IT IS STILL A RECEIPT -----------------------------------
        // Scrubbed to a timestamp would prove nothing. Six years from now
        // somebody has to be able to establish WHAT was authorised and under
        // WHICH confirmation level without reading the conversation.
        expect(receipt?.actionType).toBe('create_task');
        expect(receipt?.confirmationLevel).toBe('NONE');
        expect(receipt?.triggerSource).toBe('user_request');
        expect(receipt?.executedAt).toBeInstanceOf(Date);

        // --- THE AUTH EVENT SURVIVES TOO ---------------------------------
        // The record of whether a step-up challenge passed. `gdpr-export` has
        // retained it since P-17 and `retention.ts` ages it out on the same
        // seven-year clock; three of the five paths deleted it anyway.
        const authEvent = await client.shadowAuthEvent.findUnique({
          where: { id: convo.authEventId },
        });
        expect(authEvent).not.toBeNull();
        expect(authEvent?.sessionId).toBeNull();
        expect(authEvent?.userId).toBe(tenant.user.id);
        expect(authEvent?.result).toBe('success');
      });
    });

    it('another user gets 404 and the row survives intact', async () => {
      // THE POSITIVE CONTROL'S OTHER HALF. Two claims, and the second is the one
      // that would be missing if this were only a status-code test: `deleteById`
      // scrubs BEFORE it deletes, so an owner check that ran one statement too
      // late would erase a stranger's receipt content and then fail on the
      // session row — refusing the caller, having already destroyed the data.
      const owner = await createTenant();
      const stranger = await createTenant();
      const convo = await openConversation(owner);

      const res = await entry.call(stranger, convo.sessionId);
      expect(res.status).toBe(404);

      jest.resetModules();

      await withSecondClient(async (client) => {
        const session = await client.shadowVoiceSession.findUnique({
          where: { id: convo.sessionId },
        });
        expect(session).not.toBeNull();
        expect(session?.userId).toBe(owner.user.id);

        expect(
          await client.shadowMessage.count({ where: { sessionId: convo.sessionId } })
        ).toBe(convo.messageCount);
        expect(
          await client.shadowSessionOutcome.findUnique({ where: { id: convo.outcomeId } })
        ).not.toBeNull();

        const receipt = await client.shadowConsentReceipt.findUnique({
          where: { id: convo.receiptId },
        });
        // Still attached, and — the part a status-code-only test misses — still
        // carrying its conversation content.
        expect(receipt?.sessionId).toBe(convo.sessionId);
        expect(receipt?.reasoning).not.toBe(SCRUBBED_REASONING);
        expect(receipt?.messageId).toBeTruthy();
        expect(receipt?.sourcesCited).toEqual([`task:task-quarterly (${SPOKEN})`]);

        expect(
          await client.shadowAuthEvent.findUnique({ where: { id: convo.authEventId } })
        ).not.toBeNull();
      });
    });

    it('a session id that never existed is refused the same way', async () => {
      // Indistinguishable from the cross-tenant case above: same status, same
      // code, same message. This is what stops the endpoint being a cuid
      // existence oracle, and it is asserted per route because the whole finding
      // was that three routes answering the same question gave three answers.
      const res = await entry.call(tenant, 'clnonexistent000000000000');
      expect(res.status).toBe(404);
    });
  }
);

// ===========================================================================
// 2. THE CONSISTENCY CLAIM ITSELF
// ===========================================================================
//
// The six clauses above are asserted route by route, which proves each one is
// right. It does not quite prove the thing the ruling is ABOUT, which is that
// they agree — three separately-correct routes is what the repository had, and
// it was still a bug that the same user action had three outcomes. These two
// cases compare the routes to each other instead of to a constant.

describe('P-44 — the three routes are not distinguishable from outside', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-for-db-suite';
  });

  it('answers a stranger and a nonexistent id with the same status on all three', async () => {
    const owner = await createTenant();
    const stranger = await createTenant();

    const statuses: Record<string, { foreign: number; missing: number }> = {};
    for (const entry of ROUTES) {
      const convo = await openConversation(owner);
      const foreign = await entry.call(stranger, convo.sessionId);
      const missing = await entry.call(stranger, 'clnonexistent000000000000');
      statuses[entry.name] = { foreign: foreign.status, missing: missing.status };
    }

    // Every cell 404. Before P-44, `delete-session/[id]` answered 403 on the
    // foreign case and 404 on the missing one — an existence oracle for cuids,
    // the shape P-41 closed on `POST /api/shadow/action` and left on this one.
    expect(statuses).toEqual({
      'POST /api/shadow/delete-session/[id]': { foreign: 404, missing: 404 },
      'DELETE /api/shadow/conversations/[id]': { foreign: 404, missing: 404 },
      'DELETE /api/shadow/sessions/[id]': { foreign: 404, missing: 404 },
    });
  });

  it('leaves the database in the same state whichever route the user used', async () => {
    // The strongest form of the ruling, and it needs no constants at all: delete
    // three equivalent conversations through the three routes and compare the
    // surviving rows to EACH OTHER. A future edit that changes one path's
    // behaviour fails here even if nobody updates the expectations above.
    const tenant = await createTenant();

    const shapes: unknown[] = [];
    for (const entry of ROUTES) {
      const convo = await openConversation(tenant);
      expect((await entry.call(tenant, convo.sessionId)).status).toBe(200);

      jest.resetModules();

      const shape = await withSecondClient(async (client) => {
        const [session, messages, outcome, receipt, authEvent] = await Promise.all([
          client.shadowVoiceSession.findUnique({ where: { id: convo.sessionId } }),
          client.shadowMessage.count({ where: { sessionId: convo.sessionId } }),
          client.shadowSessionOutcome.findUnique({ where: { id: convo.outcomeId } }),
          client.shadowConsentReceipt.findUnique({ where: { id: convo.receiptId } }),
          client.shadowAuthEvent.findUnique({ where: { id: convo.authEventId } }),
        ]);
        return {
          sessionExists: session !== null,
          messages,
          outcomeExists: outcome !== null,
          receiptExists: receipt !== null,
          receiptSessionId: receipt?.sessionId ?? null,
          receiptUserId: receipt?.userId ?? null,
          receiptReasoning: receipt?.reasoning ?? null,
          receiptMessageId: receipt?.messageId ?? null,
          receiptSources: receipt?.sourcesCited ?? null,
          receiptActionType: receipt?.actionType ?? null,
          authEventExists: authEvent !== null,
          authEventSessionId: authEvent?.sessionId ?? null,
        };
      });
      shapes.push(shape);
    }

    expect(shapes[1]).toEqual(shapes[0]);
    expect(shapes[2]).toEqual(shapes[0]);

    // And the shape they agree on is the right one, so "all three broken
    // identically" cannot pass as "all three consistent".
    expect(shapes[0]).toEqual({
      sessionExists: false,
      messages: 0,
      outcomeExists: false,
      receiptExists: true,
      receiptSessionId: null,
      receiptUserId: tenant.user.id,
      receiptReasoning: SCRUBBED_REASONING,
      receiptMessageId: null,
      receiptSources: [],
      receiptActionType: 'create_task',
      authEventExists: true,
      authEventSessionId: null,
    });
  });
});

// ===========================================================================
// 3. THE FOURTH PATH — POST /api/shadow/history/clear
// ===========================================================================
//
// Not in P-44's card. Found by counting the routes that delete a session rather
// than the call sites of `deleteSession`, and it had the same defect as
// `sessions/[id]`: receipts detached but NOT scrubbed, auth events deleted. It
// is a bulk clear over every session a user has, so it does not delegate to
// `deleteById` — one row at a time would be N round trips — but it has to agree
// with it, and the assertions are therefore the same ones.

describe('P-44 — the bulk history clear agrees with the single-session routes', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-for-db-suite';
  });

  it('clears two conversations and retains both receipts, scrubbed', async () => {
    const tenant = await createTenant();
    const other = await createTenant();
    const first = await openConversation(tenant);
    const second = await openConversation(tenant);
    // A second tenant's conversation, untouched, because `mode: 'all'` is the
    // one mode with no id in it at all: an unscoped `deleteMany` here would
    // clear the platform.
    const theirs = await openConversation(other);

    const { POST } = await import('@/app/api/shadow/history/clear/route');
    const res = await POST(
      requestAs(tenant, '/api/shadow/history/clear', {
        method: 'POST',
        body: { mode: 'all' },
      })
    );
    expect(res.status).toBe(200);
    expect((await readJson<{ data: { sessionsDeleted: number } }>(res)).data.sessionsDeleted)
      .toBe(2);

    jest.resetModules();

    await withSecondClient(async (client) => {
      for (const convo of [first, second]) {
        expect(
          await client.shadowVoiceSession.findUnique({ where: { id: convo.sessionId } })
        ).toBeNull();

        const receipt = await client.shadowConsentReceipt.findUnique({
          where: { id: convo.receiptId },
        });
        expect(receipt).not.toBeNull();
        expect(receipt?.sessionId).toBeNull();
        expect(receipt?.userId).toBe(tenant.user.id);
        // The two lines this route was missing.
        expect(receipt?.reasoning).toBe(SCRUBBED_REASONING);
        expect(receipt?.sourcesCited).toEqual([]);
        expect(
          await client.shadowAuthEvent.findUnique({ where: { id: convo.authEventId } })
        ).not.toBeNull();
      }

      // The other tenant's conversation is entirely unaffected — session,
      // transcript and an UNSCRUBBED receipt.
      expect(
        await client.shadowVoiceSession.findUnique({ where: { id: theirs.sessionId } })
      ).not.toBeNull();
      const untouched = await client.shadowConsentReceipt.findUnique({
        where: { id: theirs.receiptId },
      });
      expect(untouched?.sessionId).toBe(theirs.sessionId);
      expect(untouched?.reasoning).not.toBe(SCRUBBED_REASONING);
    });
  });
});
