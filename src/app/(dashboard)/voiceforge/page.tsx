'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { Campaign, ManagedNumber, VoicePersona } from '@/modules/voiceforge/types';
import type { Call } from '@/shared/types';
import { CampaignCard } from '@/modules/voiceforge/components/CampaignCard';
import { OutcomeBadge } from '@/modules/voiceforge/components/OutcomeBadge';

export default function VoiceForgePage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [numbers, setNumbers] = useState<ManagedNumber[]>([]);
  const [personas, setPersonas] = useState<VoicePersona[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In a real app, entityId would come from auth context
    const entityId = 'default';
    Promise.all([
      fetch(`/api/voice/campaigns?entityId=${entityId}`).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch(`/api/voice/numbers?entityId=${entityId}`).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch(`/api/voice/persona?entityId=${entityId}`).then((r) => r.json()).catch(() => ({ data: [] })),
    ]).then(([campaignRes, numberRes, personaRes]) => {
      setCampaigns(campaignRes.data ?? []);
      setNumbers(numberRes.data ?? []);
      setPersonas(personaRes.data ?? []);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="p-6 text-gray-500">Loading VoiceForge...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">VoiceForge AI Engine</h1>
      </div>

      {/* Quick Nav */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Calls', href: '/voiceforge/calls', count: calls.length },
          { label: 'Campaigns', href: '/voiceforge/campaigns', count: campaigns.length },
          { label: 'Scripts', href: '/voiceforge/scripts', count: 0 },
          { label: 'Personas', href: '/voiceforge/personas', count: personas.length },
        ].map((nav) => (
          <Link key={nav.href} href={nav.href}
            className="rounded-lg border border-gray-200 bg-white p-4 hover:shadow-md transition-shadow text-center">
            <p className="text-2xl font-bold text-indigo-600">{nav.count}</p>
            <p className="text-sm text-gray-600">{nav.label}</p>
          </Link>
        ))}
      </div>

      {/* Active Campaigns */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Active Campaigns</h2>
        {campaigns.filter((c) => c.status === 'ACTIVE').length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {campaigns
              .filter((c) => c.status === 'ACTIVE')
              .map((c) => (
                <CampaignCard key={c.id} campaign={c} />
              ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No active campaigns</p>
        )}
      </section>

      {/* Recent Calls */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Recent Calls</h2>
          <Link href="/voiceforge/calls" className="text-sm text-indigo-600 hover:underline">View all</Link>
        </div>
        {calls.length > 0 ? (
          <div className="space-y-2">
            {calls.slice(0, 5).map((call) => (
              <div key={call.id} className="flex items-center justify-between bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium ${call.direction === 'INBOUND' ? 'text-blue-600' : 'text-purple-600'}`}>
                    {call.direction}
                  </span>
                  <span className="text-sm text-gray-700">{call.contactId ?? 'Unknown'}</span>
                </div>
                <div className="flex items-center gap-3">
                  {call.outcome && <OutcomeBadge outcome={call.outcome} />}
                  <span className="text-xs text-gray-400">
                    {new Date(call.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No recent calls</p>
        )}
      </section>

      {/* Number Inventory Quick View */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Phone Numbers</h2>
        {numbers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {numbers.map((num) => (
              <div key={num.id} className="bg-white rounded-lg border border-gray-200 p-3">
                <p className="font-mono text-sm text-gray-900">{num.phoneNumber}</p>
                <p className="text-xs text-gray-500">{num.label}</p>
                <span className={`text-xs px-1.5 py-0.5 rounded-full mt-1 inline-block ${
                  num.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                }`}>{num.status}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No numbers provisioned</p>
        )}
      </section>

      {/* Persona Gallery */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Personas</h2>
          <Link href="/voiceforge/personas" className="text-sm text-indigo-600 hover:underline">Manage</Link>
        </div>
        {personas.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {personas.map((p) => (
              <div key={p.id} className="bg-white rounded-lg border border-gray-200 p-3">
                <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                <p className="text-xs text-gray-500 truncate">{p.description}</p>
                <div className="mt-1 flex gap-2 text-xs text-gray-400">
                  <span>{p.voiceConfig.provider}</span>
                  <span>{p.voiceConfig.language}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No personas created</p>
        )}
      </section>
    </div>
  );
}
