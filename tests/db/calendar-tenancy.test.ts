/**
 * P-05 acceptance — Calendar tenancy, proven against a real database.
 *
 * ============================================================================
 * WHAT THIS FILE EXISTS TO PROVE
 * ============================================================================
 *
 * Before this package, the calendar module authenticated and then did not
 * authorize. Three separate shapes of the same defect:
 *
 *  1. THE TERNARY. `SchedulingService.getEvents` and
 *     `CalendarAnalyticsService.getAnalytics` both built their WHERE clause as
 *
 *         entityId ? [entityId] : <every entity this user owns>
 *
 *     with `entityId` a plain string taken straight off `?entityId=`. Naming
 *     ANY id skipped the ownership list entirely, so
 *     `GET /api/calendar?entityId=<someone else's>` returned their calendar,
 *     and `GET /api/calendar/analytics?entityId=<someone else's>` reported
 *     their meeting load.
 *
 *  2. NO TENANT IN THE WRITE. `updateEvent`, `deleteEvent`, `rescheduleEvent`,
 *     `PostMeetingService.capturePostMeeting` and `PrepPacketService` all
 *     addressed rows as `where: { id }`. Any authenticated caller who knew an
 *     event id could rename, move, delete or annotate another tenant's meeting.
 *
 *  3. `_session` DISCARDED. `GET /api/calendar/[eventId]` and both
 *     `/prep-packet` handlers ran `withAuth(request, async (_req, _session))`
 *     and then read the row by id alone. The prep packet is the worst of these:
 *     it aggregates the attendees' relationship scores, the last five messages
 *     exchanged with them, and their open tasks.
 *
 * Every case below is one of four shapes, across the route surface:
 *
 *   1. the owner reaches their own data                        -> 200/201
 *   2. tenant A cannot READ tenant B's data                    -> 403
 *   3. tenant A cannot WRITE INTO tenant B's data              -> 403, and
 *      the database is unchanged
 *   4. no session at all                                       -> 401
 *
 * A list endpoint that leaks rows is a different failure from a single-record
 * 403, so the collection routes are covered separately: they must not merely
 * refuse a foreign id, they must not RETURN foreign rows when the request looks
 * perfectly ordinary. And a "fix" that denies everyone would pass every other
 * assertion in this file, so tenant B reaches B's own data at the end.
 *
 * This runs against a real Postgres with `getToken` UNMOCKED, so each request
 * presents a genuine NextAuth JWE and the production decrypt path runs. A
 * mocked-Prisma unit test cannot observe a missing tenant check -- which is why
 * `tests/e2e/calendar-management.test.ts` passed throughout, despite its name.
 *
 * NOTE ON /api/calendar/[eventId]/post-meeting: it is not exercised here.
 * `MeetingProcessor` and the VAF config loader are imported at module scope by
 * that route and reach outside the database. Its tenancy is the same
 * `withEventScope` block as the three routes below it, and its service half is
 * covered by the `capturePostMeeting` scoping test at the end of this file.
 */

// ---------------------------------------------------------------------------
// The one shim in this file, and what it is not
// ---------------------------------------------------------------------------
//
// `uuid@13` is pure ESM: its package `exports` resolve to `dist-node/index.js`,
// which is `export { ... }`. `jest.db.config.ts` runs ts-jest in CJS and
// transforms only `.tsx?`, so any test that loads the real
// `scheduling.service` or `post-meeting.service` -- both of which
// `import { v4 as uuid } from 'uuid'` -- dies on
// `SyntaxError: Unexpected token 'export'` before a single assertion runs.
//
// The correct fix is one line of `moduleNameMapper` (or
// `transformIgnorePatterns`) in `jest.db.config.ts`, which P-05 is not
// permitted to edit. P-11 hit exactly this and wrote the same shim in
// `tests/db/queue-worker.test.ts`; this is the second occurrence, and it will
// keep recurring for every module whose services mint ids.
//
// So this substitutes `crypto.randomUUID` for `uuid.v4` -- the same RFC-4122 v4
// generator from Node's own standard library, reached through a path CJS can
// load. Nothing about the routes, the middleware, `getToken` or the database is
// stubbed: this is a module-format shim, not a behavioural mock, and no
// assertion in this file depends on it.
jest.mock('uuid', () => {
  const { randomUUID } = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return { v4: (): string => randomUUID() };
});

import { GET as calendarGET, POST as calendarPOST } from '@/app/api/calendar/route';
import {
  GET as eventGET,
  PATCH as eventPATCH,
  PUT as eventPUT,
  DELETE as eventDELETE,
} from '@/app/api/calendar/[eventId]/route';
import { POST as reschedulePOST } from '@/app/api/calendar/[eventId]/reschedule/route';
import {
  GET as prepGET,
  POST as prepPOST,
} from '@/app/api/calendar/[eventId]/prep-packet/route';
import { GET as availabilityGET } from '@/app/api/calendar/availability/route';
import { GET as analyticsGET } from '@/app/api/calendar/analytics/route';
import { POST as optimizePOST } from '@/app/api/calendar/optimize/route';
import { POST as conflictsPOST } from '@/app/api/calendar/conflicts/route';
import { POST as schedulePOST } from '@/app/api/calendar/schedule/route';

import { PostMeetingService } from '@/modules/calendar/post-meeting.service';
import { verifiedEntityIdForTest } from '../helpers/factories';

import { db, setupTestDatabase } from '../helpers/db';
import { createContact, createTwoTenants, type Tenant } from '../helpers/factories';
import { anonymousRequest, readJson, requestAs } from '../helpers/session';

setupTestDatabase();

type ErrBody = { success: false; error: { code: string; message: string } };
type OkBody<T> = { success: true; data: T };

/** Next 15 hands a route its path params as a promise; mirror that exactly. */
function ctx(eventId: string): { params: Promise<{ eventId: string }> } {
  return { params: Promise.resolve({ eventId }) };
}

/** A fixed Wednesday, so no test depends on the day it is run. */
const DAY = new Date(2026, 2, 4);
const SLOT_START = new Date(2026, 2, 4, 10, 0, 0);
const SLOT_END = new Date(2026, 2, 4, 11, 0, 0);
const DAY_START = new Date(2026, 2, 4, 0, 0, 0);
const DAY_END = new Date(2026, 2, 4, 23, 59, 59);

async function createEvent(
  entityId: string,
  overrides: Partial<{
    title: string;
    startTime: Date;
    endTime: Date;
    participantIds: string[];
    meetingNotes: string;
    prepPacket: object;
  }> = {}
) {
  return db.calendarEvent.create({
    data: {
      entityId,
      title: 'Test Event',
      startTime: SLOT_START,
      endTime: SLOT_END,
      ...overrides,
    },
  });
}

let tenantA: Tenant;
let tenantB: Tenant;

beforeEach(async () => {
  ({ tenantA, tenantB } = await createTwoTenants());
});

// ===========================================================================
// GET /api/calendar -- the list route, and the ternary that leaked it
// ===========================================================================

describe('GET /api/calendar', () => {
  it("returns the caller's own events", async () => {
    await createEvent(tenantA.entity.id, { title: 'Mine' });

    const res = await calendarGET(
      requestAs(tenantA, '/api/calendar', {
        query: { viewMode: 'day', date: DAY.toISOString() },
      })
    );

    expect(res.status).toBe(200);
    const body = await readJson<OkBody<{ events: { title: string }[] }>>(res);
    expect(body.data.events.map((e) => e.title)).toEqual(['Mine']);
  });

  it("refuses to answer for tenant B's entity", async () => {
    // THE BUG, in its purest read form. Under the old code this returned 200
    // with tenant B's calendar.
    const res = await calendarGET(
      requestAs(tenantA, '/api/calendar', {
        query: { viewMode: 'day', date: DAY.toISOString(), entityId: tenantB.entity.id },
      })
    );

    expect(res.status).toBe(403);
    expect((await readJson<ErrBody>(res)).error.code).toBe('FORBIDDEN');
  });

  it("does not return tenant B's events to an ordinary request", async () => {
    // Leaking rows is a different failure from a single-record 403: this
    // request names no entity at all and looks entirely routine.
    await createEvent(tenantA.entity.id, { title: 'Mine' });
    await createEvent(tenantB.entity.id, { title: "B's private board meeting" });

    const res = await calendarGET(
      requestAs(tenantA, '/api/calendar', {
        query: { viewMode: 'day', date: DAY.toISOString() },
      })
    );

    expect(res.status).toBe(200);
    const body = await readJson<OkBody<{ events: { title: string }[] }>>(res);
    const titles = body.data.events.map((e) => e.title);
    expect(titles).toContain('Mine');
    expect(titles).not.toContain("B's private board meeting");
  });

  it('refuses an anonymous caller', async () => {
    const res = await calendarGET(
      anonymousRequest('/api/calendar', { query: { viewMode: 'day', date: DAY.toISOString() } })
    );
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// POST /api/calendar -- writing INTO another tenant
// ===========================================================================

describe('POST /api/calendar', () => {
  const draft = {
    title: 'New Meeting',
    duration: 60,
    priority: 'MEDIUM' as const,
    type: 'MEETING' as const,
    selectedSlot: { start: SLOT_START.toISOString(), end: SLOT_END.toISOString() },
  };

  it("creates an event in the caller's own entity", async () => {
    const res = await calendarPOST(
      requestAs(tenantA, '/api/calendar', {
        method: 'POST',
        body: { ...draft, entityId: tenantA.entity.id },
      })
    );

    expect(res.status).toBe(201);
    const body = await readJson<OkBody<{ entityId: string }>>(res);
    expect(body.data.entityId).toBe(tenantA.entity.id);
  });

  it('creates an event when the caller names no entity at all', async () => {
    // The client should not have to name its own tenant. The session's active
    // entity is the answer, and one test used to assert the opposite.
    const res = await calendarPOST(
      requestAs(tenantA, '/api/calendar', { method: 'POST', body: draft })
    );

    expect(res.status).toBe(201);
    const body = await readJson<OkBody<{ entityId: string }>>(res);
    expect(body.data.entityId).toBe(tenantA.entity.id);
  });

  it("refuses to create an event inside tenant B's entity, and writes nothing", async () => {
    const res = await calendarPOST(
      requestAs(tenantA, '/api/calendar', {
        method: 'POST',
        body: { ...draft, title: 'Planted in B', entityId: tenantB.entity.id },
      })
    );

    expect(res.status).toBe(403);
    expect((await readJson<ErrBody>(res)).error.code).toBe('FORBIDDEN');

    // A 403 that still writes is not a fix.
    expect(await db.calendarEvent.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
  });

  it('refuses an anonymous caller', async () => {
    const res = await calendarPOST(
      anonymousRequest('/api/calendar', { method: 'POST', body: draft })
    );
    expect(res.status).toBe(401);
    expect(await db.calendarEvent.count()).toBe(0);
  });
});

// ===========================================================================
// GET /api/calendar/availability -- the same ternary, a second exit
// ===========================================================================

describe('GET /api/calendar/availability', () => {
  const range = {
    startDate: DAY_START.toISOString(),
    endDate: DAY_END.toISOString(),
  };

  it("reports the caller's own busy slots", async () => {
    await createEvent(tenantA.entity.id, { title: 'Mine' });

    const res = await availabilityGET(
      requestAs(tenantA, '/api/calendar/availability', { query: range })
    );

    expect(res.status).toBe(200);
    const body = await readJson<OkBody<{ totalEvents: number }>>(res);
    expect(body.data.totalEvents).toBe(1);
  });

  it("refuses to report tenant B's availability", async () => {
    const res = await availabilityGET(
      requestAs(tenantA, '/api/calendar/availability', {
        query: { ...range, entityId: tenantB.entity.id },
      })
    );

    expect(res.status).toBe(403);
    expect((await readJson<ErrBody>(res)).error.code).toBe('FORBIDDEN');
  });

  it("does not leak tenant B's busy slots to an ordinary request", async () => {
    await createEvent(tenantB.entity.id, { title: "B's private board meeting" });

    const res = await availabilityGET(
      requestAs(tenantA, '/api/calendar/availability', { query: range })
    );

    expect(res.status).toBe(200);
    const body = await readJson<OkBody<{ totalEvents: number; busySlots: { title: string }[] }>>(
      res
    );
    expect(body.data.totalEvents).toBe(0);
    expect(body.data.busySlots).toEqual([]);
  });

  it('refuses an anonymous caller', async () => {
    const res = await availabilityGET(
      anonymousRequest('/api/calendar/availability', { query: range })
    );
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// GET /api/calendar/analytics and POST /api/calendar/optimize
// ===========================================================================

describe('GET /api/calendar/analytics', () => {
  const range = {
    startDate: DAY_START.toISOString(),
    endDate: DAY_END.toISOString(),
  };

  it("reports the caller's own analytics", async () => {
    await createEvent(tenantA.entity.id, { title: 'Mine' });

    const res = await analyticsGET(
      requestAs(tenantA, '/api/calendar/analytics', { query: range })
    );

    expect(res.status).toBe(200);
    const body = await readJson<OkBody<{ meetingMetrics: { totalMeetings: number } }>>(res);
    expect(body.data.meetingMetrics.totalMeetings).toBe(1);
  });

  it("refuses to report tenant B's analytics", async () => {
    const res = await analyticsGET(
      requestAs(tenantA, '/api/calendar/analytics', {
        query: { ...range, entityId: tenantB.entity.id },
      })
    );

    expect(res.status).toBe(403);
  });

  it("does not count tenant B's meetings in an ordinary request", async () => {
    await createEvent(tenantB.entity.id, { title: "B's meeting" });
    await createEvent(tenantB.entity.id, { title: "B's other meeting" });

    const res = await analyticsGET(
      requestAs(tenantA, '/api/calendar/analytics', { query: range })
    );

    expect(res.status).toBe(200);
    const body = await readJson<OkBody<{ meetingMetrics: { totalMeetings: number } }>>(res);
    expect(body.data.meetingMetrics.totalMeetings).toBe(0);
  });

  it('refuses an anonymous caller', async () => {
    const res = await analyticsGET(anonymousRequest('/api/calendar/analytics', { query: range }));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/calendar/optimize', () => {
  const body = {
    startDate: DAY_START.toISOString(),
    endDate: DAY_END.toISOString(),
  };

  it("optimizes the caller's own schedule", async () => {
    const res = await optimizePOST(
      requestAs(tenantA, '/api/calendar/optimize', { method: 'POST', body })
    );
    expect(res.status).toBe(200);
  });

  it("refuses to optimize tenant B's schedule", async () => {
    const res = await optimizePOST(
      requestAs(tenantA, '/api/calendar/optimize', {
        method: 'POST',
        body: { ...body, entityId: tenantB.entity.id },
      })
    );
    expect(res.status).toBe(403);
  });

  it('refuses an anonymous caller', async () => {
    const res = await optimizePOST(
      anonymousRequest('/api/calendar/optimize', { method: 'POST', body })
    );
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// POST /api/calendar/conflicts and POST /api/calendar/schedule
// ===========================================================================

describe('POST /api/calendar/conflicts', () => {
  const body = {
    startTime: SLOT_START.toISOString(),
    endTime: SLOT_END.toISOString(),
  };

  it("checks conflicts in the caller's own entity", async () => {
    const res = await conflictsPOST(
      requestAs(tenantA, '/api/calendar/conflicts', { method: 'POST', body })
    );
    expect(res.status).toBe(200);
  });

  it("refuses a conflict check against tenant B's entity", async () => {
    const res = await conflictsPOST(
      requestAs(tenantA, '/api/calendar/conflicts', {
        method: 'POST',
        body: { ...body, entityId: tenantB.entity.id },
      })
    );
    expect(res.status).toBe(403);
  });

  it('refuses an anonymous caller', async () => {
    const res = await conflictsPOST(
      anonymousRequest('/api/calendar/conflicts', { method: 'POST', body })
    );
    expect(res.status).toBe(401);
  });
});

describe('POST /api/calendar/schedule', () => {
  const body = {
    title: 'Find me a slot',
    duration: 30,
    priority: 'MEDIUM' as const,
    type: 'MEETING' as const,
  };

  it("finds slots in the caller's own entity", async () => {
    const res = await schedulePOST(
      requestAs(tenantA, '/api/calendar/schedule', { method: 'POST', body })
    );
    expect(res.status).toBe(200);
  });

  it("refuses to find slots against tenant B's entity", async () => {
    const res = await schedulePOST(
      requestAs(tenantA, '/api/calendar/schedule', {
        method: 'POST',
        body: { ...body, entityId: tenantB.entity.id },
      })
    );
    expect(res.status).toBe(403);
  });

  it('refuses an anonymous caller', async () => {
    const res = await schedulePOST(
      anonymousRequest('/api/calendar/schedule', { method: 'POST', body })
    );
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// /api/calendar/[eventId] -- resource-scoped: the entity is on the ROW
// ===========================================================================

describe('GET /api/calendar/[eventId]', () => {
  it("returns the caller's own event", async () => {
    const mine = await createEvent(tenantA.entity.id, { title: 'Mine' });

    const res = await eventGET(
      requestAs(tenantA, `/api/calendar/${mine.id}`),
      ctx(mine.id)
    );

    expect(res.status).toBe(200);
    expect((await readJson<OkBody<{ title: string }>>(res)).data.title).toBe('Mine');
  });

  it("refuses to return tenant B's event", async () => {
    const theirs = await createEvent(tenantB.entity.id, { title: "B's private meeting" });

    const res = await eventGET(
      requestAs(tenantA, `/api/calendar/${theirs.id}`),
      ctx(theirs.id)
    );

    expect(res.status).toBe(403);
    expect((await readJson<ErrBody>(res)).error.code).toBe('FORBIDDEN');
  });

  it('404s an event that does not exist', async () => {
    const res = await eventGET(
      requestAs(tenantA, '/api/calendar/no-such-event'),
      ctx('no-such-event')
    );
    expect(res.status).toBe(404);
  });

  it('refuses an anonymous caller before touching the database', async () => {
    const theirs = await createEvent(tenantB.entity.id);
    const res = await eventGET(
      anonymousRequest(`/api/calendar/${theirs.id}`),
      ctx(theirs.id)
    );
    expect(res.status).toBe(401);
  });
});

describe('PATCH and PUT /api/calendar/[eventId]', () => {
  it("renames the caller's own event", async () => {
    const mine = await createEvent(tenantA.entity.id, { title: 'Before' });

    const res = await eventPATCH(
      requestAs(tenantA, `/api/calendar/${mine.id}`, {
        method: 'PATCH',
        body: { title: 'After' },
      }),
      ctx(mine.id)
    );

    expect(res.status).toBe(200);
    expect((await db.calendarEvent.findUniqueOrThrow({ where: { id: mine.id } })).title).toBe(
      'After'
    );
  });

  it("refuses to rename tenant B's event, and changes nothing", async () => {
    const theirs = await createEvent(tenantB.entity.id, { title: 'Untouched' });

    const res = await eventPATCH(
      requestAs(tenantA, `/api/calendar/${theirs.id}`, {
        method: 'PATCH',
        body: { title: 'Hijacked' },
      }),
      ctx(theirs.id)
    );

    expect(res.status).toBe(403);
    expect((await db.calendarEvent.findUniqueOrThrow({ where: { id: theirs.id } })).title).toBe(
      'Untouched'
    );
  });

  it("refuses a PUT into tenant B's event, and changes nothing", async () => {
    const theirs = await createEvent(tenantB.entity.id, { title: 'Untouched' });

    const res = await eventPUT(
      requestAs(tenantA, `/api/calendar/${theirs.id}`, {
        method: 'PUT',
        body: { title: 'Hijacked' },
      }),
      ctx(theirs.id)
    );

    expect(res.status).toBe(403);
    expect((await db.calendarEvent.findUniqueOrThrow({ where: { id: theirs.id } })).title).toBe(
      'Untouched'
    );
  });

  it('refuses an anonymous caller', async () => {
    const theirs = await createEvent(tenantB.entity.id, { title: 'Untouched' });
    const res = await eventPATCH(
      anonymousRequest(`/api/calendar/${theirs.id}`, {
        method: 'PATCH',
        body: { title: 'Hijacked' },
      }),
      ctx(theirs.id)
    );
    expect(res.status).toBe(401);
    expect((await db.calendarEvent.findUniqueOrThrow({ where: { id: theirs.id } })).title).toBe(
      'Untouched'
    );
  });
});

describe('DELETE /api/calendar/[eventId]', () => {
  it("deletes the caller's own event", async () => {
    const mine = await createEvent(tenantA.entity.id);

    const res = await eventDELETE(
      requestAs(tenantA, `/api/calendar/${mine.id}`, { method: 'DELETE' }),
      ctx(mine.id)
    );

    expect(res.status).toBe(200);
    expect(await db.calendarEvent.count({ where: { id: mine.id } })).toBe(0);
  });

  it("refuses to delete tenant B's event, and the row survives", async () => {
    const theirs = await createEvent(tenantB.entity.id);

    const res = await eventDELETE(
      requestAs(tenantA, `/api/calendar/${theirs.id}`, { method: 'DELETE' }),
      ctx(theirs.id)
    );

    expect(res.status).toBe(403);
    expect(await db.calendarEvent.count({ where: { id: theirs.id } })).toBe(1);
  });

  it('refuses an anonymous caller', async () => {
    const theirs = await createEvent(tenantB.entity.id);
    const res = await eventDELETE(
      anonymousRequest(`/api/calendar/${theirs.id}`, { method: 'DELETE' }),
      ctx(theirs.id)
    );
    expect(res.status).toBe(401);
    expect(await db.calendarEvent.count({ where: { id: theirs.id } })).toBe(1);
  });
});

describe('POST /api/calendar/[eventId]/reschedule', () => {
  const move = {
    newStartTime: new Date(2026, 2, 4, 14, 0, 0).toISOString(),
    newEndTime: new Date(2026, 2, 4, 15, 0, 0).toISOString(),
  };

  it("moves the caller's own event", async () => {
    const mine = await createEvent(tenantA.entity.id);

    const res = await reschedulePOST(
      requestAs(tenantA, `/api/calendar/${mine.id}/reschedule`, { method: 'POST', body: move }),
      ctx(mine.id)
    );

    expect(res.status).toBe(200);
    const row = await db.calendarEvent.findUniqueOrThrow({ where: { id: mine.id } });
    expect(row.startTime.getTime()).toBe(new Date(move.newStartTime).getTime());
  });

  it("refuses to move tenant B's event, and the times are unchanged", async () => {
    const theirs = await createEvent(tenantB.entity.id);

    const res = await reschedulePOST(
      requestAs(tenantA, `/api/calendar/${theirs.id}/reschedule`, { method: 'POST', body: move }),
      ctx(theirs.id)
    );

    expect(res.status).toBe(403);
    const row = await db.calendarEvent.findUniqueOrThrow({ where: { id: theirs.id } });
    expect(row.startTime.getTime()).toBe(SLOT_START.getTime());
    expect(row.endTime.getTime()).toBe(SLOT_END.getTime());
  });

  it('refuses an anonymous caller', async () => {
    const theirs = await createEvent(tenantB.entity.id);
    const res = await reschedulePOST(
      anonymousRequest(`/api/calendar/${theirs.id}/reschedule`, { method: 'POST', body: move }),
      ctx(theirs.id)
    );
    expect(res.status).toBe(401);
    const row = await db.calendarEvent.findUniqueOrThrow({ where: { id: theirs.id } });
    expect(row.startTime.getTime()).toBe(SLOT_START.getTime());
  });
});

// ===========================================================================
// /api/calendar/[eventId]/prep-packet -- the highest-value read in the module
// ===========================================================================

describe('GET /api/calendar/[eventId]/prep-packet', () => {
  const packet = { eventId: 'x', generatedAt: new Date(0).toISOString(), agenda: ['secret'] };

  it("returns the caller's own prep packet", async () => {
    const mine = await createEvent(tenantA.entity.id, { prepPacket: packet });

    const res = await prepGET(
      requestAs(tenantA, `/api/calendar/${mine.id}/prep-packet`),
      ctx(mine.id)
    );

    expect(res.status).toBe(200);
  });

  it("refuses to return tenant B's prep packet", async () => {
    const theirs = await createEvent(tenantB.entity.id, { prepPacket: packet });

    const res = await prepGET(
      requestAs(tenantA, `/api/calendar/${theirs.id}/prep-packet`),
      ctx(theirs.id)
    );

    expect(res.status).toBe(403);
    expect((await readJson<ErrBody>(res)).error.code).toBe('FORBIDDEN');
  });

  it('refuses an anonymous caller', async () => {
    const theirs = await createEvent(tenantB.entity.id, { prepPacket: packet });
    const res = await prepGET(
      anonymousRequest(`/api/calendar/${theirs.id}/prep-packet`),
      ctx(theirs.id)
    );
    expect(res.status).toBe(401);
  });
});

describe('POST /api/calendar/[eventId]/prep-packet', () => {
  it("generates a prep packet for the caller's own event", async () => {
    const contact = await createContact(tenantA.entity.id, { name: 'Alice' });
    const mine = await createEvent(tenantA.entity.id, { participantIds: [contact.id] });

    const res = await prepPOST(
      requestAs(tenantA, `/api/calendar/${mine.id}/prep-packet`, {
        method: 'POST',
        body: { depth: 'STANDARD' },
      }),
      ctx(mine.id)
    );

    expect(res.status).toBe(201);
    const body = await readJson<OkBody<{ attendeeProfiles: string[] }>>(res);
    expect(body.data.attendeeProfiles[0]).toContain('Alice');
  });

  it("refuses to generate one against tenant B's event, and writes nothing", async () => {
    const theirs = await createEvent(tenantB.entity.id);

    const res = await prepPOST(
      requestAs(tenantA, `/api/calendar/${theirs.id}/prep-packet`, {
        method: 'POST',
        body: { depth: 'STANDARD' },
      }),
      ctx(theirs.id)
    );

    expect(res.status).toBe(403);
    const row = await db.calendarEvent.findUniqueOrThrow({ where: { id: theirs.id } });
    expect(row.prepPacket).toBeNull();
  });

  it("refuses even when the body names the caller's own entity", async () => {
    // The `[eventId]` scope comes from the ROW, not the body, so naming your
    // own entity does not buy access to someone else's event.
    const theirs = await createEvent(tenantB.entity.id);

    const res = await prepPOST(
      requestAs(tenantA, `/api/calendar/${theirs.id}/prep-packet`, {
        method: 'POST',
        body: { depth: 'STANDARD', entityId: tenantA.entity.id },
      }),
      ctx(theirs.id)
    );

    expect(res.status).toBe(403);
    const row = await db.calendarEvent.findUniqueOrThrow({ where: { id: theirs.id } });
    expect(row.prepPacket).toBeNull();
  });
});

// ===========================================================================
// PostMeetingService -- the service half of the route not exercised above
// ===========================================================================

describe('PostMeetingService.capturePostMeeting', () => {
  const service = new PostMeetingService();

  it("records notes on the caller's own event and creates the action-item tasks", async () => {
    const mine = await createEvent(tenantA.entity.id);

    const result = await service.capturePostMeeting({
      eventId: mine.id,
      entityId: verifiedEntityIdForTest(tenantA.entity.id),
      notes: 'Went well',
      actionItems: [{ title: 'Send the deck', priority: 'P1' }],
      decisions: [],
      sentiment: 'POSITIVE',
      keyTakeaways: [],
    });

    expect(result.tasksCreated).toHaveLength(1);
    const row = await db.calendarEvent.findUniqueOrThrow({ where: { id: mine.id } });
    expect(row.meetingNotes).toContain('Went well');
    expect(await db.task.count({ where: { entityId: tenantA.entity.id } })).toBe(1);
  });

  it("refuses an event outside the verified entity, and writes nothing", async () => {
    const theirs = await createEvent(tenantB.entity.id);

    await expect(
      service.capturePostMeeting({
        eventId: theirs.id,
        entityId: verifiedEntityIdForTest(tenantA.entity.id),
        notes: 'Planted',
        actionItems: [{ title: 'Planted task', priority: 'P1' }],
        decisions: [],
        sentiment: 'POSITIVE',
        keyTakeaways: [],
      })
    ).rejects.toThrow(/Event not found/);

    const row = await db.calendarEvent.findUniqueOrThrow({ where: { id: theirs.id } });
    expect(row.meetingNotes).toBeNull();
    expect(await db.task.count()).toBe(0);
  });
});

// ===========================================================================
// SYMMETRY -- a "fix" that denies everyone passes every assertion above
// ===========================================================================

describe('symmetry: tenant B reaches tenant B', () => {
  it("returns B's own event to B", async () => {
    const theirs = await createEvent(tenantB.entity.id, { title: "B's own" });

    const res = await eventGET(
      requestAs(tenantB, `/api/calendar/${theirs.id}`),
      ctx(theirs.id)
    );

    expect(res.status).toBe(200);
    expect((await readJson<OkBody<{ title: string }>>(res)).data.title).toBe("B's own");
  });

  it("lists B's own events for B, and not A's", async () => {
    await createEvent(tenantA.entity.id, { title: "A's" });
    await createEvent(tenantB.entity.id, { title: "B's" });

    const res = await calendarGET(
      requestAs(tenantB, '/api/calendar', {
        query: { viewMode: 'day', date: DAY.toISOString() },
      })
    );

    expect(res.status).toBe(200);
    const body = await readJson<OkBody<{ events: { title: string }[] }>>(res);
    expect(body.data.events.map((e) => e.title)).toEqual(["B's"]);
  });

  it('lets B delete B\'s own event', async () => {
    const theirs = await createEvent(tenantB.entity.id);

    const res = await eventDELETE(
      requestAs(tenantB, `/api/calendar/${theirs.id}`, { method: 'DELETE' }),
      ctx(theirs.id)
    );

    expect(res.status).toBe(200);
    expect(await db.calendarEvent.count({ where: { id: theirs.id } })).toBe(0);
  });
});
