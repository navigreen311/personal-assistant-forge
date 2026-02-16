'use client';

import { useState } from 'react';
import type { TravelPreferences } from '../types';

export default function TravelPreferencesForm({
  preferences,
  onSave,
}: {
  preferences: TravelPreferences;
  onSave: (p: TravelPreferences) => void;
}) {
  const [form, setForm] = useState<TravelPreferences>(preferences);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Budget Per Day (USD)</label>
        <input
          type="number"
          value={form.budgetPerDayUsd}
          onChange={e => setForm({ ...form, budgetPerDayUsd: Number(e.target.value) })}
          className="w-full border rounded-md px-3 py-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Airports</label>
        <input
          type="text"
          value={form.preferredAirports.join(', ')}
          onChange={e => setForm({ ...form, preferredAirports: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
          className="w-full border rounded-md px-3 py-2"
          placeholder="DFW, ORD, LAX"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Dietary Restrictions</label>
        <input
          type="text"
          value={form.dietary.join(', ')}
          onChange={e => setForm({ ...form, dietary: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
          className="w-full border rounded-md px-3 py-2"
          placeholder="Vegetarian, Gluten-free"
        />
      </div>

      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">Airlines ({form.airlines.length})</h4>
        {form.airlines.map((airline, idx) => (
          <div key={idx} className="flex gap-2 mb-2">
            <input
              type="text"
              value={airline.name}
              onChange={e => {
                const airlines = [...form.airlines];
                airlines[idx] = { ...airlines[idx], name: e.target.value };
                setForm({ ...form, airlines });
              }}
              className="flex-1 border rounded-md px-3 py-2 text-sm"
              placeholder="Airline name"
            />
            <input
              type="text"
              value={airline.seatPreference}
              onChange={e => {
                const airlines = [...form.airlines];
                airlines[idx] = { ...airlines[idx], seatPreference: e.target.value };
                setForm({ ...form, airlines });
              }}
              className="w-24 border rounded-md px-3 py-2 text-sm"
              placeholder="Seat"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setForm({ ...form, airlines: [...form.airlines, { name: '', seatPreference: 'aisle', class: 'economy', loyaltyNumber: '' }] })}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          + Add Airline
        </button>
      </div>

      <button
        type="submit"
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
      >
        Save Preferences
      </button>
    </form>
  );
}
