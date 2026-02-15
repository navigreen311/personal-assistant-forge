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

export async function completeCalibration(userId: string): Promise<PersonalityCalibration> {
  const calibration = calibrationStore.get(userId);
  if (!calibration) throw new Error('Calibration not found');

  calibration.calibrationComplete = true;
  calibrationStore.set(userId, calibration);
  return calibration;
}

export { calibrationStore };
