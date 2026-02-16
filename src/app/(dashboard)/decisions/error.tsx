'use client';

import { ErrorFallback } from '../_components/ErrorFallback';

export default function DecisionsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorFallback error={error} reset={reset} moduleName="Decisions" />;
}
