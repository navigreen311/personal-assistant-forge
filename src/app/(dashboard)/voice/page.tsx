'use client';

import { useState, useCallback } from 'react';
import type {
  VoiceSession,
  WakeWordConfig,
  STTConfig,
  ParsedVoiceCommand,
  VoiceIntent,
} from '@/modules/voice/types';

import VoiceCaptureButton from '@/modules/voice/components/VoiceCaptureButton';
import VoiceCommandList from '@/modules/voice/components/VoiceCommandList';
import VoiceCommandPalette from '@/modules/voice/components/VoiceCommandPalette';
import TranscriptionViewer from '@/modules/voice/components/TranscriptionViewer';
import WakeWordSettings from '@/modules/voice/components/WakeWordSettings';
import VoiceActivityIndicator from '@/modules/voice/components/VoiceActivityIndicator';
import STTControls from '@/modules/voice/components/STTControls';
import VoiceHistoryList from '@/modules/voice/components/VoiceHistoryList';
import MicrophoneSelector from '@/modules/voice/components/MicrophoneSelector';

// --------------------------------------------------------------------------
// Demo / mock data
// --------------------------------------------------------------------------

const DEMO_TRANSCRIPT_SEGMENTS = [
  {
    id: '1',
    speaker: 'User',
    text: 'Add a task to review the quarterly financials by next Friday.',
    startTime: 0,
    endTime: 4.2,
    confidence: 0.92,
    isFinal: true,
  },
  {
    id: '2',
    speaker: 'Assistant',
    text: 'Got it. I have created a task "Review quarterly financials" with a due date of next Friday.',
    startTime: 4.5,
    endTime: 8.1,
    confidence: 0.98,
    isFinal: true,
  },
  {
    id: '3',
    speaker: 'User',
    text: 'Schedule a meeting with Dr. Martinez tomorrow at 3pm.',
    startTime: 10.0,
    endTime: 13.5,
    confidence: 0.89,
    isFinal: true,
  },
  {
    id: '4',
    speaker: 'Assistant',
    text: 'Meeting with Dr. Martinez scheduled for tomorrow at 3:00 PM. I sent a calendar invite.',
    startTime: 14.0,
    endTime: 18.2,
    confidence: 0.95,
    isFinal: true,
  },
];

const DEMO_HISTORY = [
  {
    id: 'h1',
    session: {
      id: 's1',
      userId: 'user-1',
      entityId: 'entity-1',
      status: 'COMPLETED' as const,
      audioFormat: 'webm' as const,
      sampleRate: 16000,
      startedAt: new Date(Date.now() - 3600000),
      endedAt: new Date(Date.now() - 3590000),
      transcript: 'Add task review Q4 financials by next Friday',
      confidence: 0.92,
    },
    intent: 'ADD_TASK' as VoiceIntent,
    intentLabel: 'Add Task',
    timestamp: new Date(Date.now() - 3600000),
    duration: 10,
    success: true,
  },
  {
    id: 'h2',
    session: {
      id: 's2',
      userId: 'user-1',
      entityId: 'entity-1',
      status: 'COMPLETED' as const,
      audioFormat: 'webm' as const,
      sampleRate: 16000,
      startedAt: new Date(Date.now() - 7200000),
      endedAt: new Date(Date.now() - 7195000),
      transcript: 'Schedule meeting with Dr. Martinez tomorrow at 3pm',
      confidence: 0.89,
    },
    intent: 'SCHEDULE_MEETING' as VoiceIntent,
    intentLabel: 'Schedule Meeting',
    timestamp: new Date(Date.now() - 7200000),
    duration: 5,
    success: true,
  },
  {
    id: 'h3',
    session: {
      id: 's3',
      userId: 'user-1',
      entityId: 'entity-1',
      status: 'ERROR' as const,
      audioFormat: 'webm' as const,
      sampleRate: 16000,
      startedAt: new Date(Date.now() - 86400000),
      endedAt: new Date(Date.now() - 86398000),
      transcript: '',
      confidence: 0,
    },
    intent: 'UNKNOWN' as VoiceIntent,
    intentLabel: 'Unknown',
    timestamp: new Date(Date.now() - 86400000),
    duration: 2,
    success: false,
  },
  {
    id: 'h4',
    session: {
      id: 's4',
      userId: 'user-1',
      entityId: 'entity-1',
      status: 'COMPLETED' as const,
      audioFormat: 'wav' as const,
      sampleRate: 16000,
      startedAt: new Date(Date.now() - 172800000),
      endedAt: new Date(Date.now() - 172793000),
      transcript: 'Draft email to Bobby about the downtown property project status update',
      confidence: 0.87,
    },
    intent: 'DRAFT_EMAIL' as VoiceIntent,
    intentLabel: 'Draft Email',
    timestamp: new Date(Date.now() - 172800000),
    duration: 7,
    success: true,
  },
];

// --------------------------------------------------------------------------
// Page Component
// --------------------------------------------------------------------------

type VoiceActivityState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export default function VoicePage() {
  const [activityState, setActivityState] = useState<VoiceActivityState>('idle');
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [lastCommand, setLastCommand] = useState<ParsedVoiceCommand | null>(null);
  const [selectedMicId, setSelectedMicId] = useState<string | undefined>(undefined);

  const [wakeWordConfig, setWakeWordConfig] = useState<WakeWordConfig>({
    enabled: true,
    phrase: 'Hey Forge',
    sensitivity: 0.5,
    provider: 'browser',
  });
  const [isWakeWordListening, setIsWakeWordListening] = useState(false);

  const [sttConfig, setSTTConfig] = useState<STTConfig>({
    provider: 'browser',
    language: 'en-US',
    enablePunctuation: true,
    enableSpeakerDiarization: false,
    interimResults: true,
  });
  const [sttStatus, setSTTStatus] = useState<'idle' | 'starting' | 'active' | 'stopping' | 'error'>('idle');

  const handleTranscript = useCallback((transcript: string) => {
    if (transcript) {
      setLastCommand({
        intent: 'ADD_TASK',
        confidence: 0.85,
        entities: [],
        rawTranscript: transcript,
        normalizedText: transcript,
      });
    }
    setActivityState('idle');
  }, []);

  const handleCommandSelect = useCallback((intent: VoiceIntent) => {
    setIsPaletteOpen(false);
    setLastCommand({
      intent,
      confidence: 1.0,
      entities: [],
      rawTranscript: `Manual: ${intent}`,
      normalizedText: intent,
    });
  }, []);

  const handleSTTStart = useCallback(() => {
    setSTTStatus('starting');
    setActivityState('listening');
    setTimeout(() => setSTTStatus('active'), 500);
  }, []);

  const handleSTTStop = useCallback(() => {
    setSTTStatus('stopping');
    setActivityState('processing');
    setTimeout(() => {
      setSTTStatus('idle');
      setActivityState('idle');
    }, 500);
  }, []);

  const handleToggleWakeWord = useCallback(() => {
    setIsWakeWordListening((prev) => !prev);
  }, []);

  return (
    <div className="min-h-screen p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Voice Assistant</h1>
          <p className="text-sm text-gray-500 mt-1">
            Control your assistant with voice commands, manage STT settings, and review history.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <VoiceActivityIndicator state={activityState} size="sm" />
          <button
            type="button"
            onClick={() => setIsPaletteOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
          >
            <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            Command Palette
            <kbd className="hidden sm:inline-flex rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-400">
              /
            </kbd>
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Sessions Today', value: '12', icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 1a4 4 0 00-4 4v6a4 4 0 008 0V5a4 4 0 00-4-4z' },
          { label: 'Commands', value: '8', icon: 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z' },
          { label: 'Avg Confidence', value: '89%', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
          { label: 'Wake Words', value: wakeWordConfig.enabled ? 'On' : 'Off', icon: 'M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={stat.icon} />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-500">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — Controls */}
        <div className="space-y-6">
          <STTControls
            config={sttConfig}
            onConfigChange={setSTTConfig}
            onStart={handleSTTStart}
            onStop={handleSTTStop}
            status={sttStatus}
            currentTranscript={sttStatus === 'active' ? 'Listening for your voice...' : undefined}
            confidence={sttStatus === 'active' ? 0.85 : undefined}
          />

          <MicrophoneSelector
            selectedDeviceId={selectedMicId}
            onDeviceChange={setSelectedMicId}
          />

          <WakeWordSettings
            config={wakeWordConfig}
            onConfigChange={setWakeWordConfig}
            isListening={isWakeWordListening}
            onToggleListening={handleToggleWakeWord}
          />
        </div>

        {/* Center + Right column — Transcription + History */}
        <div className="lg:col-span-2 space-y-6">
          <TranscriptionViewer
            segments={DEMO_TRANSCRIPT_SEGMENTS}
            isLive={sttStatus === 'active'}
            interimText={sttStatus === 'active' ? 'What should I...' : undefined}
            onExport={(format) => {
              console.log(`Exporting transcript as ${format}`);
            }}
          />

          <VoiceHistoryList
            entries={DEMO_HISTORY}
            onEntryClick={(entry) => {
              console.log('Clicked entry:', entry.id);
            }}
            onPlayback={(entry) => {
              console.log('Playback entry:', entry.id);
            }}
            onDelete={(entryId) => {
              console.log('Delete entry:', entryId);
            }}
          />

          <VoiceCommandList />
        </div>
      </div>

      {/* Command Palette (modal overlay) */}
      <VoiceCommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        onCommandSelect={handleCommandSelect}
        lastCommand={lastCommand}
        status={activityState === 'listening' ? 'listening' : activityState === 'processing' ? 'processing' : 'idle'}
      />

      {/* Floating capture button */}
      <VoiceCaptureButton
        onTranscript={handleTranscript}
        onError={(err) => {
          setActivityState('error');
          console.error('Voice error:', err);
        }}
      />
    </div>
  );
}
