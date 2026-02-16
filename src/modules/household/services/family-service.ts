import { v4 as uuidv4 } from 'uuid';
import type { FamilyMember } from '../types';

const familyStore = new Map<string, FamilyMember>();

export async function addMember(
  userId: string,
  member: Omit<FamilyMember, 'id'>
): Promise<FamilyMember> {
  const newMember: FamilyMember = {
    ...member,
    id: uuidv4(),
    userId,
  };
  familyStore.set(newMember.id, newMember);
  return newMember;
}

export async function getMembers(userId: string): Promise<FamilyMember[]> {
  return Array.from(familyStore.values()).filter(m => m.userId === userId);
}

export async function updateMemberPrivacy(
  memberId: string,
  visibility: string,
  options: { sharedCalendar?: boolean; sharedTasks?: boolean; sharedShopping?: boolean }
): Promise<FamilyMember> {
  const member = familyStore.get(memberId);
  if (!member) throw new Error(`Family member ${memberId} not found`);

  member.visibility = visibility as FamilyMember['visibility'];
  if (options.sharedCalendar !== undefined) member.sharedCalendar = options.sharedCalendar;
  if (options.sharedTasks !== undefined) member.sharedTasks = options.sharedTasks;
  if (options.sharedShopping !== undefined) member.sharedShopping = options.sharedShopping;

  familyStore.set(memberId, member);
  return member;
}

export async function getSharedItems(
  userId: string,
  memberId: string
): Promise<{ tasks: boolean; calendar: boolean; shopping: boolean }> {
  const member = familyStore.get(memberId);
  if (!member || member.userId !== userId) {
    return { tasks: false, calendar: false, shopping: false };
  }

  return {
    tasks: member.sharedTasks,
    calendar: member.sharedCalendar,
    shopping: member.sharedShopping,
  };
}
