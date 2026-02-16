'use client';

import type { WarrantyRecord } from '../types';

export default function WarrantyTracker({ warranties }: { warranties: WarrantyRecord[] }) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Warranty Tracker</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {warranties.map(w => {
          const endDate = new Date(w.warrantyEndDate);
          const now = new Date();
          const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

          return (
            <div
              key={w.id}
              className={`border rounded-lg p-4 ${w.isExpired ? 'bg-gray-50 border-gray-300' : w.isExpiring ? 'bg-red-50 border-red-300' : 'border-gray-200'}`}
            >
              <div className="flex justify-between items-start">
                <div className="font-medium">{w.itemName}</div>
                {w.isExpired ? (
                  <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-700 rounded">Expired</span>
                ) : w.isExpiring ? (
                  <span className="text-xs px-2 py-0.5 bg-red-200 text-red-700 rounded">{daysLeft}d left</span>
                ) : (
                  <span className="text-xs px-2 py-0.5 bg-green-200 text-green-700 rounded">{daysLeft}d left</span>
                )}
              </div>
              <div className="text-sm text-gray-500 mt-2">
                <div>Provider: {w.provider}</div>
                <div>Purchased: {new Date(w.purchaseDate).toLocaleDateString()}</div>
                <div>Expires: {endDate.toLocaleDateString()}</div>
              </div>
              {w.claimPhone && <div className="text-xs text-blue-600 mt-2">Claim: {w.claimPhone}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
