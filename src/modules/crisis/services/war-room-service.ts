import type { WarRoomState, CrisisEvent } from '../types';
import { getCrisisById, updateCrisis } from './detection-service';

export async function activateWarRoom(crisisId: string): Promise<WarRoomState> {
  const crisis = getCrisisById(crisisId);
  if (!crisis) throw new Error(`Crisis ${crisisId} not found`);

  crisis.warRoom = {
    isActive: true,
    activatedAt: new Date(),
    clearedCalendarEvents: ['team-standup', 'weekly-review', 'optional-sync'],
    surfacedDocuments: [`crisis-${crisis.type}-playbook`, 'emergency-contacts', 'incident-response-plan'],
    draftedComms: [
      `Initial notification: ${crisis.title} detected at ${crisis.detectedAt.toISOString()}`,
      `Status update template for ${crisis.type} incident`,
    ],
    participants: crisis.escalationChain
      .filter(s => s.status === 'ACKNOWLEDGED' || s.status === 'NOTIFIED')
      .map(s => s.contactName),
  };

  updateCrisis(crisis);
  return crisis.warRoom;
}

export async function deactivateWarRoom(crisisId: string): Promise<void> {
  const crisis = getCrisisById(crisisId);
  if (!crisis) throw new Error(`Crisis ${crisisId} not found`);

  crisis.warRoom.isActive = false;
  updateCrisis(crisis);
}

export async function getWarRoomState(crisisId: string): Promise<WarRoomState> {
  const crisis = getCrisisById(crisisId);
  if (!crisis) throw new Error(`Crisis ${crisisId} not found`);
  return crisis.warRoom;
}

export async function addWarRoomDocument(crisisId: string, documentId: string): Promise<WarRoomState> {
  const crisis = getCrisisById(crisisId);
  if (!crisis) throw new Error(`Crisis ${crisisId} not found`);

  if (!crisis.warRoom.surfacedDocuments.includes(documentId)) {
    crisis.warRoom.surfacedDocuments.push(documentId);
  }

  updateCrisis(crisis);
  return crisis.warRoom;
}
