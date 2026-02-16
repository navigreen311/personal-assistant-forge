'use client';

import type { Contact, Commitment } from '@/shared/types';
import RelationshipBadge from './RelationshipBadge';
import CommitmentList from './CommitmentList';
import CadenceIndicator from './CadenceIndicator';
import GhostingWarning from './GhostingWarning';

interface ContactDetailPanelProps {
  contact: Contact;
  onClose: () => void;
}

export default function ContactDetailPanel({ contact, onClose }: ContactDetailPanelProps) {
  const preferences = contact.preferences ?? {};
  const prefsRecord = preferences as unknown as Record<string, unknown>;
  const cadenceFrequency = (prefsRecord.cadenceFrequency as string | null) ?? null;
  const isEscalated = prefsRecord.escalated === true;

  // Simple ghosting estimation for display
  const daysSinceLastContact = contact.lastTouch
    ? Math.floor((Date.now() - new Date(contact.lastTouch).getTime()) / (1000 * 60 * 60 * 24))
    : 999;
  const isGhosting = daysSinceLastContact > 28;
  const riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = daysSinceLastContact > 28 ? 'HIGH' : daysSinceLastContact > 14 ? 'MEDIUM' : 'LOW';

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{contact.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <RelationshipBadge score={contact.relationshipScore} />
            <CadenceIndicator
              frequency={cadenceFrequency}
              isOverdue={daysSinceLastContact > 14}
              escalated={isEscalated}
            />
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <GhostingWarning
        isGhosting={isGhosting}
        riskLevel={riskLevel}
        daysSinceLastContact={daysSinceLastContact}
      />

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-gray-500">Email:</span>
          <span className="ml-1 text-gray-900">{contact.email ?? '—'}</span>
        </div>
        <div>
          <span className="text-gray-500">Phone:</span>
          <span className="ml-1 text-gray-900">{contact.phone ?? '—'}</span>
        </div>
        <div>
          <span className="text-gray-500">Preferred Channel:</span>
          <span className="ml-1 text-gray-900">{preferences.preferredChannel ?? '—'}</span>
        </div>
        <div>
          <span className="text-gray-500">Preferred Tone:</span>
          <span className="ml-1 text-gray-900">{preferences.preferredTone ?? '—'}</span>
        </div>
        <div>
          <span className="text-gray-500">Last Touch:</span>
          <span className="ml-1 text-gray-900">
            {contact.lastTouch ? new Date(contact.lastTouch).toLocaleDateString() : 'Never'}
          </span>
        </div>
      </div>

      {contact.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {contact.tags.map((tag) => (
            <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Commitments</h3>
        <CommitmentList commitments={contact.commitments} />
      </div>
    </div>
  );
}
