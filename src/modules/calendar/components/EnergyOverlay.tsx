'use client';

import type { EnergyMapping, EnergyLevel } from '../calendar.types';

interface EnergyOverlayProps {
  mappings: EnergyMapping[];
  hours: number[];
  columns: number;
}

const ENERGY_COLORS: Record<EnergyLevel, string> = {
  PEAK: 'rgba(34, 197, 94, 0.12)',
  HIGH: 'rgba(132, 204, 22, 0.10)',
  MODERATE: 'rgba(234, 179, 8, 0.08)',
  LOW: 'rgba(249, 115, 22, 0.08)',
  RECOVERY: 'rgba(56, 189, 248, 0.08)',
};

const ENERGY_LEGEND: { level: EnergyLevel; label: string; color: string }[] = [
  { level: 'PEAK', label: 'Peak', color: '#22c55e' },
  { level: 'HIGH', label: 'High', color: '#84cc16' },
  { level: 'MODERATE', label: 'Moderate', color: '#eab308' },
  { level: 'LOW', label: 'Low', color: '#f97316' },
  { level: 'RECOVERY', label: 'Recovery', color: '#38bdf8' },
];

export function EnergyOverlay({ mappings, hours, columns }: EnergyOverlayProps) {
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}>
        {hours.map((hour) => {
          const mapping = mappings.find((m) => m.hour === hour);
          if (!mapping) return null;
          const color = ENERGY_COLORS[mapping.energyLevel];
          const rowHeight = columns === 1 ? 60 : 50;
          const top = (hour - hours[0]) * rowHeight;

          return (
            <div
              key={hour}
              style={{
                position: 'absolute',
                left: '80px',
                right: 0,
                top: `${top}px`,
                height: `${rowHeight}px`,
                background: color,
              }}
            />
          );
        })}
      </div>
      <div style={{
        position: 'absolute', top: '4px', right: '4px', zIndex: 20,
        display: 'flex', gap: '6px', padding: '4px 8px',
        background: 'rgba(255,255,255,0.95)', borderRadius: '6px',
        border: '1px solid #e5e7eb', fontSize: '10px',
      }}>
        {ENERGY_LEGEND.map((item) => (
          <div key={item.level} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: item.color }} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}
