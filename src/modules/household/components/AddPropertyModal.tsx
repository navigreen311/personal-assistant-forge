'use client';

import { useState } from 'react';
import type { Property } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NewProperty = Omit<Property, 'id' | 'userId' | 'activeTasks' | 'overdueTasks' | 'providerCount'>;

interface AddPropertyModalProps {
  onClose: () => void;
  onSave: (property: NewProperty) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROPERTY_TYPES: { value: Property['type']; label: string }[] = [
  { value: 'PRIMARY', label: 'Primary Residence' },
  { value: 'RENTAL', label: 'Rental' },
  { value: 'VACATION', label: 'Vacation' },
  { value: 'COMMERCIAL', label: 'Commercial' },
];

const OWNERSHIP_TYPES: { value: Property['ownership']; label: string }[] = [
  { value: 'OWN', label: 'Own' },
  { value: 'RENT', label: 'Rent' },
  { value: 'MANAGE', label: 'Manage' },
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const inputClass =
  'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none';

const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AddPropertyModal({ onClose, onSave }: AddPropertyModalProps) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [type, setType] = useState<Property['type']>('PRIMARY');
  const [ownership, setOwnership] = useState<Property['ownership']>('OWN');
  const [moveInDate, setMoveInDate] = useState('');
  const [beds, setBeds] = useState('');
  const [baths, setBaths] = useState('');
  const [sqft, setSqft] = useState('');
  const [yearBuilt, setYearBuilt] = useState('');
  const [mortgage, setMortgage] = useState('');
  const [insurance, setInsurance] = useState('');
  const [hoa, setHoa] = useState('');
  const [utilities, setUtilities] = useState('');
  const [generatingSchedule, setGeneratingSchedule] = useState(false);

  const canSave = name.trim() && address.trim() && city.trim() && state.trim();

  function handleSave() {
    if (!canSave) return;

    const property: NewProperty = {
      name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      type,
      ownership,
      moveInDate: moveInDate ? new Date(moveInDate) : undefined,
      beds: beds ? parseInt(beds, 10) : undefined,
      baths: baths ? parseInt(baths, 10) : undefined,
      sqft: sqft ? parseInt(sqft, 10) : undefined,
      yearBuilt: yearBuilt ? parseInt(yearBuilt, 10) : undefined,
      monthlyCosts: {
        mortgage: mortgage ? parseFloat(mortgage) : 0,
        insurance: insurance ? parseFloat(insurance) : 0,
        utilities: utilities ? parseFloat(utilities) : 0,
        hoa: hoa ? parseFloat(hoa) : 0,
        maintenance: 0,
      },
    };

    onSave(property);
  }

  function handleGenerateSchedule() {
    setGeneratingSchedule(true);
    // Simulate AI generation
    setTimeout(() => {
      setGeneratingSchedule(false);
    }, 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 mx-4 w-full max-w-2xl rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Add Property</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Property Name */}
            <div className="sm:col-span-2">
              <label className={labelClass}>
                Property Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. 123 Main Street"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Address */}
            <div className="sm:col-span-2">
              <label className={labelClass}>
                Address <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Street address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* City */}
            <div>
              <label className={labelClass}>
                City <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="City"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* State */}
            <div>
              <label className={labelClass}>
                State <span className="text-red-500">*</span>
              </label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className={inputClass}
              >
                <option value="">Select state</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Property Type */}
            <div>
              <label className={labelClass}>Property Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as Property['type'])}
                className={inputClass}
              >
                {PROPERTY_TYPES.map((pt) => (
                  <option key={pt.value} value={pt.value}>{pt.label}</option>
                ))}
              </select>
            </div>

            {/* Ownership */}
            <div>
              <label className={labelClass}>Ownership</label>
              <select
                value={ownership}
                onChange={(e) => setOwnership(e.target.value as Property['ownership'])}
                className={inputClass}
              >
                {OWNERSHIP_TYPES.map((ot) => (
                  <option key={ot.value} value={ot.value}>{ot.label}</option>
                ))}
              </select>
            </div>

            {/* Move-in Date */}
            <div>
              <label className={labelClass}>Move-in Date</label>
              <input
                type="date"
                value={moveInDate}
                onChange={(e) => setMoveInDate(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Year Built */}
            <div>
              <label className={labelClass}>Year Built</label>
              <input
                type="number"
                placeholder="e.g. 2018"
                value={yearBuilt}
                onChange={(e) => setYearBuilt(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Beds */}
            <div>
              <label className={labelClass}>Beds</label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={beds}
                onChange={(e) => setBeds(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Baths */}
            <div>
              <label className={labelClass}>Baths</label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={baths}
                onChange={(e) => setBaths(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Sqft */}
            <div className="sm:col-span-2">
              <label className={labelClass}>Square Footage</label>
              <input
                type="number"
                min="0"
                placeholder="e.g. 2400"
                value={sqft}
                onChange={(e) => setSqft(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Costs heading */}
            <div className="sm:col-span-2">
              <h3 className="mt-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                Monthly Costs
              </h3>
            </div>

            {/* Mortgage / Rent */}
            <div>
              <label className={labelClass}>Mortgage / Rent ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={mortgage}
                onChange={(e) => setMortgage(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Insurance */}
            <div>
              <label className={labelClass}>Insurance ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={insurance}
                onChange={(e) => setInsurance(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* HOA */}
            <div>
              <label className={labelClass}>HOA ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={hoa}
                onChange={(e) => setHoa(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Utilities */}
            <div>
              <label className={labelClass}>Utilities ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={utilities}
                onChange={(e) => setUtilities(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* AI Generate Schedule */}
            <div className="sm:col-span-2">
              <button
                type="button"
                onClick={handleGenerateSchedule}
                disabled={generatingSchedule}
                className="w-full rounded-lg border border-purple-300 bg-purple-50 px-4 py-2.5 text-sm font-medium text-purple-700 transition hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed dark:border-purple-600 dark:bg-purple-900/20 dark:text-purple-400 dark:hover:bg-purple-900/30"
              >
                {generatingSchedule ? 'Generating...' : '✨ AI: Generate maintenance schedule'}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Property
          </button>
        </div>
      </div>
    </div>
  );
}
