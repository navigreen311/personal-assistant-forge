# Migration window 01 — authorized 2026-09-10

The schema has been frozen since P-00 wrote the only migration of this run
(`20260909172049_platform_control_plane`). Ivan has authorized a second window
for P-33's escalations. **This document is the scope. A package in this window
may add exactly what is listed here and nothing else.**

## AUTHORIZED

| # | model / change | why | verdict |
|---|---|---|---|
| ESC-1 | `InboundWebhookEvent` | `/api/webhooks/stripe` idempotency lives in a `Set`. A restart replays webhooks; a second instance does not even need one. | **LIVE, money** |
| ESC-2 | `StoredDocument` + `StoredDocumentVersion` | `/api/uploads` stores the blob durably and its metadata in a `Map`. After a restart the blob is orphaned and the `documentId` already returned to the user 404s forever. | **LIVE, data loss** |
| ESC-3 | `CommunicationOptOut` | Email/SMS suppression and opt-out lists. Latent today — both modules have zero production importers — but it must outlive the `Contact` row, and it is cheaper now than after a send feature exists. | latent, compliance |
| ESC-5 | `DNDConfig.expiresAt DateTime?` | `reason` carries `JSON.stringify({ expiresAt })` for a timed DND with no column and no reader. **No timed do-not-disturb has ever expired.** One nullable column. | trivial |

**ESC-1's argument is the one to preserve in review:** idempotency without a
unique index is a read-then-write race. Two concurrent deliveries of the same
event both pass the check and both run the handler. `@@unique([provider, eventId])`
IS the fix; `ActionLog` and `AuditLogEntry` have no unique constraint on any
business key and therefore cannot supply it, however convenient their columns look.

## NOT AUTHORIZED — ESC-4 `ActionThrottleCounter`

**Held deliberately, and not because the request is wrong.**

P-33 classified it LIVE anti-abuse on the basis that
`/api/safety/throttle` -> `checkThrottle` reads and writes those counters, and
that a restart hands every user a fresh hour, a fresh day, and an early end to
every cooldown.

That is all true. What it does not account for is **P-18's finding, re-verified
at authorization time: `checkThrottle` has exactly one caller in the entire
repository, and it is the route that reports its own status.** Nothing consults
it before placing a call, sending an email, or moving money. The `recordAction`
matches in `src/modules/attention/` are a different function that shares a name.

**So the throttle gates nothing, and persisting its counters would make a
decorative control durable and convincing.** That is a worse outcome than the
volatile version, and it is precisely the argument P-18 used when it DELETED the
constant `X-RateLimit-*` headers rather than persisting them:

> an absent limiter is a gap an operator can find; an advertised one is
> load-bearing in **someone else's** code ... the header inverts the control it
> pretends to be, and taxes exactly the clients that did not need limiting.

**The correct order is: decide whether the throttle should gate anything, wire
it, and then persist it.** Wiring it is a product decision — what a user sees
when they hit a limit, and whether `requiresApprovalAbove: 0` on `financial_tx`
means what it appears to mean — and P-18 declined to make that decision alone.
So does this window. It is queued, not dropped.

Its defaults also read `financial_tx: maxPerHour: 10, maxPerDay: 1`, which is
incoherent and should be resolved in the same decision.

## RULES FOR THIS WINDOW

1. **One migration, one package.** Nobody else may write one, exactly as in
   P-00's window.
2. **Additive only.** No column is dropped, no type narrowed, no existing model
   altered except the single nullable `DNDConfig.expiresAt`. There is production
   data in none of these tables — they do not exist yet — but there are 951 db
   tests standing on the current schema.
3. **A model is not done when it exists.** P-33's headline finding was that five
   of 75 models were referenced nowhere in `src/`, and
   `control-plane-schema.test.ts` stayed green over them **because it only
   asserts the table can be counted.** Every model added here must be read and
   written by the code path it was created for, proved by a test that survives a
   simulated restart, or it is another `ShadowSmsCode`: shipped, green, and
   ignored for a year.
4. The `@@unique` on `InboundWebhookEvent` must be exercised by a test that
   attempts a genuine duplicate insert and asserts the constraint rejects it —
   not by a read-then-write check, which is the race it exists to close.
