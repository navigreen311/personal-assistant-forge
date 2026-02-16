'use client';

import type { ShoppingItem } from '../types';

export default function ShoppingList({ items }: { items: ShoppingItem[] }) {
  const unpurchased = items.filter(i => !i.isPurchased);
  const storeGroups: Record<string, ShoppingItem[]> = {};

  for (const item of unpurchased) {
    const store = item.store ?? 'Unspecified';
    if (!storeGroups[store]) storeGroups[store] = [];
    storeGroups[store].push(item);
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Shopping List ({unpurchased.length} items)</h3>
      {Object.entries(storeGroups).map(([store, storeItems]) => (
        <div key={store}>
          <h4 className="text-sm font-medium text-gray-700 mb-2">{store}</h4>
          <div className="space-y-1">
            {storeItems.map(item => (
              <div key={item.id} className="flex items-center justify-between py-2 px-3 border rounded">
                <div className="flex items-center gap-2">
                  <input type="checkbox" className="rounded" readOnly />
                  <span>{item.name}</span>
                  <span className="text-xs text-gray-400">x{item.quantity}{item.unit ? ` ${item.unit}` : ''}</span>
                </div>
                <div className="flex items-center gap-2">
                  {item.estimatedPrice && (
                    <span className="text-sm text-gray-500">${item.estimatedPrice.toFixed(2)}</span>
                  )}
                  {item.isRecurring && (
                    <span className="text-xs px-1 bg-blue-100 text-blue-700 rounded">recurring</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
