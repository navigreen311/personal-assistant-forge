"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HouseholdInventoryTabProps {
  entityId?: string;
  property?: string;
  onRefresh?: () => void;
}

type Section = "warranties" | "subscriptions" | "inventory";

interface WarrantyItem {
  id: string;
  item: string;
  purchaseDate: string;
  warrantyExpires: string;
  status: "Active" | "Expiring Soon" | "Expired";
}

interface SubscriptionItem {
  id: string;
  service: string;
  cost: number;
  frequency: string;
  nextDue: string;
  autoRenew: boolean;
}

interface InventoryItem {
  id: string;
  name: string;
  location: string;
  value: number;
  hasPhoto: boolean;
}

// ---------------------------------------------------------------------------
// Demo Data
// ---------------------------------------------------------------------------

const DEMO_WARRANTIES: WarrantyItem[] = [
  {
    id: "w1",
    item: "Refrigerator",
    purchaseDate: "2023-03-15",
    warrantyExpires: "2027-03-15",
    status: "Active",
  },
  {
    id: "w2",
    item: "Washer/Dryer",
    purchaseDate: "2022-08-20",
    warrantyExpires: "2026-08-20",
    status: "Expiring Soon",
  },
  {
    id: "w3",
    item: "Roof",
    purchaseDate: "2020-06-01",
    warrantyExpires: "2030-06-01",
    status: "Active",
  },
];

const DEMO_SUBSCRIPTIONS: SubscriptionItem[] = [
  { id: "s1", service: "Netflix", cost: 15.99, frequency: "Monthly", nextDue: "2026-03-15", autoRenew: true },
  { id: "s2", service: "Lawn Service", cost: 75.0, frequency: "Monthly", nextDue: "2026-03-01", autoRenew: true },
  { id: "s3", service: "ADT Security", cost: 45.0, frequency: "Monthly", nextDue: "2026-03-10", autoRenew: true },
  { id: "s4", service: "Internet", cost: 79.99, frequency: "Monthly", nextDue: "2026-03-05", autoRenew: false },
];

const DEMO_INVENTORY: InventoryItem[] = [
  { id: "i1", name: "Living Room TV", location: "Living Room", value: 1200, hasPhoto: false },
  { id: "i2", name: "Kitchen Appliances", location: "Kitchen", value: 3500, hasPhoto: false },
  { id: "i3", name: "Bedroom Furniture Set", location: "Master Bedroom", value: 2800, hasPhoto: false },
  { id: "i4", name: "Home Office Equipment", location: "Office", value: 1950, hasPhoto: false },
  { id: "i5", name: "Washer & Dryer", location: "Laundry Room", value: 1800, hasPhoto: false },
  { id: "i6", name: "Patio Furniture", location: "Backyard", value: 1100, hasPhoto: false },
];

// ---------------------------------------------------------------------------
// Sub-tab definitions
// ---------------------------------------------------------------------------

const SECTIONS: { key: Section; label: string }[] = [
  { key: "warranties", label: "Warranties" },
  { key: "subscriptions", label: "Subscriptions" },
  { key: "inventory", label: "Home Inventory" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadge(status: WarrantyItem["status"]) {
  const styles: Record<WarrantyItem["status"], string> = {
    Active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    "Expiring Soon": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    Expired: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

function formatCurrency(amount: number) {
  return "$" + amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HouseholdInventoryTab({
  entityId: _entityId,
  property,
  onRefresh: _onRefresh,
}: HouseholdInventoryTabProps) {
  const [items] = useState<InventoryItem[]>(DEMO_INVENTORY);
  const [subscriptions] = useState<SubscriptionItem[]>(DEMO_SUBSCRIPTIONS);
  const [warranties] = useState<WarrantyItem[]>(DEMO_WARRANTIES);
  const [activeSection, setActiveSection] = useState<Section>("warranties");
  const [showAddForm, setShowAddForm] = useState(false);

  const filteredItems = property
    ? items.filter((i) => i.location.toLowerCase().includes(property.toLowerCase()))
    : items;

  const monthlyTotal = subscriptions.reduce((sum, s) => sum + s.cost, 0);
  const totalInsuredValue = filteredItems.reduce((sum, i) => sum + i.value, 0);

  return (
    <div className="space-y-6">
      {/* Sub-tab bar */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-6" aria-label="Inventory sections">
          {SECTIONS.map((section) => (
            <button
              key={section.key}
              onClick={() => {
                setActiveSection(section.key);
                setShowAddForm(false);
              }}
              className={`whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition ${
                activeSection === section.key
                  ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              }`}
            >
              {section.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Warranties */}
      {activeSection === "warranties" && (
        <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Warranties</h3>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700"
            >
              + Add Warranty
            </button>
          </div>

          {showAddForm && (
            <div className="border-b border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              Add warranty form placeholder — connect to your backend to persist records.
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  <th className="px-5 py-3">Item</th>
                  <th className="px-5 py-3">Purchase Date</th>
                  <th className="px-5 py-3">Warranty Expires</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {warranties.map((w) => (
                  <tr key={w.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-5 py-3 font-medium text-gray-900 dark:text-gray-100">{w.item}</td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{formatDate(w.purchaseDate)}</td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{formatDate(w.warrantyExpires)}</td>
                    <td className="px-5 py-3">{statusBadge(w.status)}</td>
                    <td className="px-5 py-3 text-right">
                      <button className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subscriptions */}
      {activeSection === "subscriptions" && (
        <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Subscriptions</h3>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700"
            >
              + Add Subscription
            </button>
          </div>

          {showAddForm && (
            <div className="border-b border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              Add subscription form placeholder — connect to your backend to persist records.
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  <th className="px-5 py-3">Service</th>
                  <th className="px-5 py-3">Cost</th>
                  <th className="px-5 py-3">Frequency</th>
                  <th className="px-5 py-3">Next Due</th>
                  <th className="px-5 py-3">Auto-renew</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {subscriptions.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-5 py-3 font-medium text-gray-900 dark:text-gray-100">{s.service}</td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{formatCurrency(s.cost)}</td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{s.frequency}</td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{formatDate(s.nextDue)}</td>
                    <td className="px-5 py-3">
                      {s.autoRenew ? (
                        <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                          Yes
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                          No
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Monthly total summary */}
          <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4 dark:border-gray-700">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Monthly Cost</span>
            <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
              {formatCurrency(monthlyTotal)}/mo
            </span>
          </div>
        </div>
      )}

      {/* Home Inventory */}
      {activeSection === "inventory" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Home Inventory
              {property && (
                <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-normal text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  Filtered: {property}
                </span>
              )}
            </h3>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700"
            >
              + Add Item
            </button>
          </div>

          {showAddForm && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              Add inventory item form placeholder — connect to your backend to persist records.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-gray-200 bg-white p-4 transition hover:shadow-md dark:border-gray-700 dark:bg-gray-900"
              >
                {/* Photo placeholder */}
                <div className="mb-3 flex h-32 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
                  <svg
                    className="h-10 w-10 text-gray-300 dark:text-gray-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>

                <h4 className="font-medium text-gray-900 dark:text-gray-100">{item.name}</h4>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.location}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                    {formatCurrency(item.value)}
                  </span>
                  <button className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                    Details
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Total insured value summary */}
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Total Insured Value ({filteredItems.length} items)
              </span>
              <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {formatCurrency(totalInsuredValue)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
