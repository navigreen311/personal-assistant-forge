'use client';

import type { ManagedNumber } from '@/modules/voiceforge/types';

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  SUSPENDED: 'bg-yellow-100 text-yellow-700',
  RELEASED: 'bg-red-100 text-red-700',
};

interface NumberInventoryProps {
  numbers: ManagedNumber[];
  onRelease?: (numberId: string) => void;
}

export function NumberInventory({ numbers, onRelease }: NumberInventoryProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Number</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Label</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Capabilities</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rate</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {numbers.map((num) => (
            <tr key={num.id}>
              <td className="px-4 py-3 text-sm font-mono text-gray-900">{num.phoneNumber}</td>
              <td className="px-4 py-3 text-sm text-gray-700">{num.label}</td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[num.status] ?? ''}`}>
                  {num.status}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-gray-600">{num.capabilities.join(', ')}</td>
              <td className="px-4 py-3 text-sm text-gray-700">${num.monthlyRate}/mo</td>
              <td className="px-4 py-3">
                {num.status === 'ACTIVE' && onRelease && (
                  <button
                    onClick={() => onRelease(num.id)}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Release
                  </button>
                )}
              </td>
            </tr>
          ))}
          {numbers.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                No phone numbers provisioned
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
