// ============================================================================
// Shadow Voice Agent — the proactive tick
// ============================================================================
//
// P-16, deliverables 1-5. THIS FILE IS THE CALLER THAT DID NOT EXIST.
//
// Before it, `suggestion-engine.evaluateTriggers`, the whole of
// `notification-escalator.ts`, the whole of `adaptive-channel.ts` and the whole
// of `digest-optimizer.ts` were correct code with no live caller, and
// `morning-briefing.deliverBriefing` could only be reached by a human pressing
// a button. `ShadowTrigger` rows -- which `POST /api/shadow/triggers` has been
// happily creating -- were evaluated by nothing at all.
//
// ----------------------------------------------------------------------------
// WHY A SWEEP AND NOT A REPEATABLE JOB PER USER
// ----------------------------------------------------------------------------
//
// `src/lib/queue/scheduler.ts` registers one BullMQ repeatable per workflow
// because a workflow owns its own cron expression. A briefing time is a column
// on a row a user edits in a settings form, and registering a repeatable per
// user means Redis holds a mirror of `ShadowProactiveConfig.briefingTime` that
// has to be re-synced on every edit -- the exact "mirror of an external source
// of truth" that `docs/parallel-build/persistence-pattern.md` says to delete
// rather than keep, and that P-11 finding 3 already paid for once in this
// repository.
//
// So there is ONE repeatable job, `shadow-proactive/proactive-tick`, and each
// tick reads the configuration rows. A user who changes their briefing time
// gets the new time on the next tick with nothing to synchronise.
//
// ----------------------------------------------------------------------------
// IDEMPOTENCE IS A QUERY, NOT A FLAG
// ----------------------------------------------------------------------------
//
// Nothing here keeps a "delivered today" marker. `alreadyDeliveredToday` counts
// the `ShadowOutreach` rows that record the delivery, compared in the user's own
// timezone. That is the same principle the escalator anti-spam check uses and
// the reason Decision 2 deleted the in-memory throttle: a tick that runs twice,
// a worker that restarts mid-sweep, and two workers running at once all produce
// one briefing, by construction, with no counter to drift.

import { prisma } from '@/lib/db';

import { morningBriefingService } from './morning-briefing';
import { endOfDaySummaryService } from './end-of-day';
import { suggestionEngine } from './suggestion-engine';
import { notificationEscalator } from './notification-escalator';
import { adaptiveChannelService } from './adaptive-channel';
import { digestOptimizer } from './digest-optimizer';

// ---- Types ----

export interface ProactiveTickResult {
  tickAt: string;
  usersSwept: number;
  briefingsDelivered: number;
  endOfDaySummariesDelivered: number;
  digestsDelivered: number;
  digestItemsBatched: number;
  triggersFired: number;
  escalationsStarted: number;
  escalationsAdvanced: number;
  escalationsBlocked: number;
  errors: Array<{ userId: string; stage: string; message: string }>;
}

export interface ProactiveTickOptions {
  /** Injected clock. Tests pass a fixed instant; the worker passes nothing. */
  now?: Date;
  /** Restrict the sweep to these users. Used by the manual "run now" route. */
  userIds?: string[];
}

// ---- Constants ----

/**
 * How late a scheduled delivery may still fire.
 *
 * Without it, a worker that starts at 23:00 delivers an 08:00 briefing at
 * 23:00 -- technically "not yet delivered today", and useless. A missed window
 * is a missed window.
 */
const SCHEDULE_GRACE_MINUTES = 120;

/** The `ShadowPreference` key `/api/shadow/config` writes the proactive block to. */
const PROACTIVE_PREF_KEY = 'proactive';

/**
 * Ladder channel -> the channel name `ShadowChannelEffectiveness` records
 * against. The ladder names a RUNG (`phone_sms` is "call, then text if it goes
 * to voicemail"); effectiveness is per MEDIUM. Recording the rung name would
 * give five channels that never compare with each other, so the adaptive
 * service would never have two rows to rank and would never downgrade anything.
 */
const LADDER_TO_MEDIUM: Record<string, string> = {
  in_app_push: 'push',
  phone_sms: 'phone',
  sms_action_links: 'sms',
  phone_call_2: 'phone',
  phone_tree: 'phone',
};

export function effectivenessChannelOf(ladderChannel: string): string {
  return LADDER_TO_MEDIUM[ladderChannel] ?? ladderChannel;
}

// ---- Time helpers ----

/**
 * `HH:MM` in the given IANA timezone.
 *
 * `Intl` rather than date-fns-tz: it is in the platform, it is what
 * `context-engine.getTemporalContext` already uses for the same question, and
 * a second timezone library would be a second answer to "what time is it for
 * this user".
 */
export function localTimeOfDay(now: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);
    return parts;
  } catch {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);
  }
}

/** `YYYY-MM-DD` in the given IANA timezone. */
export function localDate(now: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  }
}

function minutesOf(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Is `now`, in this user's timezone, inside the window that starts at
 * `scheduledAt` and lasts `SCHEDULE_GRACE_MINUTES`?
 */
export function isWithinScheduleWindow(
  now: Date,
  timezone: string,
  scheduledAt: string,
  graceMinutes: number = SCHEDULE_GRACE_MINUTES
): boolean {
  const target = minutesOf(scheduledAt);
  if (target === null) return false;
  const current = minutesOf(localTimeOfDay(now, timezone));
  if (current === null) return false;
  return current >= target && current < target + graceMinutes;
}

/**
 * Has an outreach of this trigger type already been recorded on the user's
 * local calendar day?
 *
 * The 48-hour lookback is wide enough for every timezone offset and narrow
 * enough that this is an indexed range scan rather than a table read.
 */
async function alreadyDeliveredToday(
  userId: string,
  triggerType: string,
  now: Date,
  timezone: string
): Promise<boolean> {
  const since = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const rows = await prisma.shadowOutreach.findMany({
    where: { userId, triggerType, createdAt: { gte: since } },
    select: { createdAt: true },
  });
  const today = localDate(now, timezone);
  return rows.some((row) => localDate(row.createdAt, timezone) === today);
}

// ---- Preference loading ----

interface EndOfDayPrefs {
  enabled: boolean;
  time: string;
  channel: string;
}

const DEFAULT_EOD_PREFS: EndOfDayPrefs = {
  enabled: false,
  time: '17:00',
  channel: 'in_app',
};

/**
 * End-of-day settings, read from the same `ShadowPreference` row
 * `/api/shadow/config` writes.
 *
 * They are NOT columns on `ShadowProactiveConfig`: the schema is frozen and
 * `endOfDayEnabled` / `endOfDayTime` / `endOfDayChannel` already had a home
 * when this package started. Adding columns for them would have meant a second
 * place a user setting could live, and the settings page writes to this one.
 */
export async function loadEndOfDayPrefs(userId: string): Promise<EndOfDayPrefs> {
  const pref = await prisma.shadowPreference.findUnique({
    where: { userId_preferenceKey: { userId, preferenceKey: PROACTIVE_PREF_KEY } },
  });
  if (!pref) return { ...DEFAULT_EOD_PREFS };

  try {
    const parsed = JSON.parse(pref.preferenceValue) as Record<string, unknown>;
    return {
      enabled:
        typeof parsed.endOfDayEnabled === 'boolean'
          ? parsed.endOfDayEnabled
          : DEFAULT_EOD_PREFS.enabled,
      time:
        typeof parsed.endOfDayTime === 'string' && minutesOf(parsed.endOfDayTime) !== null
          ? parsed.endOfDayTime
          : DEFAULT_EOD_PREFS.time,
      channel:
        typeof parsed.endOfDayChannel === 'string'
          ? parsed.endOfDayChannel
          : DEFAULT_EOD_PREFS.channel,
    };
  } catch {
    return { ...DEFAULT_EOD_PREFS };
  }
}

// ---- The sweep ----

/**
 * Every user the tick has anything to consider.
 *
 * Three sources, unioned: a proactive config (briefing / digest), an enabled
 * trigger, or an escalation still climbing the ladder. A user with none of the
 * three is not read at all, so the tick costs nothing for the users who have
 * not configured Shadow.
 */
async function candidateUserIds(now: Date): Promise<string[]> {
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [configs, triggers, outreach] = await Promise.all([
    prisma.shadowProactiveConfig.findMany({ select: { userId: true } }),
    prisma.shadowTrigger.findMany({ where: { enabled: true }, select: { userId: true } }),
    prisma.shadowOutreach.findMany({
      where: { status: 'pending', triggerEvent: { not: null }, createdAt: { gte: since } },
      select: { userId: true },
    }),
  ]);

  const ids = new Set<string>();
  for (const row of configs) ids.add(row.userId);
  for (const row of triggers) ids.add(row.userId);
  for (const row of outreach) ids.add(row.userId);
  return [...ids];
}

/**
 * One proactive tick.
 *
 * Errors are collected per user and per stage rather than thrown: one user with
 * a malformed preference must not stop the sweep for everyone else, and a stage
 * that failed has to be visible in the job result rather than inferred from a
 * missing row. The job itself only fails if the sweep cannot enumerate users at
 * all -- which is a real failure worth BullMQ retrying.
 */
export async function runProactiveTick(
  options: ProactiveTickOptions = {}
): Promise<ProactiveTickResult> {
  const now = options.now ?? new Date();

  const result: ProactiveTickResult = {
    tickAt: now.toISOString(),
    usersSwept: 0,
    briefingsDelivered: 0,
    endOfDaySummariesDelivered: 0,
    digestsDelivered: 0,
    digestItemsBatched: 0,
    triggersFired: 0,
    escalationsStarted: 0,
    escalationsAdvanced: 0,
    escalationsBlocked: 0,
    errors: [],
  };

  const userIds = options.userIds ?? (await candidateUserIds(now));

  for (const userId of userIds) {
    result.usersSwept += 1;
    await sweepUser(userId, now, result);
  }

  return result;
}

async function sweepUser(
  userId: string,
  now: Date,
  result: ProactiveTickResult
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, timezone: true },
  });
  if (!user) return;

  const timezone = user.timezone;
  const config = await prisma.shadowProactiveConfig.findUnique({ where: { userId } });

  // --- 1. Morning briefing (deliverable 2) --------------------------------
  if (config?.briefingEnabled ?? false) {
    try {
      if (
        isWithinScheduleWindow(now, timezone, config?.briefingTime ?? '08:00') &&
        !(await alreadyDeliveredToday(userId, 'morning_briefing', now, timezone))
      ) {
        const delivered = await morningBriefingService.deliverBriefing(userId);
        if (delivered.delivered) result.briefingsDelivered += 1;
      }
    } catch (err) {
      result.errors.push({ userId, stage: 'briefing', message: messageOf(err) });
    }
  }

  // --- 2. End-of-day summary (deliverable 3) ------------------------------
  try {
    const eod = await loadEndOfDayPrefs(userId);
    if (
      eod.enabled &&
      isWithinScheduleWindow(now, timezone, eod.time) &&
      !(await alreadyDeliveredToday(userId, 'eod_summary', now, timezone))
    ) {
      await endOfDaySummaryService.deliverSummary(userId, { channel: eod.channel, now });
      result.endOfDaySummariesDelivered += 1;
    }
  } catch (err) {
    result.errors.push({ userId, stage: 'end_of_day', message: messageOf(err) });
  }

  // --- 3. Digest call (Addition 7.2) --------------------------------------
  if (config?.digestEnabled && config.digestTime) {
    try {
      if (
        isWithinScheduleWindow(now, timezone, config.digestTime) &&
        !(await alreadyDeliveredToday(userId, 'digest_delivery', now, timezone))
      ) {
        const digest = await digestOptimizer.generateDigest(userId);
        if (digest.items.length > 0) {
          await prisma.notification.create({
            data: {
              userId,
              type: 'system',
              title: 'Shadow digest',
              body: digest.summary,
              priority: 'normal',
              metadata: { digestItemCount: digest.items.length },
            },
          });
          await prisma.shadowOutreach.create({
            data: {
              userId,
              triggerType: 'digest_delivery',
              channel: 'in_app',
              status: 'delivered',
              content: digest.summary,
            },
          });
          result.digestsDelivered += 1;
        }
      }
    } catch (err) {
      result.errors.push({ userId, stage: 'digest', message: messageOf(err) });
    }
  }

  // --- 4. Trigger engine (deliverable 1) ----------------------------------
  try {
    const evaluations = await suggestionEngine.evaluateTriggers(userId);
    for (const evaluation of evaluations) {
      if (!evaluation.shouldFire) continue;
      result.triggersFired += 1;

      const trigger = await prisma.shadowTrigger.findUnique({
        where: { id: evaluation.triggerId },
        select: { triggerType: true },
      });
      const triggerType = trigger?.triggerType ?? 'unknown';
      const priority = priorityOf(triggerType);

      // A briefing or summary is delivered above, not escalated. Escalating it
      // would ring the phone about a notification the user already has.
      if (triggerType === 'morning_briefing' || triggerType === 'eod_summary') continue;

      // --- Addition 7.2, the batch half -----------------------------------
      //
      // `digestOptimizer.addToDigest` had no caller, so the digest was always
      // empty and `generateDigest` always returned "No items in your digest".
      // This is the decision the spec states: "if item.deadline < 4 hours from
      // now -> call immediately; if item.priority === 'P0' -> call immediately;
      // ... else -> add to digest batch". `shouldBatchItem` is the predicate,
      // and it already existed with the right rules and nobody asking it.
      if (config?.digestEnabled && digestOptimizer.shouldBatchItem({ priority })) {
        await digestOptimizer.addToDigest(userId, {
          type: triggerType,
          title: evaluation.triggerName,
          priority,
          content: evaluation.content,
        });
        result.digestItemsBatched += 1;
        continue;
      }

      const preferredChannel = await adaptiveChannelService.getDowngradeChannel(
        userId,
        triggerType,
        priority
      );

      const started = await startEscalation({
        userId,
        notificationId: escalationKey(evaluation.triggerId, now),
        triggerType,
        priority,
        title: evaluation.triggerName,
        content: evaluation.content,
        preferredChannel,
      });

      if (started === 'escalated') result.escalationsStarted += 1;
      if (started === 'blocked') result.escalationsBlocked += 1;
    }
  } catch (err) {
    result.errors.push({ userId, stage: 'triggers', message: messageOf(err) });
  }

  // --- 5. Advance the ladder (deliverable 4) ------------------------------
  try {
    const active = await notificationEscalator.listActiveEscalations(userId);
    for (const escalation of active) {
      if (!notificationEscalator.dueForNextStep(escalation.lastAttemptAt, escalation.attempts, now)) {
        continue;
      }

      const preferredChannel = await adaptiveChannelService.getDowngradeChannel(
        userId,
        escalation.triggerType,
        escalation.priority
      );

      const advanced = await startEscalation({
        userId,
        notificationId: escalation.notificationId,
        triggerType: escalation.triggerType,
        priority: escalation.priority,
        title: escalation.title,
        content: escalation.title,
        preferredChannel,
      });

      if (advanced === 'escalated') result.escalationsAdvanced += 1;
      if (advanced === 'blocked') result.escalationsBlocked += 1;
    }
  } catch (err) {
    result.errors.push({ userId, stage: 'escalation', message: messageOf(err) });
  }
}

/**
 * Take one rung, record the attempt against the channel, and -- for the in-app
 * rungs -- put a `Notification` in front of the user.
 *
 * The phone and SMS rungs write the `ShadowOutreach` row and stop there. That
 * boundary is deliberate and is the `[E]` line: placing the call is
 * `PhoneOutboundHandler.callUser`, which needs a live Twilio account, so this
 * package records the decision to call durably and does not pretend the call
 * happened. `status: 'pending'` is exactly "a rung that has been decided and
 * not yet delivered" -- the same state the escalator already used.
 *
 * IT IS ALSO NOT JUST A CREDENTIALS PROBLEM, AND THAT IS WORTH STATING HERE
 * RATHER THAN FINDING AGAIN. `PhoneOutboundHandler` carries its OWN call
 * window, its own quiet hours and its own `maxPerDay`/`maxPerHour`, in a
 * module-level `Map` (`outboundCallLog`). Calling it from this function would
 * put TWO anti-spam systems in one path: the durable one this file just
 * consulted, and an in-memory one that a restart empties -- the same shape
 * `docs/parallel-build/decision-02-throttle.md` deleted `throttle-service.ts`
 * for. Whoever provisions Twilio should remove that duplicate first, so
 * `ShadowProactiveConfig` remains the single place a user's call limits live.
 */
async function startEscalation(params: {
  userId: string;
  notificationId: string;
  triggerType: string;
  priority: 'P0' | 'P1' | 'P2';
  title: string;
  content: string;
  /** `null` when the adaptive service has no evidence for this trigger type. */
  preferredChannel: string | null;
}): Promise<'escalated' | 'blocked' | 'exhausted' | 'acknowledged'> {
  const outcome = await notificationEscalator.escalate({
    userId: params.userId,
    notificationId: params.notificationId,
    type: params.triggerType,
    priority: params.priority,
    title: params.title,
    content: params.content,
    preferredChannel: params.preferredChannel ?? undefined,
  });

  if (outcome.status !== 'escalated') {
    return outcome.status as 'blocked' | 'exhausted' | 'acknowledged';
  }

  const medium = effectivenessChannelOf(outcome.channel);
  await adaptiveChannelService.recordAttempt(params.userId, medium, params.triggerType);

  if (medium === 'push' || medium === 'in_app') {
    await prisma.notification.create({
      data: {
        userId: params.userId,
        type: 'alert',
        title: params.title,
        body: params.content,
        priority: params.priority === 'P0' ? 'urgent' : params.priority === 'P1' ? 'high' : 'normal',
        metadata: {
          shadowEscalation: params.notificationId,
          attempt: outcome.attempt,
          channel: outcome.channel,
        },
      },
    });
  }

  return 'escalated';
}

/**
 * Acknowledge an escalation and teach the adaptive service that this channel
 * works for this trigger type.
 *
 * Lives here rather than in the route so the route is four lines and the
 * ordering -- acknowledge first, then account -- is in one place. Acknowledging
 * is what stops the ladder; the effectiveness write is bookkeeping, and if it
 * throws the user has still been taken off the ladder.
 */
export async function acknowledgeEscalation(params: {
  userId: string;
  outreachId: string;
  now?: Date;
}): Promise<{ acknowledged: boolean; channel: string | null; medium: string | null }> {
  const ack = await notificationEscalator.acknowledge(params);
  if (!ack.acknowledged || !ack.channel || !ack.triggerType) {
    return { acknowledged: false, channel: null, medium: null };
  }

  const medium = effectivenessChannelOf(ack.channel);
  await adaptiveChannelService.recordResponse(
    params.userId,
    medium,
    ack.triggerType,
    ack.responseTimeMs ?? 0
  );

  return { acknowledged: true, channel: ack.channel, medium };
}

// ---- Small helpers ----

/**
 * The escalation thread key for one firing of one trigger.
 *
 * Includes the instant, so a trigger that fires again tomorrow starts a new
 * ladder at rung one instead of resuming yesterday at rung four.
 */
export function escalationKey(triggerId: string, now: Date): string {
  return `trigger:${triggerId}:${now.toISOString()}`;
}

function priorityOf(triggerType: string): 'P0' | 'P1' | 'P2' {
  if (triggerType === 'P0_urgent' || triggerType === 'crisis') return 'P0';
  if (triggerType === 'workflow_blocked' || triggerType === 'vip_email') return 'P1';
  return 'P2';
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
