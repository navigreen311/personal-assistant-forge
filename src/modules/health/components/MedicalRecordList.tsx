'use client';

import { useState } from 'react';
import type { MedicalRecord } from '../types';

const typeLabels: Record<string, string> = {
  APPOINTMENT: 'Appointments',
  MEDICATION: 'Medications',
  PRESCRIPTION: 'Prescriptions',
  LAB_RESULT: 'Lab Results',
  IMMUNIZATION: 'Immunizations',
};

export default function MedicalRecordList({ records }: { records: MedicalRecord[] }) {
  const [activeType, setActiveType] = useState<string>('all');

  const types = ['all', ...Object.keys(typeLabels)];
  const filtered = activeType === 'all' ? records : records.filter(r => r.type === activeType);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Medical Records</h3>
      <div className="flex gap-2 flex-wrap">
        {types.map(type => (
          <button
            key={type}
            onClick={() => setActiveType(type)}
            className={`px-3 py-1 rounded-full text-sm ${
              activeType === type ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {type === 'all' ? 'All' : typeLabels[type] ?? type}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-gray-500 text-sm">No records found.</p>}
        {filtered.map(record => (
          <div key={record.id} className="border rounded-lg p-3">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-medium">{record.title}</div>
                {record.provider && <div className="text-sm text-gray-500">{record.provider}</div>}
              </div>
              <span className="text-xs px-2 py-0.5 bg-gray-100 rounded">{record.type}</span>
            </div>
            <div className="text-sm text-gray-600 mt-2">
              Date: {new Date(record.date).toLocaleDateString()}
              {record.nextDate && (
                <span className="ml-3">Next: {new Date(record.nextDate).toLocaleDateString()}</span>
              )}
            </div>
            {record.notes && <div className="text-sm text-gray-500 mt-1">{record.notes}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
