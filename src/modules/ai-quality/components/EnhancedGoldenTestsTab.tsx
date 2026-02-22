"use client";

import { useEffect, useState, useCallback } from "react";
import type { GoldenTestSuite } from "../types";

// ---------------------------------------------------------------------------
// Extended types
// ---------------------------------------------------------------------------

interface EnhancedTestSuite extends GoldenTestSuite {
  schedule?: {
    type: "manual" | "daily" | "weekly" | "after_deployment";
    dayOfWeek?: string;
    time?: string;
  };
  failingCases: { id: string; name: string; lastError?: string }[];
  trend?: "improving" | "stable" | "declining";
  module?: string;
}

interface NewTestCase {
  localId: string;
  input: string;
  expectedOutput: string;
  assertionType:
    | "exact_match"
    | "contains"
    | "classification"
    | "score_range"
    | "custom";
}

interface CreateSuiteForm {
  name: string;
  module: string;
  testCases: NewTestCase[];
  scheduleType: "manual" | "daily" | "weekly" | "after_deployment";
  alertOnFailure: boolean;
  failureThreshold: number;
}

interface EnhancedGoldenTestsTabProps {
  entityId?: string;
  period?: string;
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const DEMO_SUITES: EnhancedTestSuite[] = [
  {
    id: "suite-1",
    name: "Inbox Triage Accuracy",
    description: "Validates that emails are routed to the correct priority and category.",
    testCases: [
      { id: "tc-1", category: "TRIAGE", input: { subject: "Urgent: server down" }, expectedOutput: { priority: "high" }, tags: ["priority"], createdAt: new Date("2026-01-15"), lastRun: new Date("2026-02-18"), lastResult: "PASS" },
      { id: "tc-2", category: "TRIAGE", input: { subject: "Newsletter signup" }, expectedOutput: { priority: "low" }, tags: ["priority"], createdAt: new Date("2026-01-15"), lastRun: new Date("2026-02-18"), lastResult: "FAIL" },
      { id: "tc-3", category: "CLASSIFICATION", input: { subject: "Invoice attached" }, expectedOutput: { category: "billing" }, tags: ["category"], createdAt: new Date("2026-01-20"), lastRun: new Date("2026-02-18"), lastResult: "PASS" },
      { id: "tc-4", category: "TRIAGE", input: { subject: "Meeting reschedule" }, expectedOutput: { priority: "medium" }, tags: ["priority"], createdAt: new Date("2026-01-22"), lastRun: new Date("2026-02-18"), lastResult: "PASS" },
    ],
    lastRunDate: new Date("2026-02-18"),
    passRate: 75,
    totalRuns: 42,
    schedule: { type: "weekly", dayOfWeek: "Mon", time: "6:00 AM" },
    failingCases: [
      { id: "tc-2", name: "Newsletter signup -> low priority", lastError: "Expected low, got medium" },
    ],
    trend: "improving",
    module: "Inbox Triage",
  },
  {
    id: "suite-2",
    name: "Draft Composer Quality",
    description: "Ensures generated drafts match expected tone, structure, and content.",
    testCases: [
      { id: "tc-5", category: "DRAFT", input: { prompt: "Follow up on proposal" }, expectedOutput: { tone: "professional" }, tags: ["tone"], createdAt: new Date("2026-01-18"), lastRun: new Date("2026-02-17"), lastResult: "PASS" },
      { id: "tc-6", category: "DRAFT", input: { prompt: "Casual team update" }, expectedOutput: { tone: "casual" }, tags: ["tone"], createdAt: new Date("2026-01-18"), lastRun: new Date("2026-02-17"), lastResult: "PASS" },
      { id: "tc-7", category: "DRAFT", input: { prompt: "Apology for delay" }, expectedOutput: { tone: "empathetic" }, tags: ["tone"], createdAt: new Date("2026-01-25"), lastRun: new Date("2026-02-17"), lastResult: "PASS" },
    ],
    lastRunDate: new Date("2026-02-17"),
    passRate: 100,
    totalRuns: 38,
    schedule: { type: "daily", time: "2:00 AM" },
    failingCases: [],
    trend: "stable",
    module: "Draft Composer",
  },
  {
    id: "suite-3",
    name: "Task Extraction Regression",
    description: "Verifies task creation from natural language inputs.",
    testCases: [
      { id: "tc-8", category: "EXTRACTION", input: { text: "Finish the report by Friday" }, expectedOutput: { deadline: "Friday" }, tags: ["deadline"], createdAt: new Date("2026-02-01"), lastRun: new Date("2026-02-19"), lastResult: "FAIL" },
      { id: "tc-9", category: "EXTRACTION", input: { text: "Call John tomorrow at 3pm" }, expectedOutput: { time: "3:00 PM" }, tags: ["time"], createdAt: new Date("2026-02-01"), lastRun: new Date("2026-02-19"), lastResult: "FAIL" },
      { id: "tc-10", category: "EXTRACTION", input: { text: "Buy groceries" }, expectedOutput: { category: "personal" }, tags: ["category"], createdAt: new Date("2026-02-05"), lastRun: new Date("2026-02-19"), lastResult: "PASS" },
    ],
    lastRunDate: new Date("2026-02-19"),
    passRate: 33,
    totalRuns: 12,
    schedule: { type: "manual" },
    failingCases: [
      { id: "tc-8", name: "Report by Friday -> deadline extraction", lastError: "Expected Friday, got next week" },
      { id: "tc-9", name: "Call John at 3pm -> time extraction", lastError: "Expected 3:00 PM, got 15:00" },
    ],
    trend: "declining",
    module: "Task Creation",
  },
];

const MODULE_OPTIONS = [
  "Inbox Triage",
  "Draft Composer",
  "Task Creation",
  "VoiceForge",
  "Capture",
];

const ASSERTION_TYPES: { value: NewTestCase["assertionType"]; label: string }[] = [
  { value: "exact_match", label: "Exact match" },
  { value: "contains", label: "Contains" },
  { value: "classification", label: "Classification" },
  { value: "score_range", label: "Score range" },
  { value: "custom", label: "Custom" },
];

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SkeletonSuiteCard() {
  return (
    <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-5 w-48 rounded bg-gray-200" />
          <div className="h-3 w-72 rounded bg-gray-200" />
        </div>
        <div className="h-8 w-20 rounded-full bg-gray-200" />
      </div>
      <div className="mb-3 flex gap-4">
        <div className="h-3 w-24 rounded bg-gray-200" />
        <div className="h-3 w-20 rounded bg-gray-200" />
        <div className="h-3 w-32 rounded bg-gray-200" />
      </div>
      <div className="flex gap-2">
        <div className="h-8 w-24 rounded bg-gray-200" />
        <div className="h-8 w-24 rounded bg-gray-200" />
        <div className="h-8 w-28 rounded bg-gray-200" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icons (Heroicons outline)
// ---------------------------------------------------------------------------

function PlayIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
    </svg>
  );
}

function PlusIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function ClockIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function TrashIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  );
}

function PencilIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
  );
}

function HistoryIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
    </svg>
  );
}

function SpinnerIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={"animate-spin " + className} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function XMarkIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

function TrendIcon({ trend }: { trend?: "improving" | "stable" | "declining" }) {
  if (trend === "improving") {
    return (
      <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
      </svg>
    );
  }
  if (trend === "declining") {
    return (
      <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6 9 12.75l4.286-4.286a11.948 11.948 0 0 1 4.306 6.43l.776 2.898m0 0 3.182-5.511m-3.182 5.51-5.511-3.181" />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  );
}

function BeakerIcon({ className = "h-12 w-12" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-1.632 5.444a2.25 2.25 0 0 1-2.157 1.556H8.789a2.25 2.25 0 0 1-2.157-1.556L5 14.5m14 0H5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPassRateBadge(rate: number) {
  if (rate >= 90)
    return { text: rate + "%", className: "bg-green-100 text-green-800 border-green-200" };
  if (rate >= 70)
    return { text: rate + "%", className: "bg-amber-100 text-amber-800 border-amber-200" };
  return { text: rate + "%", className: "bg-red-100 text-red-800 border-red-200" };
}

function formatSchedule(schedule?: EnhancedTestSuite["schedule"]): string {
  if (!schedule || schedule.type === "manual") return "Manual only";
  if (schedule.type === "daily")
    return "Auto-runs: Daily (" + (schedule.time ?? "2:00 AM") + ")";
  if (schedule.type === "weekly")
    return (
      "Auto-runs: Weekly (" +
      (schedule.dayOfWeek ?? "Mon") +
      " " +
      (schedule.time ?? "6:00 AM") +
      ")"
    );
  return "Auto-runs: After deployment";
}

function trendLabel(trend?: "improving" | "stable" | "declining"): string {
  if (trend === "improving") return "Improving";
  if (trend === "declining") return "Declining";
  return "Stable";
}

function makeLocalId(): string {
  return "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
}

// ---------------------------------------------------------------------------
// Create Suite Wizard Modal
// ---------------------------------------------------------------------------

function CreateSuiteWizard({
  onClose,
  onSubmit,
  submitting,
}: {
  onClose: () => void;
  onSubmit: (form: CreateSuiteForm) => void;
  submitting: boolean;
}) {
  const [form, setForm] = useState<CreateSuiteForm>({
    name: "",
    module: MODULE_OPTIONS[0],
    testCases: [
      {
        localId: makeLocalId(),
        input: "",
        expectedOutput: "",
        assertionType: "exact_match",
      },
    ],
    scheduleType: "manual",
    alertOnFailure: false,
    failureThreshold: 80,
  });

  const addTestCase = () => {
    setForm((prev) => ({
      ...prev,
      testCases: [
        ...prev.testCases,
        {
          localId: makeLocalId(),
          input: "",
          expectedOutput: "",
          assertionType: "exact_match",
        },
      ],
    }));
  };

  const removeTestCase = (localId: string) => {
    setForm((prev) => ({
      ...prev,
      testCases: prev.testCases.filter((tc) => tc.localId !== localId),
    }));
  };

  const updateTestCase = (
    localId: string,
    field: keyof Omit<NewTestCase, "localId">,
    value: string,
  ) => {
    setForm((prev) => ({
      ...prev,
      testCases: prev.testCases.map((tc) =>
        tc.localId === localId ? { ...tc, [field]: value } : tc,
      ),
    }));
  };

  const canSubmit =
    form.name.trim().length > 0 &&
    form.testCases.length > 0 &&
    form.testCases.every(
      (tc) => tc.input.trim().length > 0 && tc.expectedOutput.trim().length > 0,
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Create Test Suite
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {/* Suite name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Suite Name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="e.g., Inbox Triage Accuracy"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Module dropdown */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Module
            </label>
            <select
              value={form.module}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, module: e.target.value }))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {MODULE_OPTIONS.map((mod) => (
                <option key={mod} value={mod}>
                  {mod}
                </option>
              ))}
            </select>
          </div>

          {/* Test cases */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Test Cases ({form.testCases.length})
            </label>
            <div className="space-y-4">
              {form.testCases.map((tc, idx) => (
                <div
                  key={tc.localId}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600">
                      Test Case #{idx + 1}
                    </span>
                    {form.testCases.length > 1 && (
                      <button
                        onClick={() => removeTestCase(tc.localId)}
                        className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                        title="Remove test case"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500">
                        Input
                      </label>
                      <textarea
                        value={tc.input}
                        onChange={(e) =>
                          updateTestCase(tc.localId, "input", e.target.value)
                        }
                        placeholder="Describe the test input..."
                        rows={2}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500">
                        Expected Output
                      </label>
                      <textarea
                        value={tc.expectedOutput}
                        onChange={(e) =>
                          updateTestCase(
                            tc.localId,
                            "expectedOutput",
                            e.target.value,
                          )
                        }
                        placeholder="Describe the expected output..."
                        rows={2}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500">
                        Assertion Type
                      </label>
                      <select
                        value={tc.assertionType}
                        onChange={(e) =>
                          updateTestCase(
                            tc.localId,
                            "assertionType",
                            e.target.value,
                          )
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {ASSERTION_TYPES.map((at) => (
                          <option key={at.value} value={at.value}>
                            {at.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={addTestCase}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600"
            >
              <PlusIcon className="h-4 w-4" />
              Add Test Case
            </button>
          </div>

          {/* Schedule */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Schedule
            </label>
            <select
              value={form.scheduleType}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  scheduleType: e.target
                    .value as CreateSuiteForm["scheduleType"],
                }))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="manual">Manual</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="after_deployment">After deployment</option>
            </select>
          </div>

          {/* Alert on failure */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="alertOnFailure"
                checked={form.alertOnFailure}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    alertOnFailure: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label
                htmlFor="alertOnFailure"
                className="text-sm font-medium text-gray-700"
              >
                Alert on failure
              </label>
            </div>
            {form.alertOnFailure && (
              <div className="mt-3 flex items-center gap-2">
                <label className="text-sm text-gray-600">Threshold:</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.failureThreshold}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      failureThreshold: Math.min(
                        100,
                        Math.max(0, Number(e.target.value)),
                      ),
                    }))
                  }
                  className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-500">% pass rate</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-gray-200 bg-white px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(form)}
            disabled={!canSubmit || submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <SpinnerIcon className="h-4 w-4" />
                Creating...
              </>
            ) : (
              "Create Suite"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suite Card
// ---------------------------------------------------------------------------

function SuiteCard({
  suite,
  onRunNow,
  running,
}: {
  suite: EnhancedTestSuite;
  onRunNow: (id: string) => void;
  running: boolean;
}) {
  const badge = getPassRateBadge(suite.passRate);
  const scheduleText = formatSchedule(suite.schedule);
  const isAutoScheduled =
    suite.schedule?.type !== "manual" && suite.schedule?.type !== undefined;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 transition-shadow hover:shadow-md">
      {/* Header: name + pass rate badge */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h4 className="truncate text-base font-bold text-gray-900">
              {suite.name}
            </h4>
            <span
              className={
                "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold " +
                badge.className
              }
            >
              {badge.text}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">{suite.description}</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <span>{suite.testCases.length} test cases</span>
        <span>{suite.totalRuns} runs</span>
        {suite.lastRunDate && (
          <span>
            Last run: {new Date(suite.lastRunDate).toLocaleDateString()}
          </span>
        )}
        {suite.module && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
            {suite.module}
          </span>
        )}
      </div>

      {/* Schedule indicator */}
      <div className="mt-3 flex items-center gap-2 text-xs">
        <ClockIcon
          className={
            "h-3.5 w-3.5 " +
            (isAutoScheduled ? "text-blue-500" : "text-gray-400")
          }
        />
        <span
          className={
            isAutoScheduled ? "font-medium text-blue-600" : "text-gray-500"
          }
        >
          {scheduleText}
        </span>
      </div>

      {/* Trend */}
      {suite.trend && (
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          <TrendIcon trend={suite.trend} />
          <span
            className={
              suite.trend === "improving"
                ? "text-green-600"
                : suite.trend === "declining"
                  ? "text-red-600"
                  : "text-gray-500"
            }
          >
            {trendLabel(suite.trend)} from previous runs
          </span>
        </div>
      )}

      {/* Failing cases */}
      {suite.failingCases.length > 0 && (
        <div className="mt-4 rounded-lg border border-red-100 bg-red-50 p-3">
          <p className="mb-2 text-xs font-semibold text-red-700">
            Failing Cases ({suite.failingCases.length})
          </p>
          <ul className="space-y-1.5">
            {suite.failingCases.map((fc) => (
              <li key={fc.id} className="text-xs text-red-600">
                <span className="font-medium">{fc.name}</span>
                {fc.lastError && (
                  <span className="ml-1 text-red-400">
                    &mdash; {fc.lastError}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => onRunNow(suite.id)}
          disabled={running}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? (
            <>
              <SpinnerIcon className="h-3.5 w-3.5" />
              Running...
            </>
          ) : (
            <>
              <PlayIcon className="h-3.5 w-3.5" />
              Run Now
            </>
          )}
        </button>
        <button className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
          <PencilIcon className="h-3.5 w-3.5" />
          Edit Cases
        </button>
        <button className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
          <HistoryIcon className="h-3.5 w-3.5" />
          Run History
        </button>
        <button className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
          <TrashIcon className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function EnhancedGoldenTestsTab({
  entityId,
  period,
}: EnhancedGoldenTestsTabProps) {
  const [suites, setSuites] = useState<EnhancedTestSuite[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningSuites, setRunningSuites] = useState<Set<string>>(new Set());
  const [runningAll, setRunningAll] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [creatingWizard, setCreatingWizard] = useState(false);

  // Fetch suites
  const fetchSuites = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (entityId) params.set("entityId", entityId);
      if (period) params.set("period", period);

      const res = await fetch("/api/analytics/scorecard?" + params.toString());
      if (!res.ok) throw new Error("Failed to fetch");

      const data = await res.json();
      if (data.suites && Array.isArray(data.suites) && data.suites.length > 0) {
        setSuites(data.suites);
      } else {
        setSuites(DEMO_SUITES);
      }
    } catch {
      setSuites(DEMO_SUITES);
    } finally {
      setLoading(false);
    }
  }, [entityId, period]);

  useEffect(() => {
    fetchSuites();
  }, [fetchSuites]);

  // Run single suite
  const handleRunNow = useCallback(
    async (suiteId: string) => {
      setRunningSuites((prev) => new Set(prev).add(suiteId));
      try {
        await fetch("/api/ai-quality/tests/" + suiteId + "/run", {
          method: "POST",
        });
      } catch {
        // Placeholder
      } finally {
        setRunningSuites((prev) => {
          const next = new Set(prev);
          next.delete(suiteId);
          return next;
        });
        await fetchSuites();
      }
    },
    [fetchSuites],
  );

  // Run all suites
  const handleRunAll = useCallback(async () => {
    setRunningAll(true);
    const allIds = suites.map((s) => s.id);
    setRunningSuites(new Set(allIds));
    try {
      await Promise.allSettled(
        allIds.map((id) =>
          fetch("/api/ai-quality/tests/" + id + "/run", {
            method: "POST",
          }).catch(() => {}),
        ),
      );
    } finally {
      setRunningSuites(new Set());
      setRunningAll(false);
      await fetchSuites();
    }
  }, [suites, fetchSuites]);

  // Create suite
  const handleCreateSuite = useCallback(
    async (form: CreateSuiteForm) => {
      setCreatingWizard(true);
      try {
        const payload = {
          name: form.name,
          module: form.module,
          testCases: form.testCases.map((tc) => ({
            input: tc.input,
            expectedOutput: tc.expectedOutput,
            assertionType: tc.assertionType,
          })),
          schedule: form.scheduleType,
          alertOnFailure: form.alertOnFailure,
          failureThreshold: form.failureThreshold,
        };

        await fetch("/api/analytics/scorecard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        setShowWizard(false);
        await fetchSuites();
      } catch {
        // Placeholder
      } finally {
        setCreatingWizard(false);
      }
    },
    [fetchSuites],
  );

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-7 w-36 animate-pulse rounded bg-gray-200" />
          <div className="flex gap-2">
            <div className="h-9 w-40 animate-pulse rounded-lg bg-gray-200" />
            <div className="h-9 w-32 animate-pulse rounded-lg bg-gray-200" />
          </div>
        </div>
        <SkeletonSuiteCard />
        <SkeletonSuiteCard />
        <SkeletonSuiteCard />
      </div>
    );
  }

  // Empty state
  if (suites.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Golden Tests</h2>
          <button
            onClick={() => setShowWizard(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <PlusIcon className="h-4 w-4" />
            Create Suite
          </button>
        </div>

        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 py-16">
          <BeakerIcon className="mb-4 h-12 w-12 text-gray-300" />
          <h3 className="text-base font-medium text-gray-900">
            No test suites yet
          </h3>
          <p className="mt-1 max-w-sm text-center text-sm text-gray-500">
            Create your first golden test suite to start monitoring AI quality
            and catching regressions before they impact users.
          </p>
          <button
            onClick={() => setShowWizard(true)}
            className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <PlusIcon className="h-4 w-4" />
            Create Your First Suite
          </button>
        </div>

        {showWizard && (
          <CreateSuiteWizard
            onClose={() => setShowWizard(false)}
            onSubmit={handleCreateSuite}
            submitting={creatingWizard}
          />
        )}
      </div>
    );
  }

  // Main render
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Golden Tests</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRunAll}
            disabled={runningAll}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {runningAll ? (
              <>
                <SpinnerIcon className="h-4 w-4" />
                Running All...
              </>
            ) : (
              <>
                <PlayIcon className="h-4 w-4" />
                Run All Tests Now
              </>
            )}
          </button>
          <button
            onClick={() => setShowWizard(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <PlusIcon className="h-4 w-4" />
            Create Suite
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Total Suites</p>
          <p className="text-2xl font-bold text-gray-900">{suites.length}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Total Cases</p>
          <p className="text-2xl font-bold text-gray-900">
            {suites.reduce((sum, s) => sum + s.testCases.length, 0)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Avg Pass Rate</p>
          <p className="text-2xl font-bold text-gray-900">
            {suites.length > 0
              ? Math.round(
                  suites.reduce((sum, s) => sum + s.passRate, 0) /
                    suites.length,
                )
              : 0}
            %
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Failing Cases</p>
          <p className="text-2xl font-bold text-red-600">
            {suites.reduce((sum, s) => sum + s.failingCases.length, 0)}
          </p>
        </div>
      </div>

      {/* Suite cards */}
      <div className="space-y-4">
        {suites.map((suite) => (
          <SuiteCard
            key={suite.id}
            suite={suite}
            onRunNow={handleRunNow}
            running={runningSuites.has(suite.id)}
          />
        ))}
      </div>

      {/* Create Suite Wizard Modal */}
      {showWizard && (
        <CreateSuiteWizard
          onClose={() => setShowWizard(false)}
          onSubmit={handleCreateSuite}
          submitting={creatingWizard}
        />
      )}
    </div>
  );
}
