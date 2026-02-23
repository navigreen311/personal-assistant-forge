'use client';

export default function AntifraudNotice() {
  return (
    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-300 dark:border-gray-600 p-6">
      <div className="flex items-start gap-3 mb-4">
        {/* Shield icon */}
        <svg
          className="w-6 h-6 text-gray-600 dark:text-gray-300 flex-shrink-0 mt-0.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Anti-Fraud Protections
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Built-in protections (always active, cannot be disabled)
          </p>
        </div>
      </div>

      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
        Shadow will ALWAYS refuse these actions regardless of PIN:
      </p>

      <ul className="space-y-2 mb-4">
        {[
          'Wire transfers to new/unverified accounts',
          'Bank account changes for existing vendors',
          'Sharing credentials, passwords, or API keys',
          'Bypassing approval workflows',
          'Unlogged actions ("don\'t record this")',
        ].map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
            <svg
              className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        These are hardcoded safety behaviors per Section 9 of the Shadow blueprint. They cannot be
        overridden.
      </p>

      <a
        href="/trust"
        className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
      >
        Learn more about Shadow&apos;s safety features
      </a>
    </div>
  );
}
