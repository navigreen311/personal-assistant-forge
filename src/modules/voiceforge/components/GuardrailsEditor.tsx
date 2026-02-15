'use client';

import { useState } from 'react';
import type { CallGuardrails } from '@/modules/voiceforge/types';

interface GuardrailsEditorProps {
  initial?: CallGuardrails;
  onSave: (guardrails: CallGuardrails) => void;
}

export function GuardrailsEditor({ initial, onSave }: GuardrailsEditorProps) {
  const [guardrails, setGuardrails] = useState<CallGuardrails>(initial ?? {
    maxCommitments: 3,
    forbiddenTopics: [],
    escalationTriggers: [],
    complianceProfile: [],
    maxSilenceSeconds: 10,
  });
  const [topicInput, setTopicInput] = useState('');
  const [triggerInput, setTriggerInput] = useState('');

  const addForbiddenTopic = () => {
    if (topicInput.trim()) {
      setGuardrails({ ...guardrails, forbiddenTopics: [...guardrails.forbiddenTopics, topicInput.trim()] });
      setTopicInput('');
    }
  };

  const addEscalationTrigger = () => {
    if (triggerInput.trim()) {
      setGuardrails({ ...guardrails, escalationTriggers: [...guardrails.escalationTriggers, triggerInput.trim()] });
      setTriggerInput('');
    }
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-900">Call Guardrails</h4>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Max Commitments</label>
          <input type="number" value={guardrails.maxCommitments} min={0}
            onChange={(e) => setGuardrails({ ...guardrails, maxCommitments: parseInt(e.target.value) })}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Max Silence (seconds)</label>
          <input type="number" value={guardrails.maxSilenceSeconds} min={1}
            onChange={(e) => setGuardrails({ ...guardrails, maxSilenceSeconds: parseInt(e.target.value) })}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Forbidden Topics</label>
        <div className="flex gap-2 mb-1">
          <input type="text" value={topicInput} placeholder="Add topic..."
            onChange={(e) => setTopicInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addForbiddenTopic())}
            className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-md" />
          <button type="button" onClick={addForbiddenTopic}
            className="px-2 py-1 text-sm bg-gray-100 rounded-md hover:bg-gray-200">Add</button>
        </div>
        <div className="flex flex-wrap gap-1">
          {guardrails.forbiddenTopics.map((topic, i) => (
            <span key={i} className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1">
              {topic}
              <button onClick={() => setGuardrails({
                ...guardrails,
                forbiddenTopics: guardrails.forbiddenTopics.filter((_, j) => j !== i),
              })} className="text-red-400 hover:text-red-600">&times;</button>
            </span>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Escalation Triggers</label>
        <div className="flex gap-2 mb-1">
          <input type="text" value={triggerInput} placeholder="Add trigger..."
            onChange={(e) => setTriggerInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEscalationTrigger())}
            className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-md" />
          <button type="button" onClick={addEscalationTrigger}
            className="px-2 py-1 text-sm bg-gray-100 rounded-md hover:bg-gray-200">Add</button>
        </div>
        <div className="flex flex-wrap gap-1">
          {guardrails.escalationTriggers.map((trigger, i) => (
            <span key={i} className="text-xs bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded-full flex items-center gap-1">
              {trigger}
              <button onClick={() => setGuardrails({
                ...guardrails,
                escalationTriggers: guardrails.escalationTriggers.filter((_, j) => j !== i),
              })} className="text-yellow-400 hover:text-yellow-600">&times;</button>
            </span>
          ))}
        </div>
      </div>

      <button onClick={() => onSave(guardrails)}
        className="px-3 py-1.5 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700">
        Save Guardrails
      </button>
    </div>
  );
}
