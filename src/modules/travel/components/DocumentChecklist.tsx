'use client';

import type { TravelDocument } from '../types';

export default function DocumentChecklist({ documents }: { documents: TravelDocument[] }) {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Travel Documents</h3>
      {documents.length === 0 && (
        <p className="text-gray-500 text-sm">No travel documents on file.</p>
      )}
      {documents.map((doc, idx) => (
        <div
          key={idx}
          className={`flex items-center justify-between p-3 border rounded-lg ${
            doc.isExpiringSoon ? 'border-red-300 bg-red-50' : 'border-gray-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${doc.isExpiringSoon ? 'bg-red-500' : 'bg-green-500'}`} />
            <div>
              <div className="font-medium text-sm">{doc.type.replace('_', ' ')}</div>
              <div className="text-xs text-gray-500">{doc.issuingCountry}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm">Exp: {new Date(doc.expirationDate).toLocaleDateString()}</div>
            {doc.isExpiringSoon && (
              <div className="text-xs text-red-600 font-medium">Expiring Soon</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
