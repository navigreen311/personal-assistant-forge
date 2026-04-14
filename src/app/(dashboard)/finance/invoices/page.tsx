'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useShadowPageMap } from '@/hooks/useShadowPageMap';
import InvoiceForm from '@/modules/finance/components/InvoiceForm';
import AgingBar from '@/modules/finance/components/AgingBar';
import type { Invoice, AgingReport } from '@/modules/finance/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_TABS = ['All', 'DRAFT', 'SENT', 'OVERDUE', 'PAID'] as const;

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SENT: 'bg-yellow-100 text-yellow-700',
  VIEWED: 'bg-indigo-100 text-indigo-700',
  PAID: 'bg-green-100 text-green-700',
  OVERDUE: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-200 text-gray-500',
};

interface Entity {
  id: string;
  name: string;
}

interface AutoActions {
  autoReminders: boolean;
  autoFollowUp: boolean;
  autoCall: boolean;
}

const AUTO_ACTIONS_KEY = 'invoices:autoActions';

function loadAutoActions(): AutoActions {
  if (typeof window === 'undefined')
    return { autoReminders: false, autoFollowUp: false, autoCall: false };
  try {
    const raw = localStorage.getItem(AUTO_ACTIONS_KEY);
    if (raw) return JSON.parse(raw) as AutoActions;
  } catch {
    /* ignore */
  }
  return { autoReminders: false, autoFollowUp: false, autoCall: false };
}

function saveAutoActions(actions: AutoActions) {
  try {
    localStorage.setItem(AUTO_ACTIONS_KEY, JSON.stringify(actions));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Skeleton Components
// ---------------------------------------------------------------------------

function StatCardSkeleton() {
  return <div className="h-20 animate-pulse rounded-lg bg-gray-200" />;
}

function TableRowSkeleton() {
  return (
    <tr>
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 animate-pulse rounded bg-gray-200" />
        </td>
      ))}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function InvoicesPage() {
  // Data state
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useShadowPageMap({
    pageId: 'finance.invoices',
    title: 'Invoices',
    description: 'Invoice list, aging, overdue tracking',
    visibleObjects: invoices.slice(0, 20).map((inv) => ({
      id: inv.id,
      type: 'invoice',
      label: `${inv.invoiceNumber ?? inv.id} — $${inv.total}`,
      status: inv.status,
      selector: `[data-invoice-id="${inv.id}"]`,
      deepLink: `/finance/invoices/${inv.id}`,
    })),
    availableActions: [
      { id: 'show_overdue', label: 'Overdue invoices', voiceTriggers: ['overdue invoices', 'show overdue'], confirmationLevel: 'none', reversible: true, blastRadius: 'self' },
      { id: 'create_invoice', label: 'Create invoice', voiceTriggers: ['create invoice', 'new invoice'], confirmationLevel: 'tap', reversible: true, blastRadius: 'self' },
      { id: 'send_reminder', label: 'Send payment reminder', voiceTriggers: ['send reminder', 'remind them', 'follow up on invoice'], confirmationLevel: 'confirm_phrase', reversible: false, blastRadius: 'external' },
    ],
    activeFilters: {},
    activeEntity: null,
  });
  const [aging, setAging] = useState<AgingReport | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);

  // UI state
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('All');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoActions, setAutoActions] = useState<AutoActions>(loadAutoActions);

  // ---------------------------------------------------------------------------
  // Fetch entities on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    fetch('/api/entities')
      .then((r) => r.json())
      .then((data) => {
        const list: Entity[] = data.success ? (data.data ?? []) : [];
        setEntities(list);
        if (list.length > 0 && !selectedEntityId) {
          setSelectedEntityId(list[0].id);
        }
      })
      .catch(() => {
        /* fallback */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Fetch invoices + aging whenever entity or status tab changes
  // ---------------------------------------------------------------------------
  const fetchData = useCallback(() => {
    if (!selectedEntityId) return;
    setLoading(true);

    const statusParam = activeTab === 'All' ? '' : `&status=${activeTab}`;

    Promise.all([
      fetch(
        `/api/finance/invoices?entityId=${selectedEntityId}&page=1&pageSize=50${statusParam}`
      ).then((r) => r.json()),
      fetch(`/api/finance/invoices/aging?entityId=${selectedEntityId}`).then((r) => r.json()),
    ])
      .then(([invData, agingData]) => {
        if (invData.success) setInvoices(invData.data ?? []);
        else setInvoices([]);
        if (agingData.success) setAging(agingData.data);
      })
      .catch(() => {
        setInvoices([]);
      })
      .finally(() => setLoading(false));
  }, [selectedEntityId, activeTab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------------------------------------------------------------------------
  // Derived stats
  // ---------------------------------------------------------------------------
  const totalAR = invoices
    .filter((inv) => inv.status !== 'PAID' && inv.status !== 'CANCELLED')
    .reduce((sum, inv) => sum + inv.total, 0);

  const overdueAmount = invoices
    .filter((inv) => inv.status === 'OVERDUE')
    .reduce((sum, inv) => sum + inv.total, 0);

  const paidInvoices = invoices.filter((inv) => inv.status === 'PAID');
  const avgDaysToPay =
    paidInvoices.length > 0
      ? Math.round(
          paidInvoices.reduce((sum, inv) => {
            const issued = new Date(inv.issuedDate).getTime();
            const paid = inv.paidDate ? new Date(inv.paidDate).getTime() : Date.now();
            return sum + (paid - issued) / (1000 * 60 * 60 * 24);
          }, 0) / paidInvoices.length
        )
      : 0;

  const now = new Date();
  const thisMonthCollected = paidInvoices
    .filter((inv) => {
      if (!inv.paidDate) return false;
      const d = new Date(inv.paidDate);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, inv) => sum + inv.total, 0);

  const filteredInvoices =
    activeTab === 'All' ? invoices : invoices.filter((inv) => inv.status === activeTab);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
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

  const handleAutoActionToggle = (key: keyof AutoActions) => {
    const updated = { ...autoActions, [key]: !autoActions[key] };
    setAutoActions(updated);
    saveAutoActions(updated);
  };

  const entityName = (eid: string) => entities.find((e) => e.id === eid)?.name ?? eid;

  // ---------------------------------------------------------------------------
  // Render: loading skeleton
  // ---------------------------------------------------------------------------
  if (loading && invoices.length === 0) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <Link
          href="/finance"
          className="mb-4 inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
        >
          &larr; Back to Finance
        </Link>

        <div className="mb-6 flex items-center justify-between">
          <div className="h-8 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-10 w-36 animate-pulse rounded bg-gray-200" />
        </div>

        <div className="mb-6 grid grid-cols-4 gap-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>

        <div className="rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <tbody>
              <TableRowSkeleton />
              <TableRowSkeleton />
              <TableRowSkeleton />
              <TableRowSkeleton />
              <TableRowSkeleton />
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: main page
  // ---------------------------------------------------------------------------
  return (
    <div className="mx-auto max-w-7xl p-6">
      {/* Back link */}
      <Link
        href="/finance"
        className="mb-4 inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
      >
        &larr; Back to Finance
      </Link>

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : '+ New Invoice'}
        </button>
      </div>

      {/* Entity Filter */}
      <div className="mb-6">
        <label htmlFor="entity-filter" className="mr-2 text-sm font-medium text-gray-700">
          Entity:
        </label>
        <select
          id="entity-filter"
          value={selectedEntityId}
          onChange={(e) => setSelectedEntityId(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {entities.length === 0 && <option value="">No entities</option>}
          {entities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.name}
            </option>
          ))}
        </select>
      </div>

      {/* Status Tabs */}
      <div className="mb-4 flex gap-1 border-b border-gray-200">
        {STATUS_TABS.map((tab) => {
          const count =
            tab === 'All'
              ? invoices.length
              : invoices.filter((inv) => inv.status === tab).length;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'All' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
              <span className="ml-1 text-xs text-gray-400">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Stats Bar: 4 cards */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        {/* Total AR (blue) */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-xs font-medium uppercase text-blue-600">Total AR</p>
          <p className="mt-1 text-2xl font-bold text-blue-900">${totalAR.toLocaleString()}</p>
        </div>

        {/* Overdue (red with dot) */}
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
            <p className="text-xs font-medium uppercase text-red-600">Overdue</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-red-900">
            ${overdueAmount.toLocaleString()}
          </p>
        </div>

        {/* Avg Days to Pay (gray) */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs font-medium uppercase text-gray-600">Avg Days to Pay</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{avgDaysToPay}</p>
        </div>

        {/* This Month Collected (green) */}
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-xs font-medium uppercase text-green-600">This Month Collected</p>
          <p className="mt-1 text-2xl font-bold text-green-900">
            ${thisMonthCollected.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Aging Report */}
      {aging && (
        <div className="mb-6">
          <AgingBar report={aging} />
        </div>
      )}

      {/* Inline Invoice Form */}
      {showForm && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold">New Invoice</h2>
          <InvoiceForm
            entityId={selectedEntityId}
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Invoice Table */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Invoice #</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Issued</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && invoices.length > 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-2 text-center text-xs text-gray-400">
                    Refreshing...
                  </td>
                </tr>
              )}
              {filteredInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3 text-gray-600">{inv.contactId ?? '-'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                      {entityName(inv.entityId)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    ${inv.total.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(inv.issuedDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(inv.dueDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        STATUS_BADGE[inv.status] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {inv.status === 'OVERDUE' ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          title="Send reminder email"
                          className="rounded p-1 text-gray-500 hover:bg-red-50 hover:text-red-600"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </button>
                        <button
                          title="Call client"
                          className="rounded p-1 text-gray-500 hover:bg-red-50 hover:text-red-600"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <button className="text-sm text-blue-600 hover:text-blue-800">View</button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredInvoices.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-sm text-gray-400">No invoices found</p>
                      <button
                        onClick={() => setShowForm(true)}
                        className="mt-1 text-sm text-blue-600 hover:text-blue-800"
                      >
                        Create your first invoice
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Auto-Actions Config */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Auto-Actions</h2>
        <p className="mb-4 text-sm text-gray-500">
          Configure automated workflows for invoice follow-up.
        </p>

        <div className="space-y-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={autoActions.autoReminders}
              onChange={() => handleAutoActionToggle('autoReminders')}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <p className="text-sm font-medium text-gray-900">Auto-send payment reminders</p>
              <p className="text-xs text-gray-500">
                Automatically email reminders at 7 days, 3 days, and 1 day before the due date.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={autoActions.autoFollowUp}
              onChange={() => handleAutoActionToggle('autoFollowUp')}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <p className="text-sm font-medium text-gray-900">
                Auto-draft follow-up for overdue
              </p>
              <p className="text-xs text-gray-500">
                Automatically draft a follow-up email when an invoice is overdue by more than 5
                days.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={autoActions.autoCall}
              onChange={() => handleAutoActionToggle('autoCall')}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <p className="text-sm font-medium text-gray-900">Auto-call via VoiceForge</p>
              <p className="text-xs text-gray-500">
                Trigger an automated phone call via VoiceForge when an invoice is overdue by more
                than 14 days.
              </p>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
