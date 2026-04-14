'use client';

import { useEffect, useState } from 'react';
import { useShadowContext } from '@/hooks/useShadowContext';
import { ShadowNavButton } from './ShadowNavButton';

type SessionStatus = 'none' | 'active' | 'sidekick' | 'paused';

export function ShadowNavButtonConnected() {
  const { session, pendingCount } = useShadowContext();
  const [durationSeconds, setDurationSeconds] = useState(0);

  useEffect(() => {
    if (!session?.startedAt || session.status !== 'active') {
      setDurationSeconds(0);
      return;
    }
    const started = new Date(session.startedAt).getTime();
    setDurationSeconds(Math.floor((Date.now() - started) / 1000));
  }, [session?.startedAt, session?.status]);

  const status: SessionStatus = !session
    ? 'none'
    : session.status === 'paused'
      ? 'paused'
      : session.status === 'active'
        ? 'active'
        : 'none';

  return (
    <ShadowNavButton
      sessionStatus={status}
      sessionDuration={durationSeconds}
      entityName={session?.entityName}
      pendingCount={pendingCount}
      onClick={() => window.dispatchEvent(new CustomEvent('shadow:toggle'))}
    />
  );
}
