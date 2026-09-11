import { prisma } from '@/lib/db';
import type { DNDConfig } from '../types';

// P-33: this was `const dndStore = new Map<string, DNDConfig>()`.
//
// `getDNDConfig` read that Map and nothing else, so `POST /api/attention/dnd`
// wrote Do-Not-Disturb state that a restart erased -- and erased it into a
// PLAUSIBLE default rather than an error: `getDefaultDND` returns
// `isActive: false`, so after a deploy `isDNDActive` answers `false`, the API
// answers 200 with a sensible-looking config, and every suppressed
// notification starts coming through. Quiet hours and the VIP allow-list go
// with it. There is nothing for an operator to notice.
//
// The `DNDConfig` Prisma model is a field-for-field match for the `DNDConfig`
// TypeScript type -- `userId @unique`, `isActive`, `mode`, `startTime`,
// `endTime`, `vipBreakthroughEnabled`, `vipContactIds Json` -- and
// `prisma.dNDConfig` appeared ZERO times in `src/`. The table has been sitting
// there unused.
//
// There WAS a half-built durable path: `enableDND`/`disableDND` best-effort
// wrote the whole config into `User.preferences.dnd`. Nothing ever read it
// back, and no route calls those two functions anyway, so it recorded state
// that could not be recovered. It is replaced here rather than kept in
// parallel -- two writers and no reader is how the state drifted.
//
// P-36 (ESC-5, migration window 01) closes the escalation P-33 raised here.
//
// `enableDND` filled `reason` with `JSON.stringify({ expiresAt })` for a timed
// do-not-disturb. There was no column for it and a repo-wide grep found no
// reader, so the honest description of "snooze notifications for an hour" was:
// notifications were snoozed, and the hour never ended. The one nullable column
// `expiresAt DateTime?` is the whole fix, and enforcement is on the READ
// (`getDNDConfig`) rather than in a sweeper -- the same shape P-33 used for
// `ShadowSmsCode`, and for the same reason: a `setInterval` armed at module
// load is state in the process, which is what this whole exercise is removing.
//
// `reason` is kept, and is now DERIVED from the column on read, so the field
// that used to be returned-once-and-lost survives a restart with the config.

/** Row shape as read back from `prisma.dNDConfig`. */
interface DndRow {
  userId: string;
  isActive: boolean;
  mode: string;
  startTime: string | null;
  endTime: string | null;
  expiresAt: Date | null;
  vipBreakthroughEnabled: boolean;
  vipContactIds: unknown;
}

function getDefaultDND(userId: string): DNDConfig {
  return {
    userId,
    isActive: false,
    mode: 'MANUAL',
    vipBreakthroughEnabled: true,
    vipContactIds: [],
  };
}

function rowToConfig(row: DndRow): DNDConfig {
  const config: DNDConfig = {
    userId: row.userId,
    isActive: row.isActive,
    mode: row.mode as DNDConfig['mode'],
    vipBreakthroughEnabled: row.vipBreakthroughEnabled,
    vipContactIds: Array.isArray(row.vipContactIds) ? (row.vipContactIds as string[]) : [],
    startTime: row.startTime ?? undefined,
    endTime: row.endTime ?? undefined,
  };
  if (row.expiresAt) {
    config.expiresAt = row.expiresAt;
    config.reason = JSON.stringify({ expiresAt: row.expiresAt.toISOString() });
  }
  return config;
}

/**
 * Read the config, expiring a timed do-not-disturb that has run out.
 *
 * Enforcement lives here rather than only in `isDNDActive` so that every reader
 * agrees: `GET /api/attention/dnd` would otherwise keep answering
 * `isActive: true` for a DND that `isDNDActive` had already decided was over,
 * and a UI showing an indefinite "Do Not Disturb" badge over an expired one is
 * the same class of bug as the missing column.
 *
 * The clearing write is an `updateMany` guarded on `expiresAt: { lte: now }`,
 * so it is atomic and idempotent: concurrent readers cannot double-clear, and a
 * DND re-enabled a millisecond later is not clobbered.
 */
export async function getDNDConfig(userId: string): Promise<DNDConfig> {
  const row = await prisma.dNDConfig.findUnique({ where: { userId } });
  if (!row) return getDefaultDND(userId);

  const typed = row as DndRow;
  const now = new Date();
  if (typed.expiresAt && typed.expiresAt.getTime() <= now.getTime()) {
    await prisma.dNDConfig.updateMany({
      where: { userId, expiresAt: { lte: now } },
      data: { isActive: false, expiresAt: null },
    });
    return rowToConfig({ ...typed, isActive: false, expiresAt: null });
  }

  return rowToConfig(typed);
}

export async function setDND(userId: string, config: Partial<DNDConfig>): Promise<DNDConfig> {
  const current = await getDNDConfig(userId);
  const updated: DNDConfig = { ...current, ...config, userId };

  // `userId` is @unique, so upsert is the whole read-modify-write.
  const columns = {
    isActive: updated.isActive,
    mode: updated.mode,
    startTime: updated.startTime ?? null,
    endTime: updated.endTime ?? null,
    expiresAt: updated.expiresAt ?? null,
    vipBreakthroughEnabled: updated.vipBreakthroughEnabled,
    vipContactIds: updated.vipContactIds,
  };
  await prisma.dNDConfig.upsert({
    where: { userId },
    create: { userId, ...columns },
    update: columns,
  });

  return updated;
}

export async function isDNDActive(userId: string): Promise<boolean> {
  // `getDNDConfig` has already expired a timed DND whose `expiresAt` has passed
  // -- it comes back `isActive: false` -- so every branch below sees the
  // post-expiry state. Before P-36 there was no column to expire.
  const config = await getDNDConfig(userId);

  switch (config.mode) {
    case 'MANUAL':
      return config.isActive;

    case 'FOCUS_HOURS': {
      if (!config.startTime || !config.endTime) return false;
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      return currentTime >= config.startTime && currentTime <= config.endTime;
    }

    case 'CALENDAR_AWARE':
      // Placeholder: would check calendar for current meetings
      return config.isActive;

    case 'SMART':
      // Combine all signals
      if (config.isActive) return true;
      if (config.startTime && config.endTime) {
        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        if (currentTime >= config.startTime && currentTime <= config.endTime) return true;
      }
      return false;

    default:
      return false;
  }
}

export async function checkVIPBreakthrough(userId: string, contactId: string): Promise<boolean> {
  const config = await getDNDConfig(userId);
  if (!config.vipBreakthroughEnabled) return false;
  return config.vipContactIds.includes(contactId);
}

export async function enableDND(
  userId: string,
  config?: { durationMinutes?: number; exceptions?: string[] }
): Promise<DNDConfig> {
  const current = await getDNDConfig(userId);
  const updated: DNDConfig = {
    ...current,
    isActive: true,
    mode: 'MANUAL',
  };

  if (config?.exceptions) {
    updated.vipContactIds = [...new Set([...updated.vipContactIds, ...config.exceptions])];
  }

  // P-36: `expiresAt` is now a column, so a timed DND actually ends. `reason`
  // keeps the shape its existing callers read, derived from the same value.
  if (config?.durationMinutes) {
    const expiresAt = new Date(Date.now() + config.durationMinutes * 60 * 1000);
    updated.expiresAt = expiresAt;
    updated.reason = JSON.stringify({ expiresAt: expiresAt.toISOString() });
  }

  await setDND(userId, updated);
  return updated;
}

export async function disableDND(userId: string): Promise<DNDConfig> {
  const current = await getDNDConfig(userId);
  const updated: DNDConfig = {
    ...current,
    isActive: false,
    expiresAt: undefined,
    reason: undefined,
  };
  await setDND(userId, updated);
  return updated;
}

export async function setQuietHours(
  userId: string,
  startHour: number,
  endHour: number,
  _timezone?: string
): Promise<DNDConfig> {
  const startTime = `${String(startHour).padStart(2, '0')}:00`;
  const endTime = `${String(endHour).padStart(2, '0')}:00`;

  return setDND(userId, {
    mode: 'FOCUS_HOURS',
    startTime,
    endTime,
  });
}

export async function addException(userId: string, contactId: string): Promise<DNDConfig> {
  const current = await getDNDConfig(userId);
  const vipContactIds = [...new Set([...current.vipContactIds, contactId])];
  return setDND(userId, { vipContactIds, vipBreakthroughEnabled: true });
}

export async function shouldSuppress(
  userId: string,
  notification: { priority?: string; source?: string; contactId?: string }
): Promise<boolean> {
  const active = await isDNDActive(userId);
  if (!active) return false;

  // Check exceptions
  if (notification.contactId) {
    const isVIP = await checkVIPBreakthrough(userId, notification.contactId);
    if (isVIP) return false;
  }

  // Urgent priority breaks through
  if (notification.priority === 'P0' || notification.priority === 'urgent') {
    return false;
  }

  return true;
}

/**
 * Exposed for testing: clears every DND row.
 *
 * P-33: this replaces `export { dndStore }`, which existed only so tests could
 * call `dndStore.clear()`. That export was a symptom -- a module handing out
 * its private Map because there was no other way to reset it. The reset is now
 * a delete against the table, which is also what a restart does NOT do, and
 * that difference is the point of the change.
 */
export async function _resetDNDStore(): Promise<void> {
  await prisma.dNDConfig.deleteMany();
}
