'use client';

import { useEffect, useState } from 'react';
import InvoiceTable from '@/modules/finance/components/InvoiceTable';
import InvoiceForm from '@/modules/finance/components/InvoiceForm';
import AgingBar from '@/modules/finance/components/AgingBar';
import type { Invoice, AgingReport } from '@/modules/finance/types';

const STATUS_TABS = ['All', 'DRAFT', 'SENT', 'OVERDUE', 'PAID'] as const;

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [aging, setAging] = useState<AgingReport | null>(null);
  const [activeTab, setActiveTab] = useState<string>('All');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const entityId = 'default-entity';

  useEffect(() => {
    Promise.all([
      fetch(`/api/finance/invoices?entityId=${entityId}&page=1&pageSize=50`).then((r) => r.json()),
      fetch(`/api/finance/invoices/aging?entityId=${entityId}`).then((r) => r.json()),
    ])
      .then(([invData, agingData]) => {
        if (invData.success) setInvoices(invData.data ?? []);
        if (agingData.success) setAging(agingData.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered =
    activeTab === 'All' ? invoices : invoices.filter((inv) => inv.status === activeTab);

  const handleCreate = async (data: Record<string, unknown>) => {
    const res = await fetch('/api/finance/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (result.success) {
      setInvoices([result.data, ...invoices]);
      setShowForm(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading invoices...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : 'Create Invoice'}
        </button>
      </div>

      {/* Aging Report */}
      {aging && (
        <div className="mb-6">
          <AgingBar report={aging} />
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold">New Invoice</h2>
          <InvoiceForm
            entityId={entityId}
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Status Tabs */}
      <div className="mb-4 flex gap-1 border-b border-gray-200">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === tab
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Invoice Table */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <InvoiceTable invoices={filtered} />
      </div>
    </div>
  );
}
