'use client';

import { ErrorFallback } from '../_components/ErrorFallback';

export default function AIQualityError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorFallback error={error} reset={reset} moduleName="AI Quality" />;
}
