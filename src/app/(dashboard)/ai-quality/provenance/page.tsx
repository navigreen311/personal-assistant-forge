'use client';

import { useState } from 'react';
import ProvenanceViewer from '@/modules/ai-quality/components/ProvenanceViewer';
import type { ProvenanceChain } from '@/modules/ai-quality/types';

const demoChains: ProvenanceChain[] = [
  {
    outputId: 'output-1',
    citations: [
      {
        claimId: 'c1', claim: 'Q4 revenue exceeded projections by 12%',
        sourceType: 'DOCUMENT', sourceId: 'doc-q4-report',
        sourceExcerpt: 'Total Q4 revenue reached $2.4M, surpassing the $2.14M projection by 12.1%.',
        confidence: 0.95, verified: true,
      },
      {
        claimId: 'c2', claim: 'Customer satisfaction improved to 4.7/5',
        sourceType: 'MESSAGE', sourceId: 'msg-cs-update',
        sourceExcerpt: 'Latest CSAT scores show improvement to 4.7 out of 5, up from 4.3 last quarter.',
        confidence: 0.88, verified: true,
      },
      {
        claimId: 'c3', claim: 'Three new enterprise clients onboarded',
        sourceType: 'KNOWLEDGE', sourceId: 'kb-client-tracking',
        sourceExcerpt: 'New enterprise accounts: GlobalTech Inc., DataFlow Systems, Pinnacle Solutions.',
        confidence: 0.92, verified: false,
      },
    ],
    uncitedClaims: ['Market conditions remain favorable for growth'],
    citationCoveragePercent: 75,
  },
  {
    outputId: 'output-2',
    citations: [
      {
        claimId: 'c4', claim: 'Server uptime was 99.97% in January',
        sourceType: 'DOCUMENT', sourceId: 'doc-infra-report',
        sourceExcerpt: 'Infrastructure report: January uptime 99.97%, with 13 minutes total downtime.',
        confidence: 0.98, verified: true,
      },
    ],
    uncitedClaims: [],
    citationCoveragePercent: 100,
  },
];

export default function ProvenancePage() {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = searchTerm
    ? demoChains.filter(
        (c) =>
          c.outputId.includes(searchTerm) ||
          c.citations.some(
            (cit) =>
              cit.claim.toLowerCase().includes(searchTerm.toLowerCase()) ||
              cit.sourceExcerpt.toLowerCase().includes(searchTerm.toLowerCase())
          )
      )
    : demoChains;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Citation Provenance</h2>
      </div>

      <input
        type="text"
        placeholder="Search citations..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm"
      />

      {filtered.map((chain) => (
        <div key={chain.outputId}>
          <p className="mb-2 text-sm font-medium text-gray-500">
            Output: {chain.outputId}
          </p>
          <ProvenanceViewer chain={chain} />
        </div>
      ))}

      {filtered.length === 0 && (
        <p className="text-center text-sm text-gray-400">
          No citations match your search.
        </p>
      )}
    </div>
  );
}
