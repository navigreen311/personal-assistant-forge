'use client';

export interface AdaptiveChannelNoticeProps {
  channelRates?: { inApp: number; push: number; sms: number; call: number };
  onReset: () => void;
}

const DEFAULT_RATES = { inApp: 72, push: 58, sms: 85, call: 93 };

export default function AdaptiveChannelNotice({
  channelRates,
  onReset,
}: AdaptiveChannelNoticeProps) {
  const rates = channelRates ?? DEFAULT_RATES;

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <svg className="h-5 w-5 text-blue-500 dark:text-blue-400" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-1">
            Adaptive Channel Learning
          </h4>
          <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
            Shadow learns which channels you respond to fastest and automatically adjusts delivery
            over time. These rates reflect your average response speed per channel.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <div className="text-center">
              <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">In-App</p>
              <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                <div
                  className="bg-blue-500 dark:bg-blue-400 h-2 rounded-full transition-all"
                  style={{ width: `${rates.inApp}%` }}
                />
              </div>
              <p className="text-xs font-medium text-blue-800 dark:text-blue-200 mt-1">{rates.inApp}%</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">Push</p>
              <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                <div
                  className="bg-blue-500 dark:bg-blue-400 h-2 rounded-full transition-all"
                  style={{ width: `${rates.push}%` }}
                />
              </div>
              <p className="text-xs font-medium text-blue-800 dark:text-blue-200 mt-1">{rates.push}%</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">SMS</p>
              <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                <div
                  className="bg-blue-500 dark:bg-blue-400 h-2 rounded-full transition-all"
                  style={{ width: `${rates.sms}%` }}
                />
              </div>
              <p className="text-xs font-medium text-blue-800 dark:text-blue-200 mt-1">{rates.sms}%</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">Call</p>
              <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                <div
                  className="bg-blue-500 dark:bg-blue-400 h-2 rounded-full transition-all"
                  style={{ width: `${rates.call}%` }}
                />
              </div>
              <p className="text-xs font-medium text-blue-800 dark:text-blue-200 mt-1">{rates.call}%</p>
            </div>
          </div>

          <button
            onClick={onReset}
            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 underline underline-offset-2"
          >
            Reset adaptive learning
          </button>
        </div>
      </div>
    </div>
  );
}
