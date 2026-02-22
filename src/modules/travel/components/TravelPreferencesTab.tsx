'use client';

import { useState, useCallback } from 'react';

interface TravelPreferencesTabProps {
  entityId?: string;
}

interface RankedItem {
  id: string;
  name: string;
}

const AIRPORTS = [
  { code: 'LAS', label: 'LAS — Las Vegas' },
  { code: 'LAX', label: 'LAX — Los Angeles' },
  { code: 'SFO', label: 'SFO — San Francisco' },
  { code: 'JFK', label: 'JFK — New York (JFK)' },
  { code: 'ORD', label: "ORD — Chicago O'Hare" },
  { code: 'DFW', label: 'DFW — Dallas/Fort Worth' },
  { code: 'ATL', label: 'ATL — Atlanta' },
  { code: 'MIA', label: 'MIA — Miami' },
  { code: 'SEA', label: 'SEA — Seattle' },
  { code: 'DEN', label: 'DEN — Denver' },
];

const DEFAULT_AIRLINES: RankedItem[] = [
  { id: 'delta', name: 'Delta' },
  { id: 'united', name: 'United' },
  { id: 'american', name: 'American' },
  { id: 'southwest', name: 'Southwest' },
  { id: 'jetblue', name: 'JetBlue' },
  { id: 'alaska', name: 'Alaska' },
];

const DEFAULT_HOTELS: RankedItem[] = [
  { id: 'marriott', name: 'Marriott' },
  { id: 'hilton', name: 'Hilton' },
  { id: 'hyatt', name: 'Hyatt' },
  { id: 'ihg', name: 'IHG' },
  { id: 'wyndham', name: 'Wyndham' },
  { id: 'bestwestern', name: 'Best Western' },
];

function isPassportExpiringSoon(dateStr: string): boolean {
  if (!dateStr) return false;
  const expiry = new Date(dateStr);
  const now = new Date();
  const sixMonths = new Date(now);
  sixMonths.setMonth(sixMonths.getMonth() + 6);
  return expiry <= sixMonths && expiry > now;
}

function isPassportExpired(dateStr: string): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) <= new Date();
}

function RankedList({
  items,
  onReorder,
  label,
}: {
  items: RankedItem[];
  onReorder: (items: RankedItem[]) => void;
  label: string;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const reordered = [...items];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(index, 0, moved);
    onReorder(reordered);
    setDragIndex(index);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
  };

  const moveItem = (fromIndex: number, direction: -1 | 1) => {
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= items.length) return;
    const reordered = [...items];
    [reordered[fromIndex], reordered[toIndex]] = [reordered[toIndex], reordered[fromIndex]];
    onReorder(reordered);
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {label}
      </label>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
        Drag to reorder or use arrows. Top = most preferred.
      </p>
      <div className="space-y-1">
        {items.map((item, index) => (
          <div
            key={item.id}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            className={`flex items-center gap-2 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 cursor-grab active:cursor-grabbing transition-shadow ${
              dragIndex === index ? 'shadow-md ring-2 ring-blue-300' : ''
            }`}
          >
            <span className="text-xs font-bold text-gray-400 dark:text-gray-500 w-5 text-center">
              {index + 1}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400 select-none">⠇</span>
            <span className="flex-1 text-sm text-gray-800 dark:text-gray-200">{item.name}</span>
            <button
              type="button"
              onClick={() => moveItem(index, -1)}
              disabled={index === 0}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 text-xs px-1"
              aria-label={`Move ${item.name} up`}
            >
              ▲
            </button>
            <button
              type="button"
              onClick={() => moveItem(index, 1)}
              disabled={index === items.length - 1}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 text-xs px-1"
              aria-label={`Move ${item.name} down`}
            >
              ▼
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TravelPreferencesTab({ entityId }: TravelPreferencesTabProps) {
  const [isEditing, setIsEditing] = useState(false);

  const [homeAirport, setHomeAirport] = useState('LAS');
  const [seatPreference, setSeatPreference] = useState<'Aisle' | 'Window' | 'Middle' | 'No preference'>('Aisle');
  const [cabinClass, setCabinClass] = useState<'Economy' | 'Premium Economy' | 'Business' | 'First'>('Economy');
  const [airlines, setAirlines] = useState<RankedItem[]>(DEFAULT_AIRLINES);
  const [hotels, setHotels] = useState<RankedItem[]>(DEFAULT_HOTELS);
  const [dietaryNeeds, setDietaryNeeds] = useState<'None' | 'Vegetarian' | 'Vegan' | 'Gluten-free' | 'Kosher' | 'Halal' | 'Other'>('None');
  const [dietaryOther, setDietaryOther] = useState('');
  const [tsaPrecheck, setTsaPrecheck] = useState('');
  const [globalEntry, setGlobalEntry] = useState('');
  const [passportExpiry, setPassportExpiry] = useState('');
  const [driversLicenseExpiry, setDriversLicenseExpiry] = useState('');

  // Defaults section state
  const [defaultTripType, setDefaultTripType] = useState<'Business' | 'Personal'>('Business');
  const [defaultEntity, setDefaultEntity] = useState<'MedLink Pro' | 'Personal'>('MedLink Pro');
  const [autoPackingList, setAutoPackingList] = useState(true);
  const [autoExpenseCategory, setAutoExpenseCategory] = useState(true);
  const [monitorFlightStatus, setMonitorFlightStatus] = useState(true);

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const payload = {
        homeAirport, seatPreference, cabinClass,
        airlines: airlines.map((a) => a.name),
        hotels: hotels.map((h) => h.name),
        dietaryNeeds: dietaryNeeds === 'Other' ? dietaryOther : dietaryNeeds,
        tsaPrecheck, globalEntry, passportExpiry, driversLicenseExpiry,
        defaultTripType, defaultEntity,
        autoPackingList, autoExpenseCategory, monitorFlightStatus,
      };
      await fetch('/api/travel/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      console.log('Saved preferences for entity:', entityId, payload);
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save preferences:', err);
    } finally {
      setIsSaving(false);
    }
  }, [entityId, homeAirport, seatPreference, cabinClass, airlines, hotels, dietaryNeeds, dietaryOther, tsaPrecheck, globalEntry, passportExpiry, driversLicenseExpiry, defaultTripType, defaultEntity, autoPackingList, autoExpenseCategory, monitorFlightStatus]);

  const passportWarning = passportExpiry && isPassportExpiringSoon(passportExpiry);
  const passportExpired = passportExpiry && isPassportExpired(passportExpiry);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Travel Preferences</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Set your default travel preferences for faster booking.</p>
        </div>
        {!isEditing && (
          <button type="button" onClick={() => setIsEditing(true)} className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium">
            Edit
          </button>
        )}
      </div>

      {/* Flight Preferences Card */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 space-y-5">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide">Flight Preferences</h4>

        {/* Home Airport */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Home Airport</label>
          {isEditing ? (
            <select value={homeAirport} onChange={(e) => setHomeAirport(e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              {AIRPORTS.map((airport) => (
                <option key={airport.code} value={airport.code}>{airport.label}</option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-gray-800 dark:text-gray-200">{AIRPORTS.find((a) => a.code === homeAirport)?.label ?? homeAirport}</p>
          )}
        </div>

        {/* Seat Preference */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Seat Preference</label>
          {isEditing ? (
            <div className="flex gap-3">
              {(['Aisle', 'Window', 'Middle', 'No preference'] as const).map((option) => (
                <label key={option} className={`flex items-center gap-2 border rounded-lg px-4 py-2 cursor-pointer transition-colors text-sm ${seatPreference === option ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-500' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                  <input type="radio" name="seatPreference" value={option} checked={seatPreference === option} onChange={() => setSeatPreference(option)} className="sr-only" />
                  {option}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-800 dark:text-gray-200">{seatPreference}</p>
          )}
        </div>

        {/* Cabin Class */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cabin Class</label>
          {isEditing ? (
            <div className="flex flex-wrap gap-3">
              {(['Economy', 'Premium Economy', 'Business', 'First'] as const).map((option) => (
                <label key={option} className={`flex items-center gap-2 border rounded-lg px-4 py-2 cursor-pointer transition-colors text-sm ${cabinClass === option ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-500' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                  <input type="radio" name="cabinClass" value={option} checked={cabinClass === option} onChange={() => setCabinClass(option)} className="sr-only" />
                  {option}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-800 dark:text-gray-200">{cabinClass}</p>
          )}
        </div>

        {/* Airline Preferences */}
        {isEditing ? (
          <RankedList items={airlines} onReorder={setAirlines} label="Airline Preferences" />
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Airline Preferences</label>
            <div className="flex flex-wrap gap-2">
              {airlines.map((airline, idx) => (
                <span key={airline.id} className="inline-flex items-center gap-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-3 py-1 rounded-full">
                  <span className="text-xs font-bold text-gray-400">{idx + 1}.</span> {airline.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Hotel Preferences Card */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 space-y-5">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide">Hotel Preferences</h4>
        {isEditing ? (
          <RankedList items={hotels} onReorder={setHotels} label="Hotel Chain Preferences" />
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hotel Chain Preferences</label>
            <div className="flex flex-wrap gap-2">
              {hotels.map((hotel, idx) => (
                <span key={hotel.id} className="inline-flex items-center gap-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-3 py-1 rounded-full">
                  <span className="text-xs font-bold text-gray-400">{idx + 1}.</span> {hotel.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Dietary & Documents Card */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 space-y-5">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide">Dietary & Travel Documents</h4>

        {/* Dietary Needs */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dietary Needs</label>
          {isEditing ? (
            <div className="space-y-2">
              <select value={dietaryNeeds} onChange={(e) => setDietaryNeeds(e.target.value as typeof dietaryNeeds)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                {(['None', 'Vegetarian', 'Vegan', 'Gluten-free', 'Kosher', 'Halal', 'Other'] as const).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              {dietaryNeeds === 'Other' && (
                <input type="text" value={dietaryOther} onChange={(e) => setDietaryOther(e.target.value)} placeholder="Describe your dietary needs" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-800 dark:text-gray-200">
              {dietaryNeeds === 'Other' ? dietaryOther || 'Other' : dietaryNeeds}
            </p>
          )}
        </div>

        {/* TSA PreCheck */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">TSA PreCheck Number</label>
          {isEditing ? (
            <input type="text" value={tsaPrecheck} onChange={(e) => setTsaPrecheck(e.target.value)} placeholder="Known Traveler Number" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          ) : (
            <p className="text-sm text-gray-800 dark:text-gray-200">
              {tsaPrecheck || <span className="text-gray-400 italic">Not set</span>}
            </p>
          )}
        </div>

        {/* Global Entry */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Global Entry Number</label>
          {isEditing ? (
            <input type="text" value={globalEntry} onChange={(e) => setGlobalEntry(e.target.value)} placeholder="PASSID / Global Entry Number" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          ) : (
            <p className="text-sm text-gray-800 dark:text-gray-200">
              {globalEntry || <span className="text-gray-400 italic">Not set</span>}
            </p>
          )}
        </div>

        {/* Passport Expiry */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Passport Expiry Date</label>
          {isEditing ? (
            <div className="space-y-1">
              <input type="date" value={passportExpiry} onChange={(e) => setPassportExpiry(e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              <p className="text-xs text-gray-500 dark:text-gray-400">&#9888; You will be alerted 6 months before expiry</p>
            </div>
          ) : (
            <p className="text-sm text-gray-800 dark:text-gray-200">
              {passportExpiry
                ? new Date(passportExpiry).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                : <span className="text-gray-400 italic">Not set</span>}
            </p>
          )}

          {passportExpired && (
            <div className="mt-2 flex items-center gap-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg px-3 py-2">
              <span>🚨</span>
              <span className="text-sm text-red-700 dark:text-red-300 font-medium">
                Your passport has expired. Renew immediately before booking international travel.
              </span>
            </div>
          )}
          {passportWarning && !passportExpired && (
            <div className="mt-2 flex items-center gap-2 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg px-3 py-2">
              <span>⚠️</span>
              <span className="text-sm text-yellow-700 dark:text-yellow-300 font-medium">
                Your passport expires within 6 months. Many countries require at least 6 months validity — consider renewing soon.
              </span>
            </div>
          )}
        </div>

        {/* Driver's License Expiry */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Driver&apos;s License Expiry Date</label>
          {isEditing ? (
            <input type="date" value={driversLicenseExpiry} onChange={(e) => setDriversLicenseExpiry(e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          ) : (
            <p className="text-sm text-gray-800 dark:text-gray-200">
              {driversLicenseExpiry
                ? new Date(driversLicenseExpiry).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                : <span className="text-gray-400 italic">Not set</span>}
            </p>
          )}
        </div>
      </div>

      {/* Defaults Card */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 space-y-5">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide">Defaults</h4>

        {/* Default Trip Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Trip Type</label>
          {isEditing ? (
            <select value={defaultTripType} onChange={(e) => setDefaultTripType(e.target.value as 'Business' | 'Personal')} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              <option value="Business">Business</option>
              <option value="Personal">Personal</option>
            </select>
          ) : (
            <p className="text-sm text-gray-800 dark:text-gray-200">{defaultTripType}</p>
          )}
        </div>

        {/* Default Entity */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Entity</label>
          {isEditing ? (
            <select value={defaultEntity} onChange={(e) => setDefaultEntity(e.target.value as 'MedLink Pro' | 'Personal')} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              <option value="MedLink Pro">MedLink Pro</option>
              <option value="Personal">Personal</option>
            </select>
          ) : (
            <p className="text-sm text-gray-800 dark:text-gray-200">{defaultEntity}</p>
          )}
        </div>

        {/* Automation Checkboxes */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Automation</label>
          <label className={`flex items-center gap-3 ${isEditing ? 'cursor-pointer' : 'cursor-default'}`}>
            <input
              type="checkbox"
              checked={autoPackingList}
              onChange={(e) => isEditing && setAutoPackingList(e.target.checked)}
              disabled={!isEditing}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-60"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Auto-create packing list</span>
          </label>
          <label className={`flex items-center gap-3 ${isEditing ? 'cursor-pointer' : 'cursor-default'}`}>
            <input
              type="checkbox"
              checked={autoExpenseCategory}
              onChange={(e) => isEditing && setAutoExpenseCategory(e.target.checked)}
              disabled={!isEditing}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-60"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Auto-add travel expense category</span>
          </label>
          <label className={`flex items-center gap-3 ${isEditing ? 'cursor-pointer' : 'cursor-default'}`}>
            <input
              type="checkbox"
              checked={monitorFlightStatus}
              onChange={(e) => isEditing && setMonitorFlightStatus(e.target.checked)}
              disabled={!isEditing}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-60"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Monitor flight status</span>
          </label>
        </div>
      </div>

      {/* Save Button */}
      {isEditing && (
        <div className="flex gap-3">
          <button type="button" onClick={handleSave} disabled={isSaving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2.5 px-6 rounded-lg transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900">
            {isSaving ? 'Saving...' : 'Save Preferences'}
          </button>
          <button type="button" onClick={() => setIsEditing(false)} disabled={isSaving} className="px-6 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors disabled:opacity-50">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
