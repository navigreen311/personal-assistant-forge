'use client';

import React, { useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import type { OnboardingWizard } from '@/modules/onboarding/types';
import { WizardProgress } from '@/modules/onboarding/components/WizardProgress';
import { WizardStep } from '@/modules/onboarding/components/WizardStep';
import { WelcomeScreen } from '@/modules/onboarding/components/WelcomeScreen';
import { StepOverview } from '@/modules/onboarding/components/StepOverview';
import { CompletionScreen } from '@/modules/onboarding/components/CompletionScreen';

const INITIAL_STEPS = [
  { id: 's1', order: 1, title: 'Welcome & Profile', description: 'Set up your profile and basic information', category: 'CONFIGURE' as const, status: 'IN_PROGRESS' as const, isRequired: true, estimatedMinutes: 3 },
  { id: 's2', order: 2, title: 'Create First Entity', description: 'Create your first workspace entity', category: 'CONFIGURE' as const, status: 'PENDING' as const, isRequired: true, estimatedMinutes: 5 },
  { id: 's3', order: 3, title: 'Connect Email', description: 'Connect your email accounts', category: 'CONNECT' as const, status: 'PENDING' as const, isRequired: true, estimatedMinutes: 3 },
  { id: 's4', order: 4, title: 'AI Preferences', description: 'Set your AI communication and decision preferences', category: 'CONFIGURE' as const, status: 'PENDING' as const, isRequired: true, estimatedMinutes: 4 },
  { id: 's5', order: 5, title: 'Import Tasks', description: 'Import from Notion, Todoist, or Asana', category: 'IMPORT' as const, status: 'PENDING' as const, isRequired: false, estimatedMinutes: 3 },
  { id: 's6', order: 6, title: 'Import Contacts', description: 'Import contacts from existing services', category: 'IMPORT' as const, status: 'PENDING' as const, isRequired: false, estimatedMinutes: 3 },
  { id: 's7', order: 7, title: 'Connect Calendar', description: 'Connect your calendar accounts', category: 'CONNECT' as const, status: 'PENDING' as const, isRequired: false, estimatedMinutes: 2 },
  { id: 's8', order: 8, title: 'VoiceForge Setup', description: 'Configure VoiceForge for AI-assisted voice interactions', category: 'CONFIGURE' as const, status: 'PENDING' as const, isRequired: false, estimatedMinutes: 4 },
  { id: 's9', order: 9, title: 'Configure Notifications', description: 'Set up your notification preferences', category: 'CONFIGURE' as const, status: 'PENDING' as const, isRequired: false, estimatedMinutes: 2 },
  { id: 's10', order: 10, title: 'Review & Launch', description: 'Review your setup and launch your personal assistant', category: 'LEARN' as const, status: 'PENDING' as const, isRequired: true, estimatedMinutes: 3 },
];

function computeEstimatedMinutes(steps: typeof INITIAL_STEPS): number {
  return steps
    .filter((s) => s.status === 'PENDING' || s.status === 'IN_PROGRESS')
    .reduce((sum, s) => sum + s.estimatedMinutes, 0);
}

export default function OnboardingPage() {
  const { data: session } = useSession();
  const [wizard, setWizard] = useState<OnboardingWizard | null>(null);
  const [started, setStarted] = useState(false);

  const userName = session?.user?.name || '';

  const handleStart = useCallback(() => {
    const steps = INITIAL_STEPS.map((s) => ({ ...s }));
    setWizard({
      userId: 'current-user',
      currentStep: 1,
      totalSteps: 10,
      steps,
      startedAt: new Date(),
      estimatedMinutesRemaining: computeEstimatedMinutes(steps),
    });
    setStarted(true);
  }, []);

  const handleComplete = useCallback(() => {
    if (!wizard) return;
    const updatedSteps = wizard.steps.map((s) => ({ ...s }));
    const currentStep = updatedSteps.find((s) => s.order === wizard.currentStep);
    if (currentStep) {
      currentStep.status = 'COMPLETE' as const;
      currentStep.completedAt = new Date();
    }
    const next = updatedSteps.find((s) => s.status === 'PENDING');
    const nextStep = next ? next.order : wizard.currentStep;
    if (next) {
      next.status = 'IN_PROGRESS' as const;
    }
    const isComplete = !updatedSteps.some((s) => s.status === 'PENDING' || s.status === 'IN_PROGRESS');
    setWizard({
      ...wizard,
      steps: updatedSteps,
      currentStep: nextStep,
      completedAt: isComplete ? new Date() : undefined,
      estimatedMinutesRemaining: computeEstimatedMinutes(updatedSteps),
    });
  }, [wizard]);

  const handleSkip = useCallback(() => {
    if (!wizard) return;
    const updatedSteps = wizard.steps.map((s) => ({ ...s }));
    const currentStep = updatedSteps.find((s) => s.order === wizard.currentStep);
    if (currentStep) currentStep.status = 'SKIPPED' as const;
    const next = updatedSteps.find((s) => s.status === 'PENDING');
    const nextStep = next ? next.order : wizard.currentStep;
    if (next) {
      next.status = 'IN_PROGRESS' as const;
    }
    const isComplete = !updatedSteps.some((s) => s.status === 'PENDING' || s.status === 'IN_PROGRESS');
    setWizard({
      ...wizard,
      steps: updatedSteps,
      currentStep: nextStep,
      completedAt: isComplete ? new Date() : undefined,
      estimatedMinutesRemaining: computeEstimatedMinutes(updatedSteps),
    });
  }, [wizard]);

  const handleBack = useCallback(() => {
    if (!wizard || wizard.currentStep <= 1) return;
    const updatedSteps = wizard.steps.map((s) => ({ ...s }));
    // Revert current step to PENDING
    const currentStep = updatedSteps.find((s) => s.order === wizard.currentStep);
    if (currentStep) currentStep.status = 'PENDING' as const;
    // Find previous step and make it IN_PROGRESS
    const prevOrder = wizard.currentStep - 1;
    const prevStep = updatedSteps.find((s) => s.order === prevOrder);
    if (prevStep) {
      prevStep.status = 'IN_PROGRESS' as const;
      prevStep.completedAt = undefined;
    }
    setWizard({
      ...wizard,
      steps: updatedSteps,
      currentStep: prevOrder,
      estimatedMinutesRemaining: computeEstimatedMinutes(updatedSteps),
    });
  }, [wizard]);

  const handleNavigate = useCallback((stepOrder: number) => {
    if (!wizard) return;
    const updatedSteps = wizard.steps.map((s) => ({ ...s }));
    // Set previous current step back to its completed/skipped state or pending
    const oldCurrent = updatedSteps.find((s) => s.order === wizard.currentStep);
    if (oldCurrent && oldCurrent.status === 'IN_PROGRESS') {
      oldCurrent.status = 'PENDING' as const;
    }
    // Set target step to IN_PROGRESS
    const target = updatedSteps.find((s) => s.order === stepOrder);
    if (target) {
      target.status = 'IN_PROGRESS' as const;
      target.completedAt = undefined;
    }
    setWizard({
      ...wizard,
      steps: updatedSteps,
      currentStep: stepOrder,
      completedAt: undefined,
      estimatedMinutesRemaining: computeEstimatedMinutes(updatedSteps),
    });
  }, [wizard]);

  const handleResumeStep = useCallback((stepOrder: number) => {
    if (!wizard) return;
    const updatedSteps = wizard.steps.map((s) => ({ ...s }));
    const target = updatedSteps.find((s) => s.order === stepOrder);
    if (target) {
      target.status = 'IN_PROGRESS' as const;
      target.completedAt = undefined;
    }
    setWizard({
      ...wizard,
      steps: updatedSteps,
      currentStep: stepOrder,
      completedAt: undefined,
      estimatedMinutesRemaining: computeEstimatedMinutes(updatedSteps),
    });
  }, [wizard]);

  // Welcome screen (not started)
  if (!started || !wizard) {
    return <WelcomeScreen userName={userName} onStart={handleStart} />;
  }

  // Completion screen
  if (wizard.completedAt) {
    return (
      <CompletionScreen
        wizard={wizard}
        userName={userName}
        onResumeStep={handleResumeStep}
      />
    );
  }

  // Active wizard
  const currentStep = wizard.steps.find((s) => s.order === wizard.currentStep);

  return (
    <div className="max-w-[1100px] mx-auto p-6">
      <WizardProgress wizard={wizard} />
      <div className="mt-8 flex gap-8">
        {/* Sidebar */}
        <StepOverview wizard={wizard} onNavigate={handleNavigate} />

        {/* Main step content */}
        <div className="flex-1 flex justify-center">
          {currentStep && (
            <WizardStep
              step={currentStep}
              onComplete={handleComplete}
              onSkip={handleSkip}
              onBack={handleBack}
              isFirstStep={wizard.currentStep === 1}
            />
          )}
        </div>
      </div>
    </div>
  );
}
