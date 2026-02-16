'use client';

import type { EnergyForecast } from '../types';

export default function EnergyTimeline({ forecast }: { forecast: EnergyForecast }) {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Energy Forecast</h3>
      <div className="text-sm text-gray-500">{forecast.date}</div>
      <div className="flex items-end gap-0.5 h-40">
        {forecast.hourlyEnergy
          .filter(h => h.hour >= 6 && h.hour <= 22)
          .map(entry => {
            const isPeak = forecast.peakHours.includes(entry.hour);
            const isTrough = forecast.troughHours.includes(entry.hour);

            return (
              <div key={entry.hour} className="flex flex-col items-center flex-1" title={`${entry.hour}:00 - Energy: ${entry.energyLevel}%`}>
                <div
                  className={`w-full rounded-t ${isPeak ? 'bg-green-500' : isTrough ? 'bg-red-400' : 'bg-blue-400'}`}
                  style={{ height: `${entry.energyLevel}%` }}
                />
                <div className="text-[10px] text-gray-400 mt-1">{entry.hour}</div>
              </div>
            );
          })}
      </div>
      <div className="flex gap-4 text-xs">
        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-green-500 rounded" /> Peak</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-400 rounded" /> Normal</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-red-400 rounded" /> Trough</div>
      </div>
      <p className="text-sm text-gray-600">{forecast.recommendation}</p>
    </div>
  );
}
