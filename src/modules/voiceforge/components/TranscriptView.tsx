'use client';

import type { TranscriptSegment } from '@/modules/voiceforge/types';

export function TranscriptView({ segments }: { segments: TranscriptSegment[] }) {
  if (segments.length === 0) {
    return <p className="text-sm text-gray-500 py-4 text-center">No transcript available</p>;
  }

  return (
    <div className="space-y-3">
      {segments.map((seg, i) => (
        <div key={i} className={`flex gap-3 ${seg.speaker === 'AGENT' ? 'justify-start' : 'justify-end'}`}>
          <div
            className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
              seg.speaker === 'AGENT'
                ? 'bg-indigo-50 text-indigo-900'
                : 'bg-gray-100 text-gray-900'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold">
                {seg.speaker === 'AGENT' ? 'AI Agent' : 'Caller'}
              </span>
              <span className="text-xs text-gray-400">
                {formatTime(seg.startTime)} - {formatTime(seg.endTime)}
              </span>
            </div>
            <p>{seg.text}</p>
            <div className="mt-1 text-xs text-gray-400">
              Sentiment: {seg.sentiment.toFixed(2)} | Confidence: {(seg.confidence * 100).toFixed(0)}%
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
