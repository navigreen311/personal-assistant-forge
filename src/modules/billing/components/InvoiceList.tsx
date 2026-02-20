'use client';

import type { BillingInvoice } from '@/modules/billing/types';

// --- Props ---

interface InvoiceListProps {
  invoices: BillingInvoice[];
  loading?: boolean;
  error?: string | null;
}

// --- Status Colors ---

const statusStyles: Record<BillingInvoice['status'], string> = {
  paid: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-700',
};

// --- Skeleton ---

function InvoiceSkeletonRow() {
  return (
    <tr className="border-t border-gray-100">
      <td className="px-4 py-3">
        <div className="animate-pulse h-4 w-20 bg-gray-200 rounded" />
      </td>
      <td className="px-4 py-3">
        <div className="animate-pulse h-4 w-24 bg-gray-200 rounded" />
      </td>
      <td className="px-4 py-3">
        <div className="animate-pulse h-4 w-16 bg-gray-200 rounded" />
      </td>
      <td className="px-4 py-3">
        <div className="animate-pulse h-4 w-14 bg-gray-200 rounded" />
      </td>
      <td className="px-4 py-3 text-right">
        <div className="animate-pulse h-4 w-16 bg-gray-200 rounded ml-auto" />
      </td>
    </tr>
  );
}

function InvoiceListSkeleton() {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden shadow-md">
      <table className="w-full text-sm" aria-label="Payment history loading">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Invoice</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Amount</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
            <th className="text-right px-4 py-3 font-medium text-gray-600">Action</th>
          </tr>
        </thead>
        <tbody>
          <InvoiceSkeletonRow />
          <InvoiceSkeletonRow />
          <InvoiceSkeletonRow />
        </tbody>
      </table>
    </div>
  );
}

// --- Component ---

export default function InvoiceList({ invoices, loading, error }: InvoiceListProps) {
  if (loading) {
    return <InvoiceListSkeleton />;
  }

  return (
    <div>
      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="border border-gray-200 rounded-lg overflow-hidden shadow-md">
        <table className="w-full text-sm" aria-label="Payment history">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Invoice</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Amount</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Action</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                  No invoices yet.
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-900">{inv.id}</td>
                  <td className="px-4 py-3 text-gray-700">{inv.date}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{inv.amount}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full capitalize ${statusStyles[inv.status]}`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className="text-xs text-blue-500 hover:text-blue-700 hover:underline transition-colors"
                      onClick={() => {
                        const url = inv.downloadUrl ?? `/api/finance/invoices/${inv.id}/download`;
                        window.open(url, '_blank');
                      }}
                    >
                      Download
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { InvoiceListSkeleton };
