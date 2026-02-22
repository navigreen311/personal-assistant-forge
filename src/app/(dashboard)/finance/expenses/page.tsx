"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import type { Expense } from "@/modules/finance/types";

interface Entity { id: string; name: string; }
interface Project { id: string; name: string; }
type ExpenseStatus = "categorized" | "auto" | "review";

interface EnrichedExpense extends Expense {
  status: ExpenseStatus;
  paymentMethod?: string;
  reimbursable?: boolean;
  taxDeductible?: boolean;
  projectId?: string;
}

type SortKey = "date-desc" | "date-asc" | "amount-desc" | "amount-asc" | "vendor-asc";

const PERIODS = [
  { label: "This Month", value: "this-month" },
  { label: "Last Month", value: "last-month" },
  { label: "This Quarter", value: "this-quarter" },
  { label: "Last 6 Months", value: "6-months" },
  { label: "This Year", value: "this-year" },
] as const;

const CATEGORIES = [
  "All", "Software", "Office Supplies", "Travel", "Meals", "Marketing",
  "Payroll", "Utilities", "Insurance", "Professional Services", "Other",
];

const PAYMENT_METHODS = ["Credit Card", "Cash", "Transfer", "Check"];

function deriveStatus(expense: Expense): ExpenseStatus {
  if (!expense.category || expense.category === "") return "review";
  if (expense.tags?.includes("auto-categorized")) return "auto";
  return "categorized";
}

function getPeriodDates(period: string): { start: string; end: string } {
  const now = new Date();
  let start: Date;
  const end = now;
  switch (period) {
    case "last-month": { start = new Date(now.getFullYear(), now.getMonth() - 1, 1); break; }
    case "this-quarter": { const q = Math.floor(now.getMonth() / 3) * 3; start = new Date(now.getFullYear(), q, 1); break; }
    case "6-months": start = new Date(now.getFullYear(), now.getMonth() - 6, 1); break;
    case "this-year": start = new Date(now.getFullYear(), 0, 1); break;
    default: start = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

function StatusBadge({ status }: { status: ExpenseStatus }) {
  const styles: Record<ExpenseStatus, string> = {
    categorized: "bg-green-100 text-green-700",
    auto: "bg-blue-100 text-blue-700",
    review: "bg-amber-100 text-amber-700",
  };
  const labels: Record<ExpenseStatus, string> = {
    categorized: "Categorized", auto: "Auto", review: "Review",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status === "review" && (
        <svg className="mr-1 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )}
      {labels[status]}
    </span>
  );
}

function EntityPill({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
      {name}
    </span>
  );
}

function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-8 w-48 rounded bg-gray-200" />
        <div className="h-9 w-32 rounded bg-gray-200" />
      </div>
      <div className="mb-6 flex gap-4">
        <div className="h-10 w-48 rounded bg-gray-200" />
        <div className="h-10 w-48 rounded bg-gray-200" />
      </div>
      <div className="mb-6 grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (<div key={i} className="h-24 rounded-lg bg-gray-200" />))}
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (<div key={i} className="h-14 rounded bg-gray-200" />))}
      </div>
    </div>
  );
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<EnrichedExpense[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedEntityId, setSelectedEntityId] = useState<string>("all");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("this-month");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState<"all" | ExpenseStatus>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date-desc");

  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [fAmount, setFAmount] = useState<number>(0);
  const [fDate, setFDate] = useState(new Date().toISOString().slice(0, 10));
  const [fVendor, setFVendor] = useState("");
  const [fDescription, setFDescription] = useState("");
  const [fEntityId, setFEntityId] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fPaymentMethod, setFPaymentMethod] = useState("Credit Card");
  const [fReimbursable, setFReimbursable] = useState(false);
  const [fTaxDeductible, setFTaxDeductible] = useState(false);
  const [fProjectId, setFProjectId] = useState("");
  const [fIsRecurring, setFIsRecurring] = useState(false);
  const [fFrequency, setFFrequency] = useState("MONTHLY");
  const [fTagInput, setFTagInput] = useState("");
  const [fTags, setFTags] = useState<string[]>([]);
  const [fReceipt, setFReceipt] = useState<File | null>(null);

  useEffect(() => {
    fetch("/api/entities")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setEntities(data.data);
          if (data.data.length > 0) setFEntityId(data.data[0].id);
        }
      })
      .catch(() => {
        setEntities([{ id: "default-entity", name: "Default" }]);
        setFEntityId("default-entity");
      });
  }, []);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const entityParam = selectedEntityId === "all" ? "" : `&entityId=${selectedEntityId}`;
      const { start, end } = getPeriodDates(selectedPeriod);
      const res = await fetch(`/api/finance/expenses?page=1&pageSize=200${entityParam}&startDate=${start}&endDate=${end}`);
      const data = await res.json();
      if (data.success) {
        setExpenses((data.data ?? []).map((e: Expense) => ({ ...e, status: deriveStatus(e) })));
      } else {
        setError(data.error?.message ?? "Failed to load expenses");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [selectedEntityId, selectedPeriod]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  useEffect(() => {
    if (!fEntityId) return;
    fetch(`/api/projects?entityId=${fEntityId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) setProjects(data.data);
        else setProjects([]);
      })
      .catch(() => setProjects([]));
  }, [fEntityId]);

  const entityMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entities) m.set(e.id, e.name);
    return m;
  }, [entities]);

  const filteredExpenses = useMemo(() => {
    let result = [...expenses];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((e) =>
        e.vendor.toLowerCase().includes(q) || e.description.toLowerCase().includes(q) || e.category.toLowerCase().includes(q)
      );
    }
    if (categoryFilter !== "All") result = result.filter((e) => e.category === categoryFilter);
    if (statusFilter !== "all") result = result.filter((e) => e.status === statusFilter);
    result.sort((a, b) => {
      switch (sortKey) {
        case "date-asc": return new Date(a.date).getTime() - new Date(b.date).getTime();
        case "amount-desc": return b.amount - a.amount;
        case "amount-asc": return a.amount - b.amount;
        case "vendor-asc": return a.vendor.localeCompare(b.vendor);
        default: return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
    });
    return result;
  }, [expenses, searchQuery, categoryFilter, statusFilter, sortKey]);

  const totalThisMonth = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
  const pendingReviewCount = useMemo(() => expenses.filter((e) => e.status === "review").length, [expenses]);
  const uniqueCategories = useMemo(() => new Set(expenses.map((e) => e.category).filter(Boolean)).size, [expenses]);

  const resetForm = () => {
    setFAmount(0); setFDate(new Date().toISOString().slice(0, 10)); setFVendor(""); setFDescription("");
    setFEntityId(entities[0]?.id ?? ""); setFCategory(""); setFPaymentMethod("Credit Card");
    setFReimbursable(false); setFTaxDeductible(false); setFProjectId("");
    setFIsRecurring(false); setFFrequency("MONTHLY"); setFTagInput(""); setFTags([]); setFReceipt(null); setFormError(null);
  };

  const addTag = () => {
    const t = fTagInput.trim();
    if (t && !fTags.includes(t)) { setFTags([...fTags, t]); setFTagInput(""); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fEntityId) { setFormError("Entity is required"); return; }
    setFormLoading(true); setFormError(null);
    const payload = {
      entityId: fEntityId, amount: fAmount, currency: "USD", category: fCategory,
      vendor: fVendor, description: fDescription, date: new Date(fDate).toISOString(),
      paymentMethod: fPaymentMethod, reimbursable: fReimbursable, taxDeductible: fTaxDeductible,
      projectId: fProjectId || undefined, isRecurring: fIsRecurring,
      recurringFrequency: fIsRecurring ? fFrequency : undefined, tags: fTags,
    };
    try {
      const res = await fetch("/api/finance/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await res.json();
      if (result.success) {
        setExpenses((prev) => [{ ...result.data, status: deriveStatus(result.data) }, ...prev]);
        setShowForm(false); resetForm();
      } else { setFormError(result.error?.message ?? "Failed to create expense"); }
    } catch (err) { setFormError(err instanceof Error ? err.message : "Network error"); }
    finally { setFormLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this expense?")) return;
    try {
      const res = await fetch(`/api/finance/expenses/${id}`, { method: "DELETE" });
      const result = await res.json();
      if (result.success) setExpenses((prev) => prev.filter((e) => e.id !== id));
    } catch { /* silent */ }
  };

  if (loading && expenses.length === 0) return <LoadingSkeleton />;

  return (
    <div className="mx-auto max-w-7xl p-6">
      <Link href="/finance" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Finance
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
        <button
          onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          {showForm ? "Cancel" : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Expense
            </>
          )}
        </button>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <select value={selectedEntityId} onChange={(e) => setSelectedEntityId(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
          <option value="all">All Entities</option>
          {entities.map((ent) => (<option key={ent.id} value={ent.id}>{ent.name}</option>))}
        </select>
        <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
          {PERIODS.map((p) => (<option key={p.value} value={p.value}>{p.label}</option>))}
        </select>
      </div>

      {error && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={fetchExpenses} className="font-medium text-red-700 underline hover:text-red-800">Retry</button>
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Total This Month</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">${totalThisMonth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Pending Review</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{pendingReviewCount}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Categories</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{uniqueCategories}</p>
        </div>
      </div>

      {showForm && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">New Expense</h2>
          {formError && (<div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</div>)}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Amount *</label>
                <input type="number" value={fAmount || ""} onChange={(e) => setFAmount(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  min="0.01" step="0.01" required placeholder="0.00" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Date *</label>
                <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Vendor *</label>
                <input type="text" value={fVendor} onChange={(e) => setFVendor(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" required placeholder="Vendor name" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Description *</label>
              <input type="text" value={fDescription} onChange={(e) => setFDescription(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" required placeholder="What was this expense for?" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Entity <span className="text-red-500">*</span></label>
                <select value={fEntityId} onChange={(e) => setFEntityId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" required>
                  <option value="">Select entity...</option>
                  {entities.map((ent) => (<option key={ent.id} value={ent.id}>{ent.name}</option>))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
                <select value={fCategory} onChange={(e) => setFCategory(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="">Auto-categorize</option>
                  {CATEGORIES.filter((c) => c !== "All").map((c) => (<option key={c} value={c}>{c}</option>))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Receipt</label>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 hover:border-gray-400 hover:bg-gray-50">
                  <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {fReceipt ? fReceipt.name : "Upload receipt..."}
                  <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setFReceipt(e.target.files?.[0] ?? null)} />
                </label>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Payment Method</label>
                <select value={fPaymentMethod} onChange={(e) => setFPaymentMethod(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                  {PAYMENT_METHODS.map((m) => (<option key={m} value={m}>{m}</option>))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={fReimbursable} onChange={(e) => setFReimbursable(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  Reimbursable
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={fTaxDeductible} onChange={(e) => setFTaxDeductible(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  Tax Deductible
                </label>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">Project (optional)</label>
                <select value={fProjectId} onChange={(e) => setFProjectId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="">No project</option>
                  {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={fIsRecurring} onChange={(e) => setFIsRecurring(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  Recurring
                </label>
                {fIsRecurring && (
                  <select value={fFrequency} onChange={(e) => setFFrequency(e.target.value)}
                    className="rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                    <option value="QUARTERLY">Quarterly</option>
                    <option value="ANNUAL">Annual</option>
                  </select>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Tags</label>
                <div className="flex gap-2">
                  <input type="text" value={fTagInput} onChange={(e) => setFTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Add tag + Enter" />
                </div>
                {fTags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {fTags.map((tag) => (
                      <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                        {tag}
                        <button type="button" onClick={() => setFTags(fTags.filter((t) => t !== tag))} className="text-gray-400 hover:text-gray-600">&times;</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 border-t border-gray-100 pt-4">
              <button type="submit" disabled={formLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50">
                {formLoading ? "Saving..." : "Add Expense"}
              </button>
              <button type="button" onClick={() => { setShowForm(false); resetForm(); }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search vendor, description..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
          {CATEGORIES.map((c) => (<option key={c} value={c}>{c === "All" ? "All Categories" : c}</option>))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
          <option value="all">All Statuses</option>
          <option value="categorized">Categorized</option>
          <option value="auto">Auto</option>
          <option value="review">Review</option>
        </select>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
          <option value="date-desc">Newest First</option>
          <option value="date-asc">Oldest First</option>
          <option value="amount-desc">Highest Amount</option>
          <option value="amount-asc">Lowest Amount</option>
          <option value="vendor-asc">Vendor A-Z</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Vendor</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Description</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Entity</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Category</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Amount</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredExpenses.map((expense) => (
                <tr key={expense.id} className="transition-colors hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{new Date(expense.date).toLocaleDateString()}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">{expense.vendor}</td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-sm text-gray-600" title={expense.description}>{expense.description}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm"><EntityPill name={entityMap.get(expense.entityId) ?? expense.entityId} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{expense.category || (<span className="italic text-gray-400">Uncategorized</span>)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-gray-900">${expense.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-center"><StatusBadge status={expense.status} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {expense.status === "review" ? (
                      <button className="inline-flex items-center gap-1 rounded bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-200">Categorize</button>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <button className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600" title="Edit">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button onClick={() => handleDelete(expense.id)} className="rounded p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600" title="Delete">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredExpenses.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg className="mb-3 h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
            </svg>
            <p className="text-sm font-medium text-gray-500">No expenses found</p>
            <p className="mt-1 text-xs text-gray-400">
              {searchQuery || categoryFilter !== "All" || statusFilter !== "all"
                ? "Try adjusting your filters"
                : "Add your first expense to get started"}
            </p>
          </div>
        )}
      </div>

      {filteredExpenses.length > 0 && (
        <p className="mt-3 text-xs text-gray-500">
          Showing {filteredExpenses.length} of {expenses.length} expenses
        </p>
      )}
    </div>
  );
}
