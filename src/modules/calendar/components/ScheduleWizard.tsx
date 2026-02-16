'use client';

import { useState } from 'react';
import type { ScheduleSuggestion, ParsedScheduleIntent, EventType, ScheduleRequest } from '../calendar.types';

interface ScheduleWizardProps {
  entityId?: string;
  onScheduled?: () => void;
}

type Step = 'input' | 'review' | 'select' | 'confirm';

const EVENT_TYPES: EventType[] = ['MEETING', 'CALL', 'FOCUS_BLOCK', 'TRAVEL', 'BREAK', 'PREP', 'DEBRIEF', 'PERSONAL', 'DEADLINE', 'REMINDER'];

export function ScheduleWizard({ entityId, onScheduled }: ScheduleWizardProps) {
  const [step, setStep] = useState<Step>('input');
  const [nlInput, setNlInput] = useState('');
  const [useNLP, setUseNLP] = useState(true);
  const [parsedIntent, setParsedIntent] = useState<ParsedScheduleIntent | null>(null);
  const [suggestions, setSuggestions] = useState<ScheduleSuggestion[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<ScheduleSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<ScheduleRequest>>({
    title: '',
    entityId: entityId ?? '',
    duration: 30,
    priority: 'MEDIUM',
    type: 'MEETING',
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

  const renderInput = () => (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          onClick={() => setUseNLP(true)}
          style={{
            padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '6px',
            background: useNLP ? '#3b82f6' : '#fff', color: useNLP ? '#fff' : '#374151', cursor: 'pointer',
          }}
        >
          Natural Language
        </button>
        <button
          onClick={() => setUseNLP(false)}
          style={{
            padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '6px',
            background: !useNLP ? '#3b82f6' : '#fff', color: !useNLP ? '#fff' : '#374151', cursor: 'pointer',
          }}
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
            style={{
              width: '100%', minHeight: '80px', padding: '12px', border: '1px solid #d1d5db',
              borderRadius: '8px', fontSize: '14px', resize: 'vertical',
            }}
          />
          <button
            onClick={handleNLPSubmit}
            disabled={loading || !nlInput.trim()}
            style={{
              marginTop: '12px', padding: '10px 24px', background: '#3b82f6', color: '#fff',
              border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px',
            }}
          >
            {loading ? 'Processing...' : 'Find Slots'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Event title"
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as EventType })}
              style={{ flex: 1, padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            >
              {EVENT_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
            <input
              type="number"
              value={formData.duration}
              onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 30 })}
              placeholder="Duration (min)"
              style={{ width: '120px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
          </div>
          <select
            value={formData.priority}
            onChange={(e) => setFormData({ ...formData, priority: e.target.value as ScheduleRequest['priority'] })}
            style={{ padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
          >
            <option value="LOW">Low Priority</option>
            <option value="MEDIUM">Medium Priority</option>
            <option value="HIGH">High Priority</option>
            <option value="CRITICAL">Critical</option>
          </select>
          <button
            onClick={handleStructuredSubmit}
            disabled={loading || !formData.title}
            style={{
              padding: '10px 24px', background: '#3b82f6', color: '#fff',
              border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px',
            }}
          >
            {loading ? 'Finding Slots...' : 'Find Available Slots'}
          </button>
        </div>
      )}
    </div>
  );

  const renderReview = () => (
    <div>
      <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>Parsed Intent</h3>
      {parsedIntent && (
        <div style={{ background: '#f9fafb', padding: '12px', borderRadius: '8px', fontSize: '13px' }}>
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
      <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
        <button onClick={() => setStep('input')} style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' }}>
          Back
        </button>
        <button onClick={() => setStep('select')} style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
          View Suggested Slots
        </button>
      </div>
    </div>
  );

  const renderSelect = () => (
    <div>
      <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>Suggested Time Slots</h3>
      {suggestions.length === 0 ? (
        <div style={{ color: '#6b7280', padding: '20px', textAlign: 'center' }}>No available slots found. Try adjusting your preferences.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {suggestions.map((s, i) => (
            <div
              key={i}
              onClick={() => setSelectedSlot(s)}
              style={{
                padding: '12px', border: selectedSlot === s ? '2px solid #3b82f6' : '1px solid #d1d5db',
                borderRadius: '8px', cursor: 'pointer', background: selectedSlot === s ? '#eff6ff' : '#fff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>
                  {new Date(s.slot.start).toLocaleDateString()} {new Date(s.slot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(s.slot.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div style={{
                  padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 700,
                  background: s.score >= 70 ? '#dcfce7' : s.score >= 40 ? '#fef9c3' : '#fee2e2',
                  color: s.score >= 70 ? '#16a34a' : s.score >= 40 ? '#ca8a04' : '#dc2626',
                }}>
                  {s.score}
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                {s.reasoning.map((r, ri) => (
                  <span key={ri} style={{ fontSize: '11px', padding: '2px 6px', background: '#f3f4f6', borderRadius: '4px', color: '#4b5563' }}>
                    {r}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                Energy: {s.energyLevel} | Context Switch: {s.contextSwitchCost}/10
              </div>
              {s.conflicts.length > 0 && (
                <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '4px' }}>
                  {s.conflicts.length} conflict(s): {s.conflicts.map((c) => c.description).join('; ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
        <button onClick={() => setStep(parsedIntent ? 'review' : 'input')} style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' }}>
          Back
        </button>
        <button
          onClick={handleConfirm}
          disabled={!selectedSlot || loading}
          style={{
            padding: '8px 16px', background: selectedSlot ? '#3b82f6' : '#9ca3af', color: '#fff',
            border: 'none', borderRadius: '6px', cursor: selectedSlot ? 'pointer' : 'not-allowed',
          }}
        >
          {loading ? 'Scheduling...' : 'Schedule'}
        </button>
      </div>
    </div>
  );

  const renderConfirm = () => (
    <div style={{ textAlign: 'center', padding: '40px' }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#x2705;</div>
      <h3 style={{ margin: '0 0 8px' }}>Event Scheduled!</h3>
      <p style={{ color: '#6b7280' }}>Your event has been added to the calendar.</p>
      <button
        onClick={() => { setStep('input'); setNlInput(''); setParsedIntent(null); setSuggestions([]); setSelectedSlot(null); }}
        style={{ marginTop: '16px', padding: '8px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
      >
        Schedule Another
      </button>
    </div>
  );

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {(['input', 'review', 'select', 'confirm'] as Step[]).map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{
              width: '24px', height: '24px', borderRadius: '50%',
              background: step === s ? '#3b82f6' : '#e5e7eb',
              color: step === s ? '#fff' : '#6b7280',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12px', fontWeight: 600,
            }}>
              {i + 1}
            </div>
            <span style={{ fontSize: '12px', color: step === s ? '#3b82f6' : '#6b7280', textTransform: 'capitalize' }}>{s}</span>
            {i < 3 && <div style={{ width: '20px', height: '1px', background: '#d1d5db' }} />}
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
