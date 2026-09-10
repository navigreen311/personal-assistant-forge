# P-33 escalation — store persistence, and the five schema requests it did not invent

Branch `feature/p-33-store-persistence`, branched from `master` @ `bd9dfc1`.

The package is complete: four stores moved into tables **that already existed**,
no migration, and `tests/db/store-persistence.test.ts` proves each one across a
`jest.resetModules()` restart against real Postgres (9 of 10 fail with the fix
stashed). Nothing below blocks the merge.

The full three-bucket reading of all 104 module-level stores is committed at
**`docs/store-classification.md`** — including the ones that are **correct as
they stand**, so the next package does not turn a deliberate cache into a schema
request. This file carries only the parts that need a decision from the
coordinator.

---

## 0. The thing to read first

**Five of the 75 Prisma models are referenced nowhere in `src/`:**

```
VoicePersona   PluginRecord   PluginReview   DNDConfig   ShadowSmsCode
```

Two of them backed a store a service was keeping in a Map. The frozen schema was
never the obstacle for those two — the table was already there and the service
ignored it. P-33 wired both.

`ShadowSmsCode` is the sharpest case. Its schema doc-comment names the line it
was written to replace:

```prisma
/// T-007 - replaces shadow/safety/auth-manager.ts:109.
/// In-flight second factors vanishing on restart strand a user mid-verification.
```

P-00 shipped **eleven** `T-007 - replaces …` models. Ten are wired. The one left
behind was the second factor, and `tests/db/control-plane-schema.test.ts` stayed
green over it because it only asserts the table can be counted.

**Recommended follow-up (no schema window needed):** `PluginRecord` and
`PluginReview` are near-exact fits for `plugin-service :: pluginStore` and
`security-review-service :: reviewStore`. Plugins are currently `Document` rows
with the manifest JSON-stuffed into `Document.content`, and `breakGlassRevoke`
writes an emergency revocation **to the Map only** — see bug 9 in the
classification.

---

## 1. ESC-1 — inbound payment webhook idempotency ▸ **LIVE, money**

`src/app/api/webhooks/stripe/route.ts` → `processWebhookEvent` →
`isEventProcessed`, backed by `const processedEventIds = new Set<string>()`
(`src/lib/integrations/payments/webhooks.ts:28`). A restart replays webhooks. A
second instance behind a load balancer does not even need the restart.

This is the one store on the card that turned out to be **both real and live**.

```prisma
/// P-33 - replaces lib/integrations/payments/webhooks.ts:28 (processedEventIds)
/// and :29 (eventHistory). The @@unique IS the idempotency guarantee.
model InboundWebhookEvent {
  id          String    @id @default(cuid())
  provider    String                          // "stripe"
  eventId     String                          // the provider's own event id
  type        String                          // "invoice.paid"
  payload     Json
  status      String    @default("received")  // received|processed|failed|ignored
  error       String?
  attempts    Int       @default(0)
  processedAt DateTime?
  createdAt   DateTime  @default(now())

  @@unique([provider, eventId])
  @@index([type])
  @@index([status])
}
```

**Why no existing table will do** (all 75 were checked):

- **`WebhookEvent` is OUTBOUND.** `webhookConfigId String` is a *required* FK to
  `WebhookConfig`, which itself requires a `userId` FK, a delivery `url` and a
  `secret`. An inbound Stripe event has no `WebhookConfig`; minting a synthetic
  one would attach platform-level billing traffic to some user's tenant, which
  P-23 and P-30 spent packages making impossible.
- **`QueuedAction.idempotencyKey String? @unique`** is the right primitive on the
  wrong object — ten required columns describing a *proposed action* with a
  `rollbackPlan`, a `blastRadius` and an `actionLogId` FK.
- **`ActionLog` / `AuditLogEntry`** are append-only and have **no unique
  constraint on any business key**. This is the decisive point: idempotency
  without a unique index is a read-then-write race, and two concurrent
  deliveries of the same event both pass the check and both run the handler. The
  unique index *is* the fix. A table without one cannot supply it, however
  convenient its columns look.

**Ships alongside, needs no schema** — two defects on the same path, left
unfixed because they are behaviour changes rather than persistence and deserve
their own decision:

1. `processWebhookEvent` calls `markEventProcessed(event.id)` on the **failure**
   branch (`webhooks.ts:138`). Combined with the route always returning 200 "so
   Stripe doesn't retry", a handler failure on `invoice.paid` is dropped
   permanently and any retry is answered `ignored`.
2. Whether the route should return non-200 on handler failure is a product
   decision (retry storms vs. lost events) that P-33 declined to make alone.

---

## 2. ESC-2 — uploaded document metadata ▸ **LIVE, data loss**

`POST /api/uploads` stores the file durably via `processUpload`, then records
who owns it, its checksum, its mime type and its storage key in
`const documentStore = new Map<string, DocumentMetadata>()`
(`src/lib/integrations/storage/documents.ts:34`). After a restart the blob is
orphaned and the `documentId` already returned to the user 404s forever.

Worth flagging: `src/app/api/uploads/route.ts` carries a P-23 comment saying an
authenticated user "could write a `Document` row … into any tenant's entity".
The tenancy fix is real and correct; the belief that `createDocument` writes a
`Document` row is not — it writes to a Map.

```prisma
/// P-33 - replaces lib/integrations/storage/documents.ts:34 (documentStore).
model StoredDocument {
  id             String    @id @default(cuid())
  entityId       String
  entity         Entity    @relation(fields: [entityId], references: [id])
  title          String
  description    String?
  mimeType       String
  category       String
  tags           String[]  @default([])
  currentVersion Int       @default(1)
  createdBy      String
  deletedAt      DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  versions StoredDocumentVersion[]

  @@index([entityId])
  @@index([category])
  @@index([deletedAt])
}

/// The version array `Document` has nowhere to put.
model StoredDocumentVersion {
  id         String         @id @default(cuid())
  documentId String
  document   StoredDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)
  version    Int
  storageKey String
  sizeBytes  Int
  checksum   String
  uploadedBy String
  changelog  String?
  uploadedAt DateTime       @default(now())

  @@unique([documentId, version])
  @@index([documentId])
}
```

**Why not `Document`:** it has `title`, `entityId`, `type`, `version`,
`templateId`, `citations`, `content`, `status`, `deletedAt` — and **no** column
for `mimeType`, `category`, `tags`, `createdBy`, `storageKey`, `sizeBytes` or
`checksum`, and no generic `metadata Json`. Its only Json column is `citations`,
which means something else.

**One model closes two packages' escalations.**
`src/modules/documents/services/versioning-service.ts` hit the same wall — its
own header already escalates it — because `Document.version` is a counter and
`Document` stores only current content. `StoredDocumentVersion` is the revision
history both need.

---

## 3. ESC-3 — communication opt-outs and suppression ▸ LATENT, compliance

This is the honest correction to the P-33 card's framing, and it is the reason
this section is third rather than first.

**`src/lib/integrations/email/workflows.ts` and
`src/lib/integrations/sms/workflows.ts` have ZERO production importers.** Only
their own unit tests. No route sends email or SMS through them. So
`suppressedEmails`, `unsubscribeRecords` and `optOutIndex` are a real defect and
**not a live CAN-SPAM/TCPA exposure today** — nothing has ever been suppressed,
because nothing has ever been sent.

```sh
grep -rn "integrations/email/workflows\|integrations/sms/workflows" src   # → no matches
```

They are, however, the modules an email/SMS feature will be built on, and this
is cheaper to fix before that than after.

```prisma
/// P-33 - replaces email/workflows.ts:{52,53,54} and sms/workflows.ts:{30,31}.
/// A suppression list must outlive the Contact row.
model CommunicationOptOut {
  id         String   @id @default(cuid())
  entityId   String?                       // null = platform-wide (hard bounce)
  channel    String                        // "email" | "sms"
  address    String                        // email address or E.164 number
  scope      String   @default("all")      // "all" | a category name
  reason     String?
  source     String                        // unsubscribe | hard_bounce | opt_out_keyword
  optedOutAt DateTime @default(now())

  @@unique([channel, address, entityId, scope])
  @@index([channel, address])
  @@index([entityId])
}
```

**Why not `Contact.preferences` / `ContactCallPreference.doNotCall`:** both are
keyed to a `Contact` row. A suppression list must work for an address with no
Contact (a batch recipient, a hard bounce) **and must survive that contact's
deletion** — putting it on `Contact` means deleting a contact silently
re-enables sending to someone who unsubscribed, which is precisely the failure
the law is about. `ConsentReceipt` is an AI-action receipt
(`actionId`/`impacted[]`/`reversible`) with no entity scope and no unique key.

**Two defects that persistence alone would not fix**, and that make the case for
doing this properly when it is wired:

- **`sendBatchEmails` never calls `isUnsubscribed`.** It checks
  `isEmailSuppressed` (hard bounces) only. The unsubscribe list has no reader on
  any send path — a durable unsubscribe list that no send path consults is still
  a violation.
- **`getDeliverabilityStats(entityId)` ignores `entityId`** for
  `totalBounces`/`hardBounces`/`softBounces`; `BounceRecord` has no `entityId`
  field at all. Cross-entity figures returned under a per-entity signature.

---

## 4. ESC-4 — throttle and cooldown counters ▸ **LIVE, anti-abuse**

`src/app/api/safety/throttle/route.ts` → `checkThrottle`, whose verdict comes
entirely from `hourlyCounters` / `dailyCounters` / `lastActionTimestamps`. A
restart hands every user a fresh hour **and** a fresh day and ends every
cooldown early. On a multi-instance deploy no restart is needed — each instance
keeps its own count.

The configured limits are outbound-send and money-movement limits:
`calls 5/hr, 50/day`; `emails 20/hr, 200/day`; `financial_tx` with a 30-minute
cooldown and `requiresApprovalAbove: 0`; `api_calls 100/hr, 1000/day`. Every
unit past them is a real phone call, a real email, a real transaction attempt —
and `requiresApproval` rides on the same counters, so a restart also silently
withdraws the approval requirement.

```prisma
/// P-33 - replaces engines/trust-safety/throttle-service.ts:{hourly,daily}Counters.
model ActionThrottleCounter {
  id          String   @id @default(cuid())
  userId      String
  actionType  String                 // calls | emails | financial_tx | api_calls
  window      String                 // "hour" | "day"
  windowStart DateTime
  count       Int      @default(0)
  updatedAt   DateTime @updatedAt

  @@unique([userId, actionType, window, windowStart])
  @@index([userId, actionType])
}
```

**Why not existing:**

- **`AttentionBudget`** is the closest shape — `userId`, `totalMinutes` (a cap),
  `consumedMinutes` (a counter), `resetAt` (a window end) — and fails on one
  constraint. `@@unique([userId, date])` allows exactly **one** counter per user
  per day, so it cannot hold `calls` and `emails` simultaneously, let alone an
  hourly and a daily window for each.
- **`Budget`** is entity-scoped money in cents, already owned by
  `engines/cost/budget-service.ts`.
- **`ExecutionGateRule`** is a boolean expression evaluated by `evaluateGates`,
  with nowhere to keep a count — it could express *"this user is throttled"* but
  not the counter that decides it, leaving the state in memory anyway.

**Two of the four stores in that file need nothing from you:**
`lastActionTimestamps` is `MAX(ActionLog.timestamp)` filtered by `actorId` +
`actionType` — derivable, no new column — and `customConfigs` is currently
unreachable, because `updateThrottleConfig` has no caller in `src/`.

**Also in that file:** `financial_tx` is configured `maxPerHour: 10, maxPerDay: 1`.
The daily cap makes the hourly cap unreachable; the two values are either
transposed or one is a typo.

---

## 5. ESC-5 — one nullable column, or delete a field ▸ trivial

`DNDConfig.reason` (the TypeScript type) carries
`JSON.stringify({ expiresAt })` for a timed do-not-disturb. The Prisma model has
no column for it, and **a repo-wide grep finds no reader** — no timed DND has
ever expired.

Either add `expiresAt DateTime?` to `DNDConfig` and enforce it in
`isDNDActive`, or delete the field. P-33 persisted every column that exists and
left `reason` returned-but-unstored, with a comment at the write site, rather
than stuffing it into `vipContactIds` — the only Json column on that model, and
the wrong field. That is the move this package exists to argue against, and it
is worth one column of your migration window to close properly.

---

## 6. Not schema requests — reachability defects worth their own package

Found while reading; all recorded with reproduction in
`docs/store-classification.md` §8. Listed here because several are worse than
the persistence defect that led to them.

- **Eleven module barrels have zero importers**
  (`src/modules/{admin,ai-quality,attention,crisis,delegation,developer,documents,health,knowledge,onboarding,tasks}/index.ts`).
  `@/modules/inbox` is the only one actually imported. This moves roughly a
  dozen "urgent" stores to "landmine" and is why the classification carries a
  LIVE/LATENT column at all.
- **`plugin-service`'s cache never repopulates** — `syncToStore` is absent from
  all three read functions — so `security-review-service`, which reads only the
  Map, throws `Plugin <id> not found` for every installed plugin from boot.
  `breakGlassRevoke` then writes the revocation to the Map only, while
  `GET /api/developer/plugins` (which reads the DB) reports the plugin ACTIVE.
- **`/api/shadow/phone/status` can never populate `activeCalls`**:
  `phone-outbound.ts:129` builds the StatusCallback URL with no query string,
  unlike `callAnsweredUrl` on the very next line which appends `&userId=`. The
  GET returns `{active: [], recent: []}` unconditionally.
- **`handleStepUpAuth` authenticates to a fictitious user** — hardcoded
  `userId: 'verified-caller'` after a successful SMS check, against a pending
  code stored under `userId: 'pending'`.
- **`lib/realtime/events.ts` has no writer and no subscriber**, so the
  `Last-Event-ID` SSE replay branch in `/api/events/stream` is dead code.
- **`reengagement-service.checkForReengagementTriggers` can only return `[]`** —
  `setUserActivity` has no callers, so all four branches are unreachable.
- **`golden-test-service.getRegressionReport` fabricates its baseline** and
  reports a 5-point regression on every second run by construction.
- **`digest-optimizer.generateDigest` flags the items it deliberately skipped as
  `digest_delivered`** — the most urgent items are dropped and marked delivered.
- **Two `TWO_PARTY_CONSENT_STATES` sets disagree** (13 entries vs 12; one omits
  Delaware). It is a legal list, in two files, in one repo.
- **`src/hooks/usePageMap.ts` is a dead module** duplicating `useShadowPageMap`
  + `lib/shadow/page-map.ts`, with zero importers including tests — carrying a
  detailed P-19 hardening comment.

---

## 7. One process-hygiene fix P-33 made in passing

The old `auth-manager.ts` armed `setInterval(cleanExpiredCodes, 60_000)` at
module load, un-`unref`'d. It is at least part of jest's long-standing
*"A worker process has failed to exit gracefully"* warning, which stopped
appearing when P-33 removed it — `ShadowSmsCode`'s `@@index([expiresAt])` plus
expiry-on-read replaces the sweeper.

It also made the mutation proof read like an infrastructure problem: with the
fix stashed, `tests/db/store-persistence.test.ts` ran to completion in seconds
and then **hung for 25 minutes without exiting**, because this file re-imports
that module across each `jest.resetModules()` and armed a new interval every
time. Recorded in the test file's header so the next person recognises it.
