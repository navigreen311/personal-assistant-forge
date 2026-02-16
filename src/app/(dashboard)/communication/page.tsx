'use client';

import DraftComposer from '@/modules/communication/components/DraftComposer';
import BroadcastComposer from '@/modules/communication/components/BroadcastComposer';
import { useState } from 'react';

type Tab = 'drafting' | 'broadcast';

export default function CommunicationPage() {
  const [activeTab, setActiveTab] = useState<Tab>('drafting');

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Communication Hub</h1>
        <p className="text-sm text-gray-500 mt-1">Draft messages, manage broadcasts, and control your communication tone.</p>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('drafting')}
            className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'drafting'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Draft Composer
          </button>
          <button
            onClick={() => setActiveTab('broadcast')}
            className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'broadcast'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Broadcast
          </button>
        </nav>
      </div>

      {activeTab === 'drafting' && <DraftComposer />}
      {activeTab === 'broadcast' && <BroadcastComposer />}
    </div>
  );
}
