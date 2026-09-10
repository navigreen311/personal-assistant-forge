// ============================================================================
// Shadow Voice Agent — Trusted phone device lookups
// ============================================================================
//
// P-33: `phone-inbound.ts`, `phone-outbound.ts` and `sms.ts` each held their
// own module-level `trustedDevices` Map, and the three were not even the same
// shape:
//
//     phone-inbound.ts   Map<normalizedPhone, TrustedDevice>
//     phone-outbound.ts  Map<userId, TrustedDevice[]>
//     sms.ts             Map<userId, TrustedDevice[]>
//
// None of the three modules imported `prisma` at all, so none of them ever
// read or wrote `ShadowTrustedDevice` — the table the rest of the app treats
// as the system of record for exactly this. `/api/shadow/config/trusted-
// devices` does full CRUD on it, `ShadowAuthManager.isTrustedDevice` /
// `addTrustedDevice` / `listTrustedDevices` go straight to it, and
// `action-gate.ts` and `continuous-voiceprint.ts` both query it.
//
// The consequence was worse than losing data on restart. The only writer of
// all three Maps was `_addTrustedDevice`, whose only callers are in
// `tests/unit/shadow/phone.test.ts`. In production nothing seeded them, so
// they were permanently empty, and:
//
//   * `PhoneInboundHandler.authenticateCaller` returned
//     `{ authenticated: false, requiresStepUp: true }` for EVERY inbound call;
//   * `PhoneOutboundHandler.callUser` threw
//     `No trusted phone number found for user <id>` before reaching Twilio, on
//     EVERY outbound call;
//   * `ShadowSMS.sendSMS` threw `No phone number found for user <id>` on every
//     send, and `handleInboundSMS` answered "I don't recognize this number" to
//     everyone.
//
// A user who registered their phone through the supported UI wrote a
// `ShadowTrustedDevice` row that the phone and SMS handlers could not see. The
// unit tests passed because each one calls `_addTrustedDevice` first — a
// passing test encoding the defect, which is the pattern this run keeps
// finding.
//
// This module is the single seam onto the table, so there is one query shape
// rather than three divergent ones.

import { prisma } from '@/lib/db';
import type { TrustedDevice } from './phone-types';

/** Row shape as read back from `prisma.shadowTrustedDevice`. */
interface TrustedDeviceRow {
  id: string;
  userId: string;
  phoneNumber: string | null;
  name: string;
  isActive: boolean;
  verifiedAt: Date;
  lastUsedAt: Date | null;
}

/**
 * `ShadowTrustedDevice` → the `TrustedDevice` shape the phone/SMS handlers use.
 *
 * `verified` maps to `isActive`, which is how the rest of the app reads the
 * column: `ShadowAuthManager.isTrustedDevice` filters on `isActive: true`, and
 * `removeTrustedDevice` revokes by setting it to false.
 */
function toTrustedDevice(row: TrustedDeviceRow): TrustedDevice {
  return {
    id: row.id,
    userId: row.userId,
    phoneNumber: row.phoneNumber ?? '',
    label: row.name,
    verified: row.isActive,
    lastUsed: row.lastUsedAt ?? undefined,
    createdAt: row.verifiedAt,
  };
}

/**
 * Normalize a phone number to `+<digits>` with a US `+1` default.
 *
 * Same rules as the copies in `phone-inbound.ts` and `sms.ts`; kept here so a
 * number stored unnormalized by another writer (the trusted-devices API does
 * not normalize) still matches an inbound caller id.
 */
export function normalizePhoneNumber(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('1') && cleaned.length === 11) return '+' + cleaned;
  if (cleaned.length === 10) return '+1' + cleaned;
  return '+' + cleaned;
}

const ACTIVE_PHONE = {
  isActive: true,
  phoneNumber: { not: null },
} as const;

/**
 * Find an active trusted device by caller id.
 *
 * Two steps on purpose: an exact match uses `@@index([phoneNumber])`, and the
 * fallback covers rows written unnormalized through
 * `/api/shadow/config/trusted-devices`, which stores whatever it is given.
 * The old in-memory version normalized on insert, so the fallback is what
 * keeps behaviour equivalent rather than merely similar.
 */
export async function findActiveDeviceByPhone(phoneNumber: string): Promise<TrustedDevice | null> {
  const normalized = normalizePhoneNumber(phoneNumber);

  const exact = await prisma.shadowTrustedDevice.findFirst({
    where: { ...ACTIVE_PHONE, phoneNumber: normalized },
  });
  if (exact) return toTrustedDevice(exact as TrustedDeviceRow);

  const candidates = await prisma.shadowTrustedDevice.findMany({ where: ACTIVE_PHONE });
  const match = candidates
    .map((row) => toTrustedDevice(row as TrustedDeviceRow))
    .find((device) => normalizePhoneNumber(device.phoneNumber) === normalized);

  return match ?? null;
}

/**
 * The primary active phone device for a user — the oldest verified one, so the
 * answer is stable rather than dependent on row order.
 */
export async function findActiveDeviceForUser(userId: string): Promise<TrustedDevice | null> {
  const row = await prisma.shadowTrustedDevice.findFirst({
    where: { ...ACTIVE_PHONE, userId },
    orderBy: { verifiedAt: 'asc' },
  });
  return row ? toTrustedDevice(row as TrustedDeviceRow) : null;
}

/** The phone number for a user's primary active device, or `''`. */
export async function findPhoneForUser(userId: string): Promise<string> {
  const device = await findActiveDeviceForUser(userId);
  return device?.phoneNumber ?? '';
}

// ─── Test seeding ───────────────────────────────────────────────────────────
//
// These replace the three `_addTrustedDevice` helpers, which existed only
// because the stores were in memory and unreachable. They now write and delete
// rows, so a test that seeds a device and a test that asserts a restart keeps
// it are talking about the same thing.

/** Exposed for testing: insert a trusted phone device row. */
export async function _addTrustedPhoneDevice(
  userId: string,
  device: Pick<TrustedDevice, 'phoneNumber' | 'label' | 'verified'>
): Promise<void> {
  await prisma.shadowTrustedDevice.create({
    data: {
      userId,
      deviceType: 'phone',
      phoneNumber: normalizePhoneNumber(device.phoneNumber),
      name: device.label,
      isActive: device.verified,
    },
  });
}

/** Exposed for testing: remove every trusted device row. */
export async function _resetTrustedPhoneDevices(): Promise<void> {
  await prisma.shadowTrustedDevice.deleteMany();
}
