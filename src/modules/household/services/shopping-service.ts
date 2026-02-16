import { generateJSON } from '@/lib/ai';
import { prisma } from '@/lib/db';
import type { ShoppingItem } from '../types';

function docToShoppingItem(doc: {
  id: string;
  entityId: string;
  content: string | null;
}): ShoppingItem {
  const data = doc.content ? JSON.parse(doc.content) : {};
  return {
    id: doc.id,
    userId: doc.entityId,
    name: data.name ?? '',
    category: data.category ?? '',
    quantity: data.quantity ?? 1,
    unit: data.unit,
    store: data.store,
    estimatedPrice: data.estimatedPrice,
    isPurchased: data.isPurchased ?? false,
    isRecurring: data.isRecurring ?? false,
    recurringFrequency: data.recurringFrequency,
    addedAt: data.addedAt ? new Date(data.addedAt) : new Date(),
  };
}

export async function addItem(
  userId: string,
  item: Omit<ShoppingItem, 'id' | 'isPurchased' | 'addedAt'>
): Promise<ShoppingItem> {
  const now = new Date();
  const created = await prisma.document.create({
    data: {
      title: item.name,
      entityId: userId,
      type: 'SHOPPING_LIST',
      status: 'ACTIVE',
      content: JSON.stringify({
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        store: item.store,
        estimatedPrice: item.estimatedPrice,
        isPurchased: false,
        isRecurring: item.isRecurring,
        recurringFrequency: item.recurringFrequency,
        addedAt: now.toISOString(),
      }),
    },
  });

  return docToShoppingItem(created);
}

export async function getList(userId: string, includePurchased = false): Promise<ShoppingItem[]> {
  const docs = await prisma.document.findMany({
    where: {
      entityId: userId,
      type: 'SHOPPING_LIST',
      deletedAt: null,
    },
  });

  const items: ShoppingItem[] = docs.map(docToShoppingItem);
  if (includePurchased) return items;
  return items.filter((i: ShoppingItem) => !i.isPurchased);
}

export async function markPurchased(itemId: string): Promise<ShoppingItem> {
  const existing = await prisma.document.findUnique({ where: { id: itemId } });
  if (!existing) throw new Error(`Shopping item ${itemId} not found`);

  const data = existing.content ? JSON.parse(existing.content) : {};
  data.isPurchased = true;

  const updated = await prisma.document.update({
    where: { id: itemId },
    data: {
      content: JSON.stringify(data),
    },
  });

  return docToShoppingItem(updated);
}

export async function getSmartSuggestions(userId: string): Promise<ShoppingItem[]> {
  const allItems = await getList(userId, true);

  const recurringPurchased = allItems.filter(i => i.isRecurring && i.isPurchased);
  const activeItems = allItems.filter(i => !i.isPurchased).map(i => i.name.toLowerCase());

  const suggestions: ShoppingItem[] = [];
  for (const item of recurringPurchased) {
    if (!activeItems.includes(item.name.toLowerCase())) {
      suggestions.push({
        ...item,
        id: `suggestion-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        isPurchased: false,
        addedAt: new Date(),
      });
    }
  }

  if (allItems.length > 0) {
    try {
      const purchaseHistory = allItems.map(i => ({
        name: i.name,
        category: i.category,
        isRecurring: i.isRecurring,
        isPurchased: i.isPurchased,
        store: i.store,
      }));

      const aiSuggestions = await generateJSON<{ items: { name: string; category: string; store?: string; reason: string }[] }>(
        `Analyze this shopping history and suggest items the user might need to buy.

Purchase history: ${JSON.stringify(purchaseHistory, null, 2)}
Currently on list: ${activeItems.join(', ') || 'nothing'}

Return a JSON object with:
- "items": array of { "name": string, "category": string, "store": string (optional), "reason": string }
Only suggest items NOT already on the active list. Focus on complementary items and commonly forgotten essentials.
Limit to 3-5 suggestions.`,
        {
          temperature: 0.6,
          system: 'You are a smart shopping assistant. Suggest practical items based on purchase patterns. Focus on commonly forgotten essentials and complementary items.',
        }
      );

      if (aiSuggestions.items) {
        for (const item of aiSuggestions.items) {
          if (!activeItems.includes(item.name.toLowerCase())) {
            suggestions.push({
              id: `suggestion-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              userId,
              name: item.name,
              category: item.category,
              quantity: 1,
              store: item.store,
              isPurchased: false,
              isRecurring: false,
              addedAt: new Date(),
            });
          }
        }
      }
    } catch {
      // Fall through with rule-based suggestions only
    }
  }

  return suggestions;
}

export function groupByStore(items: ShoppingItem[]): Record<string, ShoppingItem[]> {
  const groups: Record<string, ShoppingItem[]> = {};

  for (const item of items.filter(i => !i.isPurchased)) {
    const store = item.store ?? 'Unspecified';
    if (!groups[store]) groups[store] = [];
    groups[store].push(item);
  }

  return groups;
}
