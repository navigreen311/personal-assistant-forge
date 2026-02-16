'use client';

interface ErrorFallbackProps {
  error: Error & { digest?: string };
  reset: () => void;
  moduleName?: string;
}

export function ErrorFallback({ error, reset, moduleName }: ErrorFallbackProps) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-8">
      <div className="w-full max-w-md text-center">
        {/* Error icon */}
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <svg
            className="h-8 w-8 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>

        {/* Module name */}
        {moduleName && (
          <p className="mb-2 text-sm font-medium uppercase tracking-wider text-gray-500">
            {moduleName}
          </p>
        )}

        {/* Error heading */}
        <h2 className="text-xl font-semibold text-gray-900">
          Something went wrong
        </h2>

        {/* Error message */}
        <p className="mt-2 text-sm text-gray-600">
          An error occurred while loading this page. Please try again.
        </p>

        {/* Dev-only error details */}
        {process.env.NODE_ENV === 'development' && (
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
              Error Details
            </summary>
            <pre className="mt-2 overflow-auto rounded-lg bg-gray-100 p-4 text-xs text-red-800">
              {error.message}
              {error.stack && (
                <>
                  {'\n\n'}
                  {error.stack}
                </>
              )}
            </pre>
            {error.digest && (
              <p className="mt-2 text-xs text-gray-500">
                Digest: {error.digest}
              </p>
            )}
          </details>
        )}

        {/* Retry button */}
        <button
          onClick={reset}
          className="mt-6 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors"
        >
          <svg
            className="mr-2 h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
            />
          </svg>
          Try Again
        </button>
      </div>
    </div>
  );
}
