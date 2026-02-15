export interface OnboardingWizard {
  userId: string;
  currentStep: number;
  totalSteps: number;
  steps: OnboardingStep[];
  startedAt: Date;
  completedAt?: Date;
  estimatedMinutesRemaining: number;
}

export interface OnboardingStep {
  id: string;
  order: number;
  title: string;
  description: string;
  category: 'CONNECT' | 'IMPORT' | 'CONFIGURE' | 'LEARN';
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'SKIPPED';
  isRequired: boolean;
  completedAt?: Date;
}

export interface DataMigrationSource {
  id: string;
  name: string;
  icon: string;
  category: 'PRODUCTIVITY' | 'CALENDAR' | 'EMAIL' | 'CRM' | 'NOTES';
  isConnected: boolean;
  importedCount?: number;
  status: 'NOT_STARTED' | 'CONNECTING' | 'IMPORTING' | 'COMPLETE' | 'FAILED';
}

export interface PersonalityCalibration {
  userId: string;
  communicationStyle: 'FORMAL' | 'CASUAL' | 'ADAPTIVE';
  decisionSpeed: 'DELIBERATE' | 'BALANCED' | 'QUICK';
  detailPreference: 'HIGH' | 'MEDIUM' | 'LOW';
  riskTolerance: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
  autonomyComfort: 'LOW' | 'MEDIUM' | 'HIGH';
  calibrationComplete: boolean;
}

export interface ToneTrainingSample {
  id: string;
  userId: string;
  sampleText: string;
  context: string;
  userRating: number;
  adjustments: string[];
}
