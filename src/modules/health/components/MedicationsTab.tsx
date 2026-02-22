"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: "Daily" | "Twice daily" | "Weekly" | "As needed";
  times: string[];
  refillDate: string;
  notes?: string;
}

interface TakenEntry {
  medicationId: string;
  time: string;
}

interface MedicationsTabProps {
  entityId?: string;
  period?: string;
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const DEMO_MEDICATIONS: Medication[] = [
  {
    id: "med-1",
    name: "Lisinopril",
    dosage: "10 mg",
    frequency: "Daily",
    times: ["08:00"],
    refillDate: "2026-03-01",
    notes: "Take with water on empty stomach",
  },
  {
    id: "med-2",
    name: "Vitamin D3",
    dosage: "5000 IU",
    frequency: "Daily",
    times: ["08:00"],
    refillDate: "2026-04-15",
    notes: "Take with food for better absorption",
  },
  {
    id: "med-3",
    name: "Magnesium Glycinate",
    dosage: "400 mg",
    frequency: "Twice daily",
    times: ["08:00", "20:00"],
    refillDate: "2026-02-28",
  },
  {
    id: "med-4",
    name: "Omega-3 Fish Oil",
    dosage: "1000 mg",
    frequency: "Daily",
    times: ["12:00"],
    refillDate: "2026-05-10",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatTime(time24: string): string {
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr ?? "0", 10);
  const m = mStr ?? "00";
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function currentHourMinute(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="h-7 w-64 bg-gray-200 rounded" />
        <div className="h-9 w-36 bg-gray-200 rounded" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 bg-gray-100 rounded-lg" />
        ))}
      </div>
      <div className="h-40 bg-gray-100 rounded-lg" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="text-center py-16 space-y-4">
      <div className="text-5xl">🔊</div>
      <h3 className="text-lg font-semibold text-gray-700">No medications tracked yet</h3>
      <p className="text-sm text-gray-500 max-w-sm mx-auto">
        Start tracking your medications and supplements to get reminders and refill alerts.
      </p>
      <button
        onClick={onAdd}
        className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
      >
        + Add Medication
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Medication Modal
// ---------------------------------------------------------------------------

interface AddModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (med: Medication) => void;
}

function AddMedicationModal({ open, onClose, onSubmit }: AddModalProps) {
  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [frequency, setFrequency] = useState<Medication["frequency"]>("Daily");
  const [times, setTimes] = useState("08:00");
  const [refillDate, setRefillDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const newMed: Medication = {
      id: `med-${Date.now()}`,
      name,
      dosage,
      frequency,
      times: times.split(",").map((t) => t.trim()),
      refillDate,
      notes: notes || undefined,
    };

    // Placeholder: POST /api/health/medications
    // await fetch("/api/health/medications", { method: "POST", body: JSON.stringify(newMed) });
    try {
      onSubmit(newMed);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Add Medication</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Lisinopril"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dosage</label>
            <input
              required
              value={dosage}
              onChange={(e) => setDosage(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. 10 mg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Medication["frequency"])}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option>Daily</option>
              <option>Twice daily</option>
              <option>Weekly</option>
              <option>As needed</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Time(s) of day</label>
            <input
              required
              value={times}
              onChange={(e) => setTimes(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. 08:00, 20:00"
            />
            <p className="text-xs text-gray-400 mt-0.5">Comma-separated for multiple times</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Refill Date</label>
            <input
              type="date"
              required
              value={refillDate}
              onChange={(e) => setRefillDate(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Any additional notes..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Saving..." : "Save Medication"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function MedicationsTab({ entityId: _entityId, period: _period }: MedicationsTabProps) {
  const [medications, setMedications] = useState<Medication[]>(DEMO_MEDICATIONS);
  const [takenToday, setTakenToday] = useState<TakenEntry[]>([]);
  const [loading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // ----- loading state -----
  if (loading) return <LoadingSkeleton />;

  // ----- empty state -----
  if (medications.length === 0) {
    return (
      <>
        <EmptyState onAdd={() => setShowModal(true)} />
        <AddMedicationModal
          open={showModal}
          onClose={() => setShowModal(false)}
          onSubmit={(med) => setMedications((prev) => [...prev, med])}
        />
      </>
    );
  }

  // ----- mark as taken -----
  const handleMarkTaken = async (medId: string, time: string) => {
    // Placeholder: POST /api/health/medications/{id}/taken
    // await fetch(`/api/health/medications/${medId}/taken`, { method: "POST" });
    setTakenToday((prev) => [...prev, { medicationId: medId, time }]);
  };

  const isTaken = (medId: string, time: string) =>
    takenToday.some((e) => e.medicationId === medId && e.time === time);

  // ----- build today's reminders -----
  const nowTime = currentHourMinute();
  const reminders = medications
    .flatMap((med) =>
      med?.times?.map((time) => ({
        medId: med.id,
        name: med?.name ?? "Unknown",
        dosage: med?.dosage ?? "",
        time,
        taken: isTaken(med.id, time),
      })) ?? [],
    )
    .sort((a, b) => a.time.localeCompare(b.time));

  // ----- refill alerts -----
  const refillAlerts = medications
    .filter((med) => {
      const days = daysUntil(med?.refillDate ?? "");
      return days <= 14;
    })
    .map((med) => ({
      ...med,
      daysLeft: daysUntil(med?.refillDate ?? ""),
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Medications &amp; Supplements</h2>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Add Medication
        </button>
      </div>

      {/* Medications table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="pb-2 pr-4 font-medium">Name</th>
              <th className="pb-2 pr-4 font-medium">Dosage</th>
              <th className="pb-2 pr-4 font-medium">Frequency</th>
              <th className="pb-2 pr-4 font-medium">Time</th>
              <th className="pb-2 pr-4 font-medium">Refill Date</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {medications.map((med) => {
              const days = daysUntil(med?.refillDate ?? "");
              const refillSoon = days <= 14;

              return (
                <tr key={med?.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-3 pr-4 font-medium">{med?.name}</td>
                  <td className="py-3 pr-4 text-gray-600">{med?.dosage}</td>
                  <td className="py-3 pr-4 text-gray-600">{med?.frequency}</td>
                  <td className="py-3 pr-4 text-gray-600">
                    {med?.times?.map((t) => formatTime(t)).join(", ")}
                  </td>
                  <td
                    className={`py-3 pr-4 ${refillSoon ? "text-red-600 font-semibold" : "text-gray-600"}`}
                  >
                    {med?.refillDate
                      ? new Date(med.refillDate).toLocaleDateString()
                      : "-"}
                    {refillSoon && (
                      <span className="ml-1 text-xs">
                        ({days <= 0 ? "Overdue" : `${days}d`})
                      </span>
                    )}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          handleMarkTaken(med.id, med?.times?.[0] ?? "00:00")
                        }
                        disabled={isTaken(med.id, med?.times?.[0] ?? "00:00")}
                        title="Mark taken today"
                        className={`p-1.5 rounded transition-colors ${
                          isTaken(med.id, med?.times?.[0] ?? "00:00")
                            ? "bg-green-100 text-green-600"
                            : "bg-gray-100 text-gray-500 hover:bg-green-50 hover:text-green-600"
                        }`}
                      >
                        {"\u2713"}
                      </button>
                      <button
                        title="Edit medication"
                        className="p-1.5 rounded bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                      >
                        {"\u270E"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Today's Reminders */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Today&apos;s Reminders</h3>
        <div className="space-y-2">
          {reminders.length === 0 && (
            <p className="text-sm text-gray-500">No reminders scheduled for today.</p>
          )}
          {reminders.map((rem, idx) => {
            const isPast = rem.time < nowTime;

            let statusClass = "";
            let statusIcon = "";

            if (rem.taken) {
              statusClass = "text-green-600 line-through";
              statusIcon = "\u2705";
            } else if (isPast) {
              statusClass = "text-amber-600";
              statusIcon = "\u26A0\uFE0F";
            } else {
              statusClass = "text-gray-700";
              statusIcon = "\u2B1C";
            }

            return (
              <div
                key={`${rem.medId}-${rem.time}-${idx}`}
                className={`flex items-center justify-between border rounded-lg px-4 py-3 ${
                  rem.taken
                    ? "bg-green-50 border-green-200"
                    : isPast
                      ? "bg-amber-50 border-amber-200"
                      : "bg-white border-gray-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{statusIcon}</span>
                  <div>
                    <span className={`font-medium ${statusClass}`}>
                      {rem?.name} - {rem?.dosage}
                    </span>
                    <div className="text-xs text-gray-500">{formatTime(rem.time)}</div>
                  </div>
                </div>
                {!rem.taken && (
                  <button
                    onClick={() => handleMarkTaken(rem.medId, rem.time)}
                    className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Mark Taken
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Refill Alerts */}
      {refillAlerts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Refill Alerts</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {refillAlerts.map((med) => (
              <div
                key={med?.id}
                className={`border rounded-lg p-4 ${
                  (med?.daysLeft ?? 0) <= 3
                    ? "bg-red-50 border-red-200"
                    : "bg-amber-50 border-amber-200"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">{med?.name}</div>
                    <div className="text-sm text-gray-600">{med?.dosage}</div>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      (med?.daysLeft ?? 0) <= 3
                        ? "bg-red-200 text-red-800"
                        : "bg-amber-200 text-amber-800"
                    }`}
                  >
                    {(med?.daysLeft ?? 0) <= 0
                      ? "Overdue"
                      : `${med?.daysLeft} day${((med?.daysLeft ?? 0) === 1 ? "" : "s")} left`}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Refill by:{" "}
                  {med?.refillDate
                    ? new Date(med.refillDate).toLocaleDateString()
                    : "-"}
                </div>
                <div className="flex gap-2 mt-3">
                  <button className="flex-1 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                    Auto-order
                  </button>
                  <button className="flex-1 px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                    Set reminder
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Medication Modal */}
      <AddMedicationModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={(med) => setMedications((prev) => [...prev, med])}
      />
    </div>
  );
}
