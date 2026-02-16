'use client';

import React, { useState, useEffect } from 'react';
import type { OneThingNowState } from '../types';

interface Props {
  state: OneThingNowState;
}

export function OneThingNowBanner({ state }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!state.isActive || !state.currentTask) return;
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - state.currentTask!.startedAt.getTime()) / 1000);
      setElapsed(diff);
    }, 1000);
    return () => clearInterval(interval);
  }, [state.isActive, state.currentTask]);

  if (!state.isActive || !state.currentTask) return null;

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  return (
    <div style={{
      padding: '12px 16px', backgroundColor: '#1e40af', color: 'white',
      borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <div>
        <div style={{ fontWeight: 600 }}>Focus Mode Active</div>
        <div style={{ fontSize: '14px', opacity: 0.9 }}>{state.currentTask.title}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontFamily: 'monospace', fontSize: '20px' }}>
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </div>
        <div style={{ fontSize: '12px', opacity: 0.8 }}>
          {state.blockedNotifications} blocked
        </div>
      </div>
    </div>
  );
}
