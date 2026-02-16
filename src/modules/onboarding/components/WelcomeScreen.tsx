'use client';

import React from 'react';

interface Props {
  userName: string;
  onStart: () => void;
}

export function WelcomeScreen({ userName, onStart }: Props) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '400px', textAlign: 'center', padding: '40px',
    }}>
      <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '12px' }}>
        Welcome, {userName}!
      </h1>
      <p style={{ fontSize: '18px', color: '#6b7280', maxWidth: '500px', marginBottom: '32px', lineHeight: '1.6' }}>
        Your personal assistant is ready to be configured. We will walk you through
        connecting your accounts, setting preferences, and personalizing your experience.
      </p>
      <p style={{ fontSize: '14px', color: '#9ca3af', marginBottom: '24px' }}>
        This setup takes approximately 30 minutes
      </p>
      <button
        onClick={onStart}
        style={{
          padding: '14px 40px', backgroundColor: '#3b82f6', color: 'white',
          border: 'none', borderRadius: '10px', cursor: 'pointer',
          fontSize: '16px', fontWeight: 600,
        }}
      >
        Get Started
      </button>
    </div>
  );
}
