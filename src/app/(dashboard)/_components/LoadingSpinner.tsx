interface LoadingSpinnerProps {
  moduleName?: string;
  variant?: 'spinner' | 'skeleton' | 'dots';
}

function SkeletonLayout() {
  return (
    <div className="w-full max-w-4xl space-y-6">
      {/* Title bar skeleton */}
      <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />

      {/* Stat cards row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-200" />
        ))}
      </div>

      {/* Table/list skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded bg-gray-200" />
        ))}
      </div>
    </div>
  );
}

function SpinnerIcon() {
  return (
    <svg
      className="h-12 w-12 animate-spin text-blue-600"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function BouncingDots() {
  return (
    <div className="flex space-x-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-3 w-3 rounded-full bg-blue-600"
          style={{
            animation: 'bounce 1.4s infinite ease-in-out both',
            animationDelay: `${i * 0.16}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

export function LoadingSpinner({ moduleName, variant = 'skeleton' }: LoadingSpinnerProps) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-8">
      {variant === 'skeleton' && <SkeletonLayout />}
      {variant === 'spinner' && <SpinnerIcon />}
      {variant === 'dots' && <BouncingDots />}

      {moduleName && (
        <p className="mt-4 text-sm text-gray-500">
          Loading {moduleName}...
        </p>
      )}
    </div>
  );
}
