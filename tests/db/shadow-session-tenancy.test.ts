/**
 * P-41 — A SHADOW VOICE SESSION CANNOT BE READ, MOVED OR DELETED BY ID ALONE.
 *
 * ============================================================================
 * WHAT WAS WRONG
 * ============================================================================
 *
 * `src/modules/shadow/interfaces/session-manager.ts` held 13 queries keyed on
 * `{ id: sessionId }` with no owner — 7 `findUnique`, 5 `update`, 1 `delete` —
 * and every public method took the session id as a plain string. A session id
 * is a cuid a client sends in a path segment or a request body, so the row
 * crossed the tenancy boundary and eleven route files each re-checked
 * `voiceSession.userId !== session.userId` by hand afterwards. Two callers in
 * `interfaces/web-chat.ts` did not check at all.
 *
 * ============================================================================
 * WHY EVERY CASE HERE HAS A POSITIVE CONTROL IN THE SAME `it`
 * ============================================================================
 *
 * P-20 counted 267 route/method pairs that refuse EVERYONE and are counted
 * nowhere. A suite that only asserts "tenant A is refused tenant B's session"
 * passes just as convincingly against a build where the endpoint is broken for
 * everybody, and that is how a tenancy fix gets credit for an outage. So each
 * case below drives the same handler twice — once with the wrong owner, once
 * with the right one — and asserts BOTH: the refusal, and that the legitimate
 * request still returns the session.
 *
 * The refusals are asserted as 404, deliberately and not incidentally. A
 * distinguishable "that exists but is not yours" makes every one of these
 * endpoints an existence oracle for cuids; `OwnedSessionStore` cannot tell the
 * two cases apart either, because it runs one `findFirst` filtered on both
 * columns. See `src/modules/shadow/interfaces/session-store.ts`.
 *
 * ============================================================================
 * WHY THIS IS A DB TEST AND NOT A UNIT TEST
 * ============================================================================
 *
 * The unit suite asserts the SHAPE of the `where` clause against a mocked
 * Prisma. That is worth having (it is what catches a new method reaching for
 * `findUnique`), but it proves nothing about whether Postgres actually refuses:
 * a mock returns whatever it was told to return regardless of the filter. Every
 * assertion below runs a real route handler with a real signed session cookie
 * against real rows in `paf_p41`, and the state assertions re-read the row
 * afterwards rather than trusting the response body.
 *
 * Requires a real Postgres.
 */

import { db, setupTestDatabase } from '../helpers/db';
import { createTwoTenants, type Tenant } from '../helpers/factories';
import { readJson, requestAs } from '../helpers/session';

import { sessionManager } from '@/modules/shadow/interfaces/session-manager';
import { ownedSessions } from '@/modules/shadow/interfaces/session-store';
import { webChatHandler } from '@/modules/shadow/interfaces/web-chat';

import { GET as conversationGET, DELETE as conversationDELETE } from '@/app/api/shadow/conversations/[id]/route';
import { GET as outcomeGET } from '@/app/api/shadow/outcomes/[id]/route';
import { GET as messagesGET } from '@/app/api/shadow/session/[id]/messages/route';
import { POST as endPOST } from '@/app/api/shadow/session/[id]/end/route';
import { POST as pausePOST } from '@/app/api/shadow/session/[id]/pause/route';
import { POST as resumePOST } from '@/app/api/shadow/session/[id]/resume/route';
import { POST as handoffPOST } from '@/app/api/shadow/session/[id]/handoff/route';

setupTestDatabase();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Envelope<T> = { success: boolean; data: T; error?: { code: string } };

function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

async function createSessionFor(
  tenant: Tenant,
  overrides: { status?: string } = {},
): Promise<string> {
  const row = await db.shadowVoiceSession.create({
    data: {
      userId: tenant.user.id,
      status: overrides.status ?? 'active',
      currentChannel: 'web',
      channelHistory: [{ channel: 'web', enteredAt: new Date().toISOString() }],
      activeEntityId: tenant.entity.id,
      startedAt: new Date(Date.now() - 60_000),
      lastActivityAt: new Date(Date.now() - 60_000),
    },
  });
  return row.id;
}

async function statusOf(sessionId: string): Promise<string | null> {
  const row = await db.shadowVoiceSession.findUnique({
    where: { id: sessionId },
    select: { status: true },
  });
  return row?.status ?? null;
}

// ===========================================================================
// 1. THE ACCESSOR ITSELF
// ===========================================================================

describe('OwnedSessionStore: the seam every lookup goes through', () => {
  it('returns another user\'s session as null, and the owner\'s as the row', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const sessionOfB = await createSessionFor(tenantB);

    // The refusal.
    expect(await ownedSessions(tenantA.user.id).findById(sessionOfB)).toBeNull();

    // The positive control, in the same case: the same id, the right owner.
    // Without this line "returns null" is satisfied by a store that returns
    // null for everybody.
    const own = await ownedSessions(tenantB.user.id).findById(sessionOfB);
    expect(own).not.toBeNull();
    expect(own?.id).toBe(sessionOfB);
  });

  it('refuses an id that does not exist in exactly the same way', async () => {
    const { tenantA } = await createTwoTenants();
    // Indistinguishable from the cross-tenant case above: same type, same
    // value, no code and no message to tell them apart. This is what stops the
    // endpoint being a cuid existence oracle.
    expect(await ownedSessions(tenantA.user.id).findById('clnonexistent000000000000')).toBeNull();
  });

  it('will not construct without an owner, rather than filtering on undefined', () => {
    // `where: { userId: undefined }` is not an error in Prisma — it is "no
    // filter at all", which is the defect. It has to fail at construction.
    expect(() => ownedSessions('')).toThrow('non-empty userId');
  });

  it('refuses to UPDATE another user\'s session, and still updates the owner\'s', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const sessionOfB = await createSessionFor(tenantB);

    await expect(
      ownedSessions(tenantA.user.id).updateById(sessionOfB, { status: 'ended' }),
    ).rejects.toThrow();

    // The row is untouched — asserted by re-reading it, not by the throw.
    expect(await statusOf(sessionOfB)).toBe('active');

    const updated = await ownedSessions(tenantB.user.id).updateById(sessionOfB, {
      status: 'paused',
    });
    expect(updated.status).toBe('paused');
    expect(await statusOf(sessionOfB)).toBe('paused');
  });

  it('refuses to DELETE another user\'s session and leaves its transcript intact', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const sessionOfB = await createSessionFor(tenantB);
    await db.shadowMessage.create({
      data: { sessionId: sessionOfB, role: 'user', content: 'B only', channel: 'web' },
    });

    await expect(ownedSessions(tenantA.user.id).deleteById(sessionOfB)).rejects.toThrow(
      `Session ${sessionOfB} not found`,
    );

    // The child rows matter as much as the session: `deleteById` deletes the
    // transcript BEFORE the session, so an owner check that ran too late would
    // destroy another tenant's messages and then fail on the session row.
    expect(await db.shadowMessage.count({ where: { sessionId: sessionOfB } })).toBe(1);
    expect(await statusOf(sessionOfB)).toBe('active');

    // Positive control: the owner's delete does remove both.
    await ownedSessions(tenantB.user.id).deleteById(sessionOfB);
    expect(await statusOf(sessionOfB)).toBeNull();
    expect(await db.shadowMessage.count({ where: { sessionId: sessionOfB } })).toBe(0);
  });

  it('lists and counts only the asking user\'s sessions', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    await createSessionFor(tenantA);
    await createSessionFor(tenantB);
    await createSessionFor(tenantB, { status: 'ended' });

    const forA = await ownedSessions(tenantA.user.id).page({ skip: 0, take: 50 });
    const forB = await ownedSessions(tenantB.user.id).page({ skip: 0, take: 50 });

    expect(forA.total).toBe(1);
    expect(forB.total).toBe(2);
    expect(forA.sessions.every((s) => s.userId === tenantA.user.id)).toBe(true);
  });

  it('ends only the asking user\'s other active sessions', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const keepOfA = await createSessionFor(tenantA);
    const otherOfA = await createSessionFor(tenantA);
    const activeOfB = await createSessionFor(tenantB);

    const count = await ownedSessions(tenantA.user.id).endOtherActiveSessions(
      keepOfA,
      new Date(),
    );

    expect(count).toBe(1);
    expect(await statusOf(otherOfA)).toBe('ended');
    expect(await statusOf(keepOfA)).toBe('active');
    // The one-active-session rule is per user. An unscoped `updateMany` on
    // `status: 'active'` would have ended this too.
    expect(await statusOf(activeOfB)).toBe('active');
  });
});

// ===========================================================================
// 2. THE LIFECYCLE, THROUGH THE MANAGER
// ===========================================================================

describe('ShadowSessionScope: every lifecycle method refuses a stranger\'s id', () => {
  // Each entry is [name, call]. The table exists so a method added to the
  // scope without a case here is visible as an absence rather than assumed
  // covered — `scopeMethodNames` below asserts the table is complete.
  const lifecycle: ReadonlyArray<
    [string, (userId: string, sessionId: string) => Promise<unknown>]
  > = [
    ['getSession', (u, s) => sessionManager.forUser(u).getSession(s)],
    ['handoffChannel', (u, s) => sessionManager.forUser(u).handoffChannel(s, 'phone')],
    ['pauseSession', (u, s) => sessionManager.forUser(u).pauseSession(s)],
    ['resumeSession', (u, s) => sessionManager.forUser(u).resumeSession(s)],
    ['endSession', (u, s) => sessionManager.forUser(u).endSession(s)],
    ['touchSession', (u, s) => sessionManager.forUser(u).touchSession(s)],
    ['deleteSession', (u, s) => sessionManager.forUser(u).deleteSession(s)],
  ];

  it.each(lifecycle)(
    '%s: refuses the wrong owner and still works for the right one',
    async (name, call) => {
      const { tenantA, tenantB } = await createTwoTenants();
      // `paused` so `resumeSession` has work to do and `handoffChannel`'s
      // "must be active" guard is the only thing that can complain about it.
      const status = name === 'handoffChannel' ? 'active' : 'paused';
      const sessionOfB = await createSessionFor(tenantB, { status });

      if (name === 'getSession') {
        await expect(call(tenantA.user.id, sessionOfB)).resolves.toBeNull();
      } else {
        await expect(call(tenantA.user.id, sessionOfB)).rejects.toThrow(
          `Session ${sessionOfB} not found`,
        );
      }

      // Nothing moved.
      expect(await statusOf(sessionOfB)).toBe(status);

      // The positive control. Without it, "throws not found" is satisfied by a
      // scope that refuses everybody — which is the 267-route failure mode.
      await expect(call(tenantB.user.id, sessionOfB)).resolves.not.toThrow();
    },
  );

  it('the table above covers every method on the scope', () => {
    const covered = new Set(lifecycle.map(([name]) => name));
    const proto = Object.getPrototypeOf(sessionManager.forUser('u1')) as object;
    const onScope = Object.getOwnPropertyNames(proto).filter((name) => {
      if (name === 'constructor') return false;
      // Accessors (`userId`) are not callable entry points; only methods can
      // address a row.
      const descriptor = Object.getOwnPropertyDescriptor(proto, name);
      return typeof descriptor?.value === 'function';
    });

    // `startSession`, `getActiveSession` and `listSessions` take no session id
    // — there is nothing to address cross-tenant — and they are covered by the
    // store cases above. Everything else must be in the table.
    const idTaking = onScope.filter(
      (name) => !['startSession', 'getActiveSession', 'listSessions'].includes(name),
    );
    expect([...idTaking].sort()).toEqual([...covered].sort());
  });

  it('startSession cannot be aimed at another user', async () => {
    const { tenantA, tenantB } = await createTwoTenants();

    const started = await sessionManager.forUser(tenantA.user.id).startSession({
      channel: 'web',
      entityId: tenantA.entity.id,
    });

    // The owner comes from the scope, not from the params, so there is no
    // argument a caller could supply to file a session under tenant B.
    expect(started.userId).toBe(tenantA.user.id);
    expect(
      await db.shadowVoiceSession.count({ where: { userId: tenantB.user.id } }),
    ).toBe(0);
  });
});

// ===========================================================================
// 3. THE ROUTES
// ===========================================================================

describe('the Shadow session routes, cross-tenant and legitimate', () => {
  it('GET /api/shadow/conversations/[id] refuses B\'s conversation to A and serves it to B', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const sessionOfB = await createSessionFor(tenantB);
    await db.shadowMessage.create({
      data: { sessionId: sessionOfB, role: 'user', content: 'B only', channel: 'web' },
    });

    const refused = await conversationGET(
      requestAs(tenantA, `/api/shadow/conversations/${sessionOfB}`),
      ctx(sessionOfB),
    );
    expect(refused.status).toBe(404);
    // Nothing of B's leaks into the refusal body.
    expect(JSON.stringify(await readJson(refused))).not.toContain('B only');

    const served = await conversationGET(
      requestAs(tenantB, `/api/shadow/conversations/${sessionOfB}`),
      ctx(sessionOfB),
    );
    expect(served.status).toBe(200);
    const body = await readJson<Envelope<{ id: string; messages: { content: string }[] }>>(served);
    expect(body.data.id).toBe(sessionOfB);
    expect(body.data.messages.map((m) => m.content)).toContain('B only');
  });

  it('DELETE /api/shadow/conversations/[id] does not delete B\'s conversation for A', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const sessionOfB = await createSessionFor(tenantB);

    const refused = await conversationDELETE(
      requestAs(tenantA, `/api/shadow/conversations/${sessionOfB}`, { method: 'DELETE' }),
      ctx(sessionOfB),
    );
    expect(refused.status).toBe(404);
    // A successful delete returns `{ deleted: true }` and carries no canary, so
    // the response body cannot prove this — the row can. P-34 found a leaking
    // DELETE exactly this way.
    expect(await statusOf(sessionOfB)).toBe('active');

    const allowed = await conversationDELETE(
      requestAs(tenantB, `/api/shadow/conversations/${sessionOfB}`, { method: 'DELETE' }),
      ctx(sessionOfB),
    );
    expect(allowed.status).toBe(200);
    expect(await statusOf(sessionOfB)).toBeNull();
  });

  it('GET /api/shadow/session/[id]/messages refuses B\'s transcript to A', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const sessionOfB = await createSessionFor(tenantB);
    await db.shadowMessage.create({
      data: { sessionId: sessionOfB, role: 'user', content: 'canary-B', channel: 'web' },
    });

    const refused = await messagesGET(
      requestAs(tenantA, `/api/shadow/session/${sessionOfB}/messages`),
      ctx(sessionOfB),
    );
    expect(refused.status).toBe(404);
    expect(JSON.stringify(await readJson(refused))).not.toContain('canary-B');

    const served = await messagesGET(
      requestAs(tenantB, `/api/shadow/session/${sessionOfB}/messages`),
      ctx(sessionOfB),
    );
    expect(served.status).toBe(200);
    expect(JSON.stringify(await readJson(served))).toContain('canary-B');
  });

  it('GET /api/shadow/outcomes/[id] refuses B\'s outcome to A', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const sessionOfB = await createSessionFor(tenantB);
    await db.shadowSessionOutcome.create({
      data: { sessionId: sessionOfB, decisionsMade: ['canary-B-decision'] },
    });

    const refused = await outcomeGET(
      requestAs(tenantA, `/api/shadow/outcomes/${sessionOfB}`),
      ctx(sessionOfB),
    );
    expect(refused.status).toBe(404);
    expect(JSON.stringify(await readJson(refused))).not.toContain('canary-B-decision');

    const served = await outcomeGET(
      requestAs(tenantB, `/api/shadow/outcomes/${sessionOfB}`),
      ctx(sessionOfB),
    );
    expect(served.status).toBe(200);
    expect(JSON.stringify(await readJson(served))).toContain('canary-B-decision');
  });

  it('POST /api/shadow/session/[id]/end does not end B\'s session for A', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const sessionOfB = await createSessionFor(tenantB);

    const refused = await endPOST(
      requestAs(tenantA, `/api/shadow/session/${sessionOfB}/end`, { method: 'POST' }),
      ctx(sessionOfB),
    );
    expect(refused.status).toBe(404);
    expect(await statusOf(sessionOfB)).toBe('active');

    const allowed = await endPOST(
      requestAs(tenantB, `/api/shadow/session/${sessionOfB}/end`, { method: 'POST' }),
      ctx(sessionOfB),
    );
    expect(allowed.status).toBe(200);
    expect(await statusOf(sessionOfB)).toBe('ended');
  });

  it('POST /api/shadow/session/[id]/pause does not pause B\'s session for A', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const sessionOfB = await createSessionFor(tenantB);

    const refused = await pausePOST(
      requestAs(tenantA, `/api/shadow/session/${sessionOfB}/pause`, { method: 'POST' }),
      ctx(sessionOfB),
    );
    expect(refused.status).toBe(404);
    expect(await statusOf(sessionOfB)).toBe('active');

    const allowed = await pausePOST(
      requestAs(tenantB, `/api/shadow/session/${sessionOfB}/pause`, { method: 'POST' }),
      ctx(sessionOfB),
    );
    expect(allowed.status).toBe(200);
    expect(await statusOf(sessionOfB)).toBe('paused');
  });

  it('POST /api/shadow/session/[id]/resume does not resume B\'s session for A', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const sessionOfB = await createSessionFor(tenantB, { status: 'paused' });

    const refused = await resumePOST(
      requestAs(tenantA, `/api/shadow/session/${sessionOfB}/resume`, {
        method: 'POST',
        body: { channel: 'web' },
      }),
      ctx(sessionOfB),
    );
    expect(refused.status).toBe(404);
    expect(await statusOf(sessionOfB)).toBe('paused');

    const allowed = await resumePOST(
      requestAs(tenantB, `/api/shadow/session/${sessionOfB}/resume`, {
        method: 'POST',
        body: { channel: 'web' },
      }),
      ctx(sessionOfB),
    );
    expect(allowed.status).toBe(200);
    expect(await statusOf(sessionOfB)).toBe('active');
  });

  it('POST /api/shadow/session/[id]/handoff does not move B\'s session for A', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const sessionOfB = await createSessionFor(tenantB);

    const refused = await handoffPOST(
      requestAs(tenantA, `/api/shadow/session/${sessionOfB}/handoff`, {
        method: 'POST',
        body: { channel: 'phone' },
      }),
      ctx(sessionOfB),
    );
    expect(refused.status).toBe(404);

    const stillWeb = await db.shadowVoiceSession.findUnique({
      where: { id: sessionOfB },
      select: { currentChannel: true },
    });
    expect(stillWeb?.currentChannel).toBe('web');

    const allowed = await handoffPOST(
      requestAs(tenantB, `/api/shadow/session/${sessionOfB}/handoff`, {
        method: 'POST',
        body: { channel: 'phone' },
      }),
      ctx(sessionOfB),
    );
    expect(allowed.status).toBe(200);
    const moved = await db.shadowVoiceSession.findUnique({
      where: { id: sessionOfB },
      select: { currentChannel: true },
    });
    expect(moved?.currentChannel).toBe('phone');
  });
});

// ===========================================================================
// 4. THE TWO CALLERS THAT NEVER CHECKED AT ALL
// ===========================================================================

describe('web-chat: the callers that compensated for nothing', () => {
  it('end_session on another user\'s id does not end it, and does end the caller\'s own', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const sessionOfB = await createSessionFor(tenantB);
    const sessionOfA = await createSessionFor(tenantA);

    // Before P-41 this call ran `endSession(sessionId)` with no ownership
    // check of any kind and ended tenant B's session.
    await expect(
      webChatHandler.handleMessage(
        { type: 'end_session', sessionId: sessionOfB },
        tenantA.user.id,
      ),
    ).rejects.toThrow(`Session ${sessionOfB} not found`);
    expect(await statusOf(sessionOfB)).toBe('active');

    const own = await webChatHandler.handleMessage(
      { type: 'end_session', sessionId: sessionOfA },
      tenantA.user.id,
    );
    expect(own.sessionId).toBe(sessionOfA);
    expect(await statusOf(sessionOfA)).toBe('ended');
  });

  it('ping on another user\'s id does not touch it, and does touch the caller\'s own', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const sessionOfB = await createSessionFor(tenantB);
    const sessionOfA = await createSessionFor(tenantA);

    const beforeB = await db.shadowVoiceSession.findUnique({
      where: { id: sessionOfB },
      select: { lastActivityAt: true, messageCount: true },
    });

    // `handlePing` swallows touch failures on purpose, so the proof is the row,
    // not the response. A cross-tenant WRITE that is silently ignored is still
    // a cross-tenant write if it lands.
    await webChatHandler.handleMessage(
      { type: 'ping', sessionId: sessionOfB },
      tenantA.user.id,
    );

    const afterB = await db.shadowVoiceSession.findUnique({
      where: { id: sessionOfB },
      select: { lastActivityAt: true, messageCount: true },
    });
    expect(afterB?.messageCount).toBe(beforeB?.messageCount);
    expect(afterB?.lastActivityAt.getTime()).toBe(beforeB?.lastActivityAt.getTime());

    await webChatHandler.handleMessage(
      { type: 'ping', sessionId: sessionOfA },
      tenantA.user.id,
    );
    const afterA = await db.shadowVoiceSession.findUnique({
      where: { id: sessionOfA },
      select: { messageCount: true },
    });
    expect(afterA?.messageCount).toBe(1);
  });

  it('action_response on another user\'s id is refused and says so once', async () => {
    const { tenantA, tenantB } = await createTwoTenants();
    const sessionOfB = await createSessionFor(tenantB);

    const response = await webChatHandler.handleMessage(
      {
        type: 'action_response',
        sessionId: sessionOfB,
        actionId: 'a1',
        actionResponse: 'yes',
      },
      tenantA.user.id,
    );

    expect(response.response.text).toBe('Session not found or access denied.');
    // No message was written into B's transcript by A's action response.
    expect(await db.shadowMessage.count({ where: { sessionId: sessionOfB } })).toBe(0);
  });
});
