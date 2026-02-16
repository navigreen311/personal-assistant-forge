import { prisma } from '@/lib/db';
import type { OnboardingWizard, OnboardingStep } from '../types';

export const wizardStore = new Map<string, OnboardingWizard>();

export const ONBOARDING_STEPS = [
  'PROFILE_SETUP',
  'ENTITY_CREATION',
  'TONE_CALIBRATION',
  'NOTIFICATION_PREFERENCES',
  'INTEGRATION_SETUP',
  'FIRST_TASK',
  'REVIEW_COMPLETE',
] as const;

const STEP_DEFINITIONS: Array<{
  id: string;
  title: string;
  description: string;
  category: OnboardingStep['category'];
  isRequired: boolean;
}> = [
  { id: 'PROFILE_SETUP', title: 'Welcome & Profile', description: 'Basic user profile information', category: 'CONFIGURE', isRequired: true },
  { id: 'ENTITY_CREATION', title: 'Create Entity', description: 'Create first entity/organization', category: 'CONFIGURE', isRequired: true },
  { id: 'TONE_CALIBRATION', title: 'Tone Calibration', description: 'Tone preference selection', category: 'LEARN', isRequired: false },
  { id: 'NOTIFICATION_PREFERENCES', title: 'Notifications', description: 'Configure notification settings', category: 'CONFIGURE', isRequired: true },
  { id: 'INTEGRATION_SETUP', title: 'Integrations', description: 'Connect external services', category: 'CONNECT', isRequired: false },
  { id: 'FIRST_TASK', title: 'First Task', description: 'Create first task as guided exercise', category: 'LEARN', isRequired: false },
  { id: 'REVIEW_COMPLETE', title: 'Review & Complete', description: 'Review settings and complete onboarding', category: 'LEARN', isRequired: true },
];

function createDefaultSteps(): OnboardingStep[] {
  return STEP_DEFINITIONS.map((def, index) => ({
    id: def.id,
    order: index + 1,
    title: def.title,
    description: def.description,
    category: def.category,
    status: 'PENDING' as const,
    isRequired: def.isRequired,
  }));
}

interface OnboardingState {
  currentStep: number;
  completedSteps: string[];
  totalSteps: number;
  startedAt: string | null;
  completedAt: string | null;
  stepData: Record<string, unknown>;
}

function getDefaultState(): OnboardingState {
  return {
    currentStep: 0,
    completedSteps: [],
    totalSteps: ONBOARDING_STEPS.length,
    startedAt: null,
    completedAt: null,
    stepData: {},
  };
}

async function getOnboardingState(userId: string): Promise<OnboardingState> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error(`User ${userId} not found`);

  const prefs = user.preferences as Record<string, unknown>;
  if (prefs.onboarding) {
    return prefs.onboarding as OnboardingState;
  }

  return getDefaultState();
}

async function saveOnboardingState(userId: string, state: OnboardingState): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error(`User ${userId} not found`);

  const prefs = (user.preferences as Record<string, unknown>) ?? {};
  prefs.onboarding = state;

  await prisma.user.update({
    where: { id: userId },
    data: { preferences: prefs as unknown as Record<string, string> },
  });
}

export async function getWizardState(userId: string): Promise<OnboardingState> {
  return getOnboardingState(userId);
}

export async function startWizard(userId: string): Promise<OnboardingState> {
  const state: OnboardingState = {
    ...getDefaultState(),
    startedAt: new Date().toISOString(),
    currentStep: 0,
  };

  await saveOnboardingState(userId, state);
  return state;
}

export async function completeStep(
  userId: string,
  stepId: string,
  data?: Record<string, unknown>
): Promise<OnboardingState> {
  const state = await getOnboardingState(userId);

  if (!state.completedSteps.includes(stepId)) {
    state.completedSteps.push(stepId);
  }

  if (data) {
    state.stepData[stepId] = data;
  }

  state.currentStep = Math.min(state.currentStep + 1, state.totalSteps - 1);

  if (state.completedSteps.length >= state.totalSteps) {
    state.completedAt = new Date().toISOString();
  }

  await saveOnboardingState(userId, state);
  return state;
}

export async function skipStep(userId: string, stepId: string): Promise<OnboardingState> {
  const state = await getOnboardingState(userId);
  state.currentStep = Math.min(state.currentStep + 1, state.totalSteps - 1);
  await saveOnboardingState(userId, state);
  return state;
}

export async function getProgress(userId: string): Promise<{
  percentage: number;
  currentStep: number;
  totalSteps: number;
  completedSteps: string[];
  isComplete: boolean;
}> {
  const state = await getOnboardingState(userId);

  return {
    percentage: Math.round((state.completedSteps.length / state.totalSteps) * 100),
    currentStep: state.currentStep,
    totalSteps: state.totalSteps,
    completedSteps: state.completedSteps,
    isComplete: state.completedAt !== null,
  };
}

export async function resetWizard(userId: string): Promise<OnboardingState> {
  const state = getDefaultState();
  await saveOnboardingState(userId, state);
  return state;
}

// Legacy compatibility
export async function initializeWizard(userId: string): Promise<OnboardingWizard> {
  const steps = createDefaultSteps();
  const wizard: OnboardingWizard = {
    userId,
    currentStep: 1,
    totalSteps: steps.length,
    steps,
    startedAt: new Date(),
    estimatedMinutesRemaining: 30,
  };
  wizardStore.set(userId, wizard);
  await startWizard(userId).catch(() => {});
  return wizard;
}

export async function getWizard(userId: string): Promise<OnboardingWizard | null> {
  return wizardStore.get(userId) || null;
}
