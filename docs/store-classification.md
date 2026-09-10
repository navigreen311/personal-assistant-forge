# In-memory stores: a classification

**P-33.** The platform audit counted "64 in-memory stores" and the number has been
quoted since as generic cleanup. It is not generic, the number is wrong in both
directions, and a count is the wrong instrument anyway. This document replaces
the number with a reading.

The question a grep cannot answer, and the only one that matters:

> **Does losing this on restart change what a user sees, or expose the business?**

---

## 1. The measurement, and its scope

Measured on `feature/p-33-store-persistence` (base `bd9dfc1`), scope
`src/**/*.ts` + `src/**/*.tsx`, declarations anchored at column 0 — i.e. module
scope, not a data structure inside a function body.

| What | Count |
|---|---|
| Raw `new Map(` / `new Set(` anywhere in `src/` | 443 |
| — of which module-level `new Map`/`new Set` | **96** |
| &nbsp;&nbsp;• with a type parameter (`new Map<`/`new Set<`) | 77 |
| &nbsp;&nbsp;• without (all `new Set([...literals])` lookup constants) | 19 |
| Module-level empty arrays (`const x: T[] = []`) | **8** |
| Module-level object literals (`const x = {}`) | **0** |
| **Total module-level declarations** | **104** |

Reproduce:

```sh
grep -rn '^\(const\|let\|export const\|export let\) .*new \(Map\|Set\)' src --include=*.ts --include=*.tsx
grep -rn '^\(const\|let\|export const\|export let\) [A-Za-z_$]* *\(: *[^=]*\)\?= *\[\] *;\?$' src --include=*.ts --include=*.tsx
```

**This differs from every previous count, including the coordinator's.** The
audit's "64" was a Map/Set grep that never matched the 8 module-level arrays —
two of which (`unsubscribeRecords`, `optOutRecords`) are the compliance stores
the whole exercise was supposedly about. The coordinator's re-count found 69
Map/Set + 7 arrays. Anchoring at column 0 across `.ts` **and** `.tsx` gives 96 +
8. The gap is mostly the 19 literal constant Sets, which a `new Map<`-with-
generics grep skips — and which are not stores at all.

**None of these numbers is the interesting one.** 19 of the 96 are frozen
constants (`STOP_WORDS`, `DISPOSABLE_DOMAINS`, `HOMOGLYPH_MAP`,
`TWO_PARTY_CONSENT_STATES`, `BODYLESS_STATUSES`). Several more are listener
registries that re-register on every boot by definition. Counting them together
with a payment idempotency Set produces a number that cannot be acted on.

---

## 2. The finding the count was hiding

**Five of the 75 Prisma models are referenced nowhere in `src/`.** Not
under-used — *never mentioned*:

```
VoicePersona   PluginRecord   PluginReview   DNDConfig   ShadowSmsCode
```

Reproduce:

```sh
grep '^model ' prisma/schema.prisma | sed 's/^model //;s/ .*//' | while read m; do
  d=$(echo "$m" | sed 's/^\(.\)/\L\1/')
  n=$(grep -rn "prisma\.$d\b\|db\.$d\b" src --include=*.ts | wc -l)
  [ "$n" = 0 ] && echo "$m"
done
```

Two of those five back a store that a service was holding in a Map instead. The
schema is frozen and it did not need to change: **the table was already there
and the service ignored it.**

Worse for `ShadowSmsCode`, whose doc-comment names the exact line it was written
to replace:

```prisma
/// T-007 - replaces shadow/safety/auth-manager.ts:109.
/// In-flight second factors vanishing on restart strand a user mid-verification.
model ShadowSmsCode { cacheKey @unique, code, attempts, expiresAt, createdAt }
```

P-00 shipped **eleven** `T-007 - replaces …` models. Ten are wired
(`executionGateRule`, `queuedAction`, `rollbackPlan`, `workflowApproval`,
`deadManSwitch`, `role`, `userRoleAssignment`, `eSignRequest`,
`workflowExecutionRecord`, `runbookExecution`). The one left behind is the
second factor. `tests/db/control-plane-schema.test.ts` was green over it the
whole time, because it only asserts the table can be counted.

---

## 3. LIVE vs LATENT — read this column before any other

A service reachable only through a module barrel that nothing imports is not
reachable. **Eleven module barrels** —
`src/modules/{admin,ai-quality,attention,crisis,delegation,developer,documents,health,knowledge,onboarding,tasks}/index.ts`
— have zero importers in `src/`; `@/modules/inbox` is the only one actually
imported. That single fact moves roughly a dozen stores from "urgent" to
"landmine", and it is why the tables below carry a reachability column rather
than a severity score.

The honest headline for the four stores the P-33 card named as the likely
crisis:

| Store | Card's concern | What reading it showed |
|---|---|---|
| `suppressedEmails`, `unsubscribeRecords` | CAN-SPAM | **Real defect, not live.** `src/lib/integrations/email/workflows.ts` has **zero production importers** — only its own unit test. No route sends email through it. |
| `optOutIndex`, `optOutRecords` | TCPA | **Same.** `src/lib/integrations/sms/workflows.ts` has zero production importers. |
| `processedEventIds` | double-charging | **Real and LIVE.** `src/app/api/webhooks/stripe/route.ts` calls `processWebhookEvent`, whose idempotency check is this Set. |
| `usageStore` | billing | **Real, not live** (zero importers), but money, and it fits an existing table — so it was closed anyway. |

That is a better answer than confirming all four, and it was reached by reading
the import graph rather than the declaration.

---

## 4. Bucket 3 — COMPLIANCE / MONEY

Opt-outs, suppression, idempotency keys, security tokens, device
authorizations, billing counters, spend and anti-abuse limits.

| Store | Reach | Disposition |
|---|---|---|
| `shadow/safety/auth-manager.ts :: smsCodeStore` | **LIVE** — `/api/shadow/auth/{send,verify}-sms-code`, `/verify-pin`, `/trusted-devices` | **FIXED → `ShadowSmsCode`** |
| `shadow/interfaces/phone-inbound.ts :: trustedDevices` | **LIVE** — `/api/shadow/phone/inbound` | **FIXED → `ShadowTrustedDevice`** |
| `shadow/interfaces/phone-outbound.ts :: trustedDevices` | **LIVE** — `/api/shadow/phone/{outbound,status}` | **FIXED → `ShadowTrustedDevice`** |
| `shadow/interfaces/sms.ts :: trustedDevices` | **LIVE** — `/api/shadow/phone/sms` | **FIXED → `ShadowTrustedDevice`** |
| `payments/subscriptions.ts :: usageStore` | LATENT | **FIXED → `UsageRecord`** |
| `payments/webhooks.ts :: processedEventIds` | **LIVE** — `/api/webhooks/stripe` | **ESCALATED — ESC-1** |
| `payments/webhooks.ts :: eventHistory` | **LIVE** — same route | **ESCALATED — ESC-1** |
| `email/workflows.ts :: suppressedEmails`, `unsubscribeRecords`, `bounceRecords` | LATENT | **ESCALATED — ESC-3** |
| `sms/workflows.ts :: optOutIndex`, `optOutRecords` | LATENT | **ESCALATED — ESC-3** |
| `trust-safety/throttle-service.ts :: hourlyCounters`, `dailyCounters` | **LIVE** — `/api/safety/throttle` | **ESCALATED — ESC-4** |
| `trust-safety/throttle-service.ts :: lastActionTimestamps` | **LIVE** — same | Needs no storage: `MAX(ActionLog.timestamp)` by `actorId` + `actionType` |
| `trust-safety/throttle-service.ts :: customConfigs` | **LIVE** module, unreachable writer | `updateThrottleConfig` has no caller; moot until a route exists |
| `shadow/interfaces/phone-inbound.ts :: pendingVerificationCodes` | **LIVE** | Second copy of the 2FA problem, on the DTMF step-up path. `ShadowSmsCode` fits; blocked by BUG-11 below (it authenticates to a fictitious user id) |
| `shadow/interfaces/phone-outbound.ts :: outboundCallLog` | **LIVE** | The call rate limiter. `ShadowOutreach` fits — `notification-escalator.ts` already counts `callsToday`/`callsThisHour` off that model |
| `admin/services/ediscovery-service.ts :: exportStore` | **LIVE** — `/api/admin/ediscovery` | No clean fit; `Rule` with `scope:'EDISCOVERY_EXPORT'` mirrors this file's own `createHold` |
| `developer/services/security-review-service.ts :: reviewStore` | LATENT | **`PluginReview` exists and is unused** — near-exact fit |
| `trust-safety/impersonation-guard.ts :: watermarkStore` | LATENT | `ProvenanceRecord` fits. See BUG-1/BUG-2 — it is write-only today |
| `engines/cost/provider-failover.ts :: killSwitchActive` | LATENT | `ExecutionGateRule` fits, and `execution-gate.ts` already argues the case for exactly this pattern |

## 5. Bucket 2 — DATA LOSS

The only copy of something a user created or the system committed to.

| Store | Reach | Existing home? |
|---|---|---|
| `attention/services/dnd-service.ts :: dndStore` | **LIVE** — `/api/attention/dnd` | **FIXED → `DNDConfig`** (model existed, unused) |
| `attention/services/priority-router.ts :: notificationStore` | **LIVE** — `/api/attention` | **`Notification`** — near-exact; `prisma.notification` is used by six other modules but not this one. Bundler and learning service both read the Map, so digests silently empty after a restart |
| `attention/services/priority-router.ts :: routingConfigStore` | **LIVE** | `Rule` with `scope:'PRIORITY_ROUTING'`, or `User.preferences` |
| `tasks/services/recurring-tasks.ts :: recurringConfigs` | **LIVE** — `/api/tasks/recurring` | No direct fit. `Task.createdFrom` is already stamped `{type:'RECURRING', sourceId: configId}` — durable rows carrying a foreign key to a config that exists only in RAM |
| `onboarding/services/wizard-service.ts :: wizardStore` | **LIVE** — `/api/onboarding` | `AdoptionProgress`. Note the split: `initializeWizard` writes `User.preferences.onboarding`, `getWizard` reads only the Map |
| `onboarding/services/migration-service.ts :: migrationState` | LATENT | Holds `createdRecordIds[]` — the only record of what a migration created. **`RollbackPlan` exists and is not used here.** An interrupted migration is permanently unrollbackable |
| `onboarding/services/migration-service.ts :: importStore` | **LIVE** | `ActionLog` / `User.preferences` |
| `crisis/services/detection-service.ts :: crisisStore` | **LIVE** — 5 routes | **No existing fit.** The largest genuinely-missing table: in-flight incident, escalation state, war-room state |
| `crisis/services/{phone-tree,playbook,post-incident}` stores | LATENT | `Runbook` fits `customPlaybooks` well; the others partially |
| `documents/services/versioning-service.ts :: versionStore` | **LIVE** for reads | `Document` has a `version Int` counter but stores only current content — a real missing table. Its own header already escalates this |
| `documents/services/template-service.ts :: templateStore` | **LIVE** | `Document` partially; no home for `variables[]`/`outputFormats[]` |
| `ai-quality/services/citation-service.ts :: citationStore` | LATENT | **`Document.citations Json` exists for exactly this and is never written** |
| `ai-quality/services/golden-test-service.ts :: suiteStore` | LATENT | No fit (`Runbook` is the nearest abuse) |
| `ai-quality/services/override-tracking-service.ts :: overrideStore` | **LIVE** — `/api/analytics/overrides` | No fit for the original/overridden text pair. Note the reported override rate silently reads 0% after a restart, because the denominator is a live `prisma.actionLog.count()` |
| `delegation/services/delegation-service.ts :: delegationStore` | **LIVE** | Approval chain + context pack; `WorkflowApproval` is nearest |
| `storage/documents.ts :: documentStore` | **LIVE** — `POST /api/uploads` | **ESCALATED — ESC-2.** The file is stored durably; the metadata that says whose it is, and which blob it is, is in a Map |
| `shadow/interfaces/phone-{inbound,outbound}.ts :: activeSessions` | **LIVE** | `ShadowVoiceSession` + `ShadowMessage` — near-exact. The call transcript has no other home |
| `attention/one-thing-now`, `onboarding/{calibration,tone-training}`, `knowledge/surfacing :: dismissals`, `adoption/{userActivations,timeSavedEntries}`, `realtime/events :: eventHistory` (see BUG-6) | mixed | Recorded; several have unreachable writers |

## 6. Bucket 1 — CORRECT AS-IS

**These are not defects. Do not convert them into schema requests.**

- **Frozen lookup constants** (19 declarations): `STOP_WORDS` ×3,
  `DISPOSABLE_DOMAINS`, `TRUSTED_DOMAINS`, `SUSPICIOUS_TLDS`,
  `HOMOGLYPH_MAP`, `TWO_PARTY_CONSENT_STATES` ×2, `EXPLICIT_CONSENT_REGIONS`,
  `IMMEDIATE_PRIORITIES`, `ALWAYS_CALL_TRIGGERS`, `VALID_PERSONA_IDS`,
  `CCPA_*_ACTIONS`, `BODYLESS_STATUSES`, `TERMINAL_STATUSES`,
  `EXPECTED_ERROR_CODES`, `SCHEMA_DRIFT_CODES`, `PROBE_NAMES`,
  `DEFAULT_PEAK_HOURS`. Built from literals, never mutated. They hold no
  runtime-written data and are not stores.
- **Listener / handler registries** re-populated at subscribe time or module
  load: `voiceforge/call-lifecycle :: {startHandlers,endHandlers}`,
  `lib/shadow/voice/call-lifecycle :: terminationListeners`,
  `lib/realtime/events :: listeners`, `payments/webhooks :: handlers` (rebuilt
  by `registerDefaultHandlers()` at import), `health/wearable-service ::
  adapterRegistry` (class instances — functions cannot be persisted),
  `hooks/usePageMap` + `lib/shadow/page-map` registries (browser-side, rebuilt
  from the mounted React tree).
- **Template registries**: `email/templates :: templateById`,
  `sms/templates :: templateById` — built from a constant array.
- **Caches that repopulate**: `provider-failover :: providerHealthCache`
  (TTL), `rate-limit :: warned` (log de-duplication; the real counters are in
  Redis).
- **`src/lib/observability/**`** — P-28's recorder, process-local by design and
  documented as such. Untouched.
- **Per-call transient handles**: `continuous-voiceprint :: activeSessions`
  and `sentiment-integration :: sessions` hold live WebSocket handles; a dead
  socket is worthless after a restart, and the durable half already goes to
  `ShadowAuthEvent`.
- **Write-only vestigial caches** — the durable path already exists and the Map
  is never read. Deleting them is a no-behaviour-change cleanup, *not* a
  persistence project: `admin/dlp-service :: dlpStore`,
  `admin/org-policy-service :: policyStore`, `admin/sso-service :: ssoStore`,
  `developer/custom-tool-service :: toolStore`. All four read exclusively from
  `prisma.rule` / `Entity.complianceProfile` / `prisma.document`.

---

## 7. Escalations

The schema is frozen. Each of these was checked against all 75 models first.

### ESC-1 — inbound payment webhook idempotency (**LIVE, money**)

`src/app/api/webhooks/stripe/route.ts` → `processWebhookEvent` →
`isEventProcessed`, backed by `const processedEventIds = new Set<string>()`. A
restart replays webhooks. A second instance behind a load balancer does not even
need the restart.

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

Why no existing table works:

- **`WebhookEvent` is OUTBOUND.** `webhookConfigId String` is a required FK to
  `WebhookConfig`, which itself requires a `userId` FK, a delivery `url` and a
  `secret`. An inbound Stripe event has no `WebhookConfig`, and minting a
  synthetic one would attach platform billing traffic to some user's tenant.
- **`QueuedAction.idempotencyKey String? @unique`** is the right primitive on the
  wrong object: ten required columns describing a proposed action with a
  `rollbackPlan`, a `blastRadius` and an `actionLogId` FK.
- **`ActionLog` / `AuditLogEntry`** are append-only with **no unique constraint
  on any business key**. Idempotency without a unique index is a read-then-write
  race: two concurrent deliveries both pass the check and both run the handler.
  The unique index is the fix; a table without one cannot supply it.

### ESC-2 — uploaded document metadata (**LIVE, data loss**)

`POST /api/uploads` stores the file durably via `processUpload`, then records who
owns it, its checksum, its mime type and its storage key in
`const documentStore = new Map<string, DocumentMetadata>()`. After a restart the
blob is orphaned and the `documentId` already returned to the user 404s forever.

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

Why not `Document`: it has `title`, `entityId`, `type`, `version`, `templateId`,
`citations`, `content`, `status`, `deletedAt` — and **no** column for
`mimeType`, `category`, `tags`, `createdBy`, `storageKey`, `sizeBytes` or
`checksum`, and no generic `metadata Json`. Its only Json column is `citations`,
which means something else. There is nowhere at all for the version array.
`modules/documents/services/versioning-service.ts` hit the same wall and its
header already escalates it — one model closes both.

### ESC-3 — communication opt-outs and suppression (LATENT, compliance)

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

Why not `Contact.preferences` / `ContactCallPreference.doNotCall`: both are keyed
to a `Contact` row. A suppression list must work for an address that has no
Contact (a batch recipient, a hard bounce) **and must survive the contact's
deletion** — storing it on `Contact` means deleting a contact silently
re-enables sending to someone who unsubscribed, which is the exact failure the
law is about. `ConsentReceipt` is an AI-action receipt
(`actionId`/`impacted[]`/`reversible`) with no entity scope and no unique key.

Not urgent — both modules are unreachable from any route today — but they are the
modules an email/SMS feature will be built on, and the defect is cheaper to fix
before that than after.

### ESC-4 — throttle and cooldown counters (**LIVE, anti-abuse**)

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

Why not existing: **`AttentionBudget`** is the closest shape
(`userId`/`totalMinutes`/`consumedMinutes`/`resetAt`) and fails on one
constraint — `@@unique([userId, date])` allows exactly **one** counter per user
per day, so it cannot hold `calls` and `emails` at once, let alone an hourly and
a daily window for each. **`Budget`** is entity-scoped money in cents.
**`ExecutionGateRule`** is a boolean expression with nowhere to keep a count.

These are outbound-send and money-movement limits (`calls: 5/hr, 50/day`;
`emails: 20/hr, 200/day`; `financial_tx` with a 30-minute cooldown;
`api_calls: 100/hr, 1000/day`). Every unit past them is a real phone call, a real
email, a real transaction attempt.

### ESC-5 — one nullable column, or delete a field

`DNDConfig.reason` (TypeScript) carries `JSON.stringify({ expiresAt })` for a
timed DND. The Prisma model has no column for it and **a repo-wide grep finds no
reader** — nothing ever expires a timed DND. Either add `expiresAt DateTime?` to
`DNDConfig` and enforce it, or delete the field. P-33 declined to stuff it into
`vipContactIds` (the only Json column on the model), which would be the
wrong-field-on-the-right-model move this package exists to argue against.

---

## 8. Bugs found while reading (outside the card)

Reachability first — several of these are worse than the persistence defect.

1. **`trustedDevices` was never seeded in production.** The only writer of all
   three Maps was `_addTrustedDevice`, whose only callers were in
   `tests/unit/shadow/phone.test.ts`. So `authenticateCaller` returned
   `requiresStepUp: true` for *every* inbound call, `callUser` threw
   `No trusted phone number found` for *every* outbound call, and `sendSMS` threw
   for every send — while a user who registered a phone through the supported UI
   wrote a `ShadowTrustedDevice` row the handlers could not see. Fixed by P-33.
2. **`processWebhookEvent` marks FAILED events as processed** (`webhooks.ts:138`).
   Combined with the route always returning 200 "so Stripe doesn't retry", a
   handler failure on `invoice.paid` is dropped permanently and a retry is
   answered `ignored`.
3. **`sendBatchEmails` never checks `isUnsubscribed`.** It checks
   `isEmailSuppressed` (hard bounces) only. The unsubscribe list has no reader on
   any send path — persisting it would not by itself make it honoured.
4. **`getDeliverabilityStats(entityId)` ignores `entityId`** for
   `totalBounces`/`hardBounces`/`softBounces` — `BounceRecord` has no
   `entityId` field at all. Cross-entity figures under a per-entity signature.
5. **`ShadowAuthEvent` rows were written with no `userId`** by `sendSmsCode` and
   `verifySmsCode`, while `userId` was in scope as a parameter — an
   unattributable security audit trail. Fixed by P-33.
6. **`auth-manager` ran `setInterval(cleanExpiredCodes, 60_000)` at module
   load**, un-`unref`'d. This is at least part of jest's "A worker process has
   failed to exit gracefully" warning, which stopped appearing when P-33 removed
   it.
7. **`activeCalls` in `/api/shadow/phone/status` can never be populated.**
   `trackCall` only runs `if (userId)`, and `userId` comes from the query string
   — but `phone-outbound.ts:129` builds the StatusCallback URL with **no query
   string**, unlike `callAnsweredUrl` on the very next line which does append
   `&userId=`. `GET` returns `{active: [], recent: []}` unconditionally.
8. **`handleStepUpAuth` authenticates to a fictitious user.** It creates a
   session with a hardcoded `userId: 'verified-caller'` after a successful SMS
   check, and the pending code it validated was stored under `userId: 'pending'`.
   Any downstream write keyed on that id is orphaned.
9. **`plugin-service`'s cache never repopulates**, so `security-review-service`
   (which reads only the Map) throws `Plugin <id> not found` for every installed
   plugin from boot until someone mutates. **`breakGlassRevoke` then writes the
   revocation to the Map only** — an emergency revocation of a malicious plugin
   survives until the next restart, while `GET /api/developer/plugins` (which
   reads the DB) reports the plugin ACTIVE the whole time.
10. **`eventHistory` in `lib/realtime/events.ts` has no writer.** `emitEvent`,
    `emitToUser` and `emitToEntity` are the only callers of `storeEvent` and none
    of the three is called anywhere in `src/`, so the `Last-Event-ID` SSE replay
    branch in `/api/events/stream` is dead code. `listeners` has no subscriber
    either.
11. **`reengagement-service.checkForReengagementTriggers` can only return `[]`.**
    `setUserActivity` has no callers, so all four branches are unreachable.
12. **`applyWatermark` stores an `audioContentId`; `verifyVoiceCloneConsent`
    looks up a `voiceCloneId`** — the store is effectively write-only, and the
    function reports `consentVerified: true` without checking consent.
13. **`activateKillSwitch` discards a write**: it sets `cached.lastErrorAt` and
    deletes the cache entry on the next line.
14. **`financial_tx` is configured `maxPerHour: 10, maxPerDay: 1`** — the daily
    cap makes the hourly cap unreachable. Self-contradictory as written.
15. **`golden-test-service.getRegressionReport` fabricates its baseline**
    (`previousPassRate = totalRuns > 1 ? currentPassRate + 5 : 100`) and
    `runTestSuite` overwrites the history it would need, so it reports a
    5-point regression on every second run by construction.
16. **`digest-optimizer.generateDigest` marks the items it deliberately skipped
    as `digest_delivered`** — the most urgent items are the ones dropped, and
    they are flagged delivered without being returned to anyone.
17. **Unscoped reads (latent tenancy leaks, all currently unreachable):**
    `golden-test-service.getTestSuites()` returns every tenant's suites;
    `playbook-service.getCustomPlaybooks(_userId)` ignores its userId;
    `citation-service.verifyCitation` iterates a cross-tenant store; the
    shadow analytics `overrideCount` is not user-scoped.
18. **`src/hooks/usePageMap.ts` is a dead module** duplicating
    `useShadowPageMap` + `lib/shadow/page-map.ts`, with zero importers including
    tests — and it carries a detailed P-19 hardening comment.
19. **`STOP_WORDS` is triplicated and the three copies disagree**, as do the two
    `TWO_PARTY_CONSENT_STATES` sets (13 entries vs 12; one omits Delaware) — and
    that one is a legal list.
20. **`src/lib/integrations/{email/workflows,sms/workflows,payments/subscriptions}.ts`
    have zero production importers**, as do
    `engines/{adoption/reengagement-service,cost/provider-failover,trust-safety/impersonation-guard}.ts`
    and `lib/shadow/safety/continuous-voiceprint.ts` — the last of which means
    continuous voiceprint verification and its spoof kill switch never register.

---

## 9. What P-33 changed

| Store | Table | Proof |
|---|---|---|
| `smsCodeStore` | `ShadowSmsCode` | `tests/db/store-persistence.test.ts` — a code minted before a restart still verifies; the lockout survives too |
| `trustedDevices` ×3 | `ShadowTrustedDevice` | inbound auth, SMS sender identification, outbound lookup all resolve a device registered pre-restart; a revoked device stays revoked |
| `dndStore` | `DNDConfig` | DND, quiet hours and the VIP list survive; suppression still applies and the two documented break-throughs still work |
| `usageStore` | `UsageRecord` (`module = 'plan-meter'`) | a 9,999-call meter is still 9,999 after a restart, not 0 |

No migration. All four tables already existed.
