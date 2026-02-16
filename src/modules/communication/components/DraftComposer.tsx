'use client';

import { useState } from 'react';
import type { Tone, MessageChannel } from '@/shared/types';
import type { DraftVariant } from '@/modules/communication/types';
import ToneSelector from './ToneSelector';
import DraftVariantCard from './DraftVariantCard';

const CHANNELS: MessageChannel[] = ['EMAIL', 'SMS', 'SLACK', 'TEAMS', 'DISCORD', 'WHATSAPP', 'TELEGRAM', 'VOICE', 'MANUAL'];

interface DraftComposerProps {
  entityId?: string;
}

export default function DraftComposer({ entityId }: DraftComposerProps) {
  const [recipientId, setRecipientId] = useState('');
  const [intent, setIntent] = useState('');
  const [context, setContext] = useState('');
  const [tone, setTone] = useState<Tone>('DIRECT');
  const [channel, setChannel] = useState<MessageChannel>('EMAIL');
  const [variants, setVariants] = useState<DraftVariant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [powerNote, setPowerNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!recipientId || !intent) {
      setErrorMessage('Recipient and intent are required.');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setVariants([]);
    setPowerNote(null);

    try {
      const res = await fetch('/api/contacts/' + recipientId);
      if (!res.ok) {
        setErrorMessage('Recipient not found.');
        setLoading(false);
        return;
      }

      // In a real app, we'd call a dedicated drafting API endpoint.
      // For now, we simulate the draft generation client-side.
      setVariants([
        {
          id: '1',
          label: 'Direct Approach',
          subject: channel === 'EMAIL' ? `Re: ${intent.slice(0, 60)}` : undefined,
          body: `${intent}. Please respond at your earliest convenience.`,
          tone: 'DIRECT',
          wordCount: intent.split(/\s+/).length + 6,
          readingLevel: 'Grade 8',
          complianceFlags: [],
        },
        {
          id: '2',
          label: 'Diplomatic Approach',
          subject: channel === 'EMAIL' ? `Re: ${intent.slice(0, 60)}` : undefined,
          body: `I wanted to reach out regarding the following: ${intent}. I look forward to your perspective on this matter.`,
          tone: 'DIPLOMATIC',
          wordCount: intent.split(/\s+/).length + 16,
          readingLevel: 'Grade 10',
          complianceFlags: [],
        },
        {
          id: '3',
          label: 'Warm Approach',
          subject: channel === 'EMAIL' ? `Re: ${intent.slice(0, 60)}` : undefined,
          body: `I hope you're doing well! ${intent}. Thank you so much for your time!`,
          tone: 'WARM',
          wordCount: intent.split(/\s+/).length + 12,
          readingLevel: 'Grade 8',
          complianceFlags: [],
        },
      ]);
      setPowerNote('Peer relationship — use collaborative and balanced language.');
    } catch {
      setErrorMessage('Failed to generate drafts. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Recipient ID</label>
          <input
            type="text"
            value={recipientId}
            onChange={(e) => setRecipientId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            placeholder="Contact ID"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Channel</label>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as MessageChannel)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          >
            {CHANNELS.map((ch) => (
              <option key={ch} value={ch}>{ch}</option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Intent / Purpose</label>
          <textarea
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            placeholder="What should this message accomplish?"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Context (optional)</label>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            placeholder="Background information or previous conversation context"
          />
        </div>

        <ToneSelector value={tone} onChange={setTone} />
      </div>

      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <button
        onClick={handleGenerate}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Generating...' : 'Generate Drafts'}
      </button>

      {powerNote && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
          <strong>Power Dynamic:</strong> {powerNote}
        </div>
      )}

      {variants.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Draft Variants</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {variants.map((variant) => (
              <DraftVariantCard
                key={variant.id}
                variant={variant}
                isSelected={selectedVariantId === variant.id}
                onSelect={setSelectedVariantId}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
