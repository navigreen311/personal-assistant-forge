'use client';

import type { MatrixResult, MatrixCriterion, MatrixScore } from '@/modules/decisions/types';

interface DecisionMatrixTableProps {
  criteria: MatrixCriterion[];
  scores: MatrixScore[];
  result: MatrixResult;
}

function getCellColor(score: number): string {
  if (score >= 8) return 'bg-green-100 text-green-800';
  if (score >= 6) return 'bg-blue-100 text-blue-800';
  if (score >= 4) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
}

export default function DecisionMatrixTable({
  criteria,
  scores,
  result,
}: DecisionMatrixTableProps) {
  const optionIds = result.optionScores.map((o) => o.optionId);

  const getScore = (criterionId: string, optionId: string): number => {
    const s = scores.find(
      (sc) => sc.criterionId === criterionId && sc.optionId === optionId
    );
    return s?.score ?? 0;
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left font-medium text-gray-500">Criterion</th>
            <th className="px-4 py-2 text-center font-medium text-gray-500">Weight</th>
            {result.optionScores.map((opt) => (
              <th key={opt.optionId} className="px-4 py-2 text-center font-medium text-gray-500">
                {opt.label}
                {opt.rank === 1 && <span className="ml-1 text-yellow-500">★</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {criteria.map((criterion) => (
            <tr key={criterion.id}>
              <td className="px-4 py-2 font-medium text-gray-900">{criterion.name}</td>
              <td className="px-4 py-2 text-center text-gray-500">
                {(criterion.weight * 100).toFixed(0)}%
              </td>
              {optionIds.map((optId) => {
                const score = getScore(criterion.id, optId);
                return (
                  <td key={optId} className="px-4 py-2 text-center">
                    <span className={`inline-block rounded px-2 py-0.5 ${getCellColor(score)}`}>
                      {score}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-gray-50 font-semibold">
          <tr>
            <td className="px-4 py-2 text-gray-900">Weighted Total</td>
            <td className="px-4 py-2" />
            {result.optionScores.map((opt) => (
              <td key={opt.optionId} className="px-4 py-2 text-center text-gray-900">
                {opt.weightedTotal.toFixed(2)}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>

      <div className="mt-3 text-sm text-gray-600">
        <span className="font-medium">Winner:</span> {result.winner} |{' '}
        <span className="font-medium">Margin:</span> {result.margin.toFixed(2)}
      </div>
    </div>
  );
}
