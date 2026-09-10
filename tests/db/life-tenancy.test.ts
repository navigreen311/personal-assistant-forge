/**
 * P-12 acceptance — Health, Household and Travel tenancy, against a real Postgres.
 *
 * ============================================================================
 * WHAT THIS FILE EXISTS TO PROVE
 * ============================================================================
 *
 * These three modules had one defect in three shapes.
 *
 * (1) THE SCOPE WAS A USER ID IN AN ENTITY COLUMN. Every service in all three
 *     modules took a parameter named `userId` and wrote it straight into the
 *     `entityId` column:
 *
 *         where: { entityId: userId, type: 'sleep' }
 *
 *     `HealthMetric.entityId` and `Document.entityId` are foreign keys to
 *     `Entity`, so this is not merely mislabelled -- it names a row that does
 *     not exist. The routes above them passed `session.userId`, so the health
 *     module stored and queried medical records under a key belonging to a
 *     different table.
 *
 * (2) BY-ID OPERATIONS HAD NO SCOPE AT ALL. `completeTask(taskId)`,
 *     `markPurchased(itemId)`, `logMaintenance(vehicleId)`,
 *     `updateProvider(providerId)`, `logServiceCall(providerId)`,
 *     `updateMemberPrivacy(memberId)` and the entire itinerary service took an
 *     id and a `findUnique`, with either a post-hoc comparison or nothing.
 *
 * (3) THE TRAVEL `[id]` ROUTES DISCARDED THE SESSION. `GET`, `PUT` and `DELETE`
 *     on `/api/travel/itineraries/[id]` were
 *     `withAuth(request, async (_req, _session) => ...)` handing the path id
 *     straight to an unscoped service. Any authenticated user who knew or
 *     guessed an itinerary id could read another tenant's flight numbers, hotel
 *     bookings and confirmation numbers, edit them, or delete the calendar
 *     events behind them.
 *
 * ============================================================================
 * WHY THE HEALTH CASES MATTER MORE
 * ============================================================================
 *
 * `health` holds medical records, sleep, stress and wearable data. The same bug
 * that leaks a shopping list here leaks a diagnosis. So the health cases below
 * assert database state after a refused write as well as the status code: a 403
 * that still writes the row is not a fix.
 *
 * `getToken` is NOT mocked. Every request carries a genuine NextAuth JWE and the
 * production decrypt path runs, so a route that stopped calling `withAuth`
 * would answer `anonymousRequest` with a 200 and be caught here. A
 * mocked-Prisma unit test cannot observe any of this -- which is why 5,283
 * passing tests never saw it.
 */

import { GET as sleepGET } from '@/app/api/health/sleep/route';
import { GET as stressGET, POST as stressPOST } from '@/app/api/health/stress/route';
import { GET as medicalGET, POST as medicalPOST } from '@/app/api/health/medical/route';
import {
  GET as wearablesGET,
  POST as wearablesPOST,
} from '@/app/api/health/wearables/route';
import { GET as healthDashboardGET } from '@/app/api/health/dashboard/route';

import {
  GET as propertiesGET,
  POST as propertiesPOST,
} from '@/app/api/household/properties/route';
import {
  GET as warrantiesGET,
  POST as warrantiesPOST,
} from '@/app/api/household/warranties/route';
import {
  GET as maintenanceGET,
  POST as maintenancePOST,
} from '@/app/api/household/maintenance/route';
import { GET as householdDashboardGET } from '@/app/api/household/dashboard/route';

import {
  GET as itinerariesGET,
  POST as itinerariesPOST,
} from '@/app/api/travel/itineraries/route';
import {
  GET as itineraryGET,
  PUT as itineraryPUT,
  DELETE as itineraryDELETE,
} from '@/app/api/travel/itineraries/[id]/route';
import { GET as tripsGET, POST as tripsPOST } from '@/app/api/travel/trips/route';

import { db, setupTestDatabase } from '../helpers/db';
import { createTwoTenants, type Tenant } from '../helpers/factories';
import { anonymousRequest, readJson, requestAs } from '../helpers/session';

setupTestDatabase();

type ErrBody = { success: false; error: { code: string; message: string } };
type OkBody<T> = { success: true; data: T };

/** Next 15 hands a route its path params as a promise; mirror that exactly. */
function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

let tenantA: Tenant;
let tenantB: Tenant;

beforeEach(async () => {
  ({ tenantA, tenantB } = await createTwoTenants());
});

// ---------------------------------------------------------------------------
// Fixtures written directly, so a bug in one route cannot set up another's test
// ---------------------------------------------------------------------------

async function giveSleep(entityId: string, hours: number) {
  return db.healthMetric.create({
    data: {
      entityId,
      type: 'sleep',
      value: hours,
      unit: 'hours',
      source: 'manual',
      recordedAt: new Date(),
    },
  });
}

async function giveMedicalRecord(entityId: string, title: string) {
  return db.document.create({
    data: {
      entityId,
      type: 'MEDICAL',
      title,
      status: 'APPOINTMENT',
      citations: { date: new Date().toISOString(), reminders: [] },
    },
  });
}

async function giveWarranty(entityId: string, itemName: string) {
  return db.document.create({
    data: {
      entityId,
      type: 'WARRANTY',
      title: itemName,
      status: 'ACTIVE',
      content: JSON.stringify({
        itemName,
        purchaseDate: new Date('2025-01-01').toISOString(),
        warrantyEndDate: new Date('2030-01-01').toISOString(),
        provider: 'Acme',
      }),
    },
  });
}

async function giveProperty(entityId: string, name: string) {
  return db.document.create({
    data: {
      entityId,
      type: 'PROPERTY',
      title: name,
      status: 'ACTIVE',
      content: JSON.stringify({
        name,
        address: `${name} Street`,
        city: 'Henderson',
        state: 'NV',
        type: 'PRIMARY',
        ownership: 'OWN',
        monthlyCosts: { mortgage: 0, insurance: 0, utilities: 0, hoa: 0, maintenance: 0 },
      }),
    },
  });
}

/** An itinerary is a group of CalendarEvent rows sharing a prepPacket id. */
async function giveItinerary(tenant: Tenant, itineraryId: string, name: string) {
  await db.calendarEvent.create({
    data: {
      title: `${name} leg`,
      entityId: tenant.entity.id,
      startTime: new Date('2026-06-01T08:00:00Z'),
      endTime: new Date('2026-06-01T12:00:00Z'),
      prepPacket: {
        itineraryId,
        itineraryName: name,
        itineraryStatus: 'DRAFT',
        userId: tenant.user.id,
        legId: `${itineraryId}-leg-1`,
        legOrder: 1,
        legType: 'FLIGHT',
        departureLocation: 'LAS',
        arrivalLocation: 'JFK',
        timezone: 'UTC',
        confirmationNumber: 'SECRET-CONF-123',
        costUsd: 400,
        status: 'BOOKED',
      },
    },
  });
  return itineraryId;
}

// ===========================================================================
// HEALTH -- PHI. Every refused write is checked against the database.
// ===========================================================================

describe('health: sleep', () => {
  it("owner reads their own entity's sleep history", async () => {
    await giveSleep(tenantA.entity.id, 7.5);

    const res = await sleepGET(requestAs(tenantA, '/api/health/sleep'));
    expect(res.status).toBe(200);

    const body = await readJson<OkBody<{ totalHours: number }[]>>(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].totalHours).toBe(7.5);
  });

  it("refuses to read tenant B's sleep history", async () => {
    await giveSleep(tenantB.entity.id, 6.1);

    const res = await sleepGET(
      requestAs(tenantA, `/api/health/sleep?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);
    expect((await readJson<ErrBody>(res)).error.code).toBe('FORBIDDEN');
  });

  it("an ordinary request does not return tenant B's rows", async () => {
    // Not "refuses ?entityId=B" -- an entirely unremarkable request that would
    // have matched B's row if the scope were missing. Leaking rows on a list is
    // a different failure from a single-record 403.
    await giveSleep(tenantB.entity.id, 6.1);

    const res = await sleepGET(requestAs(tenantA, '/api/health/sleep'));
    expect(res.status).toBe(200);
    expect((await readJson<OkBody<unknown[]>>(res)).data).toEqual([]);
  });

  it('refuses an anonymous request', async () => {
    const res = await sleepGET(anonymousRequest('/api/health/sleep'));
    expect(res.status).toBe(401);
  });

  it("tenant B reaches tenant B's own sleep history", async () => {
    // Symmetry. A "fix" that denies everyone passes every other assertion here.
    await giveSleep(tenantB.entity.id, 8.25);

    const res = await sleepGET(requestAs(tenantB, '/api/health/sleep'));
    expect(res.status).toBe(200);
    expect((await readJson<OkBody<{ totalHours: number }[]>>(res)).data[0].totalHours).toBe(8.25);
  });
});

describe('health: stress', () => {
  it('owner records their own stress level', async () => {
    const res = await stressPOST(
      requestAs(tenantA, '/api/health/stress', {
        method: 'POST',
        body: { level: 42, source: 'manual' },
      })
    );
    expect(res.status).toBe(201);
    expect(
      await db.healthMetric.count({ where: { entityId: tenantA.entity.id, type: 'stress' } })
    ).toBe(1);
  });

  it("refuses to write a stress reading into tenant B's entity, and writes nothing", async () => {
    const res = await stressPOST(
      requestAs(tenantA, '/api/health/stress', {
        method: 'POST',
        body: { level: 99, source: 'manual', entityId: tenantB.entity.id },
      })
    );

    expect(res.status).toBe(403);
    // A 403 that still writes is not a fix.
    expect(await db.healthMetric.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
  });

  it("refuses to read tenant B's stress history", async () => {
    const res = await stressGET(
      requestAs(tenantA, `/api/health/stress?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });

  it('refuses an anonymous write', async () => {
    const res = await stressPOST(
      anonymousRequest('/api/health/stress', {
        method: 'POST',
        body: { level: 10, source: 'manual' },
      })
    );
    expect(res.status).toBe(401);
    expect(await db.healthMetric.count()).toBe(0);
  });
});

describe('health: medical records', () => {
  it('owner reads their own medical records', async () => {
    await giveMedicalRecord(tenantA.entity.id, 'Cardiology follow-up');

    const res = await medicalGET(requestAs(tenantA, '/api/health/medical'));
    expect(res.status).toBe(200);
    expect((await readJson<OkBody<{ title: string }[]>>(res)).data[0].title).toBe(
      'Cardiology follow-up'
    );
  });

  it("refuses to read tenant B's medical records", async () => {
    await giveMedicalRecord(tenantB.entity.id, 'Oncology consult');

    const res = await medicalGET(
      requestAs(tenantA, `/api/health/medical?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);

    const body = await readJson<ErrBody>(res);
    expect(JSON.stringify(body)).not.toContain('Oncology consult');
  });

  it("an ordinary medical list does not return tenant B's records", async () => {
    await giveMedicalRecord(tenantB.entity.id, 'Oncology consult');

    const res = await medicalGET(requestAs(tenantA, '/api/health/medical'));
    expect(res.status).toBe(200);
    expect((await readJson<OkBody<unknown[]>>(res)).data).toEqual([]);
  });

  it("refuses to file a medical record into tenant B's entity, and writes nothing", async () => {
    const res = await medicalPOST(
      requestAs(tenantA, '/api/health/medical', {
        method: 'POST',
        body: {
          type: 'APPOINTMENT',
          title: 'Planted record',
          date: new Date().toISOString(),
          entityId: tenantB.entity.id,
        },
      })
    );

    expect(res.status).toBe(403);
    expect(await db.document.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
  });

  it('refuses an anonymous read', async () => {
    const res = await medicalGET(anonymousRequest('/api/health/medical'));
    expect(res.status).toBe(401);
  });
});

describe('health: wearables (T-018)', () => {
  it('a connection survives being written -- a second client sees the row', async () => {
    // The store was a module-level Map, so the old service could pass an
    // in-process round trip while persisting nothing. Reading the row back
    // through the database is the part a Map cannot fake.
    const res = await wearablesPOST(
      requestAs(tenantA, '/api/health/wearables', {
        method: 'POST',
        body: { provider: 'OURA' },
      })
    );
    expect(res.status).toBe(201);

    const row = await db.healthMetric.findFirst({
      where: { entityId: tenantA.entity.id, type: 'wearable_connection' },
    });
    expect(row).not.toBeNull();
    expect(row?.source).toBe('OURA');
    expect(row?.value).toBe(1);

    // And a fresh request -- a new handler invocation, nothing carried in
    // memory -- still finds it.
    const listed = await wearablesGET(requestAs(tenantA, '/api/health/wearables'));
    const body = await readJson<OkBody<{ id: string; provider: string }[]>>(listed);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].provider).toBe('OURA');
  });

  it("refuses to connect a wearable into tenant B's entity, and writes nothing", async () => {
    const res = await wearablesPOST(
      requestAs(tenantA, '/api/health/wearables', {
        method: 'POST',
        body: { provider: 'FITBIT', entityId: tenantB.entity.id },
      })
    );

    expect(res.status).toBe(403);
    expect(await db.healthMetric.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
  });

  it("does not list tenant B's connections on an ordinary request", async () => {
    await wearablesPOST(
      requestAs(tenantB, '/api/health/wearables', { method: 'POST', body: { provider: 'WHOOP' } })
    );

    const res = await wearablesGET(requestAs(tenantA, '/api/health/wearables'));
    expect(res.status).toBe(200);
    expect((await readJson<OkBody<unknown[]>>(res)).data).toEqual([]);
  });

  it('a wearable connection row is never returned as a health reading', async () => {
    await wearablesPOST(
      requestAs(tenantA, '/api/health/wearables', { method: 'POST', body: { provider: 'GARMIN' } })
    );

    const res = await sleepGET(requestAs(tenantA, '/api/health/sleep'));
    expect((await readJson<OkBody<unknown[]>>(res)).data).toEqual([]);
  });

  it('refuses an anonymous connect', async () => {
    const res = await wearablesPOST(
      anonymousRequest('/api/health/wearables', {
        method: 'POST',
        body: { provider: 'FITBIT' },
      })
    );
    expect(res.status).toBe(401);
    expect(await db.healthMetric.count()).toBe(0);
  });
});

describe('health: dashboard', () => {
  it("reports the caller's own measurements, and null where there are none", async () => {
    await giveSleep(tenantA.entity.id, 7.1);

    const res = await healthDashboardGET(requestAs(tenantA, '/api/health/dashboard'));
    expect(res.status).toBe(200);

    const body = await readJson<
      OkBody<{ sleepHours: number | null; stepsToday: number | null; stressLevel: string | null }>
    >(res);
    expect(body.data.sleepHours).toBe(7.1);
    // Absent data reads as absent. This used to be a hardcoded 4320 steps and
    // 'low' stress for every user on every request.
    expect(body.data.stepsToday).toBeNull();
    expect(body.data.stressLevel).toBeNull();
  });

  it("does not report tenant B's measurements", async () => {
    await giveSleep(tenantB.entity.id, 6.6);

    const res = await healthDashboardGET(requestAs(tenantA, '/api/health/dashboard'));
    expect(res.status).toBe(200);
    expect((await readJson<OkBody<{ sleepHours: number | null }>>(res)).data.sleepHours).toBeNull();
  });

  it("refuses ?entityId= pointing at tenant B", async () => {
    const res = await healthDashboardGET(
      requestAs(tenantA, `/api/health/dashboard?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });

  it('refuses an anonymous request', async () => {
    const res = await healthDashboardGET(anonymousRequest('/api/health/dashboard'));
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// HOUSEHOLD
// ===========================================================================

describe('household: properties (T-027)', () => {
  it('owner reads their own properties', async () => {
    await giveProperty(tenantA.entity.id, 'Lakeside');

    const res = await propertiesGET(requestAs(tenantA, '/api/household/properties'));
    expect(res.status).toBe(200);

    const body = await readJson<OkBody<{ name: string }[]>>(res);
    expect(body.data.map((p) => p.name)).toEqual(['Lakeside']);
  });

  it("an ordinary request does not return tenant B's properties", async () => {
    await giveProperty(tenantB.entity.id, '456 Rental Ave');

    const res = await propertiesGET(requestAs(tenantA, '/api/household/properties'));
    expect(res.status).toBe(200);
    expect((await readJson<OkBody<unknown[]>>(res)).data).toEqual([]);
  });

  it("refuses to add a property to tenant B's entity, and writes nothing", async () => {
    const res = await propertiesPOST(
      requestAs(tenantA, '/api/household/properties', {
        method: 'POST',
        body: {
          name: 'Planted',
          address: '1 Planted Way',
          city: 'Henderson',
          state: 'NV',
          type: 'PRIMARY',
          ownership: 'OWN',
          entityId: tenantB.entity.id,
        },
      })
    );

    expect(res.status).toBe(403);
    expect(await db.document.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
  });

  it('refuses an anonymous request', async () => {
    const res = await propertiesGET(anonymousRequest('/api/household/properties'));
    expect(res.status).toBe(401);
  });
});

describe('household: warranties', () => {
  it('owner reads their own warranties', async () => {
    await giveWarranty(tenantA.entity.id, 'Dishwasher');

    const res = await warrantiesGET(requestAs(tenantA, '/api/household/warranties'));
    expect(res.status).toBe(200);
    expect((await readJson<OkBody<{ itemName: string }[]>>(res)).data[0].itemName).toBe(
      'Dishwasher'
    );
  });

  it("refuses to read tenant B's warranties", async () => {
    await giveWarranty(tenantB.entity.id, 'Furnace');

    const res = await warrantiesGET(
      requestAs(tenantA, `/api/household/warranties?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });

  it("refuses to add a warranty to tenant B's entity, and writes nothing", async () => {
    const res = await warrantiesPOST(
      requestAs(tenantA, '/api/household/warranties', {
        method: 'POST',
        body: {
          itemName: 'Planted warranty',
          purchaseDate: new Date('2025-01-01').toISOString(),
          warrantyEndDate: new Date('2030-01-01').toISOString(),
          provider: 'Acme',
          entityId: tenantB.entity.id,
        },
      })
    );

    expect(res.status).toBe(403);
    expect(await db.document.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
  });
});

describe('household: maintenance', () => {
  it('owner creates and reads their own maintenance task', async () => {
    const created = await maintenancePOST(
      requestAs(tenantA, '/api/household/maintenance', {
        method: 'POST',
        body: {
          category: 'HVAC',
          title: 'Replace filter',
          frequency: 'QUARTERLY',
          nextDueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        },
      })
    );
    expect(created.status).toBe(201);

    const res = await maintenanceGET(requestAs(tenantA, '/api/household/maintenance'));
    expect(res.status).toBe(200);
    expect((await readJson<OkBody<{ title: string }[]>>(res)).data[0].title).toBe('Replace filter');
  });

  it("refuses to create a maintenance task in tenant B's entity, and writes nothing", async () => {
    const res = await maintenancePOST(
      requestAs(tenantA, '/api/household/maintenance', {
        method: 'POST',
        body: {
          category: 'HVAC',
          title: 'Planted task',
          frequency: 'ANNUAL',
          nextDueDate: new Date().toISOString(),
          entityId: tenantB.entity.id,
        },
      })
    );

    expect(res.status).toBe(403);
    expect(await db.task.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
  });

  it("an ordinary maintenance list does not return tenant B's tasks", async () => {
    await maintenancePOST(
      requestAs(tenantB, '/api/household/maintenance', {
        method: 'POST',
        body: {
          category: 'LAWN',
          title: "B's mowing",
          frequency: 'MONTHLY',
          nextDueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        },
      })
    );

    const res = await maintenanceGET(requestAs(tenantA, '/api/household/maintenance'));
    expect(res.status).toBe(200);
    expect((await readJson<OkBody<unknown[]>>(res)).data).toEqual([]);
  });
});

describe('household: dashboard', () => {
  it("counts only the caller's own rows", async () => {
    await giveProperty(tenantA.entity.id, 'Mine');
    await giveProperty(tenantB.entity.id, 'Theirs');
    await giveProperty(tenantB.entity.id, 'Theirs too');

    const res = await householdDashboardGET(requestAs(tenantA, '/api/household/dashboard'));
    expect(res.status).toBe(200);
    expect((await readJson<OkBody<{ stats: { properties: number } }>>(res)).data.stats.properties)
      .toBe(1);
  });

  it("refuses ?entityId= pointing at tenant B", async () => {
    const res = await householdDashboardGET(
      requestAs(tenantA, `/api/household/dashboard?entityId=${tenantB.entity.id}`)
    );
    expect(res.status).toBe(403);
  });

  it('refuses an anonymous request', async () => {
    const res = await householdDashboardGET(anonymousRequest('/api/household/dashboard'));
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// TRAVEL -- the [id] routes are the sharpest case in the package
// ===========================================================================

describe('travel: itineraries by id', () => {
  it('owner reads their own itinerary', async () => {
    await giveItinerary(tenantA, 'itin-a', 'Tokyo');

    const res = await itineraryGET(
      requestAs(tenantA, '/api/travel/itineraries/itin-a'),
      ctx('itin-a')
    );
    expect(res.status).toBe(200);
    expect((await readJson<OkBody<{ name: string }>>(res)).data.name).toBe('Tokyo');
  });

  it("refuses to read tenant B's itinerary, and leaks no detail", async () => {
    await giveItinerary(tenantB, 'itin-b', 'Confidential Tokyo');

    const res = await itineraryGET(
      requestAs(tenantA, '/api/travel/itineraries/itin-b'),
      ctx('itin-b')
    );
    expect(res.status).toBe(403);

    const raw = JSON.stringify(await readJson<ErrBody>(res));
    expect(raw).not.toContain('Confidential Tokyo');
    expect(raw).not.toContain('SECRET-CONF-123');
  });

  it("refuses to edit tenant B's itinerary, and changes nothing", async () => {
    await giveItinerary(tenantB, 'itin-b', 'Untouched');

    const res = await itineraryPUT(
      requestAs(tenantA, '/api/travel/itineraries/itin-b', {
        method: 'PUT',
        body: { name: 'Hijacked' },
      }),
      ctx('itin-b')
    );
    expect(res.status).toBe(403);

    const events = await db.calendarEvent.findMany({ where: { entityId: tenantB.entity.id } });
    expect(events).toHaveLength(1);
    expect((events[0].prepPacket as { itineraryName: string }).itineraryName).toBe('Untouched');
  });

  it("refuses to delete tenant B's itinerary, and the rows are still there", async () => {
    await giveItinerary(tenantB, 'itin-b', 'Still here');

    const res = await itineraryDELETE(
      requestAs(tenantA, '/api/travel/itineraries/itin-b', { method: 'DELETE' }),
      ctx('itin-b')
    );
    expect(res.status).toBe(403);
    expect(await db.calendarEvent.count({ where: { entityId: tenantB.entity.id } })).toBe(1);
  });

  it('refuses an anonymous read without touching the database', async () => {
    await giveItinerary(tenantB, 'itin-b', 'Private');

    const res = await itineraryGET(
      anonymousRequest('/api/travel/itineraries/itin-b'),
      ctx('itin-b')
    );
    expect(res.status).toBe(401);
  });

  it('owner can still edit their own itinerary (symmetry)', async () => {
    await giveItinerary(tenantB, 'itin-b', 'Original');

    const res = await itineraryPUT(
      requestAs(tenantB, '/api/travel/itineraries/itin-b', {
        method: 'PUT',
        body: { name: 'Renamed' },
      }),
      ctx('itin-b')
    );
    expect(res.status).toBe(200);

    const events = await db.calendarEvent.findMany({ where: { entityId: tenantB.entity.id } });
    expect((events[0].prepPacket as { itineraryName: string }).itineraryName).toBe('Renamed');
  });
});

describe('travel: itinerary list and create', () => {
  it('owner creates an itinerary in their own entity', async () => {
    const res = await itinerariesPOST(
      requestAs(tenantA, '/api/travel/itineraries', {
        method: 'POST',
        body: {
          name: 'Lisbon',
          legs: [
            {
              order: 1,
              type: 'FLIGHT',
              departureLocation: 'LAS',
              arrivalLocation: 'LIS',
              departureTime: new Date('2026-06-01T08:00:00Z').toISOString(),
              arrivalTime: new Date('2026-06-01T20:00:00Z').toISOString(),
              timezone: 'UTC',
              costUsd: 900,
              status: 'BOOKED',
            },
          ],
        },
      })
    );
    expect(res.status).toBe(201);
    expect(await db.calendarEvent.count({ where: { entityId: tenantA.entity.id } })).toBe(1);
  });

  it("refuses to create an itinerary in tenant B's entity, and writes nothing", async () => {
    const res = await itinerariesPOST(
      requestAs(tenantA, '/api/travel/itineraries', {
        method: 'POST',
        body: {
          name: 'Planted',
          entityId: tenantB.entity.id,
          legs: [
            {
              order: 1,
              type: 'FLIGHT',
              departureLocation: 'LAS',
              arrivalLocation: 'JFK',
              departureTime: new Date('2026-06-01T08:00:00Z').toISOString(),
              arrivalTime: new Date('2026-06-01T16:00:00Z').toISOString(),
              timezone: 'UTC',
              costUsd: 100,
              status: 'BOOKED',
            },
          ],
        },
      })
    );

    expect(res.status).toBe(403);
    expect(await db.calendarEvent.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
  });

  it("an ordinary list does not return tenant B's itineraries", async () => {
    await giveItinerary(tenantB, 'itin-b', "B's trip");

    const res = await itinerariesGET(requestAs(tenantA, '/api/travel/itineraries'));
    expect(res.status).toBe(200);
    expect((await readJson<OkBody<unknown[]>>(res)).data).toEqual([]);
  });

  it('refuses an anonymous list', async () => {
    const res = await itinerariesGET(anonymousRequest('/api/travel/itineraries'));
    expect(res.status).toBe(401);
  });
});

describe('travel: trips', () => {
  it('a created trip is really written, and comes back on the next request', async () => {
    // The old POST answered 201 with a fabricated crypto.randomUUID() id when
    // its write failed -- which was every request, because the delegate it
    // called is not in the schema.
    const created = await tripsPOST(
      requestAs(tenantA, '/api/travel/trips', {
        method: 'POST',
        body: {
          name: 'Denver',
          destination: 'DEN',
          origin: 'LAS',
          startDate: new Date(Date.now() + 30 * 86400000).toISOString(),
          endDate: new Date(Date.now() + 34 * 86400000).toISOString(),
          type: 'Business',
          budget: 1200,
        },
      })
    );
    expect(created.status).toBe(201);

    const id = (await readJson<OkBody<{ id: string }>>(created)).data.id;
    const row = await db.document.findFirst({ where: { id, type: 'TRIP' } });
    expect(row).not.toBeNull();
    expect(row?.entityId).toBe(tenantA.entity.id);

    const listed = await tripsGET(requestAs(tenantA, '/api/travel/trips'));
    const body = await readJson<
      OkBody<{ stats: { upcoming: number }; trips: { name: string }[] }>
    >(listed);
    expect(body.data.trips.map((t) => t.name)).toEqual(['Denver']);
    expect(body.data.stats.upcoming).toBe(1);
  });

  it("refuses to create a trip in tenant B's entity, and writes nothing", async () => {
    const res = await tripsPOST(
      requestAs(tenantA, '/api/travel/trips', {
        method: 'POST',
        body: {
          name: 'Planted',
          destination: 'JFK',
          origin: 'LAS',
          startDate: new Date().toISOString(),
          endDate: new Date().toISOString(),
          type: 'Personal',
          budget: 1,
          entityId: tenantB.entity.id,
        },
      })
    );

    expect(res.status).toBe(403);
    expect(await db.document.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
  });

  it("an ordinary trip list does not return tenant B's trips", async () => {
    await tripsPOST(
      requestAs(tenantB, '/api/travel/trips', {
        method: 'POST',
        body: {
          name: "B's trip",
          destination: 'SFO',
          origin: 'LAS',
          startDate: new Date(Date.now() + 86400000).toISOString(),
          endDate: new Date(Date.now() + 2 * 86400000).toISOString(),
          type: 'Personal',
          budget: 500,
        },
      })
    );

    const res = await tripsGET(requestAs(tenantA, '/api/travel/trips'));
    expect(res.status).toBe(200);
    expect((await readJson<OkBody<{ trips: unknown[] }>>(res)).data.trips).toEqual([]);
  });

  it('refuses an anonymous create', async () => {
    const res = await tripsPOST(
      anonymousRequest('/api/travel/trips', {
        method: 'POST',
        body: {
          name: 'x',
          destination: 'y',
          origin: 'z',
          startDate: new Date().toISOString(),
          endDate: new Date().toISOString(),
          type: 'Personal',
          budget: 0,
        },
      })
    );
    expect(res.status).toBe(401);
    expect(await db.document.count()).toBe(0);
  });
});
