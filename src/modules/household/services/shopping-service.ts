import { v4 as uuidv4 } from 'uuid';
import { generateJSON } from '@/lib/ai';
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

  // Use AI to analyze purchase patterns and suggest additional items
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
              id: uuidv4(),
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
