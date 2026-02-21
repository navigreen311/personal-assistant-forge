'use client';

import { useState, useMemo, useCallback } from 'react';
import type {
  CaptureLatencyMetrics,
  CaptureItem,
  CaptureSource,
} from '@/modules/capture/types';

interface EnhancedCaptureStatsSidebarProps {
  metrics: CaptureLatencyMetrics[];
  captures: CaptureItem[];
}

export default function EnhancedCaptureStatsSidebar({
  metrics,
  captures,
}: EnhancedCaptureStatsSidebarProps) {
  const [copied, setCopied] = useState(false);
  const captureEmail = 'capture+uid@paf.ai';

  // --- Today computations ---
  const todayCaptures = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return captures.filter((c) => new Date(c.createdAt) >= startOfToday);
  }, [captures]);

  const todayAutoRouted = useMemo(
    () =>
      todayCaptures.filter(
        (c) =>
          c.status === 'ROUTED' &&
          (c.routingResult?.appliedRules.length ?? 0) > 0,
      ),
    [todayCaptures],
  );

  const todayManualNeeded = useMemo(
    () =>
      todayCaptures.filter(
        (c) =>
          c.status === 'ROUTED' &&
          (c.routingResult?.appliedRules.length ?? 0) === 0,
      ),
    [todayCaptures],
  );

  const autoRoutedPct = useMemo(
    () =>
      todayCaptures.length > 0
        ? Math.round((todayAutoRouted.length / todayCaptures.length) * 100)
        : 0,
    [todayCaptures, todayAutoRouted],
  );

  const manualPct = useMemo(
    () =>
      todayCaptures.length > 0
        ? Math.round((todayManualNeeded.length / todayCaptures.length) * 100)
        : 0,
    [todayCaptures, todayManualNeeded],
  );

  // --- Latency computations ---
  const avgTotal = useMemo(
    () =>
      metrics.length > 0
        ? Math.round(
            metrics.reduce((sum, m) => sum + m.totalMs, 0) / metrics.length,
          )
        : 0,
    [metrics],
  );

  const voiceMetrics = useMemo(
    () => metrics.filter((m) => m.source === 'VOICE'),
    [metrics],
  );

  const textMetrics = useMemo(
    () => metrics.filter((m) => m.source !== 'VOICE'),
    [metrics],
  );

  const avgVoiceLatency = useMemo(
    () =>
      voiceMetrics.length > 0
        ? Math.round(
            voiceMetrics.reduce((sum, m) => sum + m.totalMs, 0) /
              voiceMetrics.length,
          )
        : null,
    [voiceMetrics],
  );

  const avgTextLatency = useMemo(
    () =>
      textMetrics.length > 0
        ? Math.round(
            textMetrics.reduce((sum, m) => sum + m.totalMs, 0) /
              textMetrics.length,
          )
        : null,
    [textMetrics],
  );

  const voiceSlaOk = avgVoiceLatency !== null && avgVoiceLatency < 3000;
  const textSlaOk = avgTextLatency !== null && avgTextLatency < 5000;

  const avgCaptureToProcessed = useMemo(
    () =>
      metrics.length > 0
        ? Math.round(
            metrics.reduce((sum, m) => sum + m.captureToProcessedMs, 0) /
              metrics.length,
          )
        : 0,
    [metrics],
  );

  const avgProcessedToRouted = useMemo(
    () =>
      metrics.length > 0
        ? Math.round(
            metrics.reduce((sum, m) => sum + m.processedToRoutedMs, 0) /
              metrics.length,
          )
        : 0,
    [metrics],
  );

  // --- This Week computations ---
  const weekCaptures = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    return captures.filter((c) => new Date(c.createdAt) >= sevenDaysAgo);
  }, [captures]);

  const sourceBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of weekCaptures) {
      counts[c.source] = (counts[c.source] ?? 0) + 1;
    }
    return counts;
  }, [weekCaptures]);

  const routingBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of weekCaptures) {
      if (c.routingResult?.targetType) {
        counts[c.routingResult.targetType] =
          (counts[c.routingResult.targetType] ?? 0) + 1;
      }
    }
    return counts;
  }, [weekCaptures]);

  // --- Copy handler ---
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(captureEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }, [captureEmail]);

  // --- Source display helpers ---
  const sourceLabel = (source: CaptureSource): string => {
    const labels: Record<CaptureSource, string> = {
      VOICE: 'Voice',
      SCREENSHOT: 'Screen',
      CLIPBOARD: 'Clipboard',
      SHARE_SHEET: 'Share Sheet',
      BROWSER_EXTENSION: 'Browser',
      EMAIL_FORWARD: 'Email',
      SMS_BRIDGE: 'SMS',
      DESKTOP_TRAY: 'Desktop',
      CAMERA_SCAN: 'Camera',
      MANUAL: 'Manual',
    };
    return labels[source] ?? source;
  };

  const getSourceIcon = (source: string): string => {
    switch (source) {
      case 'VOICE':
        return '\uD83C\uDF99\uFE0F';
      case 'EMAIL_FORWARD':
        return '\uD83D\uDCE7';
      case 'CLIPBOARD':
        return '\uD83D\uDCCB';
      case 'SCREENSHOT':
      case 'CAMERA_SCAN':
        return '\uD83D\uDCF7';
      default:
        return '\uD83D\uDCCC';
    }
  };

  const getRoutingLabel = (
    targetType: string,
  ): { icon: string; label: string } => {
    switch (targetType) {
      case 'TASK':
        return { icon: '\u2192', label: 'Tasks' };
      case 'MESSAGE':
        return { icon: '\u2192', label: 'Inbox/Message' };
      case 'NOTE':
        return { icon: '\u2192', label: 'Knowledge/Note' };
      case 'EVENT':
        return { icon: '\u2192', label: 'Calendar/Event' };
      case 'CONTACT':
        return { icon: '\u2192', label: 'Contacts' };
      case 'EXPENSE':
        return { icon: '\u2192', label: 'Expenses' };
      default:
        return { icon: '\u2192', label: targetType };
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. TODAY */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Today
        </h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Captures</span>
            <span className="text-lg font-bold text-gray-900">
              {todayCaptures.length}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Auto-routed</span>
            <span className="text-sm font-semibold text-blue-600">
              {autoRoutedPct}%
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Manual needed</span>
            <span className="text-sm font-semibold text-gray-700">
              {manualPct}%
            </span>
          </div>
        </div>
      </div>

      {/* 2. LATENCY */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Latency
        </h3>
        <div className="mb-3">
          <div className="text-sm text-gray-600">Average</div>
          <div className="text-2xl font-bold text-gray-900">{avgTotal}ms</div>
        </div>

        {/* SLA indicators */}
        <div className="mb-3 space-y-1.5">
          <div className="flex items-center gap-2">
            {avgVoiceLatency !== null ? (
              voiceSlaOk ? (
                <span className="text-sm font-medium text-green-600">
                  &#10003; &lt; 3s voice
                </span>
              ) : (
                <span className="text-sm font-medium text-red-600">
                  &#10007; &gt; 3s voice
                </span>
              )
            ) : (
              <span className="text-sm text-gray-400">
                &#8212; No voice data
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {avgTextLatency !== null ? (
              textSlaOk ? (
                <span className="text-sm font-medium text-green-600">
                  &#10003; &lt; 5s text
                </span>
              ) : (
                <span className="text-sm font-medium text-red-600">
                  &#10007; &gt; 5s text
                </span>
              )
            ) : (
              <span className="text-sm text-gray-400">
                &#8212; No text data
              </span>
            )}
          </div>
        </div>

        {/* Flow indicator */}
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <span className="rounded bg-blue-50 px-1.5 py-0.5 font-medium text-blue-600">
            capture
          </span>
          <span className="text-gray-300">&rarr;</span>
          <span className="text-gray-400">{avgCaptureToProcessed}ms</span>
          <span className="text-gray-300">&rarr;</span>
          <span className="rounded bg-blue-50 px-1.5 py-0.5 font-medium text-blue-600">
            processed
          </span>
          <span className="text-gray-300">&rarr;</span>
          <span className="text-gray-400">{avgProcessedToRouted}ms</span>
          <span className="text-gray-300">&rarr;</span>
          <span className="rounded bg-green-50 px-1.5 py-0.5 font-medium text-green-600">
            routed
          </span>
        </div>
      </div>

      {/* 3. THIS WEEK */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          This Week
        </h3>

        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-gray-600">Total captures</span>
          <span className="text-lg font-bold text-gray-900">
            {weekCaptures.length}
          </span>
        </div>

        {/* By source breakdown */}
        <div className="mb-3">
          <div className="mb-1.5 text-xs font-medium text-gray-500">
            By source
          </div>
          <div className="space-y-1">
            {(['VOICE', 'EMAIL_FORWARD', 'CLIPBOARD', 'SCREENSHOT'] as const).map(
              (source) => (
                <div
                  key={source}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-gray-600">
                    {getSourceIcon(source)} {sourceLabel(source)}
                  </span>
                  <span className="font-medium text-gray-800">
                    {sourceBreakdown[source] ?? 0}
                  </span>
                </div>
              ),
            )}
            {/* Other: everything not in the four primary sources */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">
                {getSourceIcon('OTHER')} Other
              </span>
              <span className="font-medium text-gray-800">
                {Object.entries(sourceBreakdown)
                  .filter(
                    ([key]) =>
                      !['VOICE', 'EMAIL_FORWARD', 'CLIPBOARD', 'SCREENSHOT'].includes(
                        key,
                      ),
                  )
                  .reduce((sum, [, count]) => sum + count, 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Top routing destinations */}
        <div>
          <div className="mb-1.5 text-xs font-medium text-gray-500">
            Top routing destinations
          </div>
          <div className="space-y-1">
            {(['TASK', 'MESSAGE', 'NOTE', 'EVENT'] as const).map(
              (targetType) => {
                const { icon, label } = getRoutingLabel(targetType);
                return (
                  <div
                    key={targetType}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-gray-600">
                      {icon} {label}
                    </span>
                    <span className="font-medium text-gray-800">
                      {routingBreakdown[targetType] ?? 0}
                    </span>
                  </div>
                );
              },
            )}
          </div>
        </div>
      </div>

      {/* 4. CAPTURE METHODS */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Capture Methods
        </h3>
        <div className="space-y-3">
          {/* Email forward */}
          <div>
            <div className="mb-1 text-sm font-medium text-gray-700">
              Email forward
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-gray-100 px-2 py-1 font-mono text-xs text-gray-600">
                {captureEmail}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="shrink-0 rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
              >
                {copied ? 'Copied!' : 'Copy address'}
              </button>
            </div>
          </div>

          {/* Browser extension */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Browser extension</span>
            <button
              type="button"
              className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
            >
              Install extension
            </button>
          </div>

          {/* Desktop tray */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Desktop tray</span>
            <button
              type="button"
              className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
            >
              Download
            </button>
          </div>

          {/* Mobile share sheet */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Mobile share sheet</span>
            <button
              type="button"
              className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
            >
              Setup guide
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
