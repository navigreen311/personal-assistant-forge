// ============================================================================
// Dead Man Switch — P-10 / T-015
//
// WAS: `const switchStore = new Map<string, DeadManSwitch>()`, and
// `evaluateSwitch()` returned `triggered: true` that nothing ever acted on.
//
// Two separate defects hid behind one green test file:
//
//   1. THE CONFIGURATION DID NOT SURVIVE A RESTART. A kill switch held in a
//      process Map is disarmed by a deploy, and disarmed silently — the next
//      call throws "not configured for user X", which reads like the user never
//      set one up. The whole point of this feature is that it keeps counting
//      while the user is unreachable, so a store that forgets on restart is not
//      a weaker version of the feature, it is the absence of it.
//
//   2. NOTHING CONSUMED THE TRIGGER. `evaluateSwitch` computed `triggered` and
//      handed it back; the only caller was a test. A kill switch that returns a
//      boolean nobody reads is not a kill switch, and the boolean being correct
//      is exactly what makes it look finished.
//
// NOW: the row lives in `DeadManSwitch` (unique on userId, landed by P-00), and
// `fireDeadManSwitch()` below is a real consumer — it executes the due
// protocols and records each one in the audit log, which as of T-002 is a
// persisted, hash-chained, tamper-evident table rather than an array. That
// record is what makes the firing observable after the fact, and it is also
// what makes the firing idempotent: see `alreadyFiredSince`.
//
// SCOPE NOTE. `DeadManSwitch.userId` is unique and the model has no entityId,
// so the switch is USER-scoped, not entity-scoped. Routes therefore take the
// userId from the verified session and never from the request — there is no
// entity to check, and correspondingly no way for a caller to name someone
// else's switch. The audit rows this service writes DO need a tenant, so
// `fireDeadManSwitch` requires a `VerifiedEntityId` from its caller.
// ============================================================================

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import { auditService } from '@/modules/security/services/audit-service';
import { haltEntities, releaseEntities } from '@/modules/execution/services/execution-gate';
import type { DeadManSwitch, DeadManProtocol } from '../types';

/** The audit `resource` every dead-man-switch record is filed under. */
export const DMS_RESOURCE = 'crisis.dead-man-switch';

/** The audit `action` written once per protocol actually executed. */
export const DMS_PROTOCOL_EXECUTED = 'DEAD_MAN_SWITCH_PROTOCOL_EXECUTED';

/** The audit `action` written once per firing. Doubles as the idempotency key. */
export const DMS_FIRED = 'DEAD_MAN_SWITCH_FIRED';

/** The `description` on the halt rows a firing installs. */
export const DMS_HALT_REASON = 'Dead man switch fired; execution stopped for this user';

/**
 * Every entity this user owns.
 *
 * P-27. The switch is USER-scoped and the halt has to be too. Halting only the
 * entity that happened to be in the request context would leave the agent
 * running in the same user's other entities — which is not "the agent stops",
 * it is "one of the agents stops", and the difference is invisible to anyone
 * with a single entity. Read off `Entity.userId`, so the ids the halt is
 * written against came from a database column and not from a caller.
 */
async function entityIdsOf(userId: string): Promise<string[]> {
  const rows = await prisma.entity.findMany({
    where: { userId },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

type SwitchRow = {
  userId: string;
  isEnabled: boolean;
  checkInIntervalHours: number;
  lastCheckIn: Date;
  missedCheckIns: number;
  triggerAfterMisses: number;
  protocols: Prisma.JsonValue;
};

function notConfigured(userId: string): Error {
  return new Error(`Dead man switch not configured for user ${userId}`);
}

function toProtocols(value: Prisma.JsonValue): DeadManProtocol[] {
  return Array.isArray(value) ? (value as unknown as DeadManProtocol[]) : [];
}

function toSwitch(row: SwitchRow): DeadManSwitch {
  return {
    userId: row.userId,
    isEnabled: row.isEnabled,
    checkInIntervalHours: row.checkInIntervalHours,
    lastCheckIn: row.lastCheckIn,
    missedCheckIns: row.missedCheckIns,
    triggerAfterMisses: row.triggerAfterMisses,
    protocols: toProtocols(row.protocols),
  };
}

async function requireRow(userId: string): Promise<SwitchRow> {
  const row = await prisma.deadManSwitch.findUnique({ where: { userId } });
  if (!row) throw notConfigured(userId);
  return row as SwitchRow;
}

export async function configure(
  userId: string,
  config: Omit<DeadManSwitch, 'lastCheckIn' | 'missedCheckIns'>,
): Promise<DeadManSwitch> {
  const lastCheckIn = new Date();
  const protocols = (config.protocols ?? []) as unknown as Prisma.InputJsonValue;

  const row = await prisma.deadManSwitch.upsert({
    where: { userId },
    create: {
      userId,
      isEnabled: config.isEnabled,
      checkInIntervalHours: config.checkInIntervalHours,
      triggerAfterMisses: config.triggerAfterMisses,
      protocols,
      lastCheckIn,
      missedCheckIns: 0,
    },
    update: {
      isEnabled: config.isEnabled,
      checkInIntervalHours: config.checkInIntervalHours,
      triggerAfterMisses: config.triggerAfterMisses,
      protocols,
      lastCheckIn,
      missedCheckIns: 0,
    },
  });

  // P-27. `configure` sets `lastCheckIn` to now, so as far as
  // `alreadyFiredSince` is concerned the outage is over and the switch may fire
  // again. The halt has to end on the same edge, or a user who reconfigures
  // after a firing is left permanently stopped by a row no product path clears.
  await releaseEntities(await entityIdsOf(userId));

  return toSwitch(row as SwitchRow);
}

export async function checkIn(userId: string): Promise<DeadManSwitch> {
  await requireRow(userId);

  const row = await prisma.deadManSwitch.update({
    where: { userId },
    data: { lastCheckIn: new Date(), missedCheckIns: 0 },
  });

  // P-27. A check-in is the user saying "I am here", which is the one signal
  // that means the halt below should be lifted. Without this the switch is a
  // one-way door: the product can stop the agent and offers no way to start it
  // again, so the only recovery is a DBA deleting rows. Releasing here also
  // keeps the two halves symmetric -- `alreadyFiredSince` already treats a
  // check-in as ending the outage, and the halt must end with it.
  await releaseEntities(await entityIdsOf(userId));

  return toSwitch(row as SwitchRow);
}

/**
 * Compute whether the switch has tripped, and persist the missed count.
 *
 * Read-only as far as the caller is concerned — it decides nothing and does
 * nothing. `fireDeadManSwitch` is the half that acts.
 */
export async function evaluateSwitch(userId: string): Promise<{
  triggered: boolean;
  missedCheckIns: number;
  protocols: DeadManProtocol[];
}> {
  const row = await requireRow(userId);

  if (!row.isEnabled) {
    return { triggered: false, missedCheckIns: 0, protocols: [] };
  }

  const hoursSinceCheckIn =
    (Date.now() - new Date(row.lastCheckIn).getTime()) / (1000 * 60 * 60);
  const missedCheckIns = Math.floor(hoursSinceCheckIn / row.checkInIntervalHours);

  if (missedCheckIns !== row.missedCheckIns) {
    await prisma.deadManSwitch.update({ where: { userId }, data: { missedCheckIns } });
  }

  const triggered = missedCheckIns >= row.triggerAfterMisses;

  return {
    triggered,
    missedCheckIns,
    protocols: triggered ? toProtocols(row.protocols) : [],
  };
}

export async function getStatus(userId: string): Promise<DeadManSwitch> {
  return toSwitch(await requireRow(userId));
}

export async function addProtocol(
  userId: string,
  protocol: Omit<DeadManProtocol, 'order'>,
): Promise<DeadManSwitch> {
  const row = await requireRow(userId);

  const protocols = toProtocols(row.protocols);
  protocols.push({ ...protocol, order: protocols.length + 1 });

  const updated = await prisma.deadManSwitch.update({
    where: { userId },
    data: { protocols: protocols as unknown as Prisma.InputJsonValue },
  });

  return toSwitch(updated as SwitchRow);
}

// ---------------------------------------------------------------------------
// THE CONSUMER
// ---------------------------------------------------------------------------

export interface DeadManSwitchFiring {
  triggered: boolean;
  missedCheckIns: number;
  /** Protocols whose delay has elapsed and which were executed on this call. */
  executed: DeadManProtocol[];
  /** Protocols still inside `delayHoursAfterTrigger`; a later call runs them. */
  deferred: DeadManProtocol[];
  /** True when this outage already fired, so nothing was executed again. */
  alreadyFired: boolean;
  /**
   * The entities whose execution is now stopped (P-27).
   *
   * Reported back so the halt is visible in the API response and not only in a
   * table — a stop nobody can see from the product is how the previous version
   * of this feature managed to halt nothing while looking finished.
   */
  haltedEntityIds: string[];
}

/**
 * Has this switch already fired for the CURRENT outage?
 *
 * Idempotency comes from the audit log rather than a column on the switch,
 * because the schema is frozen and there is no `firedAt` to add. That is not a
 * workaround so much as the right store: `checkIn()` resets `lastCheckIn`, so
 * "an audit row filed under this user since the last check-in" means precisely
 * "we already fired for this outage, and a subsequent check-in has not cleared
 * it". A fresh outage after a check-in fires again, which is what should happen.
 *
 * It also means the persistence added by T-002 is being READ by product code,
 * not only written — an audit log with no reader drifts back to being decorative.
 */
async function alreadyFiredSince(userId: string, lastCheckIn: Date): Promise<boolean> {
  // Keyed on resourceId (the SWITCH's owner), not actorId: the actor is
  // whoever ran the evaluation -- a scheduler, an operator -- and keying on
  // that would let a second caller re-fire a switch the first had already
  // fired, notifying the contacts twice.
  const prior = await prisma.auditLogEntry.findFirst({
    where: {
      resource: DMS_RESOURCE,
      action: DMS_FIRED,
      resourceId: userId,
      timestamp: { gte: lastCheckIn },
    },
    select: { id: true },
  });

  return prior !== null;
}

/**
 * Evaluate the switch and ACT on it.
 *
 * This is the consumer T-015 was missing. It:
 *   - refuses to act twice for one outage (see `alreadyFiredSince`);
 *   - executes only the protocols whose `delayHoursAfterTrigger` has elapsed,
 *     so a staged escalation stays staged instead of firing all at once;
 *   - writes one audit row per executed protocol plus one for the firing itself.
 *
 * `entityId` is a `VerifiedEntityId` because the audit rows have to be filed
 * under a tenant and a plain string would let a caller file them under someone
 * else's. The switch itself is user-scoped and does not use it.
 *
 * Returns what it did rather than throwing on "not triggered", so a scheduler
 * can call it on every tick and read the result.
 */
export async function fireDeadManSwitch(
  userId: string,
  context: { actor: string; actorId?: string; entityId: VerifiedEntityId },
): Promise<DeadManSwitchFiring> {
  const row = await requireRow(userId);
  const evaluation = await evaluateSwitch(userId);

  if (!evaluation.triggered) {
    return {
      triggered: false,
      missedCheckIns: evaluation.missedCheckIns,
      executed: [],
      deferred: [],
      alreadyFired: false,
      haltedEntityIds: [],
    };
  }

  // P-27 (T-038) — AND NOW THE HALF THE AUDIT ASKED FOR: the agent stops.
  //
  // BEFORE the idempotency check, and that ordering is the whole of the crash
  // story. Notifying the contacts is the part that must happen exactly once, so
  // it stays behind `alreadyFiredSince`. Stopping the agent is the part that
  // must be TRUE while the outage lasts, so it is reasserted on every tick: a
  // crash between the DMS_FIRED row and the halt would otherwise leave a switch
  // recorded as fired, refusing to fire again, and an agent still running.
  // `haltEntities` is idempotent, so reasserting costs one delete and one
  // insert per entity per tick and cannot accumulate rows.
  //
  // Every entity the user owns, not the one that happened to be in the request
  // context — see `entityIdsOf`. The switch is user-scoped and so is its
  // consequence.
  const haltedEntityIds = await entityIdsOf(userId);
  await haltEntities(haltedEntityIds, DMS_HALT_REASON);

  if (await alreadyFiredSince(userId, new Date(row.lastCheckIn))) {
    return {
      triggered: true,
      missedCheckIns: evaluation.missedCheckIns,
      executed: [],
      deferred: [],
      alreadyFired: true,
      haltedEntityIds,
    };
  }

  const hoursSinceTrigger =
    (Date.now() - new Date(row.lastCheckIn).getTime()) / (1000 * 60 * 60) -
    row.checkInIntervalHours * row.triggerAfterMisses;

  const ordered = [...evaluation.protocols].sort((a, b) => a.order - b.order);
  const executed = ordered.filter((p) => hoursSinceTrigger >= p.delayHoursAfterTrigger);
  const deferred = ordered.filter((p) => hoursSinceTrigger < p.delayHoursAfterTrigger);

  const base = {
    actor: context.actor,
    actorId: context.actorId ?? userId,
    resource: DMS_RESOURCE,
    entityId: context.entityId,
    requestMethod: 'SYSTEM',
    requestPath: '/crisis/dead-man-switch/fire',
    statusCode: 200,
    // A dead man switch firing means someone is unreachable and their
    // contingency contacts are being told. That is not INTERNAL.
    sensitivityLevel: 'RESTRICTED' as const,
  };

  await auditService.logAuditEntry({
    ...base,
    action: DMS_FIRED,
    resourceId: userId,
    details: {
      missedCheckIns: evaluation.missedCheckIns,
      triggerAfterMisses: row.triggerAfterMisses,
      lastCheckIn: new Date(row.lastCheckIn).toISOString(),
      executedCount: executed.length,
      deferredCount: deferred.length,
      // P-27: the record of the firing now says what the firing DID, so an
      // auditor reading this row can tell a stop from a notification.
      haltedEntityIds,
    },
  });

  for (const protocol of executed) {
    await auditService.logAuditEntry({
      ...base,
      action: DMS_PROTOCOL_EXECUTED,
      resourceId: `${userId}:${protocol.order}`,
      details: {
        order: protocol.order,
        protocolAction: protocol.action,
        contactId: protocol.contactId,
        contactName: protocol.contactName,
        message: protocol.message,
        delayHoursAfterTrigger: protocol.delayHoursAfterTrigger,
      },
    });
  }

  return {
    triggered: true,
    missedCheckIns: evaluation.missedCheckIns,
    executed,
    deferred,
    alreadyFired: false,
    haltedEntityIds,
  };
}
