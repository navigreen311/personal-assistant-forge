'use client';

import { useState, useEffect, useRef } from 'react';

interface TranscriptSegment {
  id: string;
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
  isFinal: boolean;
}

interface TranscriptionViewerProps {
  segments: TranscriptSegment[];
  isLive?: boolean;
  interimText?: string;
  onSegmentClick?: (segment: TranscriptSegment) => void;
  onExport?: (format: 'text' | 'json') => void;
}

export default function TranscriptionViewer({
  segments,
  isLive = false,
  interimText,
  onSegmentClick,
  onExport,
}: TranscriptionViewerProps) {
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [showConfidence, setShowConfidence] = useState(false);
  const [filterSpeaker, setFilterSpeaker] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const speakers = Array.from(new Set(segments.map((s) => s.speaker)));

  const filteredSegments = filterSpeaker
    ? segments.filter((s) => s.speaker === filterSpeaker)
    : segments;

  // Auto-scroll to bottom when new segments arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [segments.length, interimText, autoScroll]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 60;
    setAutoScroll(isNearBottom);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">Transcription</h3>
          {isLive && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              Live
            </span>
          )}
          {segments.length > 0 && (
            <span className="text-xs text-gray-400">
              {segments.length} segment{segments.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTimestamps(!showTimestamps)}
            className={`rounded px-2 py-1 text-xs transition-colors ${
              showTimestamps
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            Timestamps
          </button>
          <button
            type="button"
            onClick={() => setShowConfidence(!showConfidence)}
            className={`rounded px-2 py-1 text-xs transition-colors ${
              showConfidence
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            Confidence
          </button>
          {onExport && segments.length > 0 && (
            <div className="relative group">
              <button
                type="button"
                className="rounded px-2 py-1 text-xs bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
              >
                Export
              </button>
              <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-10">
                <div className="rounded-lg border border-gray-200 bg-white shadow-lg py-1 min-w-[100px]">
                  <button
                    type="button"
                    onClick={() => onExport('text')}
                    className="w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 text-left"
                  >
                    Plain Text
                  </button>
                  <button
                    type="button"
                    onClick={() => onExport('json')}
                    className="w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 text-left"
                  >
                    JSON
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Speaker Filters */}
      {speakers.length > 1 && (
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2">
          <span className="text-xs text-gray-400">Speaker:</span>
          <button
            type="button"
            onClick={() => setFilterSpeaker(null)}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
              filterSpeaker === null
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {speakers.map((speaker) => (
            <button
              key={speaker}
              type="button"
              onClick={() => setFilterSpeaker(speaker === filterSpeaker ? null : speaker)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                filterSpeaker === speaker
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {speaker}
            </button>
          ))}
        </div>
      )}

      {/* Transcript Content */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="max-h-[400px] overflow-y-auto px-4 py-3 space-y-2"
      >
        {filteredSegments.length === 0 && !interimText ? (
          <div className="py-8 text-center">
            <svg
              className="mx-auto h-10 w-10 text-gray-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 1a4 4 0 00-4 4v6a4 4 0 008 0V5a4 4 0 00-4-4z"
              />
            </svg>
            <p className="mt-2 text-sm text-gray-500">No transcription yet.</p>
            <p className="text-xs text-gray-400">
              Start speaking to see your transcription appear here.
            </p>
          </div>
        ) : (
          <>
            {filteredSegments.map((segment) => (
              <div
                key={segment.id}
                className={`group flex gap-3 rounded-lg p-2 transition-colors hover:bg-gray-50 ${
                  onSegmentClick ? 'cursor-pointer' : ''
                }`}
                onClick={() => onSegmentClick?.(segment)}
              >
                {showTimestamps && (
                  <span className="flex-shrink-0 pt-0.5 text-xs font-mono text-gray-400 w-12">
                    {formatTime(segment.startTime)}
                  </span>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <SpeakerBadge speaker={segment.speaker} />
                    {showConfidence && (
                      <ConfidenceIndicator confidence={segment.confidence} />
                    )}
                    {!segment.isFinal && (
                      <span className="text-xs text-yellow-600 italic">interim</span>
                    )}
                  </div>
                  <p className={`text-sm text-gray-800 ${!segment.isFinal ? 'italic text-gray-500' : ''}`}>
                    {segment.text}
                  </p>
                </div>
              </div>
            ))}

            {interimText && (
              <div className="flex gap-3 rounded-lg p-2 bg-blue-50/50">
                {showTimestamps && (
                  <span className="flex-shrink-0 pt-0.5 text-xs font-mono text-blue-300 w-12">
                    --:--
                  </span>
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-blue-600">Listening...</span>
                  </div>
                  <p className="text-sm text-blue-700 italic">{interimText}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Scroll to latest button */}
      {isLive && !autoScroll && (
        <div className="border-t border-gray-100 px-4 py-2 text-center">
          <button
            type="button"
            onClick={() => {
              setAutoScroll(true);
              scrollRef.current?.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: 'smooth',
              });
            }}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            Scroll to latest
          </button>
        </div>
      )}
    </div>
  );
}

function SpeakerBadge({ speaker }: { speaker: string }) {
  const colors: Record<string, string> = {
    User: 'bg-blue-100 text-blue-700',
    Assistant: 'bg-purple-100 text-purple-700',
    'Speaker 1': 'bg-emerald-100 text-emerald-700',
    'Speaker 2': 'bg-orange-100 text-orange-700',
  };

  const colorClass = colors[speaker] ?? 'bg-gray-100 text-gray-700';

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {speaker}
    </span>
  );
}

function ConfidenceIndicator({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-600';

  return (
    <span className={`text-xs font-mono ${color}`}>
      {pct}%
    </span>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
