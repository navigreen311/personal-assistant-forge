"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface EntityOption {
  id: string;
  name: string;
  type: string;
}

type Period = "this_month" | "last_month" | "this_quarter" | "this_year" | "custom";

interface DashboardStats {
  totalIncome: number;
  totalExpenses: number;
  netCashFlow: number;
  totalPendingAR: number;
  totalOverdueAP: number;
  burnRate: number;
  runwayMonths: number;
  saasSpend: number;
  taxReserve: number;
}

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "this_year", label: "This Year" },
  { value: "custom", label: "Custom" },
];

const DEFAULT_STATS: DashboardStats = {
  totalIncome: 0,
  totalExpenses: 0,
  netCashFlow: 0,
  totalPendingAR: 0,
  totalOverdueAP: 0,
  burnRate: 0,
  runwayMonths: 0,
  saasSpend: 0,
  taxReserve: 0,
};

const SUB_PAGES = [
  {
    href: "/finance/invoices",
    icon: "\ud83d\udcc4",
    title: "Invoices",
    description: "Manage invoices & aging reports",
    quickAction: { label: "+ New Invoice", href: "/finance/invoices?action=new" },
  },
  {
    href: "/finance/expenses",
    icon: "\ud83d\udcb3",
    title: "Expenses",
    description: "Track & categorize expenses",
    quickAction: { label: "+ Add Expense", href: "/finance/expenses?action=new" },
  },
  {
    href: "/finance/budget",
    icon: "\ud83d\udcca",
    title: "Budget",
    description: "Budget planning & variance tracking",
    quickAction: null,
  },
  {
    href: "/finance/forecast",
    icon: "\ud83d\udcc8",
    title: "Forecast",
    description: "Cash flow projections & scenarios",
    quickAction: null,
  },
  {
    href: "/finance/renewals",
    icon: "\ud83d\udd04",
    title: "Renewals",
    description: "Subs & contracts tracker",
    quickAction: null,
  },
];

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function PageSkeleton() {
  const shimmer = "animate-pulse rounded bg-gray-200";

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className={`${shimmer} h-8 w-80`} />
        <div className={`${shimmer} h-4 w-96`} />
      </div>

      {/* Filters skeleton */}
      <div className="flex gap-4">
        <div className={`${shimmer} h-10 w-48`} />
        <div className={`${shimmer} h-10 w-40`} />
      </div>

      {/* Primary stats skeleton */}
      <div className="grid grid-cols-5 gap-4 rounded-lg bg-gray-900 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="text-center space-y-2">
            <div className="mx-auto h-3 w-20 rounded bg-gray-700 animate-pulse" />
            <div className="mx-auto h-6 w-24 rounded bg-gray-700 animate-pulse" />
          </div>
        ))}
      </div>

      {/* Secondary stats skeleton */}
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-4 space-y-2">
            <div className={`${shimmer} h-3 w-20`} />
            <div className={`${shimmer} h-6 w-28`} />
          </div>
        ))}
      </div>

      {/* Sub-page cards skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
            <div className={`${shimmer} h-10 w-10 rounded-lg`} />
            <div className={`${shimmer} h-5 w-24`} />
            <div className={`${shimmer} h-4 w-full`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsBarSkeleton() {
  return (
    <>
      <div className="grid grid-cols-5 gap-4 rounded-lg bg-gray-900 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="text-center space-y-2">
            <div className="mx-auto h-3 w-20 rounded bg-gray-700 animate-pulse" />
            <div className="mx-auto h-6 w-24 rounded bg-gray-700 animate-pulse" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-4 space-y-2">
            <div className="h-3 w-20 rounded bg-gray-200 animate-pulse" />
            <div className="h-6 w-28 rounded bg-gray-200 animate-pulse" />
          </div>
        ))}
      </div>
    </>
  );
}

export default function FinanceOverviewPage() {
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("this_month");
  const [stats, setStats] = useState<DashboardStats>(DEFAULT_STATS);
  const [pageLoading, setPageLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Fetch entities on mount ---
  useEffect(() => {
    async function fetchEntities() {
      try {
        const res = await fetch("/api/entities").catch(() => null);
        if (res?.ok) {
          const data = await res.json();
          const entityList: EntityOption[] = (data.data ?? []).map(
            (e: { id: string; name: string; type?: string }) => ({
              id: e.id,
              name: e.name,
              type: e.type ?? "Unknown",
            })
          );
          setEntities(entityList);
        }
      } catch {
        // Entities are optional - filter will just show All Entities
      } finally {
        setPageLoading(false);
      }
    }
    fetchEntities();
  }, []);

  // --- Fetch dashboard stats ---
  const fetchStats = useCallback(
    async (entityId: string, period: Period) => {
      setStatsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (entityId) params.set("entityId", entityId);
        params.set("period", period);

        const res = await fetch(`/api/finance/dashboard?${params.toString()}`);
        const json = await res.json();

        if (json.success && json.data) {
          const d = json.data;
          setStats({
            totalIncome: d.aggregated?.totalIncome ?? d.totalIncome ?? 0,
            totalExpenses: d.aggregated?.totalExpenses ?? d.totalExpenses ?? 0,
            netCashFlow: d.aggregated?.netCashFlow ?? d.netCashFlow ?? 0,
            totalPendingAR: d.aggregated?.totalPendingAR ?? d.totalPendingAR ?? 0,
            totalOverdueAP: d.aggregated?.totalOverdueAP ?? d.totalOverdueAP ?? 0,
            burnRate: d.burnRate ?? d.aggregated?.burnRate ?? 0,
            runwayMonths: d.runwayMonths ?? d.aggregated?.runwayMonths ?? 0,
            saasSpend: d.saasSpend ?? d.aggregated?.saasSpend ?? 0,
            taxReserve: d.taxReserve ?? d.aggregated?.taxReserve ?? 0,
          });
        } else {
          setError(json.error?.message ?? "Failed to load dashboard stats");
        }
      } catch {
        setError("Unable to reach the finance API. Showing default values.");
        setStats(DEFAULT_STATS);
      } finally {
        setStatsLoading(false);
      }
    },
    []
  );

  // --- Refetch stats when entity or period changes ---
  useEffect(() => {
    if (!pageLoading) {
      fetchStats(selectedEntity, selectedPeriod);
    }
  }, [selectedEntity, selectedPeriod, pageLoading, fetchStats]);

  // --- Full page loading ---
  if (pageLoading) {
    return <PageSkeleton />;
  }

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Financial Operations Center</h1>
        <p className="mt-1 text-sm text-gray-500">
          Multi-entity financial tracking, budgeting, and intelligence.
        </p>
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label
            htmlFor="entity-select"
            className="text-sm font-medium text-gray-700 whitespace-nowrap"
          >
            Entity:
          </label>
          <select
            id="entity-select"
            value={selectedEntity}
            onChange={(e) => setSelectedEntity(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[180px]"
          >
            <option value="">All Entities</option>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
                {entity.type ? ` (${entity.type})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="period-select"
            className="text-sm font-medium text-gray-700 whitespace-nowrap"
          >
            Period:
          </label>
          <select
            id="period-select"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value as Period)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[160px]"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 flex items-center justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => fetchStats(selectedEntity, selectedPeriod)}
            className="text-sm text-red-600 hover:text-red-700 font-medium underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Stats Bars */}
      {statsLoading ? (
        <StatsBarSkeleton />
      ) : (
        <>
          {/* Primary Stats Bar - 5 cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 rounded-lg bg-gray-900 p-4 text-white">
            <div className="text-center">
              <p className="text-xs text-gray-400">Total Income</p>
              <p className="text-lg font-bold text-green-400">${fmt(stats.totalIncome)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400">Total Expenses</p>
              <p className="text-lg font-bold text-red-400">${fmt(stats.totalExpenses)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400">Net Cash Flow</p>
              <p
                className={`text-lg font-bold ${
                  stats.netCashFlow >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                ${fmt(stats.netCashFlow)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400">Pending AR</p>
              <p className="text-lg font-bold text-amber-400">${fmt(stats.totalPendingAR)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400">Overdue AP</p>
              <p className="text-lg font-bold text-red-400">${fmt(stats.totalOverdueAP)}</p>
            </div>
          </div>

          {/* Secondary Stats Bar - 4 cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs font-medium text-gray-500">Burn Rate</p>
              <p className="mt-1 text-lg font-bold text-gray-700">
                ${fmt(stats.burnRate)}
                <span className="text-sm font-normal text-gray-400">/mo</span>
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs font-medium text-gray-500">Runway</p>
              <p
                className={`mt-1 text-lg font-bold ${
                  stats.runwayMonths < 3 ? "text-red-600" : "text-gray-700"
                }`}
              >
                {stats.runwayMonths}
                <span
                  className={`text-sm font-normal ${
                    stats.runwayMonths < 3 ? "text-red-400" : "text-gray-400"
                  }`}
                >
                  {" "}
                  months
                </span>
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs font-medium text-gray-500">SaaS Spend</p>
              <p className="mt-1 text-lg font-bold text-blue-600">
                ${fmt(stats.saasSpend)}
                <span className="text-sm font-normal text-blue-400">/mo</span>
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs font-medium text-gray-500">Tax Reserve</p>
              <p className="mt-1 text-lg font-bold text-green-600">${fmt(stats.taxReserve)}</p>
            </div>
          </div>
        </>
      )}

      {/* Sub-page Cards Grid - 5 cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {SUB_PAGES.map((page) => (
          <Link
            key={page.href}
            href={page.href}
            className="group relative rounded-lg border border-gray-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-md"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-xl group-hover:bg-blue-50">
              {page.icon}
            </div>
            <p className="font-semibold text-gray-900">{page.title}</p>
            <p className="mt-1 text-sm text-gray-500">{page.description}</p>

            {page.quickAction && (
              <Link
                href={page.quickAction.href}
                onClick={(e) => e.stopPropagation()}
                className="mt-3 inline-block rounded-md bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
              >
                {page.quickAction.label}
              </Link>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
