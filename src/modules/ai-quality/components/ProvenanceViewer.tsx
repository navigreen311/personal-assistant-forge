'use client';

import type { ProvenanceChain } from '../types';

interface Props {
  chain: ProvenanceChain;
}

const sourceTypeColors = {
  DOCUMENT: 'bg-blue-100 text-blue-700',
  MESSAGE: 'bg-green-100 text-green-700',
  KNOWLEDGE: 'bg-purple-100 text-purple-700',
  WEB: 'bg-orange-100 text-orange-700',
};

export default function ProvenanceViewer({ chain }: Props) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Citation Provenance
        </h3>
        <span className="text-sm text-gray-500">
          Coverage: {chain.citationCoveragePercent}%
        </span>
      </div>

      {chain.citations.length === 0 ? (
        <p className="text-sm text-gray-400">No citations for this output.</p>
      ) : (
        <div className="space-y-3">
          {chain.citations.map((citation) => (
            <div
              key={citation.claimId}
              className="rounded-lg border border-gray-100 bg-gray-50 p-4"
            >
              <div className="flex items-start gap-3">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    sourceTypeColors[citation.sourceType]
                  }`}
                >
                  {citation.sourceType}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {citation.claim}
                  </p>
                  <blockquote className="mt-1.5 border-l-2 border-gray-200 pl-3 text-xs text-gray-500 italic">
                    {citation.sourceExcerpt}
                  </blockquote>
                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                    <span>Source: {citation.sourceId}</span>
                    <span>
                      Confidence: {(citation.confidence * 100).toFixed(0)}%
                    </span>
                    <span
                      className={
                        citation.verified ? 'text-green-600' : 'text-gray-400'
                      }
                    >
                      {citation.verified ? 'Verified' : 'Unverified'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {chain.uncitedClaims.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase text-red-500">
            Uncited Claims
          </p>
          <ul className="space-y-1">
            {chain.uncitedClaims.map((claim, i) => (
              <li key={i} className="text-sm text-red-600">
                {claim}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
