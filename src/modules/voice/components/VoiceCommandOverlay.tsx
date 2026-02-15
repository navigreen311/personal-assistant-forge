'use client';

import { useCallback, useEffect } from 'react';
import type { ParsedVoiceCommand, ExtractedEntity } from '@/modules/voice/types';

interface VoiceCommandOverlayProps {
  isOpen: boolean;
  transcript: string;
  parsedCommand?: ParsedVoiceCommand;
  onConfirm: () => void;
  onCancel: () => void;
  onEditTranscript: (edited: string) => void;
}

export default function VoiceCommandOverlay({
  isOpen,
  transcript,
  parsedCommand,
  onConfirm,
  onCancel,
  onEditTranscript,
}: VoiceCommandOverlayProps) {
  // Escape key to cancel
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    },
    [onCancel],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Voice Command
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Cancel"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Live Transcript */}
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
            Transcript
          </label>
          <textarea
            className="w-full rounded-lg border border-gray-300 p-3 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            rows={3}
            value={transcript}
            onChange={(e) => onEditTranscript(e.target.value)}
          />
        </div>

        {/* Detected Intent */}
        {parsedCommand && (
          <>
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                Detected Intent
              </label>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
                  {formatIntent(parsedCommand.intent)}
                </span>
                <ConfidenceMeter value={parsedCommand.confidence} />
              </div>
            </div>

            {/* Extracted Entities */}
            {parsedCommand.entities.length > 0 && (
              <div className="mb-4">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                  Entities
                </label>
                <div className="flex flex-wrap gap-2">
                  {parsedCommand.entities.map((entity, idx) => (
                    <EntityBadge key={`${entity.type}-${idx}`} entity={entity} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
          >
            Cancel
          </button>
        </div>

        {/* Keyboard hint */}
        <p className="mt-3 text-center text-xs text-gray-400">
          Press <kbd className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-600">Esc</kbd> to cancel
        </p>
      </div>
    </div>
  );
}

function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-1.5">
      <div className="h-2 w-16 overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-500">{pct}%</span>
    </div>
  );
}

function EntityBadge({ entity }: { entity: ExtractedEntity }) {
  const colors: Record<string, string> = {
    PERSON: 'bg-purple-100 text-purple-800',
    DATE: 'bg-green-100 text-green-800',
    TIME: 'bg-cyan-100 text-cyan-800',
    DURATION: 'bg-teal-100 text-teal-800',
    MONEY: 'bg-amber-100 text-amber-800',
    LOCATION: 'bg-orange-100 text-orange-800',
    PRIORITY: 'bg-red-100 text-red-800',
    PROJECT: 'bg-indigo-100 text-indigo-800',
    TAG: 'bg-gray-100 text-gray-800',
  };

  const colorClass = colors[entity.type] ?? 'bg-gray-100 text-gray-800';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}>
      <span className="opacity-60">{entity.type}</span>
      <span>{entity.normalized ?? entity.value}</span>
    </span>
  );
}

function formatIntent(intent: string): string {
  return intent
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
