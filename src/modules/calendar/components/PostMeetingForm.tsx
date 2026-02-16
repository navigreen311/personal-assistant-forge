'use client';

import { useState } from 'react';
import type { ActionItemFromMeeting } from '../calendar.types';

interface PostMeetingFormProps {
  eventId: string;
  entityId: string;
  onSaved?: () => void;
}

export function PostMeetingForm({ eventId, entityId, onSaved }: PostMeetingFormProps) {
  const [notes, setNotes] = useState('');
  const [actionItems, setActionItems] = useState<ActionItemFromMeeting[]>([]);
  const [decisions, setDecisions] = useState<string[]>([]);
  const [keyTakeaways, setKeyTakeaways] = useState<string[]>([]);
  const [sentiment, setSentiment] = useState<'POSITIVE' | 'NEUTRAL' | 'NEGATIVE'>('NEUTRAL');
  const [followUpDate, setFollowUpDate] = useState('');
  const [saving, setSaving] = useState(false);

  const addActionItem = () => {
    setActionItems([...actionItems, { title: '', priority: 'P1' }]);
  };

  const removeActionItem = (index: number) => {
    setActionItems(actionItems.filter((_, i) => i !== index));
  };

  const updateActionItem = (index: number, updates: Partial<ActionItemFromMeeting>) => {
    setActionItems(actionItems.map((item, i) => i === index ? { ...item, ...updates } : item));
  };

  const addDecision = () => setDecisions([...decisions, '']);
  const addTakeaway = () => setKeyTakeaways([...keyTakeaways, '']);

  const handleSubmit = async () => {
    if (!notes.trim()) return;
    setSaving(true);
    try {
      const body = {
        eventId,
        entityId,
        notes,
        actionItems: actionItems.filter((a) => a.title.trim()),
        decisions: decisions.filter((d) => d.trim()),
        sentiment,
        keyTakeaways: keyTakeaways.filter((t) => t.trim()),
        followUpDate: followUpDate ? new Date(followUpDate).toISOString() : undefined,
      };

      const res = await fetch(`/api/calendar/${eventId}/post-meeting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) onSaved?.();
    } catch {
      // Handle error
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', width: '100%',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <label style={{ fontWeight: 600, fontSize: '13px', display: 'block', marginBottom: '4px' }}>Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Meeting notes..."
          style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }}
        />
      </div>

      <div>
        <label style={{ fontWeight: 600, fontSize: '13px', display: 'block', marginBottom: '4px' }}>Sentiment</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['POSITIVE', 'NEUTRAL', 'NEGATIVE'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSentiment(s)}
              style={{
                padding: '6px 14px', border: sentiment === s ? '2px solid #3b82f6' : '1px solid #d1d5db',
                borderRadius: '6px', cursor: 'pointer',
                background: sentiment === s ? '#eff6ff' : '#fff', fontSize: '13px',
              }}
            >
              {s === 'POSITIVE' ? '+ Positive' : s === 'NEGATIVE' ? '- Negative' : '~ Neutral'}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <label style={{ fontWeight: 600, fontSize: '13px' }}>Action Items</label>
          <button onClick={addActionItem} style={{ padding: '4px 10px', fontSize: '12px', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', background: '#fff' }}>
            + Add
          </button>
        </div>
        {actionItems.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
            <input
              value={item.title}
              onChange={(e) => updateActionItem(i, { title: e.target.value })}
              placeholder="Action item title"
              style={{ ...inputStyle, flex: 1 }}
            />
            <select
              value={item.priority}
              onChange={(e) => updateActionItem(i, { priority: e.target.value as 'P0' | 'P1' | 'P2' })}
              style={{ padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '12px' }}
            >
              <option value="P0">P0</option>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
            </select>
            <input
              type="date"
              onChange={(e) => updateActionItem(i, { dueDate: e.target.value ? new Date(e.target.value) : undefined })}
              style={{ padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '12px' }}
            />
            <button onClick={() => removeActionItem(i)} style={{ padding: '4px 8px', border: '1px solid #fca5a5', borderRadius: '4px', color: '#dc2626', cursor: 'pointer', background: '#fff' }}>
              &times;
            </button>
          </div>
        ))}
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <label style={{ fontWeight: 600, fontSize: '13px' }}>Decisions</label>
          <button onClick={addDecision} style={{ padding: '4px 10px', fontSize: '12px', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', background: '#fff' }}>
            + Add
          </button>
        </div>
        {decisions.map((d, i) => (
          <input
            key={i}
            value={d}
            onChange={(e) => setDecisions(decisions.map((v, j) => j === i ? e.target.value : v))}
            placeholder="Decision made..."
            style={{ ...inputStyle, marginBottom: '4px' }}
          />
        ))}
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <label style={{ fontWeight: 600, fontSize: '13px' }}>Key Takeaways</label>
          <button onClick={addTakeaway} style={{ padding: '4px 10px', fontSize: '12px', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', background: '#fff' }}>
            + Add
          </button>
        </div>
        {keyTakeaways.map((t, i) => (
          <input
            key={i}
            value={t}
            onChange={(e) => setKeyTakeaways(keyTakeaways.map((v, j) => j === i ? e.target.value : v))}
            placeholder="Key takeaway..."
            style={{ ...inputStyle, marginBottom: '4px' }}
          />
        ))}
      </div>

      <div>
        <label style={{ fontWeight: 600, fontSize: '13px', display: 'block', marginBottom: '4px' }}>Follow-up Date</label>
        <input
          type="date"
          value={followUpDate}
          onChange={(e) => setFollowUpDate(e.target.value)}
          style={inputStyle}
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={saving || !notes.trim()}
        style={{
          padding: '10px', background: '#3b82f6', color: '#fff', border: 'none',
          borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600,
        }}
      >
        {saving ? 'Saving...' : 'Save & Create Tasks'}
      </button>
    </div>
  );
}
