'use client';

import React from 'react';

interface Props {
  userName: string;
  onStart: () => void;
}

export function WelcomeScreen({ userName, onStart }: Props) {
  const hasRealName = userName && userName !== 'User';
  const heading = hasRealName
    ? `Welcome, ${userName}!`
    : 'Welcome to PersonalAssistantForge!';

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-10 py-10">
      <h1 className="text-3xl font-bold mb-3">
        {heading}
      </h1>
      <p className="text-lg text-gray-500 max-w-[500px] mb-8 leading-relaxed">
        Your personal assistant is ready to be configured. We will walk you through
        connecting your accounts, setting preferences, and personalizing your experience.
      </p>
      <p className="text-sm text-gray-400 mb-6">
        This setup takes approximately 30 minutes
      </p>
      <button
        onClick={onStart}
        className="px-10 py-3.5 bg-blue-500 text-white border-none rounded-xl cursor-pointer text-base font-semibold hover:bg-blue-600 transition-colors"
      >
        Get Started
      </button>
    </div>
  );
}
