'use client';

import { useState, useEffect } from 'react';

interface Props {
  userId: string;
}

export default function TimeSavedCounter({ userId }: Props) {
  const [display, setDisplay] = useState('0m saved');
  const [totalMinutes, setTotalMinutes] = useState(0);

  useEffect(() => {
    async function fetchTotal() {
      try {
        const { getRunningTotal } = await import('../time-saved-service');
        const result = await getRunningTotal(userId);
        setDisplay(result.formattedDisplay);
        setTotalMinutes(result.totalMinutes);
      } catch {
        // Fallback for SSR or missing data
      }
    }
    fetchTotal();
    const interval = setInterval(fetchTotal, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  return (
    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg shadow-lg p-6 text-white">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-blue-100">Time Saved</p>
          <p className="text-3xl font-bold mt-1">{display}</p>
        </div>
        <div className="bg-white/20 rounded-full p-3">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      </div>
      {totalMinutes > 0 && (
        <p className="text-xs text-blue-200 mt-2">
          That&apos;s {Math.round(totalMinutes / 60 * 10) / 10} hours you didn&apos;t have to spend on manual tasks.
        </p>
      )}
    </div>
  );
}
