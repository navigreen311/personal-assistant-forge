'use client';

import { useState, useEffect, useCallback } from 'react';

interface AudioDevice {
  deviceId: string;
  label: string;
  groupId: string;
}

interface MicrophoneSelectorProps {
  selectedDeviceId?: string;
  onDeviceChange?: (deviceId: string) => void;
  onError?: (error: string) => void;
  showVolumeLevel?: boolean;
  compact?: boolean;
}

export default function MicrophoneSelector({
  selectedDeviceId,
  onDeviceChange,
  onError,
  showVolumeLevel = true,
  compact = false,
}: MicrophoneSelectorProps) {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState(selectedDeviceId ?? '');
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [isTesting, setIsTesting] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'prompt' | 'granted' | 'denied' | 'checking'>('checking');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadDevices = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        const msg = 'Audio device enumeration is not supported in this browser.';
        setError(msg);
        onError?.(msg);
        setPermissionStatus('denied');
        setIsLoading(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        setPermissionStatus('granted');
      } catch (err) {
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          setPermissionStatus('denied');
          const msg = 'Microphone access denied. Please allow microphone access in your browser settings.';
          setError(msg);
          onError?.(msg);
          setIsLoading(false);
          return;
        }
        setPermissionStatus('prompt');
      }

      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = allDevices
        .filter((d) => d.kind === 'audioinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${i + 1}`,
          groupId: d.groupId,
        }));

      setDevices(audioInputs);

      if (audioInputs.length > 0) {
        const currentValid = audioInputs.some((d) => d.deviceId === activeDeviceId);
        if (!currentValid) {
          const defaultId = audioInputs[0].deviceId;
          setActiveDeviceId(defaultId);
          onDeviceChange?.(defaultId);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load audio devices.';
      setError(msg);
      onError?.(msg);
    } finally {
      setIsLoading(false);
    }
  }, [activeDeviceId, onDeviceChange, onError]);

  useEffect(() => {
    loadDevices();

    const handleDeviceChange = () => loadDevices();
    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);

    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [loadDevices]);

  useEffect(() => {
    if (selectedDeviceId !== undefined) {
      setActiveDeviceId(selectedDeviceId);
    }
  }, [selectedDeviceId]);

  const handleDeviceSelect = (deviceId: string) => {
    setActiveDeviceId(deviceId);
    onDeviceChange?.(deviceId);
  };

  const startMicTest = useCallback(async () => {
    if (isTesting) return;
    setIsTesting(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: activeDeviceId ? { deviceId: { exact: activeDeviceId } } : true,
      });

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let animationId: number;

      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;
        setVolumeLevel(avg / 255);
        animationId = requestAnimationFrame(updateLevel);
      };

      updateLevel();

      setTimeout(() => {
        cancelAnimationFrame(animationId);
        source.disconnect();
        audioContext.close();
        stream.getTracks().forEach((track) => track.stop());
        setIsTesting(false);
        setVolumeLevel(0);
      }, 5000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to test microphone.';
      setError(msg);
      onError?.(msg);
      setIsTesting(false);
    }
  }, [activeDeviceId, isTesting, onError]);

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <svg className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a4 4 0 00-4 4v6a4 4 0 008 0V5a4 4 0 00-4-4z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v1a7 7 0 01-14 0v-1M12 18v4M8 22h8" />
        </svg>
        <select
          value={activeDeviceId}
          onChange={(e) => handleDeviceSelect(e.target.value)}
          disabled={isLoading || devices.length === 0}
          className="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        >
          {isLoading ? (
            <option>Loading devices...</option>
          ) : devices.length === 0 ? (
            <option>No microphones found</option>
          ) : (
            devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))
          )}
        </select>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Microphone</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {devices.length} device{devices.length !== 1 ? 's' : ''} available
            </p>
          </div>
          <PermissionBadge status={permissionStatus} />
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
            <svg className="h-4 w-4 flex-shrink-0 mt-0.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <span>{error}</span>
              {permissionStatus === 'denied' && (
                <button
                  type="button"
                  onClick={loadDevices}
                  className="ml-2 text-red-800 underline hover:no-underline"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        )}

        {/* Loading state */}
        {isLoading ? (
          <div className="flex items-center gap-2 py-4 justify-center">
            <svg className="h-5 w-5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm text-gray-500">Detecting microphones...</span>
          </div>
        ) : (
          <>
            {/* Device list */}
            {devices.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 py-6 text-center">
                <svg className="mx-auto h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a4 4 0 00-4 4v6a4 4 0 008 0V5a4 4 0 00-4-4z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v1a7 7 0 01-14 0v-1M12 18v4M8 22h8" />
                </svg>
                <p className="mt-2 text-sm text-gray-500">No microphones detected.</p>
                <p className="text-xs text-gray-400">Connect a microphone and click refresh.</p>
                <button
                  type="button"
                  onClick={loadDevices}
                  className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  Refresh
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {devices.map((device) => (
                  <label
                    key={device.deviceId}
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      activeDeviceId === device.deviceId
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="microphone-device"
                      value={device.deviceId}
                      checked={activeDeviceId === device.deviceId}
                      onChange={() => handleDeviceSelect(device.deviceId)}
                      className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{device.label}</p>
                      <p className="text-xs text-gray-400 truncate">ID: {device.deviceId.slice(0, 16)}...</p>
                    </div>
                    {activeDeviceId === device.deviceId && (
                      <span className="flex-shrink-0 text-xs font-medium text-blue-600">Active</span>
                    )}
                  </label>
                ))}
              </div>
            )}

            {/* Volume level / Test */}
            {showVolumeLevel && devices.length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-600">Microphone Test</span>
                  <button
                    type="button"
                    onClick={startMicTest}
                    disabled={isTesting}
                    className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                      isTesting
                        ? 'bg-green-100 text-green-700 cursor-default'
                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    }`}
                  >
                    {isTesting ? 'Listening (5s)...' : 'Test Microphone'}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                  <div className="flex-1 h-3 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-75 ${
                        volumeLevel > 0.7
                          ? 'bg-red-500'
                          : volumeLevel > 0.4
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(volumeLevel * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-gray-500 w-8 text-right">
                    {Math.round(volumeLevel * 100)}
                  </span>
                </div>

                {!isTesting && volumeLevel === 0 && (
                  <p className="mt-2 text-xs text-gray-400">
                    Click &quot;Test Microphone&quot; to check your audio level.
                  </p>
                )}
              </div>
            )}

            {/* Refresh button */}
            <button
              type="button"
              onClick={loadDevices}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh devices
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function PermissionBadge({ status }: { status: 'prompt' | 'granted' | 'denied' | 'checking' }) {
  const styles: Record<string, string> = {
    checking: 'bg-gray-100 text-gray-600',
    prompt: 'bg-yellow-100 text-yellow-700',
    granted: 'bg-green-100 text-green-700',
    denied: 'bg-red-100 text-red-700',
  };

  const labels: Record<string, string> = {
    checking: 'Checking...',
    prompt: 'Permission needed',
    granted: 'Permitted',
    denied: 'Denied',
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status === 'granted' && (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
      {labels[status]}
    </span>
  );
}
