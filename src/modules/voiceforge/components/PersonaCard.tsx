'use client';

import type { VoicePersona } from '@/modules/voiceforge/types';

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  DRAFT: 'bg-gray-100 text-gray-700',
  ARCHIVED: 'bg-red-100 text-red-700',
};

export function PersonaCard({ persona, onClick }: { persona: VoicePersona; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className="rounded-lg border border-gray-200 bg-white p-4 hover:shadow-md transition-shadow cursor-pointer"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900 truncate">{persona.name}</h3>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[persona.status] ?? ''}`}>
          {persona.status}
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-3 line-clamp-2">{persona.description}</p>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-gray-400">Voice:</span>{' '}
          <span className="text-gray-700">{persona.voiceConfig.provider}</span>
        </div>
        <div>
          <span className="text-gray-400">Language:</span>{' '}
          <span className="text-gray-700">{persona.voiceConfig.language}</span>
        </div>
        <div>
          <span className="text-gray-400">Speed:</span>{' '}
          <span className="text-gray-700">{persona.voiceConfig.speed}x</span>
        </div>
        <div>
          <span className="text-gray-400">Tone:</span>{' '}
          <span className="text-gray-700">{persona.personality.defaultTone}</span>
        </div>
      </div>

      <div className="mt-3 flex gap-1">
        {persona.consentChain.length > 0 && (
          <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">
            {persona.consentChain.length} consent(s)
          </span>
        )}
        {persona.voiceConfig.accent && (
          <span className="text-xs bg-gray-50 text-gray-600 px-1.5 py-0.5 rounded">
            {persona.voiceConfig.accent}
          </span>
        )}
      </div>
    </div>
  );
}
