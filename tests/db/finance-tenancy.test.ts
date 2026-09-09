/**
 * P-07 acceptance — Finance and Billing tenancy, proven against a real database.
 *
 * ============================================================================
 * WHAT THIS FILE EXISTS TO PROVE
 * ============================================================================
 *
 * Before this package, 16 of the 18 route files under `/api/finance` and
 * `/api/billing` called
 *
 *     withAuth(request, async (req, _session) => ...)
 *
 * and then took `entityId` from the query string or the request body.
 * `src/modules/finance/` contained ONE reference to `userId` in eight files;
 * `src/modules/billing/` contained none. So all of this succeeded:
 *
 *     POST /api/finance/invoices  { "entityId": "<someone else's>", ... }
 *     GET  /api/finance/pnl?entityId=<someone else's>&startDate=...&endDate=...
 *     GET  /api/finance/stats?entityId=<someone else's>
 *
 * Authenticated, and not authorized. Money makes it worse than elsewhere: an
 * invoice or expense read across the boundary is a disclosure, and one written
 * across it is a financial record filed against the wrong business.
 *
 * ============================================================================
 * AGGREGATES ARE THE PART A 403 TEST DOES NOT SEE
 * ============================================================================
 *
 * P&L, the aging report, cash-flow forecasting, expense-category rollups and
 * `/api/finance/stats` all SUM ACROSS ROWS and return no row at all. An
 * aggregate over an unscoped set therefore leaks a tenant's revenue, burn rate
 * and runway while every single-record route stays perfectly correct, and no
 * amount of "GET /thing/<id> returns 403" testing would notice.
 *
 * Every aggregate route in this package is covered below twice: once for a
 * named foreign entity (403) and once for the leak that matters more -- an
 * ORDINARY request, naming nothing, whose totals must contain none of tenant
 * B's money.
 *
 * ============================================================================
 * WHY A REAL DATABASE
 * ============================================================================
 *
 * `getToken` is UNMOCKED here, so each request presents a genuine NextAuth JWE
 * and the production decrypt path runs. A mocked-Prisma unit test cannot
 * observe a missing tenant check -- which is why 5,269 passing tests never saw
 * this, and why `tests/e2e/finance-management.test.ts` (which builds a
 * `mockPrisma` and calls `jest.mock('@/lib/db')`) is not evidence of anything
 * here despite its name.
 */

import { GET as invoicesGET, POST as invoicesPOST } from '@/app/api/finance/invoices/route';
import {
  GET as invoiceGET,
  PUT as invoicePUT,
} from '@/app/api/finance/invoices/[id]/route';
import { GET as agingGET } from '@/app/api/finance/invoices/aging/route';
import { GET as expensesGET, POST as expensesPOST } from '@/app/api/finance/expenses/route';
import { GET as expenseCategoriesGET } from '@/app/api/finance/expenses/categories/route';
import { GET as budgetsGET, POST as budgetsPOST } from '@/app/api/finance/budget/route';
import {
  GET as budgetGET,
  PUT as budgetPUT,
  DELETE as budgetDELETE,
} from '@/app/api/finance/budget/[id]/route';
import { GET as pnlGET } from '@/app/api/finance/pnl/route';
import { GET as forecastGET } from '@/app/api/finance/forecast/route';
import { POST as scenarioPOST } from '@/app/api/finance/forecast/scenario/route';
import { GET as renewalsGET } from '@/app/api/finance/renewals/route';
import { GET as statsGET } from '@/app/api/finance/stats/route';
import { GET as dashboardGET } from '@/app/api/finance/dashboard/route';
import {
  GET as billingBudgetGET,
  POST as billingBudgetPOST,
} from '@/app/api/billing/budget/route';
import { POST as billingBudgetCheckPOST } from '@/app/api/billing/budget/check/route';
import { GET as costAttributionGET } from '@/app/api/billing/cost-attribution/route';
import {
  GET as usageGET,
  POST as usagePOST,
} from '@/app/api/billing/usage/route';

import { db, setupTestDatabase } from '../helpers/db';
import { createTwoTenants, type Tenant } from '../helpers/factories';
import { anonymousRequest, readJson, requestAs } from '../helpers/session';

setupTestDatabase();

type ErrBody = { success: false; error: { code: string; message: string } };
type OkBody<T> = { success: true; data: T };
type PageBody<T> = { success: true; data: T[]; meta: { total: number } };

/** Next 15 hands a route its path params as a promise; mirror that exactly. */
function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const ISO_START = '2026-01-01T00:00:00.000Z';
const ISO_END = '2026-12-31T00:00:00.000Z';

let tenantA: Tenant;
let tenantB: Tenant;

/** A financial record owned by `tenant`. Written directly, not through a route. */
async function seedRecord(
  tenant: Tenant,
  overrides: Partial<{
    type: string;
    amount: number;
    status: string;
    category: string;
    vendor: string;
    description: string;
    dueDate: Date;
  }> = {}
) {
  return db.financialRecord.create({
    data: {
      entityId: tenant.entity.id,
      type: 'INVOICE',
      amount: 1000,
      currency: 'USD',
      status: 'PENDING',
      category: 'INVOICE',
      dueDate: new Date('2026-06-01'),
      description: JSON.stringify({ invoiceNumber: 'INV-2026-0001', invoiceStatus: 'SENT' }),
      ...overrides,
    },
  });
}

function invoiceDraft(entityId?: string) {
  return {
    ...(entityId ? { entityId } : {}),
    lineItems: [{ description: 'Consulting', quantity: 1, unitPrice: 500, total: 0 }],
    tax: 0,
    currency: 'USD',
    status: 'DRAFT' as const,
    issuedDate: ISO_START,
    dueDate: ISO_END,
    paymentTerms: 'Net 30',
  };
}

function expenseDraft(entityId?: string) {
  return {
    ...(entityId ? { entityId } : {}),
    amount: 250,
    currency: 'USD',
    category: 'Software & SaaS',
    vendor: 'Slack',
    description: 'Monthly seat',
    date: ISO_START,
    isRecurring: false,
    tags: [],
  };
}

function budgetDraft(entityId?: string) {
  return {
    ...(entityId ? { entityId } : {}),
    name: 'Q1 Budget',
    period: { start: ISO_START, end: ISO_END },
    categories: [
      {
        category: 'Software & SaaS',
        budgeted: 1000,
        spent: 0,
        remaining: 1000,
        percentUsed: 0,
        forecast: 0,
        alert: null,
      },
    ],
    totalBudgeted: 1000,
    status: 'DRAFT' as const,
  };
}

beforeEach(async () => {
  ({ tenantA, tenantB } = await createTwoTenants());
});

// ===========================================================================
// POST /api/finance/invoices -- writing a financial record INTO another tenant
// ===========================================================================

describe('POST /api/finance/invoices', () => {
  it("creates an invoice in the caller's own entity", async () => {
    const res = await invoicesPOST(
      requestAs(tenantA, '/api/finance/invoices', {
        method: 'POST',
        body: invoiceDraft(tenantA.entity.id),
      })
    );

    expect(res.status).toBe(201);
    const body = await readJson<OkBody<{ entityId: string; total: number }>>(res);
    expect(body.data.entityId).toBe(tenantA.entity.id);
  });

  it('creates in the session entity when the client names none', async () => {
    // Do not make the client name its own tenant: that habit is the bug.
    const res = await invoicesPOST(
      requestAs(tenantA, '/api/finance/invoices', { method: 'POST', body: invoiceDraft() })
    );

    expect(res.status).toBe(201);
    const body = await readJson<OkBody<{ entityId: string }>>(res);
    expect(body.data.entityId).toBe(tenantA.entity.id);
  });

  it("refuses to file an invoice against tenant B, and writes nothing", async () => {
    // THE BUG, on money. Under the old code this returned 201 and put a real
    // financial record in tenant B's books.
    const res = await invoicesPOST(
      requestAs(tenantA, '/api/finance/invoices', {
        method: 'POST',
        body: invoiceDraft(tenantB.entity.id),
      })
    );

    expect(res.status).toBe(403);
    expect((await readJson<ErrBody>(res)).error.code).toBe('FORBIDDEN');

    // A 403 that still writes is not a fix.
    expect(
      await db.financialRecord.count({ where: { entityId: tenantB.entity.id } })
    ).toBe(0);
  });

  it('refuses an anonymous caller', async () => {
    const res = await invoicesPOST(
      anonymousRequest('/api/finance/invoices', { method: 'POST', body: invoiceDraft() })
    );
    expect(res.status).toBe(401);
    expect(await db.financialRecord.count()).toBe(0);
  });

  it('lets tenant B reach tenant B -- a fix that denies everyone is not a fix', async () => {
    const res = await invoicesPOST(
      requestAs(tenantB, '/api/finance/invoices', {
        method: 'POST',
        body: invoiceDraft(tenantB.entity.id),
      })
    );
    expect(res.status).toBe(201);
  });
});

// ===========================================================================
// GET /api/finance/invoices -- a LIST route, where leaking rows is the failure
// ===========================================================================

describe('GET /api/finance/invoices', () => {
  it("returns the caller's own invoices", async () => {
    await seedRecord(tenantA);
    const res = await invoicesGET(requestAs(tenantA, '/api/finance/invoices'));
    expect(res.status).toBe(200);
    const body = await readJson<PageBody<{ id: string }>>(res);
    expect(body.data).toHaveLength(1);
  });

  it("refuses ?entityId=<tenant B>", async () => {
    await seedRecord(tenantB);
    const res = await invoicesGET(
      requestAs(tenantA, '/api/finance/invoices', {
        query: { entityId: tenantB.entity.id },
      })
    );
    expect(res.status).toBe(403);
  });

  it("does not return tenant B's invoices in an ORDINARY request", async () => {
    // The other half of a list route, and a different failure from a 403: the
    // request names nothing unusual, and must still see none of B's rows.
    const foreign = await seedRecord(tenantB, { amount: 999999 });
    await seedRecord(tenantA, { amount: 10 });

    const res = await invoicesGET(requestAs(tenantA, '/api/finance/invoices'));
    expect(res.status).toBe(200);
    const body = await readJson<PageBody<{ id: string; total: number }>>(res);
    expect(body.data.map((i) => i.id)).not.toContain(foreign.id);
    expect(body.meta.total).toBe(1);
  });

  it('refuses an anonymous caller', async () => {
    const res = await invoicesGET(anonymousRequest('/api/finance/invoices'));
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// /api/finance/invoices/[id] -- the entity is a property of the ROW
// ===========================================================================

describe('/api/finance/invoices/[id]', () => {
  it("reads the caller's own invoice", async () => {
    const mine = await seedRecord(tenantA);
    const res = await invoiceGET(
      requestAs(tenantA, `/api/finance/invoices/${mine.id}`),
      ctx(mine.id)
    );
    expect(res.status).toBe(200);
  });

  it("refuses to read tenant B's invoice by id", async () => {
    const theirs = await seedRecord(tenantB);
    const res = await invoiceGET(
      requestAs(tenantA, `/api/finance/invoices/${theirs.id}`),
      ctx(theirs.id)
    );
    expect(res.status).toBe(403);
  });

  it("refuses to change the status of tenant B's invoice, and changes nothing", async () => {
    const theirs = await seedRecord(tenantB, { status: 'PENDING' });

    const res = await invoicePUT(
      requestAs(tenantA, `/api/finance/invoices/${theirs.id}`, {
        method: 'PUT',
        body: { status: 'PAID' },
      }),
      ctx(theirs.id)
    );

    expect(res.status).toBe(403);
    const after = await db.financialRecord.findUniqueOrThrow({ where: { id: theirs.id } });
    expect(after.status).toBe('PENDING');
  });

  it('marks the caller\'s own invoice paid', async () => {
    const mine = await seedRecord(tenantA, { status: 'PENDING' });
    const res = await invoicePUT(
      requestAs(tenantA, `/api/finance/invoices/${mine.id}`, {
        method: 'PUT',
        body: { status: 'PAID' },
      }),
      ctx(mine.id)
    );
    expect(res.status).toBe(200);
    const after = await db.financialRecord.findUniqueOrThrow({ where: { id: mine.id } });
    expect(after.status).toBe('PAID');
  });

  it('refuses an anonymous caller before it touches the database', async () => {
    const theirs = await seedRecord(tenantB);
    const res = await invoiceGET(
      anonymousRequest(`/api/finance/invoices/${theirs.id}`),
      ctx(theirs.id)
    );
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// Expenses -- list, create, and the category AGGREGATE
// ===========================================================================

describe('/api/finance/expenses', () => {
  it("creates an expense in the caller's own entity", async () => {
    const res = await expensesPOST(
      requestAs(tenantA, '/api/finance/expenses', {
        method: 'POST',
        body: expenseDraft(tenantA.entity.id),
      })
    );
    expect(res.status).toBe(201);
  });

  it("refuses to book an expense against tenant B, and writes nothing", async () => {
    const res = await expensesPOST(
      requestAs(tenantA, '/api/finance/expenses', {
        method: 'POST',
        body: expenseDraft(tenantB.entity.id),
      })
    );
    expect(res.status).toBe(403);
    expect(
      await db.financialRecord.count({ where: { entityId: tenantB.entity.id } })
    ).toBe(0);
  });

  it("does not list tenant B's expenses in an ordinary request", async () => {
    const foreign = await seedRecord(tenantB, { type: 'EXPENSE', category: 'Software & SaaS' });
    const res = await expensesGET(requestAs(tenantA, '/api/finance/expenses'));
    expect(res.status).toBe(200);
    const body = await readJson<PageBody<{ id: string }>>(res);
    expect(body.data.map((e) => e.id)).not.toContain(foreign.id);
    expect(body.meta.total).toBe(0);
  });

  it('refuses an anonymous caller', async () => {
    const res = await expensesGET(anonymousRequest('/api/finance/expenses'));
    expect(res.status).toBe(401);
  });
});

describe('GET /api/finance/expenses/categories (AGGREGATE)', () => {
  it("refuses ?entityId=<tenant B>", async () => {
    const res = await expenseCategoriesGET(
      requestAs(tenantA, '/api/finance/expenses/categories', {
        query: { entityId: tenantB.entity.id, startDate: ISO_START, endDate: ISO_END },
      })
    );
    expect(res.status).toBe(403);
  });

  it("sums none of tenant B's expenses into an ordinary request", async () => {
    await seedRecord(tenantB, {
      type: 'EXPENSE',
      amount: 50000,
      category: 'Software & SaaS',
    });

    const res = await expenseCategoriesGET(
      requestAs(tenantA, '/api/finance/expenses/categories', {
        query: { startDate: ISO_START, endDate: ISO_END },
      })
    );

    expect(res.status).toBe(200);
    const body = await readJson<OkBody<Array<{ category: string; total: number }>>>(res);
    expect(body.data).toEqual([]);
  });
});

// ===========================================================================
// Budgets -- list, create, and the [id] routes over two representations
// ===========================================================================

describe('/api/finance/budget', () => {
  it("creates a budget in the caller's own entity", async () => {
    const res = await budgetsPOST(
      requestAs(tenantA, '/api/finance/budget', {
        method: 'POST',
        body: budgetDraft(tenantA.entity.id),
      })
    );
    expect(res.status).toBe(201);
  });

  it("refuses to create a budget inside tenant B, and writes nothing", async () => {
    const res = await budgetsPOST(
      requestAs(tenantA, '/api/finance/budget', {
        method: 'POST',
        body: budgetDraft(tenantB.entity.id),
      })
    );
    expect(res.status).toBe(403);
    expect(await db.document.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
  });

  it("does not list tenant B's budgets in an ordinary request", async () => {
    await budgetsPOST(
      requestAs(tenantB, '/api/finance/budget', {
        method: 'POST',
        body: budgetDraft(tenantB.entity.id),
      })
    );

    const res = await budgetsGET(requestAs(tenantA, '/api/finance/budget'));
    expect(res.status).toBe(200);
    expect((await readJson<OkBody<unknown[]>>(res)).data).toEqual([]);
  });
});

describe('/api/finance/budget/[id]', () => {
  async function seedBudgetDocument(tenant: Tenant): Promise<string> {
    const res = await budgetsPOST(
      requestAs(tenant, '/api/finance/budget', {
        method: 'POST',
        body: budgetDraft(tenant.entity.id),
      })
    );
    const body = await readJson<OkBody<{ id: string }>>(res);
    return body.data.id;
  }

  async function seedBudgetRecord(tenant: Tenant): Promise<string> {
    const row = await db.budget.create({
      data: {
        entityId: tenant.entity.id,
        name: 'Marketing',
        amount: 1000,
        spent: 0,
        period: 'monthly',
        category: 'marketing',
        status: 'active',
      },
    });
    return row.id;
  }

  it("reads the caller's own budget", async () => {
    const id = await seedBudgetDocument(tenantA);
    const res = await budgetGET(requestAs(tenantA, `/api/finance/budget/${id}`), ctx(id));
    expect(res.status).toBe(200);
  });

  it("refuses to read tenant B's budget by id", async () => {
    const id = await seedBudgetDocument(tenantB);
    const res = await budgetGET(requestAs(tenantA, `/api/finance/budget/${id}`), ctx(id));
    expect(res.status).toBe(403);
  });

  it("refuses to update tenant B's budget, and changes nothing", async () => {
    const id = await seedBudgetRecord(tenantB);

    const res = await budgetPUT(
      requestAs(tenantA, `/api/finance/budget/${id}`, {
        method: 'PUT',
        body: { amount: 999999, name: 'Hijacked' },
      }),
      ctx(id)
    );

    expect(res.status).toBe(403);
    const after = await db.budget.findUniqueOrThrow({ where: { id } });
    expect(after.name).toBe('Marketing');
    expect(after.amount).toBe(1000);
  });

  it("refuses to close tenant B's budget, and leaves it active", async () => {
    const id = await seedBudgetRecord(tenantB);

    const res = await budgetDELETE(
      requestAs(tenantA, `/api/finance/budget/${id}`, { method: 'DELETE' }),
      ctx(id)
    );

    expect(res.status).toBe(403);
    const after = await db.budget.findUniqueOrThrow({ where: { id } });
    expect(after.status).toBe('active');
  });

  it("closes the caller's own budget", async () => {
    const id = await seedBudgetRecord(tenantA);
    const res = await budgetDELETE(
      requestAs(tenantA, `/api/finance/budget/${id}`, { method: 'DELETE' }),
      ctx(id)
    );
    expect(res.status).toBe(200);
    const after = await db.budget.findUniqueOrThrow({ where: { id } });
    expect(after.status).toBe('closed');
  });
});

// ===========================================================================
// THE AGGREGATES. None of these returns a row, so none of them would fail a
// single-record 403 test -- and every one of them is money.
// ===========================================================================

describe('GET /api/finance/pnl (AGGREGATE)', () => {
  it("refuses ?entityId=<tenant B>", async () => {
    const res = await pnlGET(
      requestAs(tenantA, '/api/finance/pnl', {
        query: { entityId: tenantB.entity.id, startDate: ISO_START, endDate: ISO_END },
      })
    );
    expect(res.status).toBe(403);
  });

  it("sums none of tenant B's revenue or expenses into an ordinary request", async () => {
    await seedRecord(tenantB, { type: 'INVOICE', amount: 750000, status: 'PAID' });
    await seedRecord(tenantB, { type: 'EXPENSE', amount: 250000, status: 'PAID' });

    const res = await pnlGET(
      requestAs(tenantA, '/api/finance/pnl', {
        query: { startDate: ISO_START, endDate: ISO_END },
      })
    );

    expect(res.status).toBe(200);
    const body = await readJson<
      OkBody<{ totalRevenue: number; totalExpenses: number; entityId: string }>
    >(res);
    expect(body.data.entityId).toBe(tenantA.entity.id);
    expect(body.data.totalRevenue).toBe(0);
    expect(body.data.totalExpenses).toBe(0);
  });
});

describe('GET /api/finance/invoices/aging (AGGREGATE)', () => {
  it("refuses ?entityId=<tenant B>", async () => {
    const res = await agingGET(
      requestAs(tenantA, '/api/finance/invoices/aging', {
        query: { entityId: tenantB.entity.id },
      })
    );
    expect(res.status).toBe(403);
  });

  it("does not report tenant B's outstanding receivables", async () => {
    await seedRecord(tenantB, { type: 'INVOICE', amount: 42000, status: 'OVERDUE' });

    const res = await agingGET(requestAs(tenantA, '/api/finance/invoices/aging'));
    expect(res.status).toBe(200);
    const body = await readJson<OkBody<{ totalOutstanding: number }>>(res);
    expect(body.data.totalOutstanding).toBe(0);
  });
});

describe('GET /api/finance/stats (AGGREGATE)', () => {
  it("refuses ?entityId=<tenant B>", async () => {
    const res = await statsGET(
      requestAs(tenantA, '/api/finance/stats', {
        query: { entityId: tenantB.entity.id },
      })
    );
    expect(res.status).toBe(403);
  });

  it("sums none of tenant B's money into the caller's own figures", async () => {
    // Nine aggregates in one handler: income, expenses, net, AR, AP, burn rate,
    // runway, SaaS spend, tax reserve. Every one of them is a leak if the
    // entity filter is wrong, and none of them returns an identifiable row.
    await seedRecord(tenantB, { type: 'EXPENSE', amount: 90000, status: 'PAID' });
    await seedRecord(tenantB, {
      type: 'INVOICE',
      amount: 500000,
      status: 'SENT',
    });

    const res = await statsGET(requestAs(tenantA, '/api/finance/stats'));
    expect(res.status).toBe(200);
    const body = await readJson<
      OkBody<{
        totalIncome: number;
        totalExpenses: number;
        pendingAR: number;
        burnRate: number;
      }>
    >(res);
    expect(body.data.totalIncome).toBe(0);
    expect(body.data.totalExpenses).toBe(0);
    expect(body.data.pendingAR).toBe(0);
    expect(body.data.burnRate).toBe(0);
  });

  it('refuses an anonymous caller', async () => {
    const res = await statsGET(anonymousRequest('/api/finance/stats'));
    expect(res.status).toBe(401);
  });
});

describe('GET /api/finance/dashboard (cross-entity AGGREGATE)', () => {
  it("refuses ?entityId=<tenant B>", async () => {
    const res = await dashboardGET(
      requestAs(tenantA, '/api/finance/dashboard', {
        query: { entityId: tenantB.entity.id, period: 'this_year' },
      })
    );
    expect(res.status).toBe(403);
  });

  it("rolls up only the caller's own entities", async () => {
    await seedRecord(tenantB, { type: 'INVOICE', amount: 123456, status: 'PAID' });

    const res = await dashboardGET(
      requestAs(tenantA, '/api/finance/dashboard', { query: { period: 'this_year' } })
    );
    expect(res.status).toBe(200);
    const body = await readJson<
      OkBody<{
        summaries: Array<{ entityId: string }>;
        aggregated: { totalIncome: number };
      }>
    >(res);
    expect(body.data.summaries.map((s) => s.entityId)).toEqual([tenantA.entity.id]);
    expect(body.data.aggregated.totalIncome).toBe(0);
  });
});

describe('GET /api/finance/forecast + POST scenario (AGGREGATES)', () => {
  it("refuses a forecast over ?entityId=<tenant B>", async () => {
    const res = await forecastGET(
      requestAs(tenantA, '/api/finance/forecast', {
        query: { entityId: tenantB.entity.id },
      })
    );
    expect(res.status).toBe(403);
  });

  it("projects none of tenant B's cash into an ordinary forecast", async () => {
    await seedRecord(tenantB, { type: 'PAYMENT', amount: 900000, status: 'PAID' });

    const res = await forecastGET(
      requestAs(tenantA, '/api/finance/forecast', { query: { days: '30' } })
    );
    expect(res.status).toBe(200);
    const body = await readJson<
      OkBody<{ entityId: string; summary: { thirtyDay: { inflow: number } } }>
    >(res);
    expect(body.data.entityId).toBe(tenantA.entity.id);
    expect(body.data.summary.thirtyDay.inflow).toBe(0);
  });

  it("refuses to model a scenario against tenant B's books", async () => {
    const res = await scenarioPOST(
      requestAs(tenantA, '/api/finance/forecast/scenario', {
        method: 'POST',
        body: {
          entityId: tenantB.entity.id,
          name: 'Peek',
          adjustments: [
            {
              type: 'REVENUE_LOSS',
              description: 'x',
              monthlyAmount: 1,
              startDate: ISO_START,
            },
          ],
        },
      })
    );
    expect(res.status).toBe(403);
  });
});

describe('GET /api/finance/renewals', () => {
  it("refuses ?entityId=<tenant B>", async () => {
    const res = await renewalsGET(
      requestAs(tenantA, '/api/finance/renewals', {
        query: { entityId: tenantB.entity.id },
      })
    );
    expect(res.status).toBe(403);
  });

  it("does not list tenant B's upcoming bills", async () => {
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const foreign = await seedRecord(tenantB, {
      type: 'BILL',
      dueDate: future,
      description: JSON.stringify({ name: 'Their SaaS' }),
    });

    const res = await renewalsGET(requestAs(tenantA, '/api/finance/renewals'));
    expect(res.status).toBe(200);
    const body = await readJson<OkBody<Array<{ id: string }>>>(res);
    expect(body.data.map((r) => r.id)).not.toContain(foreign.id);
  });
});

// ===========================================================================
// Billing. The services behind these live in src/engines/cost/, outside this
// package's file list, so the fix is at the route -- which is exactly what
// these assertions have to prove.
// ===========================================================================

describe('/api/billing/budget', () => {
  it("refuses to read tenant B's spend cap", async () => {
    const res = await billingBudgetGET(
      requestAs(tenantA, '/api/billing/budget', {
        query: { entityId: tenantB.entity.id },
      })
    );
    expect(res.status).toBe(403);
  });

  it("refuses to set a spend cap on tenant B, and writes nothing", async () => {
    const res = await billingBudgetPOST(
      requestAs(tenantA, '/api/billing/budget', {
        method: 'POST',
        body: { entityId: tenantB.entity.id, monthlyCapUsd: 1 },
      })
    );

    expect(res.status).toBe(403);
    expect(await db.budget.count({ where: { entityId: tenantB.entity.id } })).toBe(0);
  });

  it("sets a spend cap on the caller's own entity", async () => {
    const res = await billingBudgetPOST(
      requestAs(tenantA, '/api/billing/budget', {
        method: 'POST',
        body: { entityId: tenantA.entity.id, monthlyCapUsd: 250 },
      })
    );
    expect(res.status).toBe(201);
    expect(await db.budget.count({ where: { entityId: tenantA.entity.id } })).toBe(1);
  });

  it('refuses an anonymous caller', async () => {
    const res = await billingBudgetGET(anonymousRequest('/api/billing/budget'));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/billing/budget/check', () => {
  it("refuses to probe tenant B's remaining budget", async () => {
    const res = await billingBudgetCheckPOST(
      requestAs(tenantA, '/api/billing/budget/check', {
        method: 'POST',
        body: { entityId: tenantB.entity.id, additionalCost: 1 },
      })
    );
    expect(res.status).toBe(403);
  });
});

describe('/api/billing/usage', () => {
  it("refuses to record usage against tenant B, and writes nothing", async () => {
    const res = await usagePOST(
      requestAs(tenantA, '/api/billing/usage', {
        method: 'POST',
        body: {
          entityId: tenantB.entity.id,
          metricType: 'TOKENS',
          amount: 1000,
          source: 'inbox',
        },
      })
    );

    expect(res.status).toBe(403);
    expect(
      await db.usageRecord.count({ where: { entityId: tenantB.entity.id } })
    ).toBe(0);
  });

  it("records usage against the caller's own entity", async () => {
    const res = await usagePOST(
      requestAs(tenantA, '/api/billing/usage', {
        method: 'POST',
        body: { metricType: 'TOKENS', amount: 1000, source: 'inbox' },
      })
    );
    expect(res.status).toBe(201);
    expect(
      await db.usageRecord.count({ where: { entityId: tenantA.entity.id } })
    ).toBe(1);
  });

  it("does not sum tenant B's usage into an ordinary summary (AGGREGATE)", async () => {
    await db.usageRecord.create({
      data: {
        entityId: tenantB.entity.id,
        model: 'TOKENS',
        inputTokens: 1000000,
        outputTokens: 0,
        cost: 4200,
        module: 'inbox',
      },
    });

    const res = await usageGET(requestAs(tenantA, '/api/billing/usage'));
    expect(res.status).toBe(200);
    const body = await readJson<OkBody<{ totalCost: number }>>(res);
    expect(body.data.totalCost).toBe(0);
  });
});

describe('GET /api/billing/cost-attribution (AGGREGATE)', () => {
  it("refuses ?entityId=<tenant B>", async () => {
    const res = await costAttributionGET(
      requestAs(tenantA, '/api/billing/cost-attribution', {
        query: { entityId: tenantB.entity.id },
      })
    );
    expect(res.status).toBe(403);
  });

  it("attributes none of tenant B's spend in an ordinary request", async () => {
    await db.usageRecord.create({
      data: {
        entityId: tenantB.entity.id,
        model: 'TOKENS',
        inputTokens: 500,
        outputTokens: 500,
        cost: 99,
        module: 'their-secret-workflow',
      },
    });

    const res = await costAttributionGET(
      requestAs(tenantA, '/api/billing/cost-attribution')
    );
    expect(res.status).toBe(200);
    const body = await readJson<OkBody<Array<{ module?: string }>>>(res);
    expect(JSON.stringify(body.data)).not.toContain('their-secret-workflow');
  });
});
