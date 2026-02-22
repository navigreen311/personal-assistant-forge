'use client';

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AppointmentType = 'Checkup' | 'Specialist' | 'Dental' | 'Vision' | 'Lab' | 'Other';

interface Appointment {
  id: string;
  date: string;
  provider: string;
  type: AppointmentType;
  prep?: string;
  confirmed: boolean;
}

interface OverdueCheckup {
  id: string;
  label: string;
  lastDate: string;
  overdueMonths: number;
}

interface ScheduleForm {
  provider: string;
  type: AppointmentType;
  preferredDate: string;
  notes: string;
  autoSchedule: boolean;
  addToCalendar: boolean;
  requestRecords: boolean;
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const DEMO_APPOINTMENTS: Appointment[] = [
  {
    id: 'appt-1',
    date: '2026-03-05T09:00:00',
    provider: 'Dr. Sarah Chen — Primary Care',
    type: 'Checkup',
    prep: "Fasting req'd (12h)",
    confirmed: true,
  },
  {
    id: 'appt-2',
    date: '2026-03-12T14:30:00',
    provider: 'Dr. James Rivera — Cardiology',
    type: 'Specialist',
    prep: 'Bring prior ECG results',
    confirmed: false,
  },
  {
    id: 'appt-3',
    date: '2026-03-18T10:00:00',
    provider: 'Bright Smiles Dental',
    type: 'Dental',
    confirmed: true,
  },
  {
    id: 'appt-4',
    date: '2026-04-02T11:15:00',
    provider: 'Quest Diagnostics',
    type: 'Lab',
    prep: "Fasting req'd (8h)",
    confirmed: false,
  },
];

const DEMO_OVERDUE: OverdueCheckup[] = [
  {
    id: 'overdue-1',
    label: 'Annual eye exam',
    lastDate: 'Aug 2025',
    overdueMonths: 6,
  },
  {
    id: 'overdue-2',
    label: 'Dermatology skin check',
    lastDate: 'May 2025',
    overdueMonths: 9,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_BADGE_COLORS: Record<AppointmentType, string> = {
  Checkup: 'bg-green-100 text-green-800',
  Specialist: 'bg-amber-100 text-amber-800',
  Dental: 'bg-blue-100 text-blue-800',
  Vision: 'bg-purple-100 text-purple-800',
  Lab: 'bg-gray-100 text-gray-700',
  Other: 'bg-gray-100 text-gray-600',
};

const APPOINTMENT_TYPES: AppointmentType[] = [
  'Checkup',
  'Specialist',
  'Dental',
  'Vision',
  'Lab',
  'Other',
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const EMPTY_FORM: ScheduleForm = {
  provider: '',
  type: 'Checkup',
  preferredDate: '',
  notes: '',
  autoSchedule: false,
  addToCalendar: true,
  requestRecords: false,
};

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-28" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-40" /></td>
      <td className="px-4 py-3"><div className="h-5 bg-gray-200 rounded-full w-20" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-32" /></td>
      <td className="px-4 py-3"><div className="flex gap-2"><div className="h-8 bg-gray-200 rounded w-16" /><div className="h-8 bg-gray-200 rounded w-32" /></div></td>
    </tr>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-6 bg-gray-200 rounded w-48 animate-pulse" />
        <div className="h-9 bg-gray-200 rounded w-36 animate-pulse" />
      </div>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Provider</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Prep</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AppointmentsTabProps {
  entityId?: string;
  period?: string;
}

export default function AppointmentsTab({ entityId: _entityId, period: _period }: AppointmentsTabProps) {
  const [isLoading] = useState(false);
  const [appointments] = useState<Appointment[]>(DEMO_APPOINTMENTS);
  const [overdueChecks] = useState<OverdueCheckup[]>(DEMO_OVERDUE);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ScheduleForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // ---- handlers -----------------------------------------------------------

  const handlePrepCopy = (prep?: string) => {
    if (!prep) return;
    navigator.clipboard?.writeText(prep).catch(() => {
      /* silent */
    });
  };

  const handleConfirm = (id: string) => {
    // Placeholder -- would trigger VoiceForge confirmation call
    console.log(`VoiceForge: Confirm appointment `);
  };

  const handleScheduleOverdue = (id: string) => {
    // Placeholder -- would trigger VoiceForge scheduling
    console.log(`VoiceForge: Schedule overdue `);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Placeholder -- POST /api/health/appointments
      console.log('POST /api/health/appointments', form);
      await new Promise((r) => setTimeout(r, 800));
      setForm(EMPTY_FORM);
      setShowForm(false);
    } finally {
      setSubmitting(false);
    }
  };

  // ---- loading state ------------------------------------------------------

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  // ---- render -------------------------------------------------------------

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Medical Appointments</h3>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Schedule Appt
        </button>
      </div>

      {/* -- SCHEDULE APPOINTMENT FORM (inline expandable) -- */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="border rounded-lg p-5 space-y-4 bg-gray-50"
        >
          <h4 className="font-medium text-sm uppercase tracking-wide text-gray-500">
            New Appointment
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Provider */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Provider
              </label>
              <input
                type="text"
                placeholder="Search or enter provider name..."
                value={form.provider}
                onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>

            {/* Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type
              </label>
              <select
                value={form.type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, type: e.target.value as AppointmentType }))
                }
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
              >
                {APPOINTMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Preferred date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Preferred Date
              </label>
              <input
                type="date"
                value={form.preferredDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, preferredDate: e.target.value }))
                }
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Notes / prep */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes / Prep Requirements
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Fasting required, bring insurance card..."
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
            />
          </div>

          {/* Checkboxes */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.autoSchedule}
                onChange={(e) =>
                  setForm((f) => ({ ...f, autoSchedule: e.target.checked }))
                }
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Auto-schedule via VoiceForge
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.addToCalendar}
                onChange={(e) =>
                  setForm((f) => ({ ...f, addToCalendar: e.target.checked }))
                }
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Add to calendar with prep reminders
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.requestRecords}
                onChange={(e) =>
                  setForm((f) => ({ ...f, requestRecords: e.target.checked }))
                }
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Request records transfer
            </label>
          </div>

          {/* Submit */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting || !form.provider}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Scheduling...' : 'Schedule Appointment'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setForm(EMPTY_FORM);
              }}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* -- UPCOMING APPOINTMENTS -- */}
      <section>
        <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
          Upcoming
        </h4>

        {appointments?.length === 0 ? (
          <div className="border rounded-lg p-8 text-center text-gray-400 text-sm">
            No upcoming appointments. Click &ldquo;+ Schedule Appt&rdquo; to add one.
          </div>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Date</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Prep</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {appointments?.map((appt) => (
                  <tr key={appt?.id} className="hover:bg-gray-50 transition-colors">
                    {/* Date */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-medium">{formatDate(appt?.date ?? '')}</div>
                      <div className="text-xs text-gray-400">
                        {formatTime(appt?.date ?? '')}
                      </div>
                    </td>

                    {/* Provider */}
                    <td className="px-4 py-3">{appt?.provider}</td>

                    {/* Type badge */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          TYPE_BADGE_COLORS[appt?.type ?? 'Other']
                        }`}
                      >
                        {appt?.type}
                      </span>
                    </td>
                    {/* Prep */}
                    <td className="px-4 py-3 text-gray-600">
                      {appt?.prep ? (
                        <span className="flex items-center gap-1">
                          <svg
                            className="w-3.5 h-3.5 text-amber-500 flex-shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M12 9v2m0 4h.01M12 3l9.66 16.59A1 1 0 0120.66 21H3.34a1 1 0 01-.86-1.41L12 3z"
                            />
                          </svg>
                          {appt.prep}
                        </span>
                      ) : (
                        <span className="text-gray-300">&mdash;</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {appt?.prep && (
                          <button
                            onClick={() => handlePrepCopy(appt?.prep)}
                            title="Copy prep requirements"
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                          >
                            {/* Clipboard icon */}
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5h6"
                              />
                            </svg>
                            Prep
                          </button>
                        )}
                        {!appt?.confirmed && (
                          <button
                            onClick={() => handleConfirm(appt?.id ?? '')}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                          >
                            {/* Phone icon */}
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                              />
                            </svg>
                            VoiceForge: Confirm
                          </button>
                        )}
                        {appt?.confirmed && (
                          <span className="flex items-center gap-1 text-xs text-green-600">
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                            Confirmed
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {/* -- OVERDUE CHECKUPS -- */}
      {overdueChecks?.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
            Overdue
          </h4>
          <div className="space-y-3">
            {overdueChecks?.map((item) => (
              <div
                key={item?.id}
                className="flex items-center justify-between border border-amber-200 bg-amber-50 rounded-lg px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-amber-500 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v2m0 4h.01M12 3l9.66 16.59A1 1 0 0120.66 21H3.34a1 1 0 01-.86-1.41L12 3z"
                    />
                  </svg>
                  <span className="text-sm text-amber-900">
                    {item?.label} &mdash; last: {item?.lastDate} ({item?.overdueMonths} months overdue)
                  </span>
                </div>
                <button
                  onClick={() => handleScheduleOverdue(item?.id ?? '')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-800 bg-amber-100 border border-amber-300 rounded-lg hover:bg-amber-200 transition-colors whitespace-nowrap"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                    />
                  </svg>
                  Schedule via VoiceForge
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}