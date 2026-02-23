'use client';

export interface AudioQualityProps {
  noiseCancellation: boolean;
  echoSuppression: boolean;
  autoSwitchOnPoorConnection: boolean;
  vadSensitivity: string;
  onChange: (updates: Partial<Omit<AudioQualityProps, 'onChange'>>) => void;
}

export default function AudioQualitySettings({
  noiseCancellation,
  echoSuppression,
  autoSwitchOnPoorConnection,
  vadSensitivity,
  onChange,
}: AudioQualityProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Audio Quality</h3>
      <div className="space-y-4">
        {/* Noise Cancellation */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Noise Cancellation</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Reduce background noise during voice calls.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={noiseCancellation}
              onChange={(e) => onChange({ noiseCancellation: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-gray-500 peer-checked:bg-blue-600" />
          </label>
        </div>

        {/* Echo Suppression */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Echo Suppression</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Eliminate echo feedback during calls.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={echoSuppression}
              onChange={(e) => onChange({ echoSuppression: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-gray-500 peer-checked:bg-blue-600" />
          </label>
        </div>

        {/* Auto-switch on Poor Connection */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto-switch on Poor Connection</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Automatically switch to text if audio quality degrades.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={autoSwitchOnPoorConnection}
              onChange={(e) => onChange({ autoSwitchOnPoorConnection: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-gray-500 peer-checked:bg-blue-600" />
          </label>
        </div>

        {/* VAD Sensitivity */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            VAD Sensitivity
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Voice Activity Detection sensitivity level. Higher sensitivity picks up quieter speech.
          </p>
          <select
            value={vadSensitivity}
            onChange={(e) => onChange({ vadSensitivity: e.target.value })}
            className="w-full max-w-xs px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>
    </div>
  );
}
