import { v4 as uuidv4 } from 'uuid';
import type { ShoppingItem } from '../types';

const shoppingStore = new Map<string, ShoppingItem>();

export async function addItem(
  userId: string,
  item: Omit<ShoppingItem, 'id' | 'isPurchased' | 'addedAt'>
): Promise<ShoppingItem> {
  const newItem: ShoppingItem = {
    ...item,
    id: uuidv4(),
    userId,
    isPurchased: false,
    addedAt: new Date(),
  };
  shoppingStore.set(newItem.id, newItem);
  return newItem;
}

export async function getList(userId: string, includePurchased = false): Promise<ShoppingItem[]> {
  const all = Array.from(shoppingStore.values()).filter(i => i.userId === userId);
  if (includePurchased) return all;
  return all.filter(i => !i.isPurchased);
}

export async function markPurchased(itemId: string): Promise<ShoppingItem> {
  const item = shoppingStore.get(itemId);
  if (!item) throw new Error(`Shopping item ${itemId} not found`);

  item.isPurchased = true;
  shoppingStore.set(itemId, item);
  return item;
}

export async function getSmartSuggestions(userId: string): Promise<ShoppingItem[]> {
  const allItems = Array.from(shoppingStore.values()).filter(i => i.userId === userId);

  // Find recurring items that have been purchased but not re-added
  const recurringPurchased = allItems.filter(i => i.isRecurring && i.isPurchased);
  const activeItems = allItems.filter(i => !i.isPurchased).map(i => i.name.toLowerCase());

  const suggestions: ShoppingItem[] = [];
  for (const item of recurringPurchased) {
    if (!activeItems.includes(item.name.toLowerCase())) {
      suggestions.push({
        ...item,
        id: uuidv4(),
        isPurchased: false,
        addedAt: new Date(),
      });
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
