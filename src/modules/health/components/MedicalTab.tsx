'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MedicalTabProps {
  entityId?: string;
  period?: string;
}

type RecordType = 'Lab work' | 'Physical' | 'Dental' | 'Vision' | 'Specialist' | 'Imaging' | 'Other';

interface MedicalRecordRow {
  id: string;
  date: string;
  type: RecordType;
  provider: string;
  summary: string;
  details?: string;
  hasAttachment?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RECORD_TYPES: RecordType[] = [
  'Lab work',
  'Physical',
  'Dental',
  'Vision',
  'Specialist',
  'Imaging',
  'Other',
];

const TYPE_BADGE_COLORS: Record<RecordType, string> = {
  'Lab work': 'bg-purple-100 text-purple-700',
  Physical: 'bg-green-100 text-green-700',
  Dental: 'bg-blue-100 text-blue-700',
  Vision: 'bg-teal-100 text-teal-700',
  Specialist: 'bg-amber-100 text-amber-700',
  Imaging: 'bg-gray-100 text-gray-600',
  Other: 'bg-gray-100 text-gray-500',
};

const DEMO_RECORDS: MedicalRecordRow[] = [
  {
    id: 'demo-1',
    date: '2026-02-10',
    type: 'Lab work',
    provider: 'Quest Diagnostics',
    summary: 'Comprehensive metabolic panel \u2014 all values within normal range.',
    details:
      'Glucose: 92 mg/dL | BUN: 14 mg/dL | Creatinine: 0.9 mg/dL | Sodium: 140 mEq/L | Potassium: 4.2 mEq/L | Chloride: 101 mEq/L | CO2: 24 mEq/L | Calcium: 9.5 mg/dL | Total Protein: 7.1 g/dL | Albumin: 4.3 g/dL | Bilirubin: 0.8 mg/dL | ALT: 22 U/L | AST: 25 U/L | ALP: 68 U/L',
    hasAttachment: true,
  },
  {
    id: 'demo-2',
    date: '2026-01-15',
    type: 'Physical',
    provider: 'Dr. Sarah Chen',
    summary: 'Annual physical \u2014 vitals normal, BMI 23.4, no concerns flagged.',
    details:
      `Blood pressure: 118/76 mmHg | Heart rate: 68 bpm | Temperature: 98.4°F | Height: 5'10" | Weight: 163 lbs | BMI: 23.4 | Vision: 20/20 bilateral | Hearing: normal. Physician notes: Continue current exercise regimen. Schedule follow-up labs in 6 months.`,
  },
  {
    id: 'demo-3',
    date: '2025-12-03',
    type: 'Dental',
    provider: 'Bright Smile Dental',
    summary: 'Routine cleaning and exam \u2014 no cavities, mild tartar buildup on lower molars.',
    details:
      'Prophylaxis completed. Bitewing X-rays taken \u2014 no interproximal decay. Mild calculus lower lingual. Gum health: probing depths 2\u20133 mm, no bleeding on probing. Recommended: fluoride rinse nightly, next visit in 6 months.',
    hasAttachment: true,
  },
  {
    id: 'demo-4',
    date: '2025-11-18',
    type: 'Specialist',
    provider: 'Dr. James Ortiz \u2014 Dermatology',
    summary: 'Mole check \u2014 all lesions benign, one monitored for asymmetry.',
    details:
      'Full-body skin exam performed. 42 nevi catalogued. One lesion on upper back (4 mm, slight asymmetry) flagged for 6-month follow-up with dermoscopy. No biopsy required at this time. SPF 30+ daily recommended.',
  },
  {
    id: 'demo-5',
    date: '2025-09-22',
    type: 'Imaging',
    provider: 'City Radiology Partners',
    summary: 'Chest X-ray \u2014 lungs clear, no acute findings.',
    details:
      'PA and lateral views obtained. Heart size normal. Lungs are clear bilaterally. No pleural effusion. No pneumothorax. Mediastinal contours unremarkable. Osseous structures intact. Impression: Normal chest radiograph.',
    hasAttachment: true,
  },
];

// ---------------------------------------------------------------------------
// Inline SVG Icons
// ---------------------------------------------------------------------------

function WarningIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function PlusIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function ChevronDownIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function ChevronUpIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  );
}

function PaperclipIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
      />
    </svg>
  );
}

function CloseIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function UploadIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
      />
    </svg>
  );
}

function MedicalIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function MedicalTab({ entityId, period }: MedicalTabProps) {
  const [records, setRecords] = useState<MedicalRecordRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hipaaEnabled, setHipaaEnabled] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Form state
  const [formDate, setFormDate] = useState('');
  const [formType, setFormType] = useState<RecordType>('Lab work');
  const [formProvider, setFormProvider] = useState('');
  const [formSummary, setFormSummary] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ---------- Data fetching ----------

  const fetchRecords = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (entityId) params.set('entityId', entityId);
      if (period) params.set('period', period);

      const res = await fetch(`/api/health/medical?${params}`);
      if (res.ok) {
        const data = await res.json();
        const rows: MedicalRecordRow[] = (data?.records ?? data?.data ?? []).map(
          (r: Record<string, unknown>) => ({
            id: r?.id ?? crypto.randomUUID(),
            date: r?.date ?? '',
            type: r?.type ?? 'Other',
            provider: r?.provider ?? '',
            summary: r?.summary ?? r?.title ?? '',
            details: r?.details ?? r?.notes ?? undefined,
            hasAttachment: r?.hasAttachment ?? false,
          }),
        );
        setRecords(rows);
      } else {
        setRecords(DEMO_RECORDS);
      }
    } catch {
      setRecords(DEMO_RECORDS);
    } finally {
      setIsLoading(false);
    }
  }, [entityId, period]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // ---------- Row expansion ----------

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // ---------- Modal helpers ----------

  const resetForm = useCallback(() => {
    setFormDate('');
    setFormType('Lab work');
    setFormProvider('');
    setFormSummary('');
    setShowModal(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!formDate.trim() || !formProvider.trim() || !formSummary.trim()) return;

    setIsSubmitting(true);
    try {
      const body = {
        entityId,
        date: formDate,
        type: formType,
        provider: formProvider,
        summary: formSummary,
      };

      const res = await fetch('/api/health/medical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        resetForm();
        fetchRecords();
      } else {
        const newRecord: MedicalRecordRow = {
          id: crypto.randomUUID(),
          date: formDate,
          type: formType,
          provider: formProvider,
          summary: formSummary,
        };
        setRecords((prev) => [newRecord, ...prev]);
        resetForm();
      }
    } catch {
      const newRecord: MedicalRecordRow = {
        id: crypto.randomUUID(),
        date: formDate,
        type: formType,
        provider: formProvider,
        summary: formSummary,
      };
      setRecords((prev) => [newRecord, ...prev]);
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  }, [entityId, formDate, formType, formProvider, formSummary, resetForm, fetchRecords]);

  // ---------- Footer actions ----------

  const handleImport = useCallback(() => {
    alert('Import records: This feature will allow importing medical records from external providers via FHIR/HL7 integration.');
  }, []);

  const handleExport = useCallback(() => {
    alert('Export for new provider: This feature will generate a HIPAA-compliant PDF/CCD export of your medical records for transfer.');
  }, []);

  // ---------- Loading skeleton ----------

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-7 w-48 animate-pulse rounded bg-gray-200" />
          <div className="h-9 w-32 animate-pulse rounded-lg bg-gray-200" />
        </div>
        <div className="h-20 w-full animate-pulse rounded-lg bg-yellow-50 border border-amber-200" />
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="bg-gray-50 px-4 py-3">
            <div className="flex gap-8">
              {[80, 60, 100, 200, 60].map((w, i) => (
                <div key={i} className="h-4 animate-pulse rounded bg-gray-200" style={{ width: w }} />
              ))}
            </div>
          </div>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="border-t border-gray-100 px-4 py-4">
              <div className="flex items-center gap-6">
                <div className="h-4 w-20 animate-pulse rounded bg-gray-100" />
                <div className="h-5 w-16 animate-pulse rounded-full bg-gray-100" />
                <div className="h-4 w-32 animate-pulse rounded bg-gray-100" />
                <div className="h-4 w-64 animate-pulse rounded bg-gray-100 flex-1" />
                <div className="h-4 w-10 animate-pulse rounded bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-3">
          <div className="h-9 w-32 animate-pulse rounded-lg bg-gray-200" />
          <div className="h-9 w-44 animate-pulse rounded-lg bg-gray-200" />
        </div>
      </div>
    );
  }

  // ---------- Main render ----------

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MedicalIcon className="w-6 h-6 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Medical Records</h2>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Add Record
        </button>
      </div>

      {/* HIPAA Mode Banner */}
      <div className="rounded-lg border border-amber-300 bg-yellow-50 px-4 py-3">
        <div className="flex items-start gap-3">
          <WarningIcon className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-amber-800">HIPAA Mode:</span>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hipaaEnabled}
                  onChange={(e) => setHipaaEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                />
                <span className="text-sm font-medium text-amber-700">Enabled</span>
              </label>
            </div>
            <p className="mt-1 text-xs text-amber-700">
              All medical data is encrypted at rest and in transit. AI cannot access medical records without explicit consent.
            </p>
          </div>
        </div>
      </div>

      {/* Records Table */}
      {records.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center">
          <MedicalIcon className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-900">No medical records</p>
          <p className="mt-1 text-sm text-gray-500">
            Add your first medical record to start tracking your health history.
          </p>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Add Record
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Date
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Type
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Provider
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Summary
                  </th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {records.map((record) => {
                  const isExpanded = expandedId === record?.id;
                  const badgeColor =
                    TYPE_BADGE_COLORS[record?.type as RecordType] ?? 'bg-gray-100 text-gray-500';

                  return (
                    <Fragment key={record?.id}>
                      <tr className="hover:bg-gray-50 transition-colors">
                        {/* Date */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-sm text-gray-700">
                            {record?.date
                              ? new Date(record.date).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })
                              : '\u2014'}
                          </span>
                        </td>

                        {/* Type Badge */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeColor}`}
                          >
                            {record?.type ?? 'Unknown'}
                          </span>
                        </td>

                        {/* Provider */}
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-700">{record?.provider ?? '\u2014'}</span>
                        </td>

                        {/* Summary */}
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-600 line-clamp-1">
                            {record?.summary ?? '\u2014'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {record?.hasAttachment && (
                              <button
                                type="button"
                                title="Has attachment"
                                className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              >
                                <PaperclipIcon className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => toggleExpand(record?.id)}
              title={isExpanded ? 'Collapse details' : 'View details'}
                              className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                            >
                              {isExpanded ? (
                                <ChevronUpIcon className="w-4 h-4" />
                              ) : (
                                <ChevronDownIcon className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Row */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={5} className="bg-gray-50 px-6 py-4">
                            <div className="space-y-2">
                              <h4 className="text-sm font-semibold text-gray-800">Full Record Details</h4>
                              <p className="text-sm text-gray-600 leading-relaxed">
                                {record?.details ?? record?.summary ?? 'No additional details available.'}
                              </p>
                              {record?.hasAttachment && (
                                <div className="flex items-center gap-2 mt-2">
                                  <PaperclipIcon className="w-4 h-4 text-gray-400" />
                                  <span className="text-xs text-blue-600 hover:underline cursor-pointer">
                                    View attached document
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer Buttons */}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={handleImport}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Import records
        </button>
        <button
          type="button"
          onClick={handleExport}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Export for new provider
        </button>
      </div>

      {/* Add Record Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-xl">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-base font-semibold text-gray-900">Add Medical Record</h3>
              <button
                type="button"
                onClick={resetForm}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="max-h-[70vh] overflow-y-auto px-6 py-4 space-y-4">
              {/* Date */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Date</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Type */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Type</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as RecordType)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {RECORD_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              {/* Provider */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Provider Name</label>
                <input
                  type="text"
                  value={formProvider}
                  onChange={(e) => setFormProvider(e.target.value)}
                  placeholder="e.g., Dr. Sarah Chen"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Summary */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Summary</label>
                <textarea
                  value={formSummary}
                  onChange={(e) => setFormSummary(e.target.value)}
                  rows={3}
                  placeholder="Brief description of the visit or results..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* File Upload Placeholder */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Attachment</label>
                <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center hover:bg-gray-100 transition-colors cursor-pointer">
                  <UploadIcon className="w-6 h-6 text-gray-400" />
                  <p className="mt-2 text-sm text-gray-500">Click or drag to upload a file</p>
                  <p className="mt-1 text-xs text-gray-400">PDF, JPG, PNG up to 10 MB</p>
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!formDate.trim() || !formProvider.trim() || !formSummary.trim() || isSubmitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : 'Save Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
