'use client';

import { useState, KeyboardEvent } from 'react';
import type { ScheduleSuggestion, ParsedScheduleIntent, EventType, ScheduleRequest } from '../calendar.types';

interface ScheduleWizardProps {
  entityId?: string;
  onScheduled?: () => void;
}

type Step = 'input' | 'review' | 'select' | 'confirm';

type MeetingType = '1:1' | 'Group' | 'External' | 'Focus Block' | 'Personal';
type DurationPreset = '15' | '30' | '45' | '60' | '90' | '120' | 'custom';
type RecurrenceOption = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';
type BufferOption = 'none' | '15before' | '30before' | '15after' | '30after' | 'both';
type PrepTimeOption = 'none' | '15' | '30' | '60';
type VisibilityOption = 'busy' | 'free' | 'tentative';

interface ExtendedFormData extends Partial<ScheduleRequest> {
  meetingType?: MeetingType;
  participants?: string[];
  durationPreset?: DurationPreset;
  location?: string;
  recurrence?: RecurrenceOption;
  buffer?: BufferOption;
  prepTime?: PrepTimeOption;
  visibility?: VisibilityOption;
}

const EVENT_TYPES: EventType[] = ['MEETING', 'CALL', 'FOCUS_BLOCK', 'TRAVEL', 'BREAK', 'PREP', 'DEBRIEF', 'PERSONAL', 'DEADLINE', 'REMINDER'];

const DURATION_LABELS: Record<DurationPreset, string> = {
  '15': '15 minutes',
  '30': '30 minutes',
  '45': '45 minutes',
  '60': '1 hour',
  '90': '1.5 hours',
  '120': '2 hours',
  'custom': 'Custom',
};

const BUFFER_LABELS: Record<BufferOption, string> = {
  none: 'None',
  '15before': '15m before',
  '30before': '30m before',
  '15after': '15m after',
  '30after': '30m after',
  both: 'Both (15m before & after)',
};

export function ScheduleWizard({ entityId, onScheduled }: ScheduleWizardProps) {
  const [step, setStep] = useState<Step>('input');
  const [nlInput, setNlInput] = useState('');
  const [useNLP, setUseNLP] = useState(true);
  const [parsedIntent, setParsedIntent] = useState<ParsedScheduleIntent | null>(null);
  const [suggestions, setSuggestions] = useState<ScheduleSuggestion[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<ScheduleSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [participantInput, setParticipantInput] = useState('');
  const [formData, setFormData] = useState<ExtendedFormData>({
    title: '',
    entityId: entityId ?? '',
    duration: 30,
    priority: 'MEDIUM',
    type: 'MEETING',
    meetingType: '1:1',
    participants: [],
    durationPreset: '30',
    location: '',
    recurrence: 'none',
    buffer: 'none',
    prepTime: 'none',
    visibility: 'busy',
  });

  const handleNLPSubmit = async () => {
    if (!nlInput.trim() || !entityId) return;
    setLoading(true);
    try {
      const res = await fetch('/api/calendar/schedule/natural', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: nlInput, entityId }),
      });
      const json = await res.json();
      if (json.success) {
        setParsedIntent(json.data.parsed);
        setSuggestions(json.data.suggestions);
        setStep('review');
      }
    } catch {
      // Handle error
    } finally {
      setLoading(false);
    }
  };

  const handleStructuredSubmit = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/calendar/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (json.success) {
        setSuggestions(json.data);
        setStep('select');
      }
    } catch {
      // Handle error
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedSlot) return;
    setLoading(true);
    try {
      const requestBody = parsedIntent
        ? {
            title: parsedIntent.title,
            entityId: entityId ?? formData.entityId,
            duration: parsedIntent.duration ?? 30,
            priority: parsedIntent.priority,
            type: parsedIntent.type,
            selectedSlot: selectedSlot.slot,
          }
        : { ...formData, selectedSlot: selectedSlot.slot };

      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const json = await res.json();
      if (json.success) {
        setStep('confirm');
        onScheduled?.();
      }
    } catch {
      // Handle error
    } finally {
      setLoading(false);
    }
  };

  const handleDurationPresetChange = (preset: DurationPreset) => {
    const durationMap: Partial<Record<DurationPreset, number>> = {
      '15': 15, '30': 30, '45': 45, '60': 60, '90': 90, '120': 120,
    };
    setFormData({
      ...formData,
      durationPreset: preset,
      duration: preset !== 'custom' ? (durationMap[preset] ?? 30) : formData.duration,
    });
  };

  const addParticipant = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !formData.participants?.includes(trimmed)) {
      setFormData({ ...formData, participants: [...(formData.participants ?? []), trimmed] });
    }
    setParticipantInput('');
  };

  const removeParticipant = (name: string) => {
    setFormData({ ...formData, participants: formData.participants?.filter((p) => p !== name) });
  };

  const handleParticipantKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addParticipant(participantInput);
    } else if (e.key === 'Backspace' && !participantInput && formData.participants?.length) {
      const updated = [...(formData.participants ?? [])];
      updated.pop();
      setFormData({ ...formData, participants: updated });
    }
  };

  const handleGenerateMeetLink = () => {
    setFormData({ ...formData, location: 'https://meet.google.com/placeholder-link' });
  };

  const renderInput = () => (
    <div>
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setUseNLP(true)}
          className={`px-4 py-2 rounded-md border text-sm font-medium transition-colors ${
            useNLP
              ? 'bg-blue-500 text-white border-blue-500'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          Natural Language
        </button>
        <button
          onClick={() => setUseNLP(false)}
          className={`px-4 py-2 rounded-md border text-sm font-medium transition-colors ${
            !useNLP
              ? 'bg-blue-500 text-white border-blue-500'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          Structured Form
        </button>
      </div>

      {useNLP ? (
        <div>
          <textarea
            value={nlInput}
            onChange={(e) => setNlInput(e.target.value)}
            placeholder='e.g., "Set up a call with Dr. Martinez next week, prefer mornings"'
            className="w-full min-h-[80px] px-3 py-3 border border-gray-300 rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={handleNLPSubmit}
            disabled={loading || !nlInput.trim()}
            className="mt-3 px-6 py-2.5 bg-blue-500 text-white rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
          >
            {loading ? 'Processing...' : 'Find Slots'}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Title */}
          <input
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Event title"
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />

          {/* Event Type + Priority row */}
          <div className="flex gap-2">
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as EventType })}
              className="flex-1 px-2 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace('_', ' ')}
                </option>
              ))}
            </select>
            <select
              value={formData.priority}
              onChange={(e) =>
                setFormData({ ...formData, priority: e.target.value as ScheduleRequest['priority'] })
              }
              className="flex-1 px-2 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="LOW">Low Priority</option>
              <option value="MEDIUM">Medium Priority</option>
              <option value="HIGH">High Priority</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>

          {/* --- NEW FIELDS START --- */}

          {/* Meeting Type */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Meeting Type</label>
            <select
              value={formData.meetingType}
              onChange={(e) => setFormData({ ...formData, meetingType: e.target.value as MeetingType })}
              className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {(['1:1', 'Group', 'External', 'Focus Block', 'Personal'] as MeetingType[]).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Participants */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Participants</label>
            <div className="min-h-[40px] px-2 py-1.5 border border-gray-300 rounded-md flex flex-wrap gap-1.5 items-center focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
              {(formData.participants ?? []).map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full"
                >
                  {p}
                  <button
                    type="button"
                    onClick={() => removeParticipant(p)}
                    className="text-blue-500 hover:text-blue-700 leading-none"
                    aria-label={`Remove ${p}`}
                  >
                    &times;
                  </button>
                </span>
              ))}
              <input
                value={participantInput}
                onChange={(e) => setParticipantInput(e.target.value)}
                onKeyDown={handleParticipantKeyDown}
                onBlur={() => participantInput.trim() && addParticipant(participantInput)}
                placeholder={(formData.participants ?? []).length === 0 ? 'Add participants...' : ''}
                className="flex-1 min-w-[120px] text-sm outline-none bg-transparent"
              />
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Press Enter or comma to add</p>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Duration</label>
            <div className="flex gap-2">
              <select
                value={formData.durationPreset}
                onChange={(e) => handleDurationPresetChange(e.target.value as DurationPreset)}
                className="flex-1 px-2 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {(Object.keys(DURATION_LABELS) as DurationPreset[]).map((k) => (
                  <option key={k} value={k}>{DURATION_LABELS[k]}</option>
                ))}
              </select>
              {formData.durationPreset === 'custom' && (
                <input
                  type="number"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 30 })}
                  placeholder="Minutes"
                  min={5}
                  max={480}
                  className="w-28 px-2 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
          </div>

          {/* Location / Virtual Link */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Location / Virtual Link</label>
            <div className="flex gap-2">
              <input
                value={formData.location ?? ''}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Room name, address, or meeting URL"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={handleGenerateMeetLink}
                className="px-3 py-2 text-xs font-medium text-blue-600 border border-blue-300 rounded-md hover:bg-blue-50 transition-colors whitespace-nowrap"
              >
                Generate Meet link
              </button>
            </div>
          </div>

          {/* Recurrence */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Recurrence</label>
            <select
              value={formData.recurrence}
              onChange={(e) => setFormData({ ...formData, recurrence: e.target.value as RecurrenceOption })}
              className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="none">None</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          {/* Buffer */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Buffer Time</label>
            <select
              value={formData.buffer}
              onChange={(e) => setFormData({ ...formData, buffer: e.target.value as BufferOption })}
              className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {(Object.keys(BUFFER_LABELS) as BufferOption[]).map((k) => (
                <option key={k} value={k}>{BUFFER_LABELS[k]}</option>
              ))}
            </select>
          </div>

          {/* Prep Time */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Prep Time</label>
            <select
              value={formData.prepTime}
              onChange={(e) => setFormData({ ...formData, prepTime: e.target.value as PrepTimeOption })}
              className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="none">None</option>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
            </select>
          </div>

          {/* Visibility */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Visibility</label>
            <select
              value={formData.visibility}
              onChange={(e) => setFormData({ ...formData, visibility: e.target.value as VisibilityOption })}
              className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="busy">Busy</option>
              <option value="free">Free</option>
              <option value="tentative">Tentative</option>
            </select>
          </div>

          {/* --- NEW FIELDS END --- */}

          <button
            onClick={handleStructuredSubmit}
            disabled={loading || !formData.title}
            className="px-6 py-2.5 bg-blue-500 text-white rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
          >
            {loading ? 'Finding Slots...' : 'Find Available Slots'}
          </button>
        </div>
      )}
    </div>
  );

  const renderReview = () => (
    <div>
      <h3 className="m-0 mb-4 text-base font-semibold">Parsed Intent</h3>
      {parsedIntent && (
        <div className="bg-gray-50 p-3 rounded-lg text-sm space-y-1">
          <div><strong>Title:</strong> {parsedIntent.title}</div>
          <div><strong>Type:</strong> {parsedIntent.type}</div>
          <div><strong>Duration:</strong> {parsedIntent.duration ?? 30} min</div>
          <div><strong>Priority:</strong> {parsedIntent.priority}</div>
          {parsedIntent.participantNames.length > 0 && (
            <div><strong>Participants:</strong> {parsedIntent.participantNames.join(', ')}</div>
          )}
          <div><strong>Confidence:</strong> {Math.round((parsedIntent.confidence ?? 0) * 100)}%</div>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setStep('input')}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm cursor-pointer hover:bg-gray-50 transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => setStep('select')}
          className="px-4 py-2 bg-blue-500 text-white border-none rounded-md text-sm cursor-pointer hover:bg-blue-600 transition-colors"
        >
          View Suggested Slots
        </button>
      </div>
    </div>
  );

  const renderSelect = () => (
    <div>
      <h3 className="m-0 mb-4 text-base font-semibold">Suggested Time Slots</h3>
      {suggestions.length === 0 ? (
        <div className="text-gray-500 py-5 text-center">
          No available slots found. Try adjusting your preferences.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {suggestions.map((s, i) => (
            <div
              key={i}
              onClick={() => setSelectedSlot(s)}
              className={`p-3 rounded-lg cursor-pointer transition-colors ${
                selectedSlot === s
                  ? 'border-2 border-blue-500 bg-blue-50'
                  : 'border border-gray-300 bg-white hover:bg-gray-50'
              }`}
            >
              <div className="flex justify-between items-center">
                <div className="font-semibold text-sm">
                  {new Date(s.slot.start).toLocaleDateString()}{' '}
                  {new Date(s.slot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                  {new Date(s.slot.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div
                  className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    s.score >= 70
                      ? 'bg-green-100 text-green-700'
                      : s.score >= 40
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {s.score}
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {s.reasoning.map((r, ri) => (
                  <span
                    key={ri}
                    className="text-[11px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-600"
                  >
                    {r}
                  </span>
                ))}
              </div>
              <div className="text-[11px] text-gray-500 mt-1">
                Energy: {s.energyLevel} | Context Switch: {s.contextSwitchCost}/10
              </div>
              {s.conflicts.length > 0 && (
                <div className="text-[11px] text-red-600 mt-1">
                  {s.conflicts.length} conflict(s): {s.conflicts.map((c) => c.description).join('; ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setStep(parsedIntent ? 'review' : 'input')}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm cursor-pointer hover:bg-gray-50 transition-colors"
        >
          Back
        </button>
        <button
          onClick={handleConfirm}
          disabled={!selectedSlot || loading}
          className={`px-4 py-2 text-white border-none rounded-md text-sm transition-colors ${
            selectedSlot && !loading
              ? 'bg-blue-500 cursor-pointer hover:bg-blue-600'
              : 'bg-gray-400 cursor-not-allowed'
          }`}
        >
          {loading ? 'Scheduling...' : 'Schedule'}
        </button>
      </div>
    </div>
  );

  const renderConfirm = () => (
    <div className="text-center py-10">
      <div className="text-5xl mb-4">&#x2705;</div>
      <h3 className="m-0 mb-2 text-lg font-semibold">Event Scheduled!</h3>
      <p className="text-gray-500">Your event has been added to the calendar.</p>
      <button
        onClick={() => {
          setStep('input');
          setNlInput('');
          setParsedIntent(null);
          setSuggestions([]);
          setSelectedSlot(null);
        }}
        className="mt-4 px-6 py-2 bg-blue-500 text-white border-none rounded-md text-sm cursor-pointer hover:bg-blue-600 transition-colors"
      >
        Schedule Another
      </button>
    </div>
  );

  return (
    <div className="max-w-[600px] mx-auto">
      <div className="flex gap-2 mb-6">
        {(['input', 'review', 'select', 'confirm'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                step === s ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'
              }`}
            >
              {i + 1}
            </div>
            <span
              className={`text-xs capitalize ${step === s ? 'text-blue-500' : 'text-gray-500'}`}
            >
              {s}
            </span>
            {i < 3 && <div className="w-5 h-px bg-gray-300" />}
          </div>
        ))}
      </div>

      {step === 'input' && renderInput()}
      {step === 'review' && renderReview()}
      {step === 'select' && renderSelect()}
      {step === 'confirm' && renderConfirm()}
    </div>
  );
}
