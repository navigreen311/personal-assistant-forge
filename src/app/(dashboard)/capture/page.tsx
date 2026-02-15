'use client';

import { useState, useCallback } from 'react';
import QuickCaptureBar from '@/modules/capture/components/QuickCaptureBar';
import CaptureInbox from '@/modules/capture/components/CaptureInbox';
import CaptureMetricsDashboard from '@/modules/capture/components/CaptureMetricsDashboard';
import type {
  CaptureItem,
  CaptureSource,
  CaptureContentType,
  CaptureLatencyMetrics,
} from '@/modules/capture/types';

export default function CapturePage() {
  const [captures, setCaptures] = useState<CaptureItem[]>([]);
  const [metrics] = useState<CaptureLatencyMetrics[]>([]);

  const handleCapture = useCallback(
    async (params: {
      rawContent: string;
      source: CaptureSource;
      contentType: CaptureContentType;
    }) => {
      try {
        const response = await fetch('/api/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: 'current-user', // In production: from auth context
            ...params,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          if (result.data) {
            setCaptures((prev) => [result.data, ...prev]);
          }
        }
      } catch {
        // Error handling would show a toast in production
      }
    },
    [],
  );

  const handleApproveRouting = useCallback((id: string) => {
    setCaptures((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, status: 'ROUTED' as const, updatedAt: new Date() } : c,
      ),
    );
  }, []);

  const handleArchive = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setCaptures((prev) =>
      prev.map((c) =>
        idSet.has(c.id) ? { ...c, status: 'ARCHIVED' as const, updatedAt: new Date() } : c,
      ),
    );
  }, []);

  const handleReroute = useCallback((_id: string) => {
    // Would open a routing selection modal in production
  }, []);

  return (
    <div className="flex gap-6">
      {/* Main content */}
      <div className="flex-1 space-y-4">
        <QuickCaptureBar onCapture={handleCapture} />
        <CaptureInbox
          captures={captures}
          onApproveRouting={handleApproveRouting}
          onArchive={handleArchive}
          onReroute={handleReroute}
        />
      </div>

      {/* Side panel — metrics */}
      <aside className="hidden w-80 shrink-0 lg:block">
        <CaptureMetricsDashboard metrics={metrics} captures={captures} />
      </aside>
    </div>
  );
}
