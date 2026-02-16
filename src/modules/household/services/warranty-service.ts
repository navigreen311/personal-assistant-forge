import { v4 as uuidv4 } from 'uuid';
import { addDays, isBefore, isAfter } from 'date-fns';
import type { WarrantyRecord, SubscriptionRecord } from '../types';

const warrantyStore = new Map<string, WarrantyRecord>();
const subscriptionStore = new Map<string, SubscriptionRecord>();

export async function addWarranty(
  userId: string,
  warranty: Omit<WarrantyRecord, 'id' | 'isExpiring' | 'isExpired'>
): Promise<WarrantyRecord> {
  const now = new Date();
  const endDate = new Date(warranty.warrantyEndDate);
  const newWarranty: WarrantyRecord = {
    ...warranty,
    id: uuidv4(),
    userId,
    isExpiring: isAfter(endDate, now) && isBefore(endDate, addDays(now, 30)),
    isExpired: isBefore(endDate, now),
  };
  warrantyStore.set(newWarranty.id, newWarranty);
  return newWarranty;
}

export async function getWarranties(userId: string): Promise<WarrantyRecord[]> {
  const now = new Date();
  return Array.from(warrantyStore.values())
    .filter(w => w.userId === userId)
    .map(w => {
      const endDate = new Date(w.warrantyEndDate);
      return {
        ...w,
        isExpiring: isAfter(endDate, now) && isBefore(endDate, addDays(now, 30)),
        isExpired: isBefore(endDate, now),
      };
    });
}

export async function getExpiringWarranties(userId: string, days: number): Promise<WarrantyRecord[]> {
  const now = new Date();
  const futureDate = addDays(now, days);
  return Array.from(warrantyStore.values())
    .filter(w => w.userId === userId)
    .filter(w => {
      const endDate = new Date(w.warrantyEndDate);
      return isAfter(endDate, now) && isBefore(endDate, futureDate);
    })
    .map(w => ({ ...w, isExpiring: true, isExpired: false }));
}

export async function addSubscription(
  userId: string,
  sub: Omit<SubscriptionRecord, 'id'>
): Promise<SubscriptionRecord> {
  const newSub: SubscriptionRecord = {
    ...sub,
    id: uuidv4(),
    userId,
  };
  subscriptionStore.set(newSub.id, newSub);
  return newSub;
}

export async function getSubscriptions(userId: string): Promise<SubscriptionRecord[]> {
  return Array.from(subscriptionStore.values()).filter(s => s.userId === userId);
}

export async function getMonthlySubscriptionCost(userId: string): Promise<number> {
  const subs = await getSubscriptions(userId);
  return subs
    .filter(s => s.isActive)
    .reduce((total, s) => {
      if (s.billingCycle === 'ANNUAL') return total + s.costPerMonth / 12;
      return total + s.costPerMonth;
    }, 0);
}

export async function getUpcomingRenewals(userId: string, days: number): Promise<SubscriptionRecord[]> {
  const now = new Date();
  const futureDate = addDays(now, days);
  return Array.from(subscriptionStore.values())
    .filter(s => s.userId === userId && s.isActive)
    .filter(s => {
      const renewalDate = new Date(s.renewalDate);
      return isAfter(renewalDate, now) && isBefore(renewalDate, futureDate);
    });
}
