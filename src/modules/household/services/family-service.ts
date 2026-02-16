import { prisma } from '@/lib/db';
import type { FamilyMember } from '../types';

function contactToFamilyMember(contact: {
  id: string;
  entityId: string;
  name: string;
  email: string | null;
  phone: string | null;
  preferences: unknown;
}): FamilyMember {
  const prefs = (contact.preferences ?? {}) as Record<string, unknown>;
  return {
    id: contact.id,
    userId: contact.entityId,
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
  userId: string,
  member: Omit<FamilyMember, 'id'>
): Promise<FamilyMember> {
  const created = await prisma.contact.create({
    data: {
      entityId: userId,
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

  return contactToFamilyMember(created);
}

export async function getMembers(userId: string): Promise<FamilyMember[]> {
  const contacts = await prisma.contact.findMany({
    where: {
      entityId: userId,
      tags: { has: 'family' },
      deletedAt: null,
    },
  });

  return contacts.map(contactToFamilyMember);
}

export async function updateMemberPrivacy(
  memberId: string,
  visibility: string,
  options: { sharedCalendar?: boolean; sharedTasks?: boolean; sharedShopping?: boolean }
): Promise<FamilyMember> {
  const existing = await prisma.contact.findUnique({ where: { id: memberId } });
  if (!existing) throw new Error(`Family member ${memberId} not found`);

  const currentPrefs = (existing.preferences ?? {}) as Record<string, unknown>;
  const updated = await prisma.contact.update({
    where: { id: memberId },
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

  return contactToFamilyMember(updated);
}

export async function getSharedItems(
  userId: string,
  memberId: string
): Promise<{ tasks: boolean; calendar: boolean; shopping: boolean }> {
  const contact = await prisma.contact.findUnique({ where: { id: memberId } });
  if (!contact || contact.entityId !== userId) {
    return { tasks: false, calendar: false, shopping: false };
  }

  const prefs = (contact.preferences ?? {}) as Record<string, unknown>;
  return {
    tasks: (prefs.sharedTasks as boolean) ?? false,
    calendar: (prefs.sharedCalendar as boolean) ?? false,
    shopping: (prefs.sharedShopping as boolean) ?? false,
  };
}
