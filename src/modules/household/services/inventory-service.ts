import { prisma } from '@/lib/db';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { InventoryItem } from '../types';

/**
 * Household inventory, stored on `Document` with `type = 'INVENTORY'`.
 *
 * Same shadow-table convention as warranties, vehicles and the shopping list;
 * see property-service.ts for why. The route this replaces held five hardcoded
 * appliances and filtered them with `(i) => i.userId === session.userId || true`
 * -- a tenancy check that could not fail.
 */

const DOCUMENT_TYPE = 'INVENTORY';

interface InventoryContent {
  itemName: string;
  propertyId: string;
  propertyName: string;
  category: InventoryItem['category'];
  purchaseDate: string;
  warrantyEndDate?: string;
  value: number;
  serialNumber?: string;
  modelNumber?: string;
  notes?: string;
}

function docToInventoryItem(
  doc: { id: string; content: string | null },
  userId: string
): InventoryItem {
  const data = (doc.content ? JSON.parse(doc.content) : {}) as Partial<InventoryContent>;
  return {
    id: doc.id,
    userId,
    itemName: data.itemName ?? '',
    propertyId: data.propertyId ?? '',
    propertyName: data.propertyName ?? '',
    category: data.category ?? 'OTHER',
    purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : new Date(0),
    warrantyEndDate: data.warrantyEndDate ? new Date(data.warrantyEndDate) : undefined,
    value: data.value ?? 0,
    serialNumber: data.serialNumber,
    modelNumber: data.modelNumber,
    notes: data.notes,
  };
}

export type InventoryDraft = Omit<InventoryItem, 'id' | 'userId'>;

export async function addInventoryItem(
  entityId: VerifiedEntityId,
  userId: string,
  item: InventoryDraft
): Promise<InventoryItem> {
  const content: InventoryContent = {
    itemName: item.itemName,
    propertyId: item.propertyId,
    propertyName: item.propertyName,
    category: item.category,
    purchaseDate: new Date(item.purchaseDate).toISOString(),
    warrantyEndDate: item.warrantyEndDate
      ? new Date(item.warrantyEndDate).toISOString()
      : undefined,
    value: item.value,
    serialNumber: item.serialNumber,
    modelNumber: item.modelNumber,
    notes: item.notes,
  };

  const created = await prisma.document.create({
    data: {
      title: item.itemName,
      entityId,
      type: DOCUMENT_TYPE,
      status: 'ACTIVE',
      content: JSON.stringify(content),
    },
  });

  return docToInventoryItem(created, userId);
}

export async function getInventory(
  entityId: VerifiedEntityId,
  userId: string,
  filters: { propertyId?: string; category?: string } = {}
): Promise<InventoryItem[]> {
  const docs = await prisma.document.findMany({
    // Scope applied here and unconditionally; the caller-supplied filters below
    // narrow the result and can never widen it.
    where: { entityId, type: DOCUMENT_TYPE, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });

  let items = docs.map((doc) => docToInventoryItem(doc, userId));
  if (filters.propertyId) {
    items = items.filter((i) => i.propertyId === filters.propertyId);
  }
  if (filters.category) {
    items = items.filter((i) => i.category === filters.category);
  }
  return items;
}
