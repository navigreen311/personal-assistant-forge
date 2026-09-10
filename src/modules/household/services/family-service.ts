import { prisma } from '@/lib/db';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { FamilyMember } from '../types';

function contactToFamilyMember(
  contact: {
    id: string;
    entityId: string;
    name: string;
    email: string | null;
    phone: string | null;
    preferences: unknown;
  },
  userId: string
): FamilyMember {
  const prefs = (contact.preferences ?? {}) as Record<string, unknown>;
  return {
    id: contact.id,
    userId,
    name: contact.name,
    relationship: (prefs.relationship as string) ?? '',
    email: contact.email ?? undefined,
    phone: contact.phone ?? undefined,
    visibility: (prefs.visibility as FamilyMember['visibility']) ?? 'FULL',
    sharedCalendar: (prefs.sharedCalendar as boolean) ?? false,
    sharedTasks: (prefs.sharedTasks as boolean) ?? false,
    sharedShopping: (prefs.sharedShopping as boolean) ?? false,
  };
}

export async function addMember(
  entityId: VerifiedEntityId,
  userId: string,
  member: Omit<FamilyMember, 'id'>
): Promise<FamilyMember> {
  const created = await prisma.contact.create({
    data: {
      entityId,
      name: member.name,
      email: member.email ?? null,
      phone: member.phone ?? null,
      tags: ['family'],
      preferences: {
        relationship: member.relationship,
        visibility: member.visibility,
        sharedCalendar: member.sharedCalendar,
        sharedTasks: member.sharedTasks,
        sharedShopping: member.sharedShopping,
      },
    },
  });

  return contactToFamilyMember(created, userId);
}

export async function getMembers(
  entityId: VerifiedEntityId,
  userId: string
): Promise<FamilyMember[]> {
  const contacts = await prisma.contact.findMany({
    where: {
      entityId,
      tags: { has: 'family' },
      deletedAt: null,
    },
  });

  return contacts.map((c) => contactToFamilyMember(c, userId));
}

export async function updateMemberPrivacy(
  entityId: VerifiedEntityId,
  userId: string,
  memberId: string,
  visibility: string,
  options: { sharedCalendar?: boolean; sharedTasks?: boolean; sharedShopping?: boolean }
): Promise<FamilyMember> {
  // findFirst with the scope in the WHERE, not findUnique-then-compare.
  const existing = await prisma.contact.findFirst({ where: { id: memberId, entityId } });
  if (!existing) throw new Error(`Family member ${memberId} not found`);

  const currentPrefs = (existing.preferences ?? {}) as Record<string, unknown>;
  // updateMany, not update: update takes a unique WHERE and cannot carry the entity.
  const changed = await prisma.contact.updateMany({
    where: { id: memberId, entityId },
    data: {
      preferences: {
        ...currentPrefs,
        visibility,
        ...(options.sharedCalendar !== undefined && { sharedCalendar: options.sharedCalendar }),
        ...(options.sharedTasks !== undefined && { sharedTasks: options.sharedTasks }),
        ...(options.sharedShopping !== undefined && { sharedShopping: options.sharedShopping }),
      },
    },
  });
  if (changed.count === 0) throw new Error(`Family member ${memberId} not found`);

  const updated = await prisma.contact.findFirstOrThrow({ where: { id: memberId, entityId } });

  return contactToFamilyMember(updated, userId);
}

export async function getSharedItems(
  entityId: VerifiedEntityId,
  memberId: string
): Promise<{ tasks: boolean; calendar: boolean; shopping: boolean }> {
  const contact = await prisma.contact.findFirst({ where: { id: memberId, entityId } });
  if (!contact) {
    return { tasks: false, calendar: false, shopping: false };
  }

  const prefs = (contact.preferences ?? {}) as Record<string, unknown>;
  return {
    tasks: (prefs.sharedTasks as boolean) ?? false,
    calendar: (prefs.sharedCalendar as boolean) ?? false,
    shopping: (prefs.sharedShopping as boolean) ?? false,
  };
}
