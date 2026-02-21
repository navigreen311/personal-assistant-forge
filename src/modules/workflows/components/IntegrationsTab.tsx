'use client';

import React, { useState, useEffect, useCallback } from 'react';

// ============================================================================
// IntegrationsTab — Grid of connected service integration cards
// Shows status (Live/Off), sync info, and configure/enable actions
// ============================================================================

// --- Types ---

interface IntegrationsTabProps {
  entityId?: string;
}

interface IntegrationDefinition {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface IntegrationStatus {
  id: string;
  isActive: boolean;
  syncInfo?: string;
}

// --- Constants ---

const INTEGRATIONS: IntegrationDefinition[] = [
  { id: 'gmail', name: 'Gmail', icon: '\uD83D\uDCE7', color: 'bg-red-100 text-red-700' },
  { id: 'slack', name: 'Slack', icon: '\uD83D\uDCAC', color: 'bg-purple-100 text-purple-700' },
  { id: 'twilio', name: 'Twilio', icon: '\uD83D\uDCDE', color: 'bg-blue-100 text-blue-700' },
  { id: 'stripe', name: 'Stripe', icon: '\uD83D\uDCB3', color: 'bg-indigo-100 text-indigo-700' },
  { id: 'quickbooks', name: 'QuickBooks', icon: '\uD83D\uDCCA', color: 'bg-green-100 text-green-700' },
  { id: 'notion', name: 'Notion', icon: '\uD83D\uDCDD', color: 'bg-gray-100 text-gray-700' },
  { id: 'hubspot', name: 'HubSpot', icon: '\uD83D\uDD36', color: 'bg-orange-100 text-orange-700' },
  { id: 'zapier', name: 'Zapier', icon: '\u26A1', color: 'bg-amber-100 text-amber-700' },
];

const DEFAULT_STATUSES: IntegrationStatus[] = INTEGRATIONS.map((integration) => ({
  id: integration.id,
  isActive: false,
}));

// --- IntegrationCard (inline) ---

interface IntegrationCardProps {
  definition: IntegrationDefinition;
  status: IntegrationStatus;
  onConfigure: (id: string, name: string) => void;
  onEnable: (id: string, name: string) => void;
}

function IntegrationCard({ definition, status, onConfigure, onEnable }: IntegrationCardProps) {
  const { id, name, icon, color } = definition;
  const { isActive, syncInfo } = status;

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-4 flex flex-col items-center gap-3">
      {/* Icon circle */}
      <div
        className={`w-12 h-12 rounded-full flex items-center justify-center text-xl ${color}`}
      >
        {icon}
      </div>

      {/* Service name */}
      <h4 className="text-sm font-semibold text-gray-900">{name}</h4>

      {/* Status badge */}
      {isActive ? (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          Live
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
          Off
        </span>
      )}

      {/* Sync info (only for active integrations) */}
      {isActive && syncInfo && (
        <p className="text-xs text-gray-500">{syncInfo}</p>
      )}

      {/* Spacer to push button to bottom */}
      <div className="flex-1" />

      {/* Action button */}
      {isActive ? (
        <button
          onClick={() => onConfigure(id, name)}
          className="w-full px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors"
        >
          Configure
        </button>
      ) : (
        <button
          onClick={() => onEnable(id, name)}
          className="w-full px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md transition-colors"
        >
          Enable
        </button>
      )}
    </div>
  );
}

// --- Main Component ---

export default function IntegrationsTab({ entityId }: IntegrationsTabProps) {
  const [statuses, setStatuses] = useState<IntegrationStatus[]>(DEFAULT_STATUSES);
  const [loading, setLoading] = useState(true);

  // Fetch integration statuses from API
  useEffect(() => {
    let cancelled = false;

    async function fetchStatuses() {
      try {
        const url = entityId
          ? `/api/integrations?entityId=${encodeURIComponent(entityId)}`
          : '/api/integrations';
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Failed to fetch integrations: ${response.status}`);
        }

        const data: IntegrationStatus[] = await response.json();

        if (!cancelled) {
          // Merge fetched statuses with our known integrations
          const merged = INTEGRATIONS.map((integration) => {
            const fetched = data.find((s) => s.id === integration.id);
            return fetched ?? { id: integration.id, isActive: false };
          });
          setStatuses(merged);
        }
      } catch {
        // On any error, default to all "off" status
        if (!cancelled) {
          setStatuses(DEFAULT_STATUSES);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchStatuses();

    return () => {
      cancelled = true;
    };
  }, [entityId]);

  // --- Handlers ---

  const handleConfigure = useCallback((id: string, name: string) => {
    alert(`Configure ${name} integration`);
  }, []);

  const handleEnable = useCallback((id: string, name: string) => {
    alert(`Configure ${name} integration`);
  }, []);

  const handleAddWebhook = useCallback(() => {
    alert('Add Custom Webhook');
  }, []);

  const handleConnectZapier = useCallback(() => {
    alert('Connect via Zapier/Make');
  }, []);

  // --- Render ---

  if (loading) {
    return (
      <div className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Connected Integrations</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {INTEGRATIONS.map((integration) => (
            <div
              key={integration.id}
              className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col items-center gap-3 animate-pulse"
            >
              <div className="w-12 h-12 rounded-full bg-gray-200" />
              <div className="h-4 w-16 bg-gray-200 rounded" />
              <div className="h-5 w-12 bg-gray-200 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <h2 className="text-lg font-semibold text-gray-900 mb-6">Connected Integrations</h2>

      {/* Integration cards grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {INTEGRATIONS.map((integration) => {
          const status = statuses.find((s) => s.id === integration.id) ?? {
            id: integration.id,
            isActive: false,
          };

          return (
            <IntegrationCard
              key={integration.id}
              definition={integration}
              status={status}
              onConfigure={handleConfigure}
              onEnable={handleEnable}
            />
          );
        })}
      </div>

      {/* Footer actions */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={handleAddWebhook}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Custom Webhook
        </button>

        <button
          onClick={handleConnectZapier}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Connect via Zapier/Make
        </button>
      </div>
    </div>
  );
}
