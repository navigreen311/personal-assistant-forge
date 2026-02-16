'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center bg-gray-50 font-sans antialiased">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900">
            Something went wrong
          </h1>
          <p className="mt-4 text-gray-600">
            An unexpected error occurred. Please try again.
          </p>
          {process.env.NODE_ENV === 'development' && error.message && (
            <pre className="mt-4 max-w-lg overflow-auto rounded bg-red-50 p-4 text-left text-sm text-red-800">
              {error.message}
            </pre>
          )}
          <button
            onClick={reset}
            className="mt-8 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors"
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
