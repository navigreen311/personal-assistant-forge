'use client';

import { ErrorFallback } from '../_components/ErrorFallback';

export default function CalendarError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorFallback error={error} reset={reset} moduleName="Calendar" />;
}
