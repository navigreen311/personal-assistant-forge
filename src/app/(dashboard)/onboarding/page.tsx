'use client';

import React, { useState, useCallback } from 'react';
import type { OnboardingWizard } from '@/modules/onboarding/types';
import { WizardProgress } from '@/modules/onboarding/components/WizardProgress';
import { WizardStep } from '@/modules/onboarding/components/WizardStep';
import { WelcomeScreen } from '@/modules/onboarding/components/WelcomeScreen';

export default function OnboardingPage() {
  const [wizard, setWizard] = useState<OnboardingWizard | null>(null);
  const [started, setStarted] = useState(false);

  const handleStart = useCallback(() => {
    const steps = [
      { id: 's1', order: 1, title: 'Welcome & Profile', description: 'Set up your profile and basic information', category: 'CONFIGURE' as const, status: 'IN_PROGRESS' as const, isRequired: true },
      { id: 's2', order: 2, title: 'Connect Email', description: 'Connect your email accounts', category: 'CONNECT' as const, status: 'PENDING' as const, isRequired: true },
      { id: 's3', order: 3, title: 'Connect Calendar', description: 'Connect your calendar', category: 'CONNECT' as const, status: 'PENDING' as const, isRequired: true },
      { id: 's4', order: 4, title: 'Import Contacts', description: 'Import contacts from existing services', category: 'IMPORT' as const, status: 'PENDING' as const, isRequired: false },
      { id: 's5', order: 5, title: 'Import Tasks', description: 'Import from Notion/Todoist/Asana', category: 'IMPORT' as const, status: 'PENDING' as const, isRequired: false },
      { id: 's6', order: 6, title: 'Communication Preferences', description: 'Set your communication style', category: 'CONFIGURE' as const, status: 'PENDING' as const, isRequired: true },
      { id: 's7', order: 7, title: 'Personality Calibration', description: 'Calibrate AI to your style', category: 'CONFIGURE' as const, status: 'PENDING' as const, isRequired: true },
      { id: 's8', order: 8, title: 'Tone Training', description: 'Train AI communication tone', category: 'LEARN' as const, status: 'PENDING' as const, isRequired: false },
      { id: 's9', order: 9, title: 'Create First Entity', description: 'Create your first workspace', category: 'CONFIGURE' as const, status: 'PENDING' as const, isRequired: true },
      { id: 's10', order: 10, title: 'Tour Complete', description: 'Review and start using the platform', category: 'LEARN' as const, status: 'PENDING' as const, isRequired: true },
    ];

    setWizard({
      userId: 'current-user',
      currentStep: 1,
      totalSteps: 10,
      steps,
      startedAt: new Date(),
      estimatedMinutesRemaining: 30,
    });
    setStarted(true);
  }, []);

  const handleComplete = useCallback(() => {
    if (!wizard) return;
    const updated = { ...wizard };
    const currentStep = updated.steps.find((s) => s.order === updated.currentStep);
    if (currentStep) {
      currentStep.status = 'COMPLETE' as const;
      currentStep.completedAt = new Date();
    }
    const next = updated.steps.find((s) => s.status === 'PENDING');
    if (next) {
      next.status = 'IN_PROGRESS' as const;
      updated.currentStep = next.order;
    } else {
      updated.completedAt = new Date();
    }
    const done = updated.steps.filter((s) => s.status === 'COMPLETE' || s.status === 'SKIPPED').length;
    updated.estimatedMinutesRemaining = Math.max(0, (updated.totalSteps - done) * 3);
    setWizard(updated);
  }, [wizard]);

  const handleSkip = useCallback(() => {
    if (!wizard) return;
    const updated = { ...wizard };
    const currentStep = updated.steps.find((s) => s.order === updated.currentStep);
    if (currentStep) currentStep.status = 'SKIPPED' as const;
    const next = updated.steps.find((s) => s.status === 'PENDING');
    if (next) {
      next.status = 'IN_PROGRESS' as const;
      updated.currentStep = next.order;
    } else {
      updated.completedAt = new Date();
    }
    const done = updated.steps.filter((s) => s.status === 'COMPLETE' || s.status === 'SKIPPED').length;
    updated.estimatedMinutesRemaining = Math.max(0, (updated.totalSteps - done) * 3);
    setWizard(updated);
  }, [wizard]);

  if (!started || !wizard) {
    return <WelcomeScreen userName="User" onStart={handleStart} />;
  }

  if (wizard.completedAt) {
    return (
      <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '16px' }}>Setup Complete!</h1>
        <p style={{ color: '#6b7280', marginBottom: '24px' }}>
          Your personal assistant is configured and ready to help.
        </p>
        <WizardProgress wizard={wizard} />
      </div>
    );
  }

  const currentStep = wizard.steps.find((s) => s.order === wizard.currentStep);

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <WizardProgress wizard={wizard} />
      <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'center' }}>
        {currentStep && (
          <WizardStep step={currentStep} onComplete={handleComplete} onSkip={handleSkip} />
        )}
      </div>
    </div>
  );
}
