'use client';

import { useState } from 'react';
import type { Campaign } from '@/modules/voiceforge/types';

interface CampaignControlsProps {
  campaign: Campaign;
  onAction: (action: 'start' | 'pause' | 'stop') => Promise<void>;
}

export function CampaignControls({ campaign, onAction }: CampaignControlsProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleAction = async (action: 'start' | 'pause' | 'stop') => {
    setLoading(action);
    try {
      await onAction(action);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex gap-2">
      {(campaign.status === 'DRAFT' || campaign.status === 'PAUSED') && (
        <button
          onClick={() => handleAction('start')}
          disabled={loading !== null}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
        >
          {loading === 'start' ? 'Starting...' : 'Start'}
        </button>
      )}
      {campaign.status === 'ACTIVE' && (
        <button
          onClick={() => handleAction('pause')}
          disabled={loading !== null}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-yellow-600 text-white hover:bg-yellow-700 disabled:opacity-50"
        >
          {loading === 'pause' ? 'Pausing...' : 'Pause'}
        </button>
      )}
      {(campaign.status === 'ACTIVE' || campaign.status === 'PAUSED') && (
        <button
          onClick={() => handleAction('stop')}
          disabled={loading !== null}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
        >
          {loading === 'stop' ? 'Stopping...' : 'Stop'}
        </button>
      )}
    </div>
  );
}
