import { v4 as uuidv4 } from 'uuid';
import type { OnboardingWizard, OnboardingStep } from '../types';

const wizardStore = new Map<string, OnboardingWizard>();

function createDefaultSteps(): OnboardingStep[] {
  return [
    { id: uuidv4(), order: 1, title: 'Welcome & Profile', description: 'Set up your profile and basic information', category: 'CONFIGURE', status: 'PENDING', isRequired: true },
    { id: uuidv4(), order: 2, title: 'Connect Email', description: 'Connect your email accounts for message management', category: 'CONNECT', status: 'PENDING', isRequired: true },
    { id: uuidv4(), order: 3, title: 'Connect Calendar', description: 'Connect your calendar for scheduling', category: 'CONNECT', status: 'PENDING', isRequired: true },
    { id: uuidv4(), order: 4, title: 'Import Contacts', description: 'Import your contacts from existing services', category: 'IMPORT', status: 'PENDING', isRequired: false },
    { id: uuidv4(), order: 5, title: 'Import Tasks from Notion/Todoist/Asana', description: 'Import existing tasks from productivity tools', category: 'IMPORT', status: 'PENDING', isRequired: false },
    { id: uuidv4(), order: 6, title: 'Set Communication Preferences', description: 'Configure your communication style and channels', category: 'CONFIGURE', status: 'PENDING', isRequired: true },
    { id: uuidv4(), order: 7, title: 'Personality Calibration', description: 'Calibrate the AI to your working style', category: 'CONFIGURE', status: 'PENDING', isRequired: true },
    { id: uuidv4(), order: 8, title: 'Tone Training', description: 'Train the AI to match your communication tone', category: 'LEARN', status: 'PENDING', isRequired: false },
    { id: uuidv4(), order: 9, title: 'Create First Entity', description: 'Create your first business entity or workspace', category: 'CONFIGURE', status: 'PENDING', isRequired: true },
    { id: uuidv4(), order: 10, title: 'Tour Complete', description: 'Review your setup and start using the platform', category: 'LEARN', status: 'PENDING', isRequired: true },
  ];
}

export async function initializeWizard(userId: string): Promise<OnboardingWizard> {
  const steps = createDefaultSteps();
  const wizard: OnboardingWizard = {
    userId,
    currentStep: 1,
    totalSteps: 10,
    steps,
    startedAt: new Date(),
    estimatedMinutesRemaining: 30,
  };
  wizardStore.set(userId, wizard);
  return wizard;
}

export async function getWizard(userId: string): Promise<OnboardingWizard | null> {
  return wizardStore.get(userId) || null;
}

export async function completeStep(userId: string, stepId: string): Promise<OnboardingWizard> {
  const wizard = wizardStore.get(userId);
  if (!wizard) throw new Error('Wizard not found');

  const step = wizard.steps.find((s) => s.id === stepId);
  if (!step) throw new Error(`Step ${stepId} not found`);

  step.status = 'COMPLETE';
  step.completedAt = new Date();

  // Advance to next pending step
  const nextPending = wizard.steps.find((s) => s.status === 'PENDING');
  if (nextPending) {
    wizard.currentStep = nextPending.order;
    nextPending.status = 'IN_PROGRESS';
  } else {
    wizard.completedAt = new Date();
  }

  // Update estimated time
  const completedCount = wizard.steps.filter((s) => s.status === 'COMPLETE' || s.status === 'SKIPPED').length;
  wizard.estimatedMinutesRemaining = Math.max(0, Math.round((wizard.totalSteps - completedCount) * 3));

  wizardStore.set(userId, wizard);
  return wizard;
}

export async function skipStep(userId: string, stepId: string): Promise<OnboardingWizard> {
  const wizard = wizardStore.get(userId);
  if (!wizard) throw new Error('Wizard not found');

  const step = wizard.steps.find((s) => s.id === stepId);
  if (!step) throw new Error(`Step ${stepId} not found`);
  if (step.isRequired) throw new Error('Cannot skip a required step');

  step.status = 'SKIPPED';

  const nextPending = wizard.steps.find((s) => s.status === 'PENDING');
  if (nextPending) {
    wizard.currentStep = nextPending.order;
    nextPending.status = 'IN_PROGRESS';
  } else {
    wizard.completedAt = new Date();
  }

  const completedCount = wizard.steps.filter((s) => s.status === 'COMPLETE' || s.status === 'SKIPPED').length;
  wizard.estimatedMinutesRemaining = Math.max(0, Math.round((wizard.totalSteps - completedCount) * 3));

  wizardStore.set(userId, wizard);
  return wizard;
}

export async function getProgress(userId: string): Promise<{ percent: number; currentStep: string; estimatedMinutesRemaining: number }> {
  const wizard = wizardStore.get(userId);
  if (!wizard) throw new Error('Wizard not found');

  const completedCount = wizard.steps.filter((s) => s.status === 'COMPLETE' || s.status === 'SKIPPED').length;
  const currentStep = wizard.steps.find((s) => s.order === wizard.currentStep);

  return {
    percent: Math.round((completedCount / wizard.totalSteps) * 100),
    currentStep: currentStep?.title || 'Complete',
    estimatedMinutesRemaining: wizard.estimatedMinutesRemaining,
  };
}

export { wizardStore };
