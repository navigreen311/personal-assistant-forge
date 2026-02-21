'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { VoiceIntent, ParsedVoiceCommand } from '@/modules/voice/types';

interface CommandSuggestion {
  intent: VoiceIntent;
  label: string;
  description: string;
  examples: string[];
  icon: string;
}

const COMMAND_SUGGESTIONS: CommandSuggestion[] = [
  {
    intent: 'ADD_TASK',
    label: 'Add Task',
    description: 'Create a new task with optional due date and priority',
    examples: ['Add task review Q4 financials', 'Todo update homepage'],
    icon: 'M12 4v16m8-8H4',
  },
  {
    intent: 'SCHEDULE_MEETING',
    label: 'Schedule Meeting',
    description: 'Book a meeting on your calendar',
    examples: ['Schedule meeting with Dr. Martinez tomorrow at 3pm'],
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  },
  {
    intent: 'DRAFT_EMAIL',
    label: 'Draft Email',
    description: 'Compose an email draft for review',
    examples: ['Draft email to Bobby about the downtown project'],
    icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  },
  {
    intent: 'WHATS_NEXT',
    label: "What's Next",
    description: 'Show your next tasks and agenda items',
    examples: ["What's next?", 'Show my agenda'],
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  },
  {
    intent: 'CALL_CONTACT',
    label: 'Call Contact',
    description: 'Initiate a VoiceForge call handoff',
    examples: ['Call Dr. Martinez', 'Call the nursing facility'],
    icon: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
  },
  {
    intent: 'SET_REMINDER',
    label: 'Set Reminder',
    description: 'Create a time-based reminder',
    examples: ['Remind me to call the plumber tomorrow at 9am'],
    icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  },
  {
    intent: 'ADD_NOTE',
    label: 'Add Note',
    description: 'Capture a quick note',
    examples: ['Add note review compliance checklist before the audit'],
    icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  },
  {
    intent: 'SEARCH',
    label: 'Search',
    description: 'Search across your data',
    examples: ['Search for HIPAA compliance docs'],
    icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  },
  {
    intent: 'LOG_EXPENSE',
    label: 'Log Expense',
    description: 'Record a business expense',
    examples: ['Log expense $45.50 for office supplies'],
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    intent: 'DICTATE',
    label: 'Dictate',
    description: 'Start free-form dictation',
    examples: ['Dictate a memo to the team'],
    icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 1a4 4 0 00-4 4v6a4 4 0 008 0V5a4 4 0 00-4-4z',
  },
];

type PaletteStatus = 'idle' | 'listening' | 'processing' | 'success' | 'error';

interface VoiceCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onCommandSelect?: (intent: VoiceIntent) => void;
  lastCommand?: ParsedVoiceCommand | null;
  status?: PaletteStatus;
}

export default function VoiceCommandPalette({
  isOpen,
  onClose,
  onCommandSelect,
  lastCommand,
  status = 'idle',
}: VoiceCommandPaletteProps) {
  const [filter, setFilter] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredCommands = COMMAND_SUGGESTIONS.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(filter.toLowerCase()) ||
      cmd.description.toLowerCase().includes(filter.toLowerCase()) ||
      cmd.examples.some((ex) => ex.toLowerCase().includes(filter.toLowerCase())),
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      setTimeout(() => inputRef.current?.focus(), 100);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl mx-4 rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Search / Status Header */}
        <div className="border-b border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <StatusDot status={status} />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search voice commands or type a command..."
              className="flex-1 text-sm text-gray-900 placeholder-gray-400 bg-transparent outline-none"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <kbd className="hidden sm:inline-flex items-center rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-500">
              Esc
            </kbd>
          </div>

          {status !== 'idle' && (
            <div className="mt-2 text-xs text-gray-500">
              {status === 'listening' && 'Listening for voice command...'}
              {status === 'processing' && 'Processing command...'}
              {status === 'success' && 'Command recognized!'}
              {status === 'error' && 'Could not recognize command. Try again.'}
            </div>
          )}
        </div>

        {/* Last Recognized Command */}
        {lastCommand && lastCommand.intent !== 'UNKNOWN' && (
          <div className="border-b border-gray-100 bg-blue-50 px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-blue-600 font-medium">Last command:</span>
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                {formatIntent(lastCommand.intent)}
              </span>
              <span className="text-gray-500 text-xs ml-auto">
                {Math.round(lastCommand.confidence * 100)}% confidence
              </span>
            </div>
            {lastCommand.rawTranscript && (
              <p className="mt-1 text-xs text-gray-600 italic truncate">
                &quot;{lastCommand.rawTranscript}&quot;
              </p>
            )}
          </div>
        )}

        {/* Command List */}
        <div className="max-h-[50vh] overflow-y-auto py-2">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-gray-500">No matching commands found.</p>
              <p className="mt-1 text-xs text-gray-400">
                Try saying your command aloud or adjust your search.
              </p>
            </div>
          ) : (
            filteredCommands.map((cmd) => (
              <button
                key={cmd.intent}
                type="button"
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                onClick={() => onCommandSelect?.(cmd.intent)}
              >
                <div className="mt-0.5 flex-shrink-0 h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <svg
                    className="h-4 w-4 text-blue-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d={cmd.icon} />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{cmd.label}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{cmd.description}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {cmd.examples.map((ex) => (
                      <span
                        key={ex}
                        className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500"
                      >
                        &quot;{ex}&quot;
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-2.5 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {filteredCommands.length} command{filteredCommands.length !== 1 ? 's' : ''} available
          </span>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span>Click to execute</span>
            <span>or speak a command</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: PaletteStatus }) {
  const styles: Record<PaletteStatus, string> = {
    idle: 'bg-gray-300',
    listening: 'bg-blue-500 animate-pulse',
    processing: 'bg-yellow-500 animate-pulse',
    success: 'bg-green-500',
    error: 'bg-red-500',
  };

  return (
    <span className={`inline-block h-2.5 w-2.5 rounded-full ${styles[status]}`} />
  );
}

function formatIntent(intent: string): string {
  return intent
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
