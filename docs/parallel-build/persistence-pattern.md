# The persistence pattern

**Frozen 2026-09-09 by P-00.** How to move a module-level in-memory store onto
the schema P-00 landed.

**The schema is frozen.** `prisma/schema.prisma` and `prisma/migrations/` are
coordinator-only. **A migration in your PR is an automatic hand-back.** If a
model you need is missing or wrong-shaped, **stop and escalate** — there is one
additive-only amendment window (P-00b) and it needs coordinator sign-off.

---

## What happened here

The codebase was scaffolded rapidly across many sessions. Every module got a
TypeScript `Map` because that was the fastest way to get pages rendering with
data. Nobody decided on in-memory storage; it was the path of least resistance,
repeated 38 times. It is not a staged plan, so **there is no reason to preserve
the pattern anywhere.**

The deployment target is a **single Docker instance with
`restart: unless-stopped`**. Horizontal scaling is not required, so you are not
designing for cross-instance coordination — but `restart: unless-stopped`
*guarantees restarts*, and a restart empties every one of these. Restart survival
is the whole requirement.

---

## Before you write anything: is it actually a store?

79 raw `new Map<` matches; roughly 45 are genuine stores. **A grep finds
mentions, not construction.** These are correctly in memory — leave them:

- **Callback registries** — `startHandlers`, `endHandlers`,
  `terminationListeners`, realtime `listeners`, payments `handlers`. Functions
  cannot be persisted, and they are re-registered at boot.
- **Static lookup tables** — `HOMOGLYPH_MAP`, email/SMS `templateById`,
  `adapterRegistry`. Constants written in source.
- **Derived caches** — `playbookCache`, `providerHealthCache`. Rebuildable, and
  stale entries are worse than absent ones.
- **Mirrors of an external source of truth** — `scheduler.activeSchedules`
  mirrors BullMQ repeat state; Redis owns it.

If losing it on restart costs the user data or breaks a guarantee, persist it.
If it rebuilds itself, do not.

---

## Four stores shadow tables that already exist

**Point at these. Do not add a second model.**

| store | existing model |
|---|---|
| `execution/services/runbook-service.ts:18` `runbookStore` | `Runbook` |
| `attention/services/dnd-service.ts:8` `dndStore` | `DNDConfig` |
| `attention/services/priority-router.ts:17` `notificationStore` | `Notification` |
| shadow phone `trustedDevices` | `ShadowTrustedDevice` |

Field names drift between the TypeScript interface and the existing model —
`Runbook` has `category`/`runCount`/`version` where the interface has
`tags`/`lastRunStatus`. **Reconcile on the read side.** Do not add duplicate
columns to make the interface fit.

---

## The pattern

```ts
// BEFORE
const gateStore = new Map<string, ExecutionGate>();

export async function getGate(id: string): Promise<ExecutionGate | undefined> {
  return gateStore.get(id);
}

// AFTER
import { prisma } from '@/lib/db';

export async function getGate(id: string): Promise<ExecutionGate | undefined> {
  const row = await prisma.executionGateRule.findUnique({ where: { id } });
  return row ? toExecutionGate(row) : undefined;
}
```

Keep the exported function signatures. Callers should not have to change, and
keeping them stable keeps your package inside its own files.

### Modelling conventions used by the landed schema

1. **Scalar interface fields are columns; nested objects and arrays are `Json`.**
   Matches the existing convention — see `ShadowSessionOutcome`.
2. **`entityId` and `userId` are indexed columns, not Prisma relations.**
   Deliberate: control-plane rows must not cascade-delete with their subject. An
   audit trail that disappears when an entity is removed is not an audit trail.
   Precedent already existed at `ShadowConsentReceipt.entityId`.
3. **Ids come from `@default(cuid())`.** `workflows/services/approval-service.ts`
   mints ids from a module-level counter that resets on restart and can collide
   within a millisecond. Do not port that; drop it.

---

## Prove it with a real database

A mocked Prisma client will accept `prisma.tableThatDoesNotExist.create()`
without complaint. That is precisely how `shadow/compliance` came to call four
delegates that were never in the schema, with tests passing the whole time.

Add to `tests/db/` and run with `npm run test:db`:

```ts
it('survives a restart', async () => {
  await configureSwitch(userId, { checkInIntervalHours: 24 });

  // A second client is a different process's view of the same row.
  const other = new PrismaClient();
  const row = await other.deadManSwitch.findUnique({ where: { userId } });
  expect(row).not.toBeNull();
  await other.$disconnect();
});
```

P-20 asserts this across the whole control plane at the end of the run. Your job
is to make your own module's half true.
