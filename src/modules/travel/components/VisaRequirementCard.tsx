'use client';

import type { VisaRequirement } from '../types';

export default function VisaRequirementCard({ requirement }: { requirement: VisaRequirement }) {
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold">
          {requirement.citizenshipCountry} → {requirement.destinationCountry}
        </h4>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          requirement.visaRequired ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
        }`}>
          {requirement.visaRequired ? 'Visa Required' : 'Visa Free'}
        </span>
      </div>
      {requirement.visaType && (
        <div className="text-sm mb-2">
          <span className="text-gray-500">Type:</span> {requirement.visaType}
        </div>
      )}
      {requirement.processingDays && (
        <div className="text-sm mb-2">
          <span className="text-gray-500">Processing:</span> {requirement.processingDays} days
        </div>
      )}
      <div className="text-sm mb-2">
        <span className="text-gray-500">Required Documents:</span>
        <ul className="list-disc list-inside ml-2 mt-1">
          {requirement.documentRequired.map((doc, idx) => (
            <li key={idx} className="text-gray-700">{doc}</li>
          ))}
        </ul>
      </div>
      <div className="text-sm text-gray-600 mt-2 p-2 bg-gray-50 rounded">{requirement.notes}</div>
    </div>
  );
}
