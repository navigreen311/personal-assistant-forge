'use client';

import type { Invoice } from '@/modules/finance/types';

interface Props {
  invoices: Invoice[];
  onSelect?: (invoice: Invoice) => void;
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SENT: 'bg-blue-100 text-blue-700',
  VIEWED: 'bg-indigo-100 text-indigo-700',
  PAID: 'bg-green-100 text-green-700',
  OVERDUE: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-200 text-gray-500',
};

function daysAge(dueDate: Date): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24)));
}

export default function InvoiceTable({ invoices, onSelect }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-3">Number</th>
            <th className="px-4 py-3">Contact</th>
            <th className="px-4 py-3 text-right">Amount</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Due Date</th>
            <th className="px-4 py-3 text-right">Age (days)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {invoices.map((invoice) => (
            <tr
              key={invoice.id}
              className="cursor-pointer hover:bg-gray-50"
              onClick={() => onSelect?.(invoice)}
            >
              <td className="px-4 py-3 font-medium">{invoice.invoiceNumber}</td>
              <td className="px-4 py-3 text-gray-600">{invoice.contactId ?? '-'}</td>
              <td className="px-4 py-3 text-right font-medium">
                ${invoice.total.toLocaleString()}
              </td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[invoice.status] ?? ''}`}>
                  {invoice.status}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-600">
                {new Date(invoice.dueDate).toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-right text-gray-600">
                {daysAge(invoice.dueDate)}
              </td>
            </tr>
          ))}
          {invoices.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                No invoices found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
