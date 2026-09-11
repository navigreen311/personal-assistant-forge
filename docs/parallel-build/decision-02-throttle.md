# Decision 2 — the action throttle is deleted, not wired

**Decided by the coordinator, 2026-09-10, on evidence. Reversible if wrong.**

## The question

P-33 escalated `ActionThrottleCounter` (ESC-4) to persist
`src/engines/trust-safety/throttle-service.ts`'s `hourlyCounters`,
`dailyCounters` and `lastActionTimestamps`, classifying it **LIVE anti-abuse**: a
restart hands every user a fresh hour, a fresh day and an early end to every
cooldown, and `requiresApproval` rides the same counters, so a restart silently
withdraws the approval requirement.

All of that is true. Migration window 01 held it anyway, on P-18's finding that
`checkThrottle` gates nothing. This document closes the question.

## What the evidence shows

**The duplicate has no consumer at all.**

```
importers of throttle-service.ts   -> 1, its own route
UI callers of /api/safety/throttle -> 0
```

A closed loop. Nothing reads it, nothing acts on it.

**The control it duplicates already exists, and is better built.**
`ShadowProactiveConfig` is a real Prisma model with `maxCallsPerDay` (default 5)
and `maxCallsPerHour` (default 2), it has routes users can configure it through,
and **it is enforced** — `notification-escalator.ts:239` and `:255` refuse to
escalate to a call when the limit is reached.

Decisively, it does not keep a counter at all:

```ts
const callsToday = await prisma.shadowOutreach.count({
  where: { userId, channel: { contains: 'phone' },
           createdAt: { gte: dayStart }, status: { not: 'blocked' } },
});
if (callsToday >= config.maxCallsPerDay) return { allowed: false, ... };
```

**It counts the rows that record the actual outreach.** That is correct across a
restart and across instances *by construction* — there is no counter to drift,
nothing to persist, and no read-then-write race. It is a better design than
ESC-4's `ActionThrottleCounter`, which would have had to solve those problems.

This is also the design the committed spec describes:
`docs/specs/PAF-Shadow-Voice-Agent-v2-…`, Part 9.2 — `max_calls_per_day`,
`max_calls_per_hour`, `min_minutes_between_calls`.

## The decision

**Delete `src/engines/trust-safety/throttle-service.ts` and
`/api/safety/throttle`. Do not persist ESC-4.**

Keeping it means carrying a second design for a control that already works, and
persisting it would make a decorative limiter durable and convincing. That is the
argument P-18 used when it **deleted** the constant `X-RateLimit-*` headers
rather than persisting them:

> an absent limiter is a gap an operator can find; an advertised one is
> load-bearing in **someone else's** code … the header inverts the control it
> pretends to be.

The same reasoning applies with more force here, because deleting costs nothing:
the real control is already shipped and enforced.

Its incoherent defaults become moot, but are worth recording as evidence the file
was never exercised: `financial_tx: maxPerHour: 10, maxPerDay: 1` — the hourly
limit is unreachable because the daily one blocks the second transaction of the
day, so `maxPerHour` is dead code. `requiresApprovalAbove: 0` with
`count >= 0` means it always returns `requiresApproval: true`. **No caller ever
noticed, because there was no caller.**

## What this does NOT decide

`ShadowProactiveConfig` covers **phone escalation**. It does not cover email
volume, message volume, or financial transactions — the other action types
`throttle-service` declared. If those need limits, they need a design that starts
from the same principle: **count the durable rows that record the action, do not
keep a counter.** That is a product question about which actions need budgets,
not a persistence question, and nothing today enforces limits on them either way.

`/api/safety/throttle` disappearing is an API removal. It has no UI consumer and
its answer was never true, but it is a public route and its removal belongs in a
changelog.
