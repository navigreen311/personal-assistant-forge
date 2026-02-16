import { generateJSON } from '@/lib/ai';
import type { PersonalityCalibration } from '../types';

const calibrationStore = new Map<string, PersonalityCalibration>();

export async function startCalibration(userId: string): Promise<PersonalityCalibration> {
  const calibration: PersonalityCalibration = {
    userId,
    communicationStyle: 'ADAPTIVE',
    decisionSpeed: 'BALANCED',
    detailPreference: 'MEDIUM',
    riskTolerance: 'MODERATE',
    autonomyComfort: 'MEDIUM',
    calibrationComplete: false,
  };
  calibrationStore.set(userId, calibration);
  return calibration;
}

export async function updateCalibration(
  userId: string,
  updates: Partial<PersonalityCalibration>
): Promise<PersonalityCalibration> {
  const current = calibrationStore.get(userId);
  if (!current) throw new Error('Calibration not started');

  const updated: PersonalityCalibration = { ...current, ...updates, userId };
  calibrationStore.set(userId, updated);
  return updated;
}

export async function getCalibration(userId: string): Promise<PersonalityCalibration> {
  const calibration = calibrationStore.get(userId);
  if (!calibration) throw new Error('Calibration not found');
  return calibration;
}

export async function completeCalibration(userId: string): Promise<PersonalityCalibration & { aiProfile?: Record<string, unknown> }> {
  const calibration = calibrationStore.get(userId);
  if (!calibration) throw new Error('Calibration not found');

  calibration.calibrationComplete = true;
  calibrationStore.set(userId, calibration);

  let aiProfile: Record<string, unknown> | undefined;
  try {
    aiProfile = await generateJSON<Record<string, unknown>>(
      `Analyze this user's personality calibration and synthesize behavioral preferences for an AI assistant.

User calibration data:
- Communication style: ${calibration.communicationStyle}
- Decision speed: ${calibration.decisionSpeed}
- Detail preference: ${calibration.detailPreference}
- Risk tolerance: ${calibration.riskTolerance}
- Autonomy comfort: ${calibration.autonomyComfort}

Produce a JSON object with:
- "behavioralPreferences": object with keys like "responseLength", "proactivity", "detailLevel", "decisionSupport"
- "recommendations": array of 3-5 strings describing how the AI should behave with this user
- "suggestedAutonomyLevel": one of "SUGGEST", "DRAFT", "EXECUTE_WITH_APPROVAL", "EXECUTE_AUTONOMOUS"`,
      { temperature: 0.5, maxTokens: 512 }
    );
  } catch {
    // AI profiling is optional enhancement
  }

  return { ...calibration, aiProfile };
}

export { calibrationStore };
