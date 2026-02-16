import { addDays, isBefore, isAfter } from 'date-fns';
import { prisma } from '@/lib/db';
import type { WarrantyRecord, SubscriptionRecord } from '../types';

function docToWarranty(doc: {
  id: string;
  entityId: string;
  content: string | null;
}): WarrantyRecord {
  const data = doc.content ? JSON.parse(doc.content) : {};
  const now = new Date();
  const endDate = data.warrantyEndDate ? new Date(data.warrantyEndDate) : new Date();
  return {
    id: doc.id,
    userId: doc.entityId,
    itemName: data.itemName ?? '',
    purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : new Date(),
    warrantyEndDate: endDate,
    provider: data.provider ?? '',
    receiptUrl: data.receiptUrl,
    claimPhone: data.claimPhone,
    isExpiring: isAfter(endDate, now) && isBefore(endDate, addDays(now, 30)),
    isExpired: isBefore(endDate, now),
    notes: data.notes,
  };
}

function docToSubscription(doc: {
  id: string;
  entityId: string;
  content: string | null;
}): SubscriptionRecord {
  const data = doc.content ? JSON.parse(doc.content) : {};
  return {
    id: doc.id,
    userId: doc.entityId,
    name: data.name ?? '',
    costPerMonth: data.costPerMonth ?? 0,
    billingCycle: data.billingCycle ?? 'MONTHLY',
    renewalDate: data.renewalDate ? new Date(data.renewalDate) : new Date(),
    category: data.category ?? '',
    isActive: data.isActive ?? true,
    autoRenew: data.autoRenew ?? false,
    cancellationUrl: data.cancellationUrl,
  };
}

export async function addWarranty(
  userId: string,
  warranty: Omit<WarrantyRecord, 'id' | 'isExpiring' | 'isExpired'>
): Promise<WarrantyRecord> {
  const created = await prisma.document.create({
    data: {
      title: warranty.itemName,
      entityId: userId,
      type: 'WARRANTY',
      status: 'ACTIVE',
      content: JSON.stringify({
        itemName: warranty.itemName,
        purchaseDate: new Date(warranty.purchaseDate).toISOString(),
        warrantyEndDate: new Date(warranty.warrantyEndDate).toISOString(),
        provider: warranty.provider,
        receiptUrl: warranty.receiptUrl,
        claimPhone: warranty.claimPhone,
        notes: warranty.notes,
      }),
    },
  });

  return docToWarranty(created);
}

export async function getWarranties(userId: string): Promise<WarrantyRecord[]> {
  const docs = await prisma.document.findMany({
    where: {
      entityId: userId,
      type: 'WARRANTY',
      deletedAt: null,
    },
  });

  return docs.map(docToWarranty);
}

export async function getExpiringWarranties(userId: string, days: number): Promise<WarrantyRecord[]> {
  const now = new Date();
  const futureDate = addDays(now, days);

  const docs = await prisma.document.findMany({
    where: {
      entityId: userId,
      type: 'WARRANTY',
      deletedAt: null,
    },
  });

  const warranties: WarrantyRecord[] = docs.map(docToWarranty);
  return warranties
    .filter((w: WarrantyRecord) => {
      const endDate = new Date(w.warrantyEndDate);
      return isAfter(endDate, now) && isBefore(endDate, futureDate);
    })
    .map((w: WarrantyRecord) => ({ ...w, isExpiring: true, isExpired: false }));
}

export async function addSubscription(
  userId: string,
  sub: Omit<SubscriptionRecord, 'id'>
): Promise<SubscriptionRecord> {
  const created = await prisma.document.create({
    data: {
      title: sub.name,
      entityId: userId,
      type: 'SUBSCRIPTION',
      status: 'ACTIVE',
      content: JSON.stringify({
        name: sub.name,
        costPerMonth: sub.costPerMonth,
        billingCycle: sub.billingCycle,
        renewalDate: new Date(sub.renewalDate).toISOString(),
        category: sub.category,
        isActive: sub.isActive,
        autoRenew: sub.autoRenew,
        cancellationUrl: sub.cancellationUrl,
      }),
    },
  });

  return docToSubscription(created);
}

export async function getSubscriptions(userId: string): Promise<SubscriptionRecord[]> {
  const docs = await prisma.document.findMany({
    where: {
      entityId: userId,
      type: 'SUBSCRIPTION',
      deletedAt: null,
    },
  });

  return docs.map(docToSubscription);
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
  const subs = await getSubscriptions(userId);

  return subs
    .filter(s => s.isActive)
    .filter(s => {
      const renewalDate = new Date(s.renewalDate);
      return isAfter(renewalDate, now) && isBefore(renewalDate, futureDate);
    });
}
