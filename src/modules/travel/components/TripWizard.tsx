'use client';

import { useState } from 'react';

// --- Types -------------------------------------------------------------------

interface FlightOption {
  id: string;
  airline: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  stops: string;
  duration: string;
  price: number;
}

interface HotelOption {
  id: string;
  name: string;
  rating: number;
  pricePerNight: number;
  nights: number;
  totalPrice: number;
}

interface WizardData {
  // Step 1: Basics
  tripName: string;
  entityId: string;
  tripType: 'Business' | 'Personal' | 'Mixed';
  destination: string;
  departDate: string;
  returnDate: string;
  budget: number;
  travelers: number;
  // Step 2: Flight
  selectedFlight: FlightOption | null;
  // Step 3: Hotel
  selectedHotel: HotelOption | null;
  // Step 4: AI extras
  generatePackingList: boolean;
  addMeetingsToCalendar: boolean;
  bookRestaurant: boolean;
  prepBriefing: boolean;
}

interface TripWizardProps {
  open: boolean;
  onClose: () => void;
  onSave?: (data: WizardData) => void;
}

const STEPS = ['Basics', 'Flights', 'Hotel', 'Review'] as const;

const ENTITIES = [
  { id: 'entity-1', name: 'MedLink Pro' },
  { id: 'entity-2', name: 'HealthBridge' },
  { id: 'entity-3', name: 'Personal' },
];

// --- Component ---------------------------------------------------------------

export default function TripWizard({ open, onClose, onSave }: TripWizardProps) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [flightOptions, setFlightOptions] = useState<FlightOption[]>([]);
  const [hotelOptions, setHotelOptions] = useState<HotelOption[]>([]);
  const [loadingFlights, setLoadingFlights] = useState(false);
  const [loadingHotels, setLoadingHotels] = useState(false);

  const [data, setData] = useState<WizardData>({
    tripName: '',
    entityId: '',
    tripType: 'Business',
    destination: '',
    departDate: '',
    returnDate: '',
    budget: 3000,
    travelers: 1,
    selectedFlight: null,
    selectedHotel: null,
    generatePackingList: true,
    addMeetingsToCalendar: true,
    bookRestaurant: false,
    prepBriefing: true,
  });

  function update(partial: Partial<WizardData>) {
    setData((prev) => ({ ...prev, ...partial }));
  }

  // Fetch flights when moving to step 2
  async function fetchFlights() {
    setLoadingFlights(true);
    try {
      const params = new URLSearchParams({
        origin: 'LAS',
        destination: data.destination || 'JFK',
        date: data.departDate || '',
      });
      const res = await fetch(`/api/travel/flights/search?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setFlightOptions(json.data ?? json.flights ?? []);
      } else {
        setFlightOptions(getMockFlights());
      }
    } catch {
      setFlightOptions(getMockFlights());
    } finally {
      setLoadingFlights(false);
    }
  }

  // Fetch hotels when moving to step 3
  async function fetchHotels() {
    setLoadingHotels(true);
    try {
      const params = new URLSearchParams({
        destination: data.destination || 'New York',
        checkIn: data.departDate || '',
        checkOut: data.returnDate || '',
      });
      const res = await fetch(`/api/travel/hotels/search?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setHotelOptions(json.data ?? json.hotels ?? []);
      } else {
        setHotelOptions(getMockHotels());
      }
    } catch {
      setHotelOptions(getMockHotels());
    } finally {
      setLoadingHotels(false);
    }
  }

  function handleNext() {
    if (step === 0) {
      fetchFlights();
      setStep(1);
    } else if (step === 1) {
      fetchHotels();
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  }

  function handleBack() {
    if (step > 0) setStep(step - 1);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch('/api/travel/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.tripName || `Trip to ${data.destination}`,
          destination: data.destination,
          origin: 'Las Vegas',
          startDate: data.departDate,
          endDate: data.returnDate,
          type: data.tripType,
          entityId: data.entityId || 'entity-1',
          budget: data.budget,
        }),
      });
      onSave?.(data);
      onClose();
    } catch {
      // still close on error for demo
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const budgetRemaining =
    data.budget - (data.selectedFlight?.price ?? 0) - (data.selectedHotel?.totalPrice ?? 0);
  const budgetUsedPct = data.budget > 0
    ? Math.round(((data.budget - budgetRemaining) / data.budget) * 100)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Plan New Trip</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1 px-6 pt-4 pb-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center flex-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                  ${i < step ? 'bg-blue-600 text-white' : i === step ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}
              >
                {i < step ? '\u2713' : i + 1}
              </div>
              <span
                className={`ml-2 text-sm font-medium hidden sm:inline ${i === step ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}
              >
                {label}
              </span>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${i < step ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          {step === 0 && <StepBasics data={data} update={update} />}
          {step === 1 && (
            <StepFlights
              loading={loadingFlights}
              flights={flightOptions}
              selected={data.selectedFlight}
              onSelect={(f) => update({ selectedFlight: f })}
            />
          )}
          {step === 2 && (
            <StepHotel
              loading={loadingHotels}
              hotels={hotelOptions}
              selected={data.selectedHotel}
              budgetRemaining={budgetRemaining + (data.selectedHotel?.totalPrice ?? 0)}
              onSelect={(h) => update({ selectedHotel: h })}
            />
          )}
          {step === 3 && (
            <StepReview
              data={data}
              budgetUsedPct={budgetUsedPct}
              budgetRemaining={budgetRemaining}
              update={update}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          {step === 0 ? (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={handleBack}
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              {'\u2190'} Back
            </button>
          )}

          {step < 3 ? (
            <button
              onClick={handleNext}
              className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Next: {STEPS[step + 1]} {'\u2192'}
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {saving ? 'Saving...' : 'Save Trip'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Step Components ---------------------------------------------------------

function StepBasics({
  data,
  update,
}: {
  data: WizardData;
  update: (p: Partial<WizardData>) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Trip Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Trip Name <span className="text-gray-400">(optional)</span>
        </label>
        <input
          type="text"
          value={data.tripName}
          onChange={(e) => update({ tripName: e.target.value })}
          placeholder="e.g. NYC Healthcare Conference"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Entity + Trip Type */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Entity
          </label>
          <select
            value={data.entityId}
            onChange={(e) => update({ entityId: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select entity...</option>
            {ENTITIES.map((ent) => (
              <option key={ent.id} value={ent.id}>
                {ent.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Trip Type
          </label>
          <select
            value={data.tripType}
            onChange={(e) => update({ tripType: e.target.value as WizardData['tripType'] })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
          >
            <option value="Business">Business</option>
            <option value="Personal">Personal</option>
            <option value="Mixed">Mixed</option>
          </select>
        </div>
      </div>

      {/* Destination */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Destination
        </label>
        <input
          type="text"
          value={data.destination}
          onChange={(e) => update({ destination: e.target.value })}
          placeholder="Search city or airport..."
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Depart Date
          </label>
          <input
            type="date"
            value={data.departDate}
            onChange={(e) => update({ departDate: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Return Date
          </label>
          <input
            type="date"
            value={data.returnDate}
            onChange={(e) => update({ returnDate: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Budget + Travelers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Budget ($)
          </label>
          <input
            type="number"
            value={data.budget}
            onChange={(e) => update({ budget: Number(e.target.value) })}
            min={0}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Travelers
          </label>
          <input
            type="number"
            value={data.travelers}
            onChange={(e) => update({ travelers: Number(e.target.value) })}
            min={1}
            max={20}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  );
}

function StepFlights({
  loading,
  flights,
  selected,
  onSelect,
}: {
  loading: boolean;
  flights: FlightOption[];
  selected: FlightOption | null;
  onSelect: (f: FlightOption) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">Searching flights...</p>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Select a flight or add one manually.
      </p>

      {flights.map((flight) => {
        const isSelected = selected?.id === flight.id;
        return (
          <div
            key={flight.id}
            className={`border rounded-lg p-4 transition-colors cursor-pointer ${
              isSelected
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600'
            }`}
            onClick={() => onSelect(flight)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {flight.airline}
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {flight.flightNumber}
                </span>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-green-600 dark:text-green-400">
                  ${flight.price}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
              <span>
                {flight.origin} {flight.departureTime} {'\u2192'} {flight.destination}{' '}
                {flight.arrivalTime}
              </span>
              <span className="text-gray-400">|</span>
              <span>{flight.stops}</span>
              <span className="text-gray-400">|</span>
              <span>{flight.duration}</span>
            </div>
            {isSelected && (
              <div className="mt-2 text-sm font-medium text-blue-600 dark:text-blue-400">
                {'\u2713'} Selected
              </div>
            )}
          </div>
        );
      })}

      <button className="w-full py-2 text-sm font-medium text-blue-600 dark:text-blue-400 border border-dashed border-blue-300 dark:border-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
        + Add flight manually
      </button>
    </div>
  );
}

function StepHotel({
  loading,
  hotels,
  selected,
  budgetRemaining,
  onSelect,
}: {
  loading: boolean;
  hotels: HotelOption[];
  selected: HotelOption | null;
  budgetRemaining: number;
  onSelect: (h: HotelOption) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">Searching hotels...</p>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Select accommodation for your trip.
        </p>
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
          Budget remaining: <span className="text-green-600 dark:text-green-400">${budgetRemaining.toLocaleString()}</span>
        </span>
      </div>

      {hotels.map((hotel) => {
        const isSelected = selected?.id === hotel.id;
        return (
          <div
            key={hotel.id}
            className={`border rounded-lg p-4 transition-colors cursor-pointer ${
              isSelected
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600'
            }`}
            onClick={() => onSelect(hotel)}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {hotel.name}
                </div>
                <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
                  <span className="text-yellow-500">{'\u2605'}</span>
                  <span>{hotel.rating}</span>
                  <span className="text-gray-400">|</span>
                  <span>${hotel.pricePerNight}/night</span>
                  <span className="text-gray-400">|</span>
                  <span>{hotel.nights} nights = ${hotel.totalPrice}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-green-600 dark:text-green-400">
                  ${hotel.totalPrice}
                </div>
              </div>
            </div>
            {isSelected && (
              <div className="mt-2 text-sm font-medium text-blue-600 dark:text-blue-400">
                {'\u2713'} Selected
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StepReview({
  data,
  budgetUsedPct,
  budgetRemaining,
  update,
}: {
  data: WizardData;
  budgetUsedPct: number;
  budgetRemaining: number;
  update: (p: Partial<WizardData>) => void;
}) {
  const totalSpent = (data.selectedFlight?.price ?? 0) + (data.selectedHotel?.totalPrice ?? 0);

  return (
    <div className="space-y-5">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Trip Summary</h3>

      {/* Trip info */}
      <div className="bg-gray-50 dark:bg-gray-900/30 rounded-lg p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">Trip</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {data.tripName || `Trip to ${data.destination}`}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">Destination</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">{data.destination || 'Not set'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">Dates</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {data.departDate || '?'} {'\u2013'} {data.returnDate || '?'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">Type</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">{data.tripType}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">Travelers</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">{data.travelers}</span>
        </div>
      </div>

      {/* Flight */}
      {data.selectedFlight && (
        <div className="bg-gray-50 dark:bg-gray-900/30 rounded-lg p-4 text-sm">
          <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 tracking-widest uppercase mb-2">
            Flight
          </div>
          <div className="flex justify-between">
            <span className="text-gray-900 dark:text-gray-100">
              {data.selectedFlight.airline} {data.selectedFlight.flightNumber}
            </span>
            <span className="font-medium text-green-600 dark:text-green-400">
              ${data.selectedFlight.price}
            </span>
          </div>
          <div className="text-gray-500 dark:text-gray-400 mt-1">
            {data.selectedFlight.origin} {data.selectedFlight.departureTime} {'\u2192'}{' '}
            {data.selectedFlight.destination} {data.selectedFlight.arrivalTime} | {data.selectedFlight.stops} |{' '}
            {data.selectedFlight.duration}
          </div>
        </div>
      )}

      {/* Hotel */}
      {data.selectedHotel && (
        <div className="bg-gray-50 dark:bg-gray-900/30 rounded-lg p-4 text-sm">
          <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 tracking-widest uppercase mb-2">
            Hotel
          </div>
          <div className="flex justify-between">
            <span className="text-gray-900 dark:text-gray-100">{data.selectedHotel.name}</span>
            <span className="font-medium text-green-600 dark:text-green-400">
              ${data.selectedHotel.totalPrice}
            </span>
          </div>
          <div className="text-gray-500 dark:text-gray-400 mt-1">
            {data.selectedHotel.nights} nights @ ${data.selectedHotel.pricePerNight}/night |{' '}
            {'\u2605'} {data.selectedHotel.rating}
          </div>
        </div>
      )}

      {/* Budget bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">
            Budget: ${totalSpent.toLocaleString()} / ${data.budget.toLocaleString()} ({budgetUsedPct}% used)
          </span>
          <span className={`font-medium ${budgetRemaining >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            ${budgetRemaining.toLocaleString()} remaining
          </span>
        </div>
        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${budgetUsedPct >= 90 ? 'bg-red-500' : budgetUsedPct >= 70 ? 'bg-yellow-500' : 'bg-blue-600'}`}
            style={{ width: `${Math.min(budgetUsedPct, 100)}%` }}
          />
        </div>
      </div>

      {/* AI Extras */}
      <div className="space-y-3">
        <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 tracking-widest uppercase">
          AI Extras
        </div>
        {[
          { key: 'generatePackingList' as const, label: 'Generate packing list' },
          { key: 'addMeetingsToCalendar' as const, label: 'Add meetings to calendar' },
          { key: 'bookRestaurant' as const, label: 'Book restaurant reservations' },
          { key: 'prepBriefing' as const, label: 'Prep travel briefing' },
        ].map((opt) => (
          <label key={opt.key} className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={data[opt.key]}
              onChange={(e) => update({ [opt.key]: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// --- Mock Data Fallbacks -----------------------------------------------------

function getMockFlights(): FlightOption[] {
  return [
    {
      id: 'fl-1',
      airline: 'Delta',
      flightNumber: 'DL1234',
      origin: 'LAS',
      destination: 'JFK',
      departureTime: '6:00am',
      arrivalTime: '1:30pm',
      stops: 'Direct',
      duration: '4h 30m',
      price: 289,
    },
    {
      id: 'fl-2',
      airline: 'United',
      flightNumber: 'UA567',
      origin: 'LAS',
      destination: 'JFK',
      departureTime: '8:15am',
      arrivalTime: '4:00pm',
      stops: '1 stop (DEN)',
      duration: '5h 45m',
      price: 245,
    },
    {
      id: 'fl-3',
      airline: 'Southwest',
      flightNumber: 'WN890',
      origin: 'LAS',
      destination: 'JFK',
      departureTime: '7:00am',
      arrivalTime: '2:30pm',
      stops: 'Direct',
      duration: '4h 30m',
      price: 198,
    },
  ];
}

function getMockHotels(): HotelOption[] {
  return [
    {
      id: 'ht-1',
      name: 'Marriott Midtown',
      rating: 4.3,
      pricePerNight: 189,
      nights: 3,
      totalPrice: 567,
    },
    {
      id: 'ht-2',
      name: 'Hilton Garden Inn',
      rating: 4.1,
      pricePerNight: 159,
      nights: 3,
      totalPrice: 477,
    },
    {
      id: 'ht-3',
      name: 'Hampton Inn',
      rating: 3.9,
      pricePerNight: 129,
      nights: 3,
      totalPrice: 387,
    },
  ];
}
