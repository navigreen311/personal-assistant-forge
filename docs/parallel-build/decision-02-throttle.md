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

---

# AMENDMENT — 2026-09-10, same day. The stated reason was wrong.

**The decision stands. The argument for it does not, and the correction matters
more than the decision.**

Above, this document claims `ShadowProactiveConfig` "is enforced" at
`notification-escalator.ts:239/:255`. The code is there and it is correct. **It
does not run.**

```
notificationEscalator singleton  ->  0 callers anywhere in src/
```

The class is defined, instantiated at module scope as `notificationEscalator`,
re-exported by `proactive/index.ts` — and **no code calls a method on it.**

## How the coordinator got it wrong, recorded because the mechanism repeats

The check was `grep -rln "shadow/proactive'" src/` plus a second grep for
`from '@/modules/shadow/proactive`. The second matched four route files, and that
was read as "four routes import the barrel".

**It was a prefix match.** Those four routes import
`@/modules/shadow/proactive/morning-briefing`,
`…/entity-persona` and `…/suggestion-engine` — *specific files*. **Not one of
them imports the barrel, and not one imports `notification-escalator`.**

That is the eighth scope-dependent measurement error on this repository, and the
first one the coordinator made rather than caught. It is also precisely the
distinction P-35 flagged when it declined to ship its factory-scan: **import-
granular reachability is not function-granular reachability.** A module can be
imported, re-exported, and still have no live caller.

## What changes

`throttle-service.ts` is still deleted — an in-memory duplicate with incoherent
defaults and no callers. That part was never in doubt.

But the reason is not "the real control already works". It is:

**Of the two implementations of per-user action limits, one is in-memory with
defaults that cannot fire, and the other counts durable rows and is correct by
construction. Neither is wired. Delete the first and WIRE THE SECOND.**

Wiring `notification-escalator` is not follow-up tidying — it is Sprint 5's
listed deliverable *"Escalation state machine (notify -> call -> SMS -> phone
tree)"* (issue #24), and it is what makes `maxCallsPerDay`, `maxCallsPerHour`,
quiet hours and the VIP breakout real. **Until it is wired, every anti-spam
control the Shadow settings page offers is a stored preference nothing reads** —
the same shape as the twelve phantoms, one level up: not a fake result, but a
correct implementation with no caller.

It belongs to P-16 and is stated in that package's card.

## The general lesson, since this run keeps paying for it

**"It exists" and "it is imported" are both weaker than "it is called".** This
codebase has now produced all three failure modes:

- a table that exists and nothing queries (`ShadowSmsCode`, five models)
- a module that is imported and whose functions nobody calls (`notification-escalator`)
- code that runs and reports success for work it did not do (twelve phantoms)

`control-plane-schema.test.ts` now catches the first. Nothing catches the second.
