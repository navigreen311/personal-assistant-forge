'use client';

import type { GoldenTestSuite } from '../types';

interface Props {
  suites: GoldenTestSuite[];
}

export default function GoldenTestPanel({ suites }: Props) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">
        Golden Test Suites
      </h3>

      {suites.length === 0 ? (
        <p className="text-sm text-gray-400">No test suites created yet.</p>
      ) : (
        <div className="space-y-3">
          {suites.map((suite) => (
            <div
              key={suite.id}
              className="rounded-lg border border-gray-100 bg-gray-50 p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-gray-900">{suite.name}</h4>
                  <p className="text-sm text-gray-500">{suite.description}</p>
                </div>
                <div className="text-right">
                  <p
                    className={`text-2xl font-bold ${
                      suite.passRate >= 80
                        ? 'text-green-600'
                        : suite.passRate >= 60
                          ? 'text-yellow-600'
                          : 'text-red-600'
                    }`}
                  >
                    {suite.passRate}%
                  </p>
                  <p className="text-xs text-gray-400">pass rate</p>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                <span>{suite.testCases.length} test cases</span>
                <span>{suite.totalRuns} runs</span>
                {suite.lastRunDate && (
                  <span>
                    Last run: {new Date(suite.lastRunDate).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
